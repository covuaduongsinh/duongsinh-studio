import { randomUUID } from 'node:crypto';
import { expect } from 'vitest';
import { createAppTest } from '@nocobase/app-testing/server';
import {
  signIn,
  DEFAULT_ADMIN_CREDENTIALS,
} from '@nocobase/app-plugin-authentication/testing';
import { agentsToken } from '@nocobase/app-plugin-agents/server/tokens';
import { CONTRIBUTOR_SET_KEY } from '../../server/access/roles.js';
import { AGENT_KIND } from '../../server/agents/ids.js';
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

interface Offer {
  id: string;
  status: string;
  docId: string | null;
  targetScope: string | null;
  canDecide?: boolean;
}

test(
  'an agent suggests keeping a file, and the person who sent it or owns the issue decides',
  { timeout: 240_000 },
  async ({ testApp, app, request }) => {
    expect((await request('/kb/offers?issueId=x')).status).toBe(401);
    expect((await request('/kb/docs')).status).toBe(401);
    expect((await request('/kb/offers/x/reject', json({}))).status).toBe(401);

    const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
    const agents = app.container.resolve(agentsToken);
    const ownerId = (
      (await (await admin.fetch('/auth/get-session')).json()) as {
        user: { id: string };
      }
    ).user.id;
    const offering = await agents.agents.ensureSystem({
      id: 'ds-test-offering',
      name: 'Offering agent',
      description: 'Suggests.',
      instructions: null,
      actions: ['pm.issues/view', 'kb.knowledge/read', 'kb.knowledge/propose'],
      modelEntries: [{ tool: 'claude', model: MODEL }],
    });
    const plain = await agents.agents.ensureSystem({
      id: 'ds-test-plain',
      name: 'Plain agent',
      description: 'Implements.',
      instructions: null,
      actions: ['pm.issues/view'],
      modelEntries: [{ tool: 'claude', model: MODEL }],
    });
    const project = (
      await (
        await admin.fetch(
          '/projects',
          json({ name: 'Tri thức', visibility: 'members' }),
        )
      ).json()
    ).data as { id: string };
    const issueFor = async (agentId: string, title: string) =>
      (
        (await (
          await admin.fetch(
            '/projects/issues',
            json({
              title,
              statusKey: 'in_progress',
              projectId: project.id,
              executor: { type: AGENT_KIND, id: agentId },
            }),
          )
        ).json()) as { data: { id: string } }
      ).data;
    const issue = await issueFor(offering.id, 'Có tệp');
    const other = await issueFor(plain.id, 'Không được đề xuất');

    const upload = async (issueId: string, name: string) => {
      const form = new FormData();
      form.append(
        'file',
        new File(['Nội dung tệp'], name, { type: 'text/plain' }),
      );
      const made = await admin.fetch(
        `/projects/issues/${issueId}/attachments`,
        {
          method: 'POST',
          headers: {
            origin: 'http://localhost',
            'Idempotency-Key': `${Date.now()}.${randomUUID()}`,
          },
          body: form,
        },
      );
      expect(made.status).toBe(201);
      return ((await made.json()) as { data: { id: string } }).data.id;
    };
    const files = [
      await upload(issue.id, 'a.txt'),
      await upload(issue.id, 'b.txt'),
      await upload(issue.id, 'c.txt'),
      await upload(issue.id, 'd.txt'),
    ];
    const elsewhere = await upload(other.id, 'e.txt');

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
      features: ['input', 'workspaceKey', 'checkout', 'skills', 'mounts'],
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
    const claimed = await agents.claims.claim(runner, 5);
    const tokens = new Map<string, string>();
    for (const payload of claimed) {
      const detail = (
        await (await admin.fetch(`/issueRuns/${payload.run.id}`)).json()
      ).data as { agentId: string };
      tokens.set(detail.agentId, String(payload.cli.credential.content.token));
    }
    const offer = (agentId: string, attachmentId: string) => {
      const init = json({ attachmentId, reason: 'Tài liệu dùng lại được' });
      return request('/kb/offers', {
        ...init,
        headers: {
          ...init.headers,
          'x-nocobase-run-token': tokens.get(agentId) ?? '',
        },
      });
    };

    // A person does not offer, nor an agent without the action, nor a file of another issue.
    expect(
      (
        await admin.fetch(
          '/kb/offers',
          json({ attachmentId: files[0], reason: 'Tôi muốn' }),
        )
      ).status,
    ).toBe(403);
    expect((await offer(plain.id, elsewhere)).status).toBe(403);
    expect((await offer(offering.id, elsewhere)).status).toBe(404);

    // Offered once however many times it asks, at most three per run.
    const first = await offer(offering.id, files[0] as string);
    expect(first.status).toBe(201);
    const made = ((await first.json()) as { data: Offer }).data;
    expect(made.status).toBe('pending');
    const again = await offer(offering.id, files[0] as string);
    expect(((await again.json()) as { data: Offer }).data.id).toBe(made.id);
    expect((await offer(offering.id, files[1] as string)).status).toBe(201);
    expect((await offer(offering.id, files[2] as string)).status).toBe(201);
    expect((await offer(offering.id, files[3] as string)).status).toBe(400);

    // An outsider sees nothing and decides nothing.
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
    expect(
      (await contributor.fetch(`/kb/offers?issueId=${issue.id}`)).status,
    ).toBe(404);
    expect(
      (await contributor.fetch(`/kb/offers/${made.id}/reject`, json({})))
        .status,
    ).toBe(404);

    // The person who sent it decides.
    const listed = (
      await (await admin.fetch(`/kb/offers?issueId=${issue.id}`)).json()
    ).data as Offer[];
    expect(listed).toHaveLength(3);
    expect(listed[0]?.canDecide).toBe(true);

    const saved = (
      await (await admin.fetch(`/kb/offers/${made.id}/accept`, json({}))).json()
    ).data as Offer;
    expect(saved).toMatchObject({ status: 'saved', targetScope: 'project' });
    expect(saved.docId).toBeTruthy();
    // It is decided once.
    expect(
      (await admin.fetch(`/kb/offers/${made.id}/accept`, json({}))).status,
    ).toBe(400);
    const declined = (
      await (
        await admin.fetch(
          `/kb/offers/${(listed[1] as Offer).id}/reject`,
          json({}),
        )
      ).json()
    ).data as Offer;
    expect(declined.status).toBe('declined');

    // The file is knowledge now: listed, searchable by words, and its bytes are the original's.
    const docs = (await (await admin.fetch('/kb/docs')).json()) as {
      data: { id: string; title: string; kind: string; filename?: string }[];
      meta: { total: number };
    };
    const doc = docs.data.find((item) => item.id === saved.docId);
    expect(doc).toMatchObject({ kind: 'file', filename: 'a.txt' });
    expect(docs.meta.total).toBe(docs.data.length);
    expect(
      (
        (await (await admin.fetch('/kb/docs?q=zzzkhongco')).json()) as {
          data: unknown[];
        }
      ).data,
    ).toEqual([]);
    const file = await admin.fetch(`/kb/docs/${saved.docId}/file`);
    expect(file.status).toBe(200);
    expect(await file.text()).toBe('Nội dung tệp');
    expect(file.headers.get('content-disposition')).toContain('a.txt');

    // A run lists what its agent reads.
    const asRunDocs = await request('/kb/docs', {
      headers: {
        'x-nocobase-run-token': tokens.get(offering.id) ?? '',
      },
    });
    expect(asRunDocs.status).toBe(200);
  },
);
