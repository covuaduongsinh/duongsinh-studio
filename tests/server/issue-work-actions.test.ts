import { randomUUID } from 'node:crypto';
import { expect } from 'vitest';
import { createAppTest } from '@nocobase/app-testing/server';
import {
  signIn,
  DEFAULT_ADMIN_CREDENTIALS,
} from '@nocobase/app-plugin-authentication/testing';
import { agentsToken } from '@nocobase/app-plugin-agents/server/tokens';
import { CONTRIBUTOR_SET_KEY } from '../../server/access/roles.js';
import { AGENT_KIND, PROJECT_MANAGER_ID } from '../../server/agents/ids.js';
import { createStandaloneServer } from '../../server/standalone.js';

const test = createAppTest({
  createServer: createStandaloneServer,
  config: {
    app: { publicOrigin: 'http://localhost' },
    auth: { secret: 'test-auth-secret-at-least-32-characters' },
  },
});

const PROTOCOL_VERSION = 14;
const MODEL = 'claude-sonnet-4-5';

const json = (body: unknown, method = 'POST') => ({
  method,
  headers: {
    'content-type': 'application/json',
    origin: 'http://localhost',
    'Idempotency-Key': `${Date.now()}.${randomUUID()}`,
  },
  body: JSON.stringify(body),
});

interface IssueRef {
  id: string;
  revision: number;
}

