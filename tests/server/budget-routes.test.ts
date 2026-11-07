// @vitest-environment node
import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { createAppTest } from '@nocobase/app-testing/server';
import {
  signIn,
  DEFAULT_ADMIN_CREDENTIALS,
} from '@nocobase/app-plugin-authentication/testing';
import { agentsToken } from '@nocobase/app-plugin-agents/server/tokens';
import { databaseManagerToken } from '@nocobase/db';
import { CONTRIBUTOR_SET_KEY } from '../../server/access/roles.js';
import { AGENT_KIND } from '../../server/agents/ids.js';
import {
  budgetPeriodOf,
  budgetState,
  createBudgetService,
} from '../../server/budgets/service.js';
import { createStandaloneServer } from '../../server/standalone.js';

const test = createAppTest({
  createServer: createStandaloneServer,
  config: {
    app: { publicOrigin: 'http://localhost' },
    auth: { secret: 'test-auth-secret-at-least-32-characters' },
  },
});

const PASSWORD = 'Studio-test-123!';
const MODEL = 'claude-sonnet-4-5';
const PROTOCOL_VERSION = 14;

const json = (body: unknown, method = 'POST') => ({
  method,
  headers: {
    'content-type': 'application/json',
    origin: 'http://localhost',
    'Idempotency-Key': `${Date.now()}.${randomUUID()}`,
  },
  body: JSON.stringify(body),
});

interface Budget {
  id: string;
  scope: string;
  state: string;
  usedRuns: number;
  maxRuns: number | null;
}

describe('what the figures mean', () => {
  const figures = {
    usedRuns: 0,
    usedTokens: 0,
    maxRuns: 10,
    maxTokens: 1000,
    released: false,
  };

  it('warns from 80%, stops at 100%, and a release lets work through', () => {
    expect(budgetState({ ...figures, usedRuns: 7 })).toBe('ok');
    expect(budgetState({ ...figures, usedRuns: 8 })).toBe('warning');
    expect(budgetState({ ...figures, usedTokens: 800 })).toBe('warning');
    expect(budgetState({ ...figures, usedRuns: 10 })).toBe('blocked');
    expect(budgetState({ ...figures, usedTokens: 5000 })).toBe('blocked');
    expect(budgetState({ ...figures, usedRuns: 10, released: true })).toBe(
      'released',
    );
    // A release is for the limit: below it, the figures speak.
    expect(budgetState({ ...figures, usedRuns: 8, released: true })).toBe(
      'warning',
    );
  });

  it('a limit left out never stops, and a limit of nothing always does', () => {
    expect(
      budgetState({
        ...figures,
        maxRuns: null,
        usedRuns: 999,
        maxTokens: null,
      }),
    ).toBe('ok');
    expect(budgetState({ ...figures, maxRuns: 0 })).toBe('blocked');
  });

  it('periods turn at midnight in Vietnam', () => {
    // 23:30 UTC on the 31st is already 06:30 on the 1st in Vietnam.
    const moment = new Date('2026-10-31T23:30:00.000Z');
    expect(budgetPeriodOf('day', moment)).toEqual({
      key: '2026-11-01',
      since: new Date('2026-10-31T17:00:00.000Z'),
    });
    expect(budgetPeriodOf('month', moment)).toEqual({
      key: '2026-11',
      since: new Date('2026-10-31T17:00:00.000Z'),
    });
    expect(
      budgetPeriodOf('day', new Date('2026-11-01T16:59:00.000Z')).key,
    ).toBe('2026-11-01');
  });
});

