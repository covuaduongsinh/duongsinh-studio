// @vitest-environment node
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { expect as e } from 'vitest';
import { createAppTest } from '@nocobase/app-testing/server';
import {
  signIn,
  DEFAULT_ADMIN_CREDENTIALS,
} from '@nocobase/app-plugin-authentication/testing';
import { databaseManagerToken } from '@nocobase/db';
import { tierRuleOf } from '../../server/providers/issue-subject.js';
import { createStandaloneServer } from '../../server/standalone.js';
import {
  TIER_POLICY,
  extraReviewNeeded,
  raiseTier,
  setTier,
  tierOf,
  TierError,
} from '../../server/tiers/service.js';

// T10 (plan T): an issue has a tier that code, not the project manager's guess, turns into what is asked of it.
describe('tier policy', () => {
  it('asks more of a sensitive issue than of a small one', () => {
    expect(TIER_POLICY.small).toMatchObject({
      approach: 'skip',
      reviewPasses: 1,
    });
    expect(TIER_POLICY.standard).toMatchObject({
      approach: 'whenRisky',
      reviewPasses: 1,
    });
    expect(TIER_POLICY.sensitive).toMatchObject({
      approach: 'required',
      reviewPasses: 2,
    });
  });

  it('tells the agent what its tier asks of it', () => {
    expect(tierRuleOf('small')).toMatch(/do not write an approach/u);
    expect(tierRuleOf('standard')).toMatch(/only when/u);
    expect(tierRuleOf('sensitive')).toMatch(/wait for it to be accepted/u);
  });

  it('wants the extra review when the tier is sensitive or sensitive paths are touched', () => {
    expect(extraReviewNeeded('small', [])).toBe(false);
    expect(extraReviewNeeded('standard', [])).toBe(false);
    expect(extraReviewNeeded('standard', ['package.json'])).toBe(true);
    expect(extraReviewNeeded('small', ['package.json'])).toBe(true);
    expect(extraReviewNeeded('sensitive', [])).toBe(true);
  });
});

const test = createAppTest({
  createServer: createStandaloneServer,
  config: {
    app: { publicOrigin: 'http://localhost' },
    auth: { secret: 'test-auth-secret-at-least-32-characters' },
    secrets: {
      keys: [
        { version: 1, key: 'test-secrets-key-at-least-32-characters-long' },
      ],
    },
  },
});

const PASSWORD = 'Contributor#2026-pass';
const json = (body: unknown, method = 'POST') => ({
  method,
  headers: {
    'content-type': 'application/json',
    origin: 'http://localhost',
    'Idempotency-Key': `${Date.now()}.${randomUUID()}`,
  },
  body: JSON.stringify(body),
});

test(
  'T10: default by project, chosen per issue, raised by sensitive paths and never lowered by itself',
  { timeout: 180_000 },
  async ({ testApp, app, request }) => {
    const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
    const conn = app.container.resolve(databaseManagerToken).connection();
    const projectId = (
      (await (
        await admin.fetch(
          '/projects',
          json({ name: 'Tier Project', visibility: 'members' }),
        )
      ).json()) as { data: { id: string } }
    ).data.id;
    const make = async (title: string) =>
      (
        (await (
          await admin.fetch('/projects/issues', json({ title, projectId }))
        ).json()) as { data: { id: string } }
      ).data.id;
    const first = await make('First');

    // No choice yet: the project's default, which is "standard" until someone says otherwise (Q7).
    expect(await tierOf(conn, first)).toMatchObject({
      tier: 'standard',
      source: 'default',
    });
    await conn.query
      .insertInto('dsAutopilotSettings')
      .values({
        projectId,
        enabled: 0 as never,
        mergeMethod: 'squash',
        stallMinutes: 30,
        sensitivePolicy: 'extraReview',
        defaultTier: 'small',
        updatedAt: new Date(),
      } as never)
      .execute();
    expect(await tierOf(conn, first)).toMatchObject({
      tier: 'small',
      source: 'default',
    });

    // A person chooses.
    await setTier(conn, first, 'standard', { userId: 'u1', reason: null });
    expect(await tierOf(conn, first)).toMatchObject({
      tier: 'standard',
      source: 'issue',
    });

    // Sensitive paths raise it, once; it records what it was raised from.
    expect(await raiseTier(conn, first, 'package.json')).toBe(true);
    expect(await raiseTier(conn, first, 'package.json')).toBe(false);
    expect(await tierOf(conn, first)).toMatchObject({
      tier: 'sensitive',
      raisedFrom: 'standard',
    });
    // Nothing lowers a raised issue by itself, and a person cannot go below it either.
    await e(
      setTier(conn, first, 'small', { userId: 'u1', reason: null }),
    ).rejects.toBeInstanceOf(TierError);
    expect((await tierOf(conn, first)).tier).toBe('sensitive');

    // Routes: 401, 403/404 for someone outside the project, 200 for a manager, 400 for a bad tier.
    const second = await make('Second');
    expect((await request(`/issues/${second}/tier`)).status).toBe(401);
    const read = await admin.fetch(`/issues/${second}/tier`);
    expect(read.status).toBe(200);
    expect(((await read.json()) as any).data).toMatchObject({
      tier: 'small',
      source: 'default',
    });
    const put = await admin.fetch(
      `/issues/${second}/tier`,
      json({ tier: 'sensitive', reason: 'touches billing' }, 'PUT'),
    );
    expect(put.status).toBe(200);
    expect(((await put.json()) as any).data).toMatchObject({
      tier: 'sensitive',
    });
    expect(
      (
        await admin.fetch(
          `/issues/${second}/tier`,
          json({ tier: 'huge' }, 'PUT'),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await admin.fetch(
          '/users',
          json({
            name: 'outsider3',
            username: 'outsider3',
            email: 'outsider3@example.test',
            password: PASSWORD,
            roleScopes: { app: [] },
          }),
        )
      ).status,
    ).toBe(201);
    const outsider = await signIn(testApp, {
      username: 'outsider3',
      password: PASSWORD,
    });
    expect([403, 404]).toContain(
      (await outsider.fetch(`/issues/${second}/tier`)).status,
    );
    expect([403, 404]).toContain(
      (
        await outsider.fetch(
          `/issues/${second}/tier`,
          json({ tier: 'small' }, 'PUT'),
        )
      ).status,
    );
    // The project's default is set through the autopilot settings.
    const settings = await admin.fetch(
      `/projects/${projectId}/autopilot`,
      json({ defaultTier: 'sensitive' }, 'PUT'),
    );
    expect(settings.status).toBe(200);
    expect(((await settings.json()) as any).data.defaultTier).toBe('sensitive');
  },
);
