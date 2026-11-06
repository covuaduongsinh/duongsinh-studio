import { randomUUID } from 'node:crypto';
import { expect } from 'vitest';
import { createAppTest } from '@nocobase/app-testing/server';
import {
  signIn,
  DEFAULT_ADMIN_CREDENTIALS,
} from '@nocobase/app-plugin-authentication/testing';
import { projectsToken } from '@nocobase/app-plugin-projects/server/tokens';
import { databaseManagerToken } from '@nocobase/db';
import { PROJECT_MANAGER_ID } from '../../server/agents/ids.js';
import { PROJECT_MANAGER_PRINCIPLES } from '../../server/agents/project-manager-principles.js';
import {
  AUTOPILOT_ON_RULE,
  createIssueSubject,
} from '../../server/providers/issue-subject.js';
import { autopilotServiceToken } from '../../server/providers/autopilot.js';
import { createStandaloneServer } from '../../server/standalone.js';

// The project manager writes needsYou on every delivery, and autopilot merges only without one: the claim has to tell
// it when autopilot is on, or a project with autopilot on never merges by itself.
const test = createAppTest({
  createServer: createStandaloneServer,
  config: {
    app: { publicOrigin: 'http://localhost' },
    auth: { secret: 'test-auth-secret-at-least-32-characters' },
  },
});

const json = (body: unknown) => ({
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    origin: 'http://localhost',
    'Idempotency-Key': `${Date.now()}.${randomUUID()}`,
  },
  body: JSON.stringify(body),
});

test(
  'the project manager hears whether autopilot is on, read-only turns start fresh and earlier turns come along',
  { timeout: 120_000 },
  async ({ testApp, app }) => {
    const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
    const { container } = app;
    const created = await admin.fetch(
      '/projects',
      json({ name: 'Autopilot brief' }),
    );
    expect(created.status).toBe(201);
    const project = (await created.json()).data as { id: string };
    const issued = await admin.fetch(
      '/projects/issues',
      json({ title: 'Brief', statusKey: 'backlog', projectId: project.id }),
    );
    expect(issued.status).toBe(201);
    const issue = (await issued.json()).data as { id: string };

    const summaries = [
      {
        id: 'earlier',
        status: 'succeeded',
        finishedAt: '2026-11-06T10:00:00.000Z',
        summary: 'Đã giao bước đầu.',
      },
    ];
    const subject = createIssueSubject({
      projects: container.resolve(projectsToken),
      viewerOf: () => Promise.resolve(null),
      translate: () => Promise.resolve((key) => key),
      recentSummaries: () => Promise.resolve(summaries),
    });
    const claim = (agentId: string, text = 'Tiếp tục') =>
      ({
        agent: { id: agentId },
        run: { id: 'run-1', subject: { kind: 'issue', id: issue.id } },
        inputs: [{ actor: { name: 'Tự lái' }, text, payload: null }],
        cli: { command: 'ds-studio', manifest: { commands: [] } },
      }) as never;
    const conn = container.resolve(databaseManagerToken).connection();
    const assemble = (agentId: string) =>
      subject.context.assemble(conn, claim(agentId));
    const rules = async (agentId: string) =>
      (await assemble(agentId)).guidance?.rules ?? [];

    // Off by default.
    expect(await rules(PROJECT_MANAGER_ID)).not.toContain(AUTOPILOT_ON_RULE);

    const autopilot = container.resolve(autopilotServiceToken);
    await autopilot.saveSettings(project.id, { enabled: true });
    expect(await rules(PROJECT_MANAGER_ID)).toContain(AUTOPILOT_ON_RULE);
    // Only the project manager moves issues.
    expect(await rules('some-other-agent')).not.toContain(AUTOPILOT_ON_RULE);

    // Paused means a person merges again, so needsYou is right again.
    await autopilot.pause(project.id, 'Nghỉ', 'user-admin');
    expect(await rules(PROJECT_MANAGER_ID)).not.toContain(AUTOPILOT_ON_RULE);

    // The principles say what to do with that line.
    expect(PROJECT_MANAGER_PRINCIPLES).toContain('để trống `needsYou`');

    // Hand-over history goes only to the project manager, outside the reusable brief.
    const coordinating = await assemble(PROJECT_MANAGER_ID);
    expect(coordinating.turn?.fresh).toContain('Đã giao bước đầu.');
    expect((await assemble('some-other-agent')).turn?.fresh).toBeUndefined();

    // A read-only turn starts a fresh tool session.
    expect(
      subject.sessionPolicy?.(
        claim('reviewer', 'Next: review\nMode: read-only'),
      ),
    ).toBe('fresh');
    expect(subject.sessionPolicy?.(claim('coder', 'Next: sửa'))).toBe('reuse');
  },
);
