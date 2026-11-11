import { randomUUID } from 'node:crypto';
import { expect } from 'vitest';
import { createAppTest } from '@nocobase/app-testing/server';
import {
  signIn,
  DEFAULT_ADMIN_CREDENTIALS,
} from '@nocobase/app-plugin-authentication/testing';
import { agentsToken } from '@nocobase/app-plugin-agents/server/tokens';
import { AGENT_KIND } from '../../server/agents/ids.js';
import { CONTRIBUTOR_SET_KEY } from '../../server/access/roles.js';
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

const PEOPLE = [
  '/reports/delivery',
  '/reports/agents',
  '/reports/projects',
  '/reports/attention',
  '/reports/learning',
];
const ALL = [...PEOPLE, '/reports/metrics', '/reports/usage'];

test(
  'the reports need the dashboard grant, cover what the caller sees and open to a run only by its action',
  { timeout: 240_000 },
  async ({ testApp, app, request }) => {
    for (const path of ALL) expect((await request(path)).status).toBe(401);

    const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
    const agents = app.container.resolve(agentsToken);
    const ownerId = (
      (await (await admin.fetch('/auth/get-session')).json()) as {
        user: { id: string };
      }
    ).user.id;
    const coder = await agents.agents.ensureSystem({
      id: 'ds-test-coder',
      name: 'Test coder',
      description: 'Implements.',
      instructions: null,
      actions: ['pm.issues/view'],
      modelEntries: [{ tool: 'claude', model: MODEL }],
    });
    const reader = await agents.agents.ensureSystem({
      id: 'ds-test-reader',
      name: 'Test reader',
      description: 'Reads the figures.',
      instructions: null,
      actions: ['pm.issues/view', 'studio.reports/read'],
      modelEntries: [{ tool: 'claude', model: MODEL }],
    });

    // A project with an issue an agent completes and one that stays blocked and overdue.
    const project = (
      await (
        await admin.fetch(
          '/projects',
          json({ name: 'Báo cáo', visibility: 'members' }),
        )
      ).json()
    ).data as { id: string };
    const newIssue = async (title: string, extra: object = {}) => {
      const made = await admin.fetch(
        '/projects/issues',
        json({
          title,
          statusKey: 'in_progress',
          projectId: project.id,
          executor: { type: AGENT_KIND, id: coder.id },
          ...extra,
        }),
      );
      expect(made.status).toBe(201);
      return (await made.json()).data as { id: string; revision: number };
    };
    const move = async (
      issue: { id: string; revision: number },
      statusKey: string,
      extra: object = {},
    ) => {
      const moved = await admin.fetch(
        `/projects/issues/${issue.id}`,
        json({ statusKey, revision: issue.revision, ...extra }, 'PATCH'),
      );
      expect(moved.status).toBe(200);
      return ((await moved.json()).data as { issue: typeof issue }).issue;
    };
    const finished = await newIssue('Đã giao xong');
    await move(finished, 'done', { acceptance: 'Đã làm.' });
    const stuck = await newIssue('Đang vướng', {
      dueDate: '2020-01-01',
      priority: 'high',
    });
    await move(stuck, 'blocked', { needsYou: 'Cần bạn quyết' });

    // The owner sees them.
    const delivery = (
      await (await admin.fetch('/reports/delivery?days=7')).json()
    ).data as {
      days: number;
      subjects: boolean;
      current: { completed: number; agentShare: number | null };
      buckets: unknown[];
    };
    expect(delivery).toMatchObject({ days: 7, subjects: true });
    expect(delivery.current.completed).toBe(1);
    expect(delivery.current.agentShare).toBe(1);
    expect(delivery.buckets).toHaveLength(7);
    expect((await admin.fetch('/reports/delivery?days=8')).status).toBe(400);
    expect((await admin.fetch('/reports/agents?days=90')).status).toBe(200);

    const projects = (await (await admin.fetch('/reports/projects')).json())
      .data as {
      days: number;
      projects: { id: string; completed: number; blocked: number }[];
    };
    expect(projects.days).toBe(30);
    expect(
      projects.projects.find((row) => row.id === project.id),
    ).toMatchObject({ completed: 1, blocked: 1 });

    const attention = (await (await admin.fetch('/reports/attention')).json())
      .data as {
      blocked: { total: number; items: { id: string; since: string }[] };
      overdue: { items: { id: string; since: string }[] };
      reviewWaits: { total: number };
      failedRuns: { total: number };
    };
    expect(attention.blocked.items.map((item) => item.id)).toContain(stuck.id);
    expect(
      attention.overdue.items.find((item) => item.id === stuck.id)?.since,
    ).toBe('2020-01-01');
    expect(attention.reviewWaits.total).toBe(0);

    const metricsAnswer = (await (
      await admin.fetch(`/reports/metrics?projectId=${project.id}`)
    ).json()) as {
      data: {
        projectId: string;
        aiShare: { share: number; deliveredTotal: number; byAgent: unknown[] };
        humanLoad: { openDecisions: number };
        reliability: { runs: number };
        statuses: { aiShare: string; lostRuns: string };
      };
      meta: { message: string };
    };
    expect(metricsAnswer.data.projectId).toBe(project.id);
    expect(metricsAnswer.data.aiShare).toMatchObject({
      share: 1,
      deliveredTotal: 1,
      byAgent: [{ agentId: coder.id, name: 'Test coder', count: 1 }],
    });
    expect(metricsAnswer.data.humanLoad.openDecisions).toBe(1);
    // Runs are counted by their issue's project.
    expect(metricsAnswer.data.reliability.runs).toBeGreaterThan(0);
    const elsewhere = (await (
      await admin.fetch(
        `/reports/metrics?projectId=${
          (
            (await (
              await admin.fetch('/projects', json({ name: 'Trống' }))
            ).json()) as { data: { id: string } }
          ).data.id
        }`,
      )
    ).json()) as { data: { reliability: { runs: number } } };
    expect(elsewhere.data.reliability.runs).toBe(0);
    expect(metricsAnswer.data.statuses.aiShare).toBe('ok');
    expect(metricsAnswer.meta.message.length).toBeGreaterThan(20);
    expect(
      (await admin.fetch('/reports/metrics?projectId=nowhere')).status,
    ).toBe(404);
    expect((await admin.fetch('/reports/metrics?from=nope')).status).toBe(400);

    const learningRes = await admin.fetch('/reports/learning?days=7');
    expect(learningRes.status).toBe(200);
    const learningData = (await learningRes.json()) as {
      data: { repeatedMistakes: unknown[]; newLessonsCount: number };
    };
    expect(learningData.data.repeatedMistakes).toBeDefined();
    expect(typeof learningData.data.newLessonsCount).toBe('number');

    const usage = (await (
      await admin.fetch('/reports/usage?groupBy=project')
    ).json()) as { data: { groupBy: string; rows: unknown[] } };
    expect(usage.data.groupBy).toBe('project');
    expect((await admin.fetch('/reports/usage?groupBy=type')).status).toBe(400);

    // A contributor holds the page but sees none of this private project's figures.
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
    const theirs = (
      await (await contributor.fetch('/reports/delivery?days=7')).json()
    ).data as { subjects: boolean; current: { completed: number } };
    expect(theirs.subjects).toBe(true);
    expect(theirs.current.completed).toBe(0);
    const theirProjects = (
      await (await contributor.fetch('/reports/projects')).json()
    ).data as { projects: { id: string }[] };
    expect(theirProjects.projects.some((row) => row.id === project.id)).toBe(
      false,
    );
    const theirAttention = (
      await (await contributor.fetch('/reports/attention')).json()
    ).data as { blocked: { items: { id: string }[] } };
    expect(
      theirAttention.blocked.items.some((row) => row.id === stuck.id),
    ).toBe(false);
    const theirRuns = (
      await (await contributor.fetch('/reports/agents?days=7')).json()
    ).data as { current: { runs: number } };
    expect(theirRuns.current.runs).toBe(0);
    expect(
      (await contributor.fetch(`/reports/metrics?projectId=${project.id}`))
        .status,
    ).toBe(404);

    // Someone without the page's grant gets no figures at all.
    const madeMember = await admin.fetch(
      '/users',
      json({
        name: 'member1',
        username: 'member1',
        email: 'member1@example.test',
        password: PASSWORD,
        roleScopes: { app: [] },
      }),
    );
    expect(madeMember.status).toBe(201);
    const member = await signIn(testApp, {
      username: 'member1',
      password: PASSWORD,
    });
    for (const path of ALL) expect((await member.fetch(path)).status).toBe(403);

    // A run reads only what its agent may, and never the people's routes.
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
    const asRun = (token: unknown, path: string) =>
      request(path, {
        headers: { 'x-nocobase-run-token': String(token) },
      });
    await newIssue('Đang làm');
    await newIssue('Đọc số liệu', {
      executor: { type: AGENT_KIND, id: reader.id },
    });
    const claimed = await agents.claims.claim(runner, 5);
    const tokens = new Map<string, unknown>();
    for (const payload of claimed) {
      const detail = (
        await (await admin.fetch(`/issueRuns/${payload.run.id}`)).json()
      ).data as { agentId: string };
      tokens.set(detail.agentId, payload.cli.credential.content.token);
    }
    const plain = tokens.get(coder.id);
    const allowed = tokens.get(reader.id);
    expect(plain).toBeDefined();
    expect(allowed).toBeDefined();
    expect((await asRun(plain, '/reports/metrics')).status).toBe(403);
    expect((await asRun(plain, '/reports/usage')).status).toBe(403);
    const readByRun = await asRun(allowed, '/reports/metrics');
    expect(readByRun.status).toBe(200);
    expect(
      ((await readByRun.json()).data as { subjects: boolean }).subjects,
    ).toBe(true);
    expect((await asRun(allowed, '/reports/usage')).status).toBe(200);
    for (const path of PEOPLE)
      expect([401, 403]).toContain((await asRun(allowed, path)).status);
  },
);
