import { randomUUID } from 'node:crypto';

import { expect } from 'vitest';
import { createAppTest } from '@nocobase/app-testing/server';
import {
  signIn,
  DEFAULT_ADMIN_CREDENTIALS,
} from '@nocobase/app-plugin-authentication/testing';

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

interface IssueRef {
  id: string;
  identifier: string;
  title: string;
  revision: number;
}

interface Row {
  issue: { id: string };
  dependencyWait: boolean;
  blockers: {
    issueId: string;
    identifier: string;
    title: string;
    reason: string;
  }[];
  followed: boolean;
}

interface Groups {
  mode: string;
  groups: { group: string; count: number; data: Row[] }[];
  following: string[];
  waiting: number;
}

test(
  'task groups name what holds an issue, fold the groups of the split view and follow what the person follows',
  { timeout: 240_000 },
  async ({ testApp }) => {
    const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
    const newIssue = async (title: string): Promise<IssueRef> => {
      const made = await admin.fetch('/projects/issues', json({ title }));
      expect(made.status).toBe(201);
      return (await made.json()).data as IssueRef;
    };
    const read = async (query: string): Promise<Groups> => {
      const answer = await admin.fetch(`/taskGroups${query}`);
      expect(answer.status).toBe(200);
      return (await answer.json()).data as Groups;
    };
    const rowOf = (groups: Groups, id: string): Row | undefined =>
      groups.groups
        .flatMap((group) => group.data)
        .find((row) => row.issue.id === id);
    const groupOf = (groups: Groups, id: string): string | undefined =>
      groups.groups.find((group) =>
        group.data.some((row) => row.issue.id === id),
      )?.group;

    const blocker = await newIssue('Phải xong trước');
    const held = await newIssue('Bị giữ lại');
    const free = await newIssue('Không bị giữ');
    const dropped = await newIssue('Bỏ đi');
    const linked = await admin.fetch(
      `/projects/issues/${held.id}/dependencies`,
      json({ dependsOnIssueId: blocker.id }),
    );
    expect(linked.status).toBe(201);
    const cancelled = await admin.fetch(
      `/projects/issues/${dropped.id}`,
      json({ statusKey: 'cancelled', revision: dropped.revision }, 'PATCH'),
    );
    expect(cancelled.status).toBe(200);

    // A row says whether something holds it, and what.
    const table = await read('?mode=table');
    expect(table.mode).toBe('table');
    expect(rowOf(table, held.id)).toMatchObject({
      dependencyWait: true,
      blockers: [
        {
          issueId: blocker.id,
          identifier: blocker.identifier,
          title: blocker.title,
          reason: 'dependency',
        },
      ],
    });
    expect(rowOf(table, free.id)).toMatchObject({
      dependencyWait: false,
      blockers: [],
    });
    // The table keeps a group of its own for what was cancelled.
    expect(groupOf(table, dropped.id)).toBe('cancelled');

    // The split view has four groups: what waits for the person, what is under way, the backlog and what is done.
    const split = await read('?mode=split');
    expect(split.mode).toBe('split');
    for (const group of split.groups)
      expect(['wait', 'doing', 'backlog', 'done']).toContain(group.group);
    expect(groupOf(split, held.id)).toBe('backlog');
    expect(groupOf(split, dropped.id)).toBe('done');

    // `follow=all` adds what the person follows to a list scoped to someone else; `scope` keeps the scope.
    const stranger = 'nobody-involved';
    const scoped = await read(`?mode=split&involvesUserId=${stranger}`);
    expect(rowOf(scoped, free.id)).toBeUndefined();
    const everything = await read(
      `?mode=split&follow=all&involvesUserId=${stranger}`,
    );
    expect(rowOf(everything, free.id)).toMatchObject({ followed: true });
    expect(everything.following).toContain(free.id);
    const narrow = await read(
      `?mode=split&follow=scope&involvesUserId=${stranger}`,
    );
    expect(rowOf(narrow, free.id)).toBeUndefined();

    // Anything else is refused before it reaches the query.
    const refused = await admin.fetch('/taskGroups?follow=everyone');
    expect(refused.status).toBe(400);
  },
);