test(
  'budgets belong to who holds them, stop every run being queued, tell people once, and can be released',
  { timeout: 240_000 },
  async ({ app, testApp, request }) => {
    for (const path of ['/budgets', '/notificationPreferences'])
      expect((await request(path)).status).toBe(401);

    const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
    const ownerId = (
      (await (await admin.fetch('/auth/get-session')).json()) as {
        user: { id: string };
      }
    ).user.id;
    expect(
      (
        await admin.fetch(
          '/users',
          json({
            name: 'contributor1',
            username: 'contributor1',
            email: 'contributor1@example.test',
            password: PASSWORD,
            roleScopes: { app: [CONTRIBUTOR_SET_KEY] },
          }),
        )
      ).status,
    ).toBe(201);
    const contributor = await signIn(testApp, {
      username: 'contributor1',
      password: PASSWORD,
    });

    // A contributor reads and sets neither, yet chooses their own notifications.
    expect((await contributor.fetch('/budgets')).status).toBe(403);
    expect(
      (
        await contributor.fetch(
          '/budgets',
          json({ scope: 'global', period: 'day', maxRuns: 5 }, 'PUT'),
        )
      ).status,
    ).toBe(403);
    expect(
      (await (await contributor.fetch('/notificationPreferences')).json()).data,
    ).toEqual({
      emailDecisions: true,
      emailReports: true,
      pushDecisions: true,
      emailAvailable: false,
    });
    const chosen = await contributor.fetch(
      '/notificationPreferences',
      json({ emailReports: false }, 'PUT'),
    );
    expect(chosen.status).toBe(200);
    expect((await chosen.json()).data).toMatchObject({
      emailDecisions: true,
      emailReports: false,
    });
    // One person's choice is not another's.
    expect(
      (await (await admin.fetch('/notificationPreferences')).json()).data
        .emailReports,
    ).toBe(true);

    // Nonsense is refused.
    for (const body of [
      { scope: 'global', period: 'day' },
      { scope: 'global', scopeId: 'x', period: 'day', maxRuns: 1 },
      { scope: 'project', period: 'day', maxRuns: 1 },
      { scope: 'global', period: 'week', maxRuns: 1 },
      { scope: 'global', period: 'day', maxRuns: -1 },
    ])
      expect((await admin.fetch('/budgets', json(body, 'PUT'))).status).toBe(
        400,
      );

    const { container } = app;
    const agents = container.resolve(agentsToken);
    const coder = await agents.agents.ensureSystem({
      id: 'ds-test-coder',
      name: 'Test coder',
      description: 'Implements.',
      instructions: null,
      actions: ['pm.issues/view', 'pm.issues/comment'],
      modelEntries: [{ tool: 'claude', model: MODEL }],
    });
    const project = (
      await (
        await admin.fetch(
          '/projects',
          json({ name: 'Sandbox', visibility: 'members' }),
        )
      ).json()
    ).data as { id: string };
    const other = (
      await (
        await admin.fetch(
          '/projects',
          json({ name: 'Khác', visibility: 'members' }),
        )
      ).json()
    ).data as { id: string };
    const conn = () => container.resolve(databaseManagerToken).connection();
    const runsOn = async (issueId: string) =>
      (
        await conn()
          .query.selectFrom('agRuns')
          .select(['id'])
          .where('subjectId', '=', issueId)
          .execute()
      ).length;
    const issueOn = async (projectId: string, title: string) =>
      (
        await (
          await admin.fetch(
            '/projects/issues',
            json({
              title,
              statusKey: 'in_progress',
              projectId,
              executor: { type: AGENT_KIND, id: coder.id },
            }),
          )
        ).json()
      ).data as { id: string };

    // With no budget, work runs as ever.
    const before = await issueOn(project.id, 'Trước ngân sách');
    expect(await runsOn(before.id)).toBe(1);

    // A project's budget stops work on that project, and only that.
    const saved = await admin.fetch(
      '/budgets',
      json(
        { scope: 'project', scopeId: project.id, period: 'day', maxRuns: 1 },
        'PUT',
      ),
    );
    expect(saved.status).toBe(200);
    const budget = (await saved.json()).data as Budget;
    expect(budget).toMatchObject({
      scope: 'project',
      maxRuns: 1,
      usedRuns: 1,
      state: 'blocked',
    });
    const stopped = await issueOn(project.id, 'Bị ngân sách chặn');
    expect(await runsOn(stopped.id)).toBe(0);
    // Starting it by hand is refused, and says why.
    const byHand = await admin.fetch(
      `/agentBoard/issues/${stopped.id}/start`,
      json({}),
    );
    expect(byHand.status).toBe(400);
    expect((await byHand.json()).error.reason).toBe('BUDGET_EXHAUSTED');
    const elsewhere = await issueOn(other.id, 'Dự án khác');
    expect(await runsOn(elsewhere.id)).toBe(1);

    // People are told after the work's transaction, and only once however often it is stopped.
    await issueOn(project.id, 'Bị chặn lần nữa');
    await vi.waitFor(async () => {
      const events = await conn()
        .query.selectFrom('dsBudgetEvents')
        .select(['kind'])
        .where('budgetId', '=', budget.id)
        .execute();
      expect(events).toEqual([{ kind: 'blocked' }]);
    });

    // The form offers what a budget can be set on, and only to its holder.
    expect((await contributor.fetch('/budgets/scopeOptions')).status).toBe(403);
    const options = (await (await admin.fetch('/budgets/scopeOptions')).json())
      .data as { projects: { name: string }[]; agents: { id: string }[] };
    expect(options.projects.map(({ name }) => name)).toContain('Sandbox');
    expect(options.agents.map(({ id }) => id)).toContain(coder.id);
    expect(budget.scope).toBe('project');
    const listed = (await (await admin.fetch('/budgets')).json())
      .data as (Budget & { scopeName: string })[];
    expect(listed[0]?.scopeName).toBe('Sandbox');

    // Setting the same scope and period again changes that budget, not adds one.
    const raised = (
      await (
        await admin.fetch(
          '/budgets',
          json(
            {
              scope: 'project',
              scopeId: project.id,
              period: 'day',
              maxRuns: 2,
            },
            'PUT',
          ),
        )
      ).json()
    ).data as Budget;
    expect(raised.id).toBe(budget.id);
    expect(raised.state).toBe('ok');
    expect(
      (
        await admin.fetch(
          '/budgets',
          json(
            {
              scope: 'project',
              scopeId: project.id,
              period: 'day',
              maxRuns: 1,
            },
            'PUT',
          ),
        )
      ).status,
    ).toBe(200);

    // A contributor cannot release it; its holder can, and work runs again.
    expect(
      (await contributor.fetch(`/budgets/${budget.id}/release`, json({})))
        .status,
    ).toBe(403);
    const released = await admin.fetch(
      `/budgets/${budget.id}/release`,
      json({}),
    );
    expect(released.status).toBe(200);
    expect((await released.json()).data.state).toBe('released');
    const after = await issueOn(project.id, 'Sau khi mở chặn');
    expect(await runsOn(after.id)).toBe(1);

    // A run's token is not a person: it reads no budgets and chooses nothing.
    const registration = await agents.runners.createRegistrationToken(ownerId, {
      trust: 'ownerOnly',
    });
    const registered = await agents.runners.register({
      registrationToken: registration.token,
      name: 'test-runner',
      hostname: 'test-host',
      os: 'linux',
      arch: 'x64',
      version: '0.0.0-test',
      protocolVersion: PROTOCOL_VERSION,
      features: ['input', 'workspaceKey', 'checkout', 'skills'],
      tools: [
        {
          kind: 'claude',
          authenticated: true,
          status: 'ready',
          models: [{ id: MODEL }],
        },
      ],
    });
    const runner = await agents.runners.authenticate(registered.runnerKey);
    const [payload] = await agents.claims.claim(runner, 1);
    const asRun = {
      'x-nocobase-run-token': String(payload?.cli.credential.content.token),
    };
    for (const path of ['/budgets', '/notificationPreferences'])
      expect([401, 403]).toContain(
        (await request(path, { headers: asRun })).status,
      );

    // Removing it takes its record too, and work is free again.
    expect(
      (
        await contributor.fetch(`/budgets/${budget.id}`, {
          ...json({}, 'DELETE'),
          body: undefined,
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await admin.fetch(`/budgets/${budget.id}`, {
          ...json({}, 'DELETE'),
          body: undefined,
        })
      ).status,
    ).toBe(204);
    expect(
      (
        await admin.fetch(`/budgets/${budget.id}`, {
          ...json({}, 'DELETE'),
          body: undefined,
        })
      ).status,
    ).toBe(404);
    expect(
      await conn()
        .query.selectFrom('dsBudgetEvents')
        .select(['id'])
        .where('budgetId', '=', budget.id)
        .execute(),
    ).toEqual([]);

    // A new period starts clean: nothing the last one used, nothing it released.
    const notify = vi.fn(async () => undefined);
    let today = new Date();
    const clocked = createBudgetService({
      conn,
      notify,
      now: () => today,
    });
    const global = await clocked.save({
      scope: 'global',
      scopeId: '',
      period: 'day',
      maxRuns: 1,
      maxTokens: null,
      byUserId: ownerId,
    });
    expect(global.state).toBe('blocked');
    await clocked.release(global.id, ownerId);
    expect(await clocked.stopsIssue(after.id, coder.id)).toBeNull();
    today = new Date(today.getTime() + 40 * 24 * 60 * 60 * 1000);
    expect(
      (await clocked.list()).find(({ id }) => id === global.id),
    ).toMatchObject({
      usedRuns: 0,
      state: 'ok',
    });
    expect(notify).not.toHaveBeenCalled();
    expect(await clocked.remove(global.id)).toBe(true);
  },
);
