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
const PASSWORD = 'Studio-test-123!';

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
  statusKey: string;
}

test(
  'issue work routes answer by who asks, and follow the run from queued to a decided failure',
  { timeout: 240_000 },
  async ({ testApp, app, request }) => {
    const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
    const { container } = app;
    const agents = container.resolve(agentsToken);
    const session = (await (await admin.fetch('/auth/get-session')).json()) as {
      user: { id: string };
    };
    const ownerId = session.user.id;

    const coder = await agents.agents.ensureSystem({
      id: 'ds-test-coder',
      name: 'Test coder',
      description: 'Implements.',
      instructions: null,
      actions: ['pm.issues/view', 'pm.issues/comment'],
      modelEntries: [{ tool: 'claude', model: MODEL }],
    });
    await agents.agents.ensureSystem({
      id: PROJECT_MANAGER_ID,
      name: 'Project manager',
      description: 'Coordinates.',
      instructions: null,
      actions: ['pm.issues/view', 'pm.issues/comment'],
      modelEntries: [{ tool: 'claude', model: MODEL }],
    });

    // A private project: a contributor outside it does not see its issues.
    const project = (
      await (
        await admin.fetch(
          '/projects',
          json({ name: 'Private', visibility: 'members' }),
        )
      ).json()
    ).data as { id: string };
    const created = await admin.fetch(
      '/projects/issues',
      json({
        title: 'Work issue',
        statusKey: 'in_progress',
        projectId: project.id,
        executor: { type: AGENT_KIND, id: coder.id },
      }),
    );
    expect(created.status).toBe(201);
    const issue = (await created.json()).data as IssueRef;

    const madeContributor = await admin.fetch(
      '/users',
      json({
        name: 'contributor1',
        username: 'contributor1',
        email: 'contributor1@example.test',
        password: PASSWORD,
        roleScopes: { app: [CONTRIBUTOR_SET_KEY] },
      }),
    );
    expect(madeContributor.status).toBe(201);
    const contributor = await signIn(testApp, {
      username: 'contributor1',
      password: PASSWORD,
    });

    const readPaths = [
      `/issueProgress/${issue.id}`,
      `/issueRuns?issue=${issue.id}`,
      `/issueCommentRuns/${issue.id}`,
      `/issueOwnerHandoffs/${issue.id}`,
      `/issuePanels/${issue.id}`,
    ];
    // Nobody signed in: 401, on every route.
    for (const path of [...readPaths, '/agentBoard'])
      expect((await request(path)).status).toBe(401);
    expect(
      (await request(`/agentBoard/issues/${issue.id}/start`, json({}))).status,
    ).toBe(401);

    // A contributor who cannot see the issue gets nothing about it, and no board row.
    for (const path of readPaths)
      expect((await contributor.fetch(path)).status).toBe(404);
    const contributorBoard = (
      await (await contributor.fetch('/agentBoard')).json()
    ).data as {
      rows: { issue: { id: string } }[];
    };
    expect(contributorBoard.rows.some((row) => row.issue.id === issue.id)).toBe(
      false,
    );
    expect(
      (
        await contributor.fetch(
          `/issues/${issue.id}/sendBack`,
          json({ revision: 1, content: 'Không' }),
        )
      ).status,
    ).toBe(404);

    // The owner sees the queued run.
    const queued = (
      await (await admin.fetch(`/issueProgress/${issue.id}`)).json()
    ).data as {
      state: string;
      agent: { id: string };
    };
    expect(queued.state).toBe('queued');
    expect(queued.agent.id).toBe(coder.id);
    const board = (await (await admin.fetch('/agentBoard')).json()).data as {
      rows: { state: string; issue: { id: string }; mine: boolean }[];
      summary: { queued: number };
    };
    expect(board.rows.find((row) => row.issue.id === issue.id)).toMatchObject({
      state: 'queued',
      mine: true,
    });
    expect(board.summary.queued).toBeGreaterThan(0);

    // A runner claims it: the run token reads runs but no route for people, and only its own hand-overs.
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
      features: ['input', 'workspaceKey', 'checkout'],
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
    const asRun = (path: string, init: RequestInit = {}) =>
      request(path, {
        ...init,
        headers: {
          ...(init.headers as Record<string, string> | undefined),
          'x-nocobase-run-token': String(payload.cli.credential.content.token),
        },
      });
    expect((await asRun(`/issueRuns?issue=${issue.id}`)).status).toBe(200);
    expect((await asRun(`/issueProgress/${issue.id}`)).status).toBe(403);
    expect((await asRun('/agentBoard')).status).toBe(403);
    expect(
      (
        await asRun(
          `/failedRuns/${payload.run.id}/decide`,
          json({ action: 'cancel' }),
        )
      ).status,
    ).toBe(403);

    const working = (
      await (await admin.fetch(`/issueProgress/${issue.id}`)).json()
    ).data as {
      state: string;
      runner: string | null;
    };
    expect(working.state).toBe('working');

    // The transcript and the run's own page.
    const runs = (await (
      await admin.fetch(`/issueRuns?issue=${issue.id}`)
    ).json()) as {
      data: { id: string; agentId: string; status: string }[];
    };
    expect(runs.data[0].agentId).toBe(coder.id);
    expect(['dispatched', 'running']).toContain(runs.data[0].status);
    expect((await admin.fetch(`/issueRuns/${runs.data[0].id}`)).status).toBe(
      200,
    );
    expect(
      (await admin.fetch(`/issueRuns/${runs.data[0].id}/events`)).status,
    ).toBe(200);
    expect(
      (await contributor.fetch(`/issueRuns/${runs.data[0].id}`)).status,
    ).toBe(404);

    // Only a failed run has a card; a person cannot dispatch and a person-only decision cannot be taken by the outsider.
    expect(
      (
        await admin.fetch(
          `/failedRuns/${runs.data[0].id}/decide`,
          json({ action: 'retry' }),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await admin.fetch(
          `/failedRuns/${runs.data[0].id}/dispatch`,
          json({ content: 'x' }),
        )
      ).status,
    ).toBe(403);

    // The run fails: the progress asks for a decision, and cancelling it answers once.
    await agents.reports.fail(runner, payload.run.id, {
      reason: 'toolProcess',
      detail: 'Tiến trình dừng.',
    } as never);
    const failed = (
      await (await admin.fetch(`/issueProgress/${issue.id}`)).json()
    ).data as {
      state: string;
      failedRunId: string;
    };
    expect(failed.state).toBe('needsDecision');
    expect(failed.failedRunId).toBe(payload.run.id);
    expect(
      (
        await contributor.fetch(
          `/failedRuns/${payload.run.id}/decide`,
          json({ action: 'cancel' }),
        )
      ).status,
    ).toBe(404);
    const decided = await admin.fetch(
      `/failedRuns/${payload.run.id}/decide`,
      json({ action: 'cancel' }),
    );
    expect(decided.status).toBe(200);
    expect((await decided.json()).data).toEqual({ outcome: 'cancelled' });
    expect(
      (
        await admin.fetch(
          `/failedRuns/${payload.run.id}/decide`,
          json({ action: 'retry' }),
        )
      ).status,
    ).toBe(400);

    // Sending back: only from acceptance.
    const current = (
      await (await admin.fetch(`/projects/issues/${issue.id}`)).json()
    ).data as {
      issue?: IssueRef;
    } & IssueRef;
    const revision = (current.issue ?? current).revision;
    expect(
      (
        await admin.fetch(
          `/issues/${issue.id}/sendBack`,
          json({ revision, content: 'Sửa lại.' }),
        )
      ).status,
    ).toBe(400);
    const moved = await admin.fetch(
      `/projects/issues/${issue.id}`,
      json(
        { statusKey: 'in_review', revision, acceptance: 'Đã xong' },
        'PATCH',
      ),
    );
    expect(moved.status).toBe(200);
    const inReview = ((await moved.json()).data as { issue: IssueRef }).issue;
    const sentBack = await admin.fetch(
      `/issues/${issue.id}/sendBack`,
      json({ revision: inReview.revision, content: 'Sửa lại phần này.' }),
    );
    expect(sentBack.status).toBe(200);
    expect(
      ((await sentBack.json()).data as { commentId: string }).commentId,
    ).toBeTruthy();

    // The panel gathers the sections.
    const panels = (
      await (await admin.fetch(`/issuePanels/${issue.id}`)).json()
    ).data as {
      progress: { state: string };
      ownerHandoff: { handoff: unknown };
      commentRunLimit: unknown;
    };
    expect(panels.progress.state).toBeTruthy();
    expect(panels.ownerHandoff.handoff).toBeNull();
    expect(panels.commentRunLimit).toBeNull();
  },
);
