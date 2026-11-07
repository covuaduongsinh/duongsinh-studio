import { randomUUID } from 'node:crypto';
import { expect } from 'vitest';
import { createAppTest } from '@nocobase/app-testing/server';
import {
  signIn,
  DEFAULT_ADMIN_CREDENTIALS,
} from '@nocobase/app-plugin-authentication/testing';
import { agentsToken } from '@nocobase/app-plugin-agents/server/tokens';
import { databaseManagerToken } from '@nocobase/db';
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
interface WaitingEntry {
  notice: { type: string; kind: string; subject: { id: string } };
}

test(
  'what waits on a person comes from the issues, and each person sees only their own',
  { timeout: 240_000 },
  async ({ testApp, app, request }) => {
    const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
    const agents = app.container.resolve(agentsToken);
    const conn = app.container.resolve(databaseManagerToken).connection();
    const session = (await (await admin.fetch('/auth/get-session')).json()) as {
      user: { id: string };
    };
    const coder = await agents.agents.ensureSystem({
      id: 'ds-test-coder',
      name: 'Test coder',
      description: 'Implements.',
      instructions: null,
      actions: ['pm.issues/view', 'pm.issues/comment'],
      modelEntries: [{ tool: 'claude', model: MODEL }],
    });
    const newIssue = async (title: string, statusKey = 'backlog') => {
      const made = await admin.fetch(
        '/projects/issues',
        json({
          title,
          statusKey,
          executor: { type: AGENT_KIND, id: coder.id },
        }),
      );
      expect(made.status).toBe(201);
      return (await made.json()).data as IssueRef;
    };
    const paths = [
      '/inbox/items',
      '/inbox/notices?ids=x',
      '/inbox/pending',
      '/inbox/unreadCount',
      '/inbox/waiting',
      '/followUps',
      '/followUps/following',
      '/followUps/issues?issueIds=x',
      '/taskGroups',
      '/taskGroups/summary',
      '/taskGroups/rows?ids=x',
      '/taskGroups/children?parentIds=x',
    ];
    for (const path of paths) expect((await request(path)).status).toBe(401);

    // An issue waiting for acceptance is a decision for its owner.
    const accept = await newIssue('Nghiệm thu');
    const moved = await admin.fetch(
      `/projects/issues/${accept.id}`,
      json(
        {
          statusKey: 'in_progress',
          revision: accept.revision,
        },
        'PATCH',
      ),
    );
    expect(moved.status).toBe(200);
    const inProgress = ((await moved.json()).data as { issue: IssueRef }).issue;
    const reviewed = await admin.fetch(
      `/projects/issues/${accept.id}`,
      json(
        {
          statusKey: 'in_review',
          revision: inProgress.revision,
          acceptance: 'Đã xong',
          needsYou: 'Xem và nghiệm thu',
        },
        'PATCH',
      ),
    );
    expect(reviewed.status).toBe(200);

    const waiting = (await (await admin.fetch('/inbox/waiting')).json())
      .data as WaitingEntry[];
    expect(waiting.map((entry) => entry.notice.type)).toContain('accept');
    expect(waiting[0].notice).toMatchObject({
      kind: 'decision',
      source: 'studio',
    });
    // One subject only.
    const other = await newIssue('Không liên quan');
    const one = (
      await (
        await admin.fetch(`/inbox/waiting?subject=issue:${other.id}`)
      ).json()
    ).data as WaitingEntry[];
    expect(one).toEqual([]);
    const pending = (await (await admin.fetch('/inbox/pending')).json())
      .data as {
      decision: number;
      info: number;
    };
    expect(pending.decision).toBeGreaterThan(0);
    expect(typeof pending.info).toBe('number');
    const items = (await (await admin.fetch('/inbox/items')).json()).data as {
      kind: string;
      pending: boolean;
    }[];
    expect(items.some((item) => item.kind === 'decision' && item.pending)).toBe(
      true,
    );
    expect((await admin.fetch('/inbox/reconcile', json({}))).status).toBe(200);

    // A contributor owes nothing here and reads nothing of the owner's.
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
    const contributor = await signIn(testApp, {
      username: 'contributor1',
      password: 'Studio-test-123!',
    });
    expect(
      (await (await contributor.fetch('/inbox/waiting')).json()).data,
    ).toEqual([]);
    expect(
      (
        (await (await contributor.fetch('/inbox/pending')).json()).data as {
          decision: number;
        }
      ).decision,
    ).toBe(0);

    // Acceptance over: the decision is gone without anything to reconcile.
    const summary = (await (await admin.fetch('/taskGroups/summary')).json())
      .data as {
      mine: { open: number; waiting: number };
      waiting: number;
    };
    expect(summary.mine.open).toBeGreaterThan(0);
    expect(summary.waiting).toBe(1);

    const groups = (await (await admin.fetch('/taskGroups')).json()).data as {
      groups: {
        group: string;
        data: { issue: { id: string }; waits: string[] }[];
      }[];
      waiting: number;
    };
    const wait = groups.groups.find((group) => group.group === 'wait');
    expect(wait?.data.find((row) => row.issue.id === accept.id)?.waits).toEqual(
      ['accept'],
    );
    expect(groups.waiting).toBe(1);
    const decisions = (
      await (await admin.fetch(`/taskGroups/${accept.id}/decisions`)).json()
    ).data as WaitingEntry[];
    expect(decisions).toHaveLength(1);

    // Follow-ups: following, unread after someone else's comment, and seen again.
    expect(
      (await admin.fetch(`/followUps/issues/${other.id}/follow`, json({})))
        .status,
    ).toBe(200);
    const following = (await (await admin.fetch('/followUps/following')).json())
      .data as { following: string[] };
    expect(following.following).toContain(other.id);
    const seen = await admin.fetch(
      `/followUps/issues/${other.id}/markSeen`,
      json({}),
    );
    expect(seen.status).toBe(200);
    const contributorComment = await contributor.fetch(
      `/projects/issues/${other.id}/comments`,
      json({ content: 'Một bình luận' }),
    );
    expect(contributorComment.status).toBe(201);
    const rowOf = async () =>
      (
        (await (
          await admin.fetch(`/followUps/issues?issueIds=${other.id}`)
        ).json()) as {
          data: { id: string; unread: number; followed: boolean }[];
        }
      ).data[0];
    expect(await rowOf()).toMatchObject({ followed: true, unread: 1 });
    await admin.fetch(`/followUps/issues/${other.id}/markSeen`, json({}));
    expect((await rowOf()).unread).toBe(0);
    const list = (await (await admin.fetch('/followUps')).json()).data as {
      issues: { id: string }[];
      counts: { backlog: number };
    };
    expect(list.issues.map((issue) => issue.id)).toContain(other.id);

    // Replacing the list follows and unfollows; a contributor cannot follow what they do not see.
    expect(
      (
        await admin.fetch(
          '/followUps/following',
          json({ following: [accept.id] }, 'PUT'),
        )
      ).status,
    ).toBe(200);
    const replaced = (await (await admin.fetch('/followUps/following')).json())
      .data as { following: string[] };
    expect(replaced.following).toContain(accept.id);
    expect(replaced.following).not.toContain(other.id);
    expect(
      (await contributor.fetch('/followUps/issues/unknown/follow', json({})))
        .status,
    ).toBe(404);
    expect(session.user.id).toBeTruthy();

    // Decisions are read from issues, not stored as in-app messages: nothing to mark read or delete under their ids.
    const waitingOf = async (who: typeof admin) =>
      (await (await who.fetch('/inbox/waiting')).json())
        .data as (WaitingEntry & {
        inApp?: boolean;
        notice: { decisionKey: string; subject: { id: string } };
      })[];
    expect(
      (await waitingOf(admin)).every((entry) => entry.inApp === false),
    ).toBe(true);

    // Handed to someone by another person: a decision for the new owner only, gone once they accept it.
    const contributorId = ((await member.json()) as { data: { id: string } })
      .data.id;
    const handed = await newIssue('Bàn giao');
    const transferred = await admin.fetch(
      `/projects/issues/${handed.id}`,
      json({ ownerUserId: contributorId, revision: handed.revision }, 'PATCH'),
    );
    expect(transferred.status).toBe(200);
    const takeOver = (await waitingOf(contributor)).filter(
      (entry) => entry.notice.subject.id === handed.id,
    );
    expect(takeOver.map((entry) => entry.notice.type)).toEqual(['takeOver']);
    expect(takeOver[0]?.inApp).toBe(false);
    expect(
      (await waitingOf(admin)).some(
        (entry) => entry.notice.subject.id === handed.id,
      ),
    ).toBe(false);
    const handoff = (
      await (await contributor.fetch(`/issueOwnerHandoffs/${handed.id}`)).json()
    ).data as { handoff: { notificationKey: string } };
    expect(
      (
        await contributor.fetch(
          `/issueOwnerHandoffs/${handed.id}/accept`,
          json({ notificationKey: handoff.handoff.notificationKey }),
        )
      ).status,
    ).toBe(200);
    expect(
      (await waitingOf(contributor)).some(
        (entry) => entry.notice.subject.id === handed.id,
      ),
    ).toBe(false);

    // Comment runs held back by the limit: a decision for the owner, gone once they let the runs continue.
    const limited = await newIssue('Giới hạn lượt');
    await conn.repository('pmActivities').createOne({
      values: {
        id: '990000000000001',
        issueId: limited.id,
        actorType: 'system',
        actorId: null,
        action: 'work_skipped',
        details: { reason: 'limited', trigger: 'comment' },
        createdAt: new Date(),
      },
    });
    const held = (await waitingOf(admin)).filter(
      (entry) => entry.notice.subject.id === limited.id,
    );
    expect(held.map((entry) => entry.notice.type)).toEqual(['authorize']);
    const limit = (
      await (await admin.fetch(`/issueCommentRuns/${limited.id}`)).json()
    ).data as { token: string } | null;
    expect(limit?.token).toBeTruthy();
    expect(
      (
        await admin.fetch(
          `/issueCommentRuns/${limited.id}/continue`,
          json({ token: limit?.token }),
        )
      ).status,
    ).toBe(200);
    expect(
      (await waitingOf(admin)).some(
        (entry) => entry.notice.subject.id === limited.id,
      ),
    ).toBe(false);
  },
);