test(
  'failed runs are retried and handed over, a held comment continues, and an owner handoff is decided',
  { timeout: 240_000 },
  async ({ testApp, app, request }) => {
    const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
    const agents = app.container.resolve(agentsToken);
    const session = (await (await admin.fetch('/auth/get-session')).json()) as {
      user: { id: string };
    };
    const actions = ['pm.issues/view', 'pm.issues/comment', 'pm.issues/edit'];
    const entry = { tool: 'claude', model: MODEL };
    const coder = await agents.agents.ensureSystem({
      id: 'ds-test-coder',
      name: 'Test coder',
      description: 'Implements.',
      instructions: null,
      actions,
      modelEntries: [entry],
    });
    await agents.agents.ensureSystem({
      id: PROJECT_MANAGER_ID,
      name: 'Project manager',
      description: 'Coordinates.',
      instructions: null,
      actions,
      modelEntries: [entry],
    });
    const registration = await agents.runners.createRegistrationToken(
      session.user.id,
      { trust: 'ownerOnly' },
    );
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
    const tokenOf = (payload: {
      cli: { credential: { content: { token: unknown } } };
    }) => String(payload.cli.credential.content.token);
    const withToken = (token: string, init: RequestInit = {}) => ({
      ...init,
      headers: {
        ...(init.headers as Record<string, string> | undefined),
        'x-nocobase-run-token': token,
      },
    });
    const newIssue = async (title: string, status = 'in_progress') => {
      const created = await admin.fetch(
        '/projects/issues',
        json({
          title,
          statusKey: status,
          executor: { type: AGENT_KIND, id: coder.id },
        }),
      );
      expect(created.status).toBe(201);
      return (await created.json()).data as IssueRef;
    };
    const fail = (runId: string) =>
      agents.reports.fail(runner, runId, {
        reason: 'toolProcess',
        detail: 'Tiến trình dừng.',
      } as never);

    // Retry: a failed run starts again, and its card is answered.
    const retried = await newIssue('Retry');
    const [firstRun] = await agents.claims.claim(runner, 1);
    await fail(firstRun.run.id);
    const decision = await admin.fetch(
      `/failedRuns/${firstRun.run.id}/decide`,
      json({ action: 'retry' }),
    );
    expect(decision.status).toBe(200);
    const answered = (await decision.json()).data as {
      outcome: string;
      runId: string;
    };
    expect(answered.outcome).toBe('retried');
    expect(answered.runId).not.toBe(firstRun.run.id);
    const after = (
      await (await admin.fetch(`/issueProgress/${retried.id}`)).json()
    ).data as {
      failedRunId: string | null;
    };
    expect(after.failedRunId).toBeNull();
    await agents.claims.claim(runner, 1).then((held) => fail(held[0].run.id));
    await admin.fetch(
      `/failedRuns/${answered.runId}/decide`,
      json({ action: 'cancel' }),
    );

    // Handing to the project manager starts it; a run token may not.
    const handed = await newIssue('Handed', 'backlog');
    const started = await admin.fetch(
      `/projectManager/issues/${handed.id}/start`,
      json({}),
    );
    expect(started.status).toBe(200);
    const managerRunId = (
      (await started.json()).data as { runId: string | null }
    ).runId;
    expect(managerRunId).toBeTruthy();
    const [managerClaim] = await agents.claims.claim(runner, 1);
    expect(managerClaim.run.id).toBe(managerRunId);
    const managerToken = tokenOf(managerClaim);
    expect(
      (
        await request(
          `/projectManager/issues/${handed.id}/start`,
          withToken(managerToken, json({})),
        )
      ).status,
    ).toBe(403);

    // The manager's mention starts the coder; when its run fails the manager hands the step over.
    const mention = `[@coder](mention://agent/${coder.id})`;
    const handOver = await request(
      `/projects/issues/${handed.id}/comments`,
      withToken(
        managerToken,
        json({ content: `${mention}\n\nNext: làm bước đầu.` }),
      ),
    );
    expect(handOver.status).toBe(201);
    const [coderClaim] = await agents.claims.claim(runner, 1);
    expect((await agents.runs.get(coderClaim.run.id)).agentId).toBe(coder.id);
    await fail(coderClaim.run.id);
    // A person cannot use the run's way, and a hand-over names exactly one agent.
    expect(
      (
        await admin.fetch(
          `/failedRuns/${coderClaim.run.id}/dispatch`,
          json({ content: mention }),
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await request(
          `/failedRuns/${coderClaim.run.id}/dispatch`,
          withToken(managerToken, json({ content: 'Không nhắc agent nào.' })),
        )
      ).status,
    ).toBe(400);
    const dispatched = await request(
      `/failedRuns/${coderClaim.run.id}/dispatch`,
      withToken(
        managerToken,
        json({ content: `${mention}\n\nNext: thử lại.` }),
      ),
    );
    expect(dispatched.status).toBe(200);
    const replacement = (await dispatched.json()).data as {
      commentId: string;
      runId: string;
    };
    expect(replacement.commentId).toBeTruthy();
    expect(replacement.runId).not.toBe(coderClaim.run.id);

    // The replacement fails too; the manager confirms another step it already started.
    const [replacementClaim] = await agents.claims.claim(runner, 1);
    expect(replacementClaim.run.id).toBe(replacement.runId);
    await fail(replacement.runId);
    const confirmed = await request(
      '/failedRuns/confirmHandoff',
      withToken(
        managerToken,
        json({
          failedRunId: replacement.runId,
          replacementRunId: managerRunId,
        }),
      ),
    );
    expect(confirmed.status).toBe(200);
    expect((await confirmed.json()).data).toEqual({ outcome: 'reassigned' });

    // A run limit of one: the manager's second mention is held, and the owner lets it continue.
    expect(
      (
        await admin.fetch(
          '/projectManager',
          json({ commentRunLimit: 1 }, 'PATCH'),
        )
      ).status,
    ).toBe(200);
    const held = await request(
      `/projects/issues/${handed.id}/comments`,
      withToken(
        managerToken,
        json({ content: `${mention}\n\nNext: còn một việc.` }),
      ),
    );
    expect(held.status).toBe(201);
    const limit = (
      await (await admin.fetch(`/issueCommentRuns/${handed.id}`)).json()
    ).data as {
      token: string;
      maxRuns: number;
      windowHours: number;
    } | null;
    expect(limit).toMatchObject({ maxRuns: 1, windowHours: 24 });
    const holding = (
      await (await admin.fetch(`/issueProgress/${handed.id}`)).json()
    ).data as {
      state: string;
    };
    expect(holding.state).not.toBe('finished');
    expect(
      (
        await admin.fetch(
          `/issueCommentRuns/${handed.id}/continue`,
          json({ token: randomUUID() }),
        )
      ).status,
    ).toBe(400);
    const continued = await admin.fetch(
      `/issueCommentRuns/${handed.id}/continue`,
      json({ token: limit?.token }),
    );
    expect(continued.status).toBe(200);
    expect(
      ((await continued.json()).data as { runIds: string[] }).runIds.length,
    ).toBeGreaterThan(0);
    expect(
      (await (await admin.fetch(`/issueCommentRuns/${handed.id}`)).json()).data,
    ).toBeNull();

    // An owner handoff: the new owner decides; rejecting returns the issue.
    const member = await admin.fetch(
      '/users',
      json({
        name: 'contributor1',
        username: 'contributor1',
        email: 'contributor1@example.test',
        password: 'Studio-test-123!',
        roleScopes: { app: [CONTRIBUTOR_SET_KEY] },
      }),
    );
    expect(member.status).toBe(201);
    const memberId = ((await member.json()).data as { id: string }).id;
    const contributor = await signIn(testApp, {
      username: 'contributor1',
      password: 'Studio-test-123!',
    });
    const owned = await newIssue('Handoff', 'backlog');
    const transferred = await admin.fetch(
      `/projects/issues/${owned.id}`,
      json({ ownerUserId: memberId, revision: owned.revision }, 'PATCH'),
    );
    expect(transferred.status).toBe(200);
    const view = (
      await (await contributor.fetch(`/issueOwnerHandoffs/${owned.id}`)).json()
    ).data as {
      handoff: {
        waiting: boolean;
        ownerUserId: string;
        previousOwnerUserId: string;
        notificationKey: string;
      };
      canDecide: boolean;
    };
    expect(view.handoff).toMatchObject({
      waiting: true,
      ownerUserId: memberId,
      previousOwnerUserId: session.user.id,
    });
    expect(view.canDecide).toBe(true);
    // Who handed it away does not decide.
    expect(
      (
        await admin.fetch(
          `/issueOwnerHandoffs/${owned.id}/reject`,
          json({ notificationKey: view.handoff.notificationKey }),
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await contributor.fetch(
          `/issueOwnerHandoffs/${owned.id}/accept`,
          json({ notificationKey: randomUUID() }),
        )
      ).status,
    ).toBe(400);
    const rejected = await contributor.fetch(
      `/issueOwnerHandoffs/${owned.id}/reject`,
      json({ notificationKey: view.handoff.notificationKey }),
    );
    expect(rejected.status).toBe(200);
    const issueAfter = (
      await (await admin.fetch(`/projects/issues/${owned.id}`)).json()
    ).data as {
      issue?: { ownerUserId: string };
      ownerUserId?: string;
    };
    expect(issueAfter.issue?.ownerUserId ?? issueAfter.ownerUserId).toBe(
      session.user.id,
    );
  },
);
