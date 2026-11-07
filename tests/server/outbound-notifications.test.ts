// @vitest-environment node
import { randomUUID } from 'node:crypto';
import { expect, vi } from 'vitest';
import { createAppTest } from '@nocobase/app-testing/server';
import {
  signIn,
  DEFAULT_ADMIN_CREDENTIALS,
} from '@nocobase/app-plugin-authentication/testing';
import { databaseManagerToken } from '@nocobase/db';
import { createOutbound } from '../../server/notifications/outbound.js';
import { createStandaloneServer } from '../../server/standalone.js';

const test = createAppTest({
  createServer: createStandaloneServer,
  config: {
    app: { publicOrigin: 'http://localhost' },
    auth: { secret: 'test-auth-secret-at-least-32-characters' },
  },
});

const json = (body: unknown, method = 'POST') => ({
  method,
  headers: {
    'content-type': 'application/json',
    origin: 'http://localhost',
    'Idempotency-Key': `${Date.now()}.${randomUUID()}`,
  },
  body: JSON.stringify(body),
});

const TEXTS = {
  title: (identifier: string) => `Quyết định ${identifier}`,
  body: ({ title, needsYou }: { title: string; needsYou: string | null }) =>
    needsYou ? `${title}: ${needsYou}` : title,
};

interface Sent {
  idempotencyKey: string;
  messages: Record<
    string,
    { to: unknown[]; subject?: string; html?: string; url?: string }
  >;
}

test(
  'people are told outside Studio as they chose, about what is new, once, with no backlog',
  { timeout: 240_000 },
  async ({ app, testApp }) => {
    const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
    const ownerId = (
      (await (await admin.fetch('/auth/get-session')).json()) as {
        user: { id: string };
      }
    ).user.id;
    const conn = () => app.container.resolve(databaseManagerToken).connection();
    const sent: Sent[] = [];
    let emailOn = true;
    let devices: { id: string; enabled?: boolean }[] = [];
    const send = vi.fn(async (input: Sent) => {
      sent.push(input);
    });
    const outbound = createOutbound({
      conn,
      publicBase: () => 'https://studio.test/main',
      basePath: () => '/main',
      emailEnabled: () => emailOn,
      send: send as never,
      devicesOf: async () => devices,
    });
    const project = (
      await (
        await admin.fetch(
          '/projects',
          json({ name: 'Sandbox', visibility: 'members' }),
        )
      ).json()
    ).data as { id: string };
    const issue = async (title: string) =>
      (
        await (
          await admin.fetch(
            '/projects/issues',
            json({ title, projectId: project.id, statusKey: 'backlog' }),
          )
        ).json()
      ).data as { id: string; identifier: string };
    const ask = (id: string, needsYou: string | null) =>
      conn()
        .query.updateTable('pmIssues')
        .set({ needsYou })
        .where('id', '=', id)
        .execute();
    const finish = (id: string) =>
      conn()
        .query.updateTable('pmIssues')
        .set({ statusKey: 'done' })
        .where('id', '=', id)
        .execute();

    // Whatever waits on the first look is noted, not sent.
    const old = await issue('Việc cũ');
    await ask(old.id, 'Câu hỏi cũ');
    expect(await outbound.sendDecisionAlerts(TEXTS)).toBe(0);
    expect(sent).toEqual([]);

    // What arrives after it is sent, by email with a link that escapes what people wrote.
    const fresh = await issue('Việc <mới>');
    await ask(fresh.id, 'Chọn A hay B?');
    expect(await outbound.sendDecisionAlerts(TEXTS)).toBe(1);
    expect(sent).toHaveLength(1);
    const email = sent[0]?.messages['studio-email'];
    expect(email?.to).toHaveLength(1);
    expect(email?.subject).toBe(`Quyết định ${fresh.identifier}`);
    expect(email?.html).toContain('Việc &lt;mới&gt;');
    expect(email?.html).not.toContain('<mới>');
    expect(email?.html).toContain(
      `https://studio.test/main/issues/${fresh.id}`,
    );

    // Looking again sends nothing.
    expect(await outbound.sendDecisionAlerts(TEXTS)).toBe(0);
    expect(sent).toHaveLength(1);

    // A different question is a new decision; a finished issue asks nothing.
    await ask(fresh.id, 'Chọn C hay D?');
    const finished = await issue('Việc đã xong');
    await ask(finished.id, 'Không ai cần trả lời');
    await finish(finished.id);
    expect(await outbound.sendDecisionAlerts(TEXTS)).toBe(1);
    expect(sent).toHaveLength(2);

    // Work waiting for acceptance is a decision too.
    const review = await issue('Chờ nghiệm thu');
    await conn()
      .query.updateTable('pmIssues')
      .set({ statusKey: 'in_review' })
      .where('id', '=', review.id)
      .execute();
    expect(await outbound.sendDecisionAlerts(TEXTS)).toBe(1);
    expect(sent).toHaveLength(3);

    // With devices, the push goes to the ones turned on, with the base path in its link.
    devices = [{ id: 'on' }, { id: 'paused', enabled: false }];
    const pushed = await issue('Có thiết bị');
    await ask(pushed.id, 'Trả lời nhé');
    await outbound.sendDecisionAlerts(TEXTS);
    const push = sent.at(-1)?.messages.webPush;
    expect(push?.to).toEqual([{ id: 'on', userId: ownerId }]);
    expect(push?.url).toBe(`/main/issues/${pushed.id}`);

    // Each person's choice is kept per kind, and a choice off sends nothing of that kind.
    await outbound.setPreferences(ownerId, {
      emailDecisions: false,
      pushDecisions: false,
    });
    const before = sent.length;
    const muted = await issue('Đã tắt');
    await ask(muted.id, 'Không gửi');
    expect(await outbound.sendDecisionAlerts(TEXTS)).toBe(0);
    expect(sent).toHaveLength(before);
    const report = {
      key: 'ds-report-1',
      kind: 'report' as const,
      title: 'Báo cáo tuần',
      body: 'Nội dung',
      path: '/dashboard',
    };
    expect(await outbound.deliver(ownerId, report)).toEqual({
      email: true,
      push: false,
    });
    await outbound.setPreferences(ownerId, { emailReports: false });
    expect(await outbound.deliver(ownerId, report)).toEqual({
      email: false,
      push: false,
    });

    // With the channel off nothing is attempted, whatever was chosen.
    await outbound.setPreferences(ownerId, {
      emailDecisions: true,
      emailReports: true,
    });
    emailOn = false;
    const count = sent.length;
    expect(await outbound.deliver(ownerId, report)).toEqual({
      email: false,
      push: false,
    });
    expect(sent).toHaveLength(count);
    emailOn = true;

    // A channel failing is logged and leaves the other one and the caller alone.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    send.mockRejectedValueOnce(new Error('smtp is down'));
    expect(await outbound.deliver(ownerId, report)).toEqual({
      email: false,
      push: false,
    });
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  },
);
