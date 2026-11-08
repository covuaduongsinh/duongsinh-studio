// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type {
  Projects,
  Viewer,
} from '@nocobase/app-plugin-projects/server/tokens';
import type {
  IssueListItem,
  StatusDefinition,
} from '@nocobase/app-plugin-projects/shared/issues';
import type { PlanDecided } from '@nocobase/app-plugin-projects/shared/plans';
import {
  CONVERSATION_SOURCES,
  PLAN_DECIDED_NEWS,
  conversationOfPlan,
  conversationRuleLines,
  createIssueContextResolver,
  createIssueLinkResolver,
  createIssueSessionIntegration,
  createProjectContextResolver,
  createSessionProjects,
  issueStatusView,
  planDecidedNews,
  planSourceOf,
  sessionInstructions,
} from '../../server/conversations/studio-conversations.js';

const STATUSES: StatusDefinition[] = [
  { key: 'backlog', name: 'Backlog', category: 'unstarted', color: 'gray' },
  {
    key: 'in_progress',
    name: 'In progress',
    category: 'started',
    color: 'blue',
  },
  { key: 'blocked', name: 'Blocked', category: 'started', color: 'red' },
  { key: 'in_review', name: 'In review', category: 'started', color: 'purple' },
  { key: 'done', name: 'Done', category: 'done', color: 'green' },
  { key: 'cancelled', name: 'Cancelled', category: 'closed', color: 'gray' },
];

function issue(
  overrides: Partial<IssueListItem> & Pick<IssueListItem, 'id' | 'identifier'>,
): IssueListItem {
  return {
    title: `Issue ${overrides.identifier}`,
    description: '',
    statusKey: 'in_progress',
    acceptance: null,
    priority: 'none',
    ownerUserId: 'owner',
    executor: null,
    parentIssueId: null,
    stage: null,
    projectId: 'p1',
    startDate: null,
    dueDate: null,
    revision: 1,
    createdById: null,
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
    lastActivityAt: '2026-11-01T00:00:00.000Z',
    deletedAt: null,
    owner: { id: 'owner', name: 'Chủ dự án' },
    executorName: 'Project manager',
    project: { id: 'p1', name: 'Sandbox', leadUserId: null },
    labels: [],
    subtaskCount: 0,
    blockedCount: 0,
    ...overrides,
  } as IssueListItem;
}

/** A projects service that shows `visibleTo` the issues and projects listed, and nobody else anything. */
function fakeProjects(visibleTo: string) {
  const issues = [
    issue({ id: 'i1', identifier: 'PM-9', title: 'Elo', statusKey: 'done' }),
    issue({ id: 'i2', identifier: 'PM-10', title: 'Dịch vi-VN' }),
  ];
  const sees = (viewer: Viewer) => viewer.userId === visibleTo;
  const projects = {
    issueQueries: {
      statuses: () => STATUSES,
      summaries: async (viewer: Viewer, refs: readonly string[]) =>
        sees(viewer)
          ? issues
              .filter(
                (item) =>
                  refs.includes(item.id) || refs.includes(item.identifier),
              )
              .map(({ id, identifier, title, statusKey }) => ({
                id,
                identifier,
                title,
                statusKey,
              }))
          : [],
      page: async (
        viewer: Viewer,
        query: { issueIds?: readonly string[]; q?: string },
      ) => ({
        data: sees(viewer)
          ? issues.filter(
              (item) =>
                (!query.issueIds || query.issueIds.includes(item.id)) &&
                (!query.q ||
                  item.title.includes(query.q) ||
                  item.identifier.includes(query.q)),
            )
          : [],
        nextCursor: null,
      }),
    },
    projects: {
      list: async (viewer: Viewer) =>
        sees(viewer) ? [{ id: 'p1', name: 'Sandbox' }] : [],
    },
  };
  return {
    projects: () => projects as unknown as Projects,
    viewerOf: async (userId: string): Promise<Viewer> =>
      ({ userId, actor: { type: 'user', id: userId } }) as unknown as Viewer,
  };
}

const conn = {} as never;

describe('Studio conversations', () => {
  it('starts conversations from Ask agent and gives their runs the Dương Sinh rules', () => {
    expect(CONVERSATION_SOURCES.map((source) => source.key)).toEqual([
      'askAgent',
    ]);
    const rules = conversationRuleLines('ds-studio').rules ?? [];
    const text = rules.join('\n');
    expect(text).toContain('Vietnamese');
    expect(text).toContain('https://nocobase.dsc.edu.vn');
    expect(text).toContain('secrets');
    expect(text).toContain('ds-studio kb search');
    expect(text).toContain('ds-studio memory list');
    expect(text).toMatch(/propose one operation plan/u);
    expect(text).toMatch(/Never write issues directly/u);
  });

  it('resolves pinned issues and projects only for people who see them', async () => {
    const deps = fakeProjects('admin');
    const issues = createIssueContextResolver(deps);
    expect(
      Object.fromEntries(await issues(conn, 'admin', ['i1', 'PM-10', 'nope'])),
    ).toEqual({
      i1: { title: 'Elo', key: 'PM-9', url: '/issues/PM-9' },
      'PM-10': { title: 'Dịch vi-VN', key: 'PM-10', url: '/issues/PM-10' },
    });
    expect((await issues(conn, 'stranger', ['i1'])).size).toBe(0);
    const projects = createProjectContextResolver(deps);
    expect(Object.fromEntries(await projects(conn, 'admin', ['p1']))).toEqual({
      p1: { title: 'Sandbox', key: null, url: '/projects/p1' },
    });
    expect((await projects(conn, 'stranger', ['p1'])).size).toBe(0);
  });

  it('sources a conversation run’s plans from its conversation and refuses an issue run any', () => {
    const source = planSourceOf({
      id: 'run-1',
      subjectKind: 'conversation',
      subjectId: 'c-1',
    });
    expect(source).toEqual({
      kind: 'conversation',
      key: 'conversation:c-1',
      data: { conversationId: 'c-1', runId: 'run-1' },
    });
    expect(conversationOfPlan(source!)).toBe('c-1');
    expect(
      conversationOfPlan({ kind: 'conversation', key: 'conversation:c-2' }),
    ).toBe('c-2');
    expect(conversationOfPlan({ kind: 'statusRule', key: 'x' })).toBeNull();
    expect(
      planSourceOf({ id: 'run-2', subjectKind: 'issue', subjectId: 'i1' }),
    ).toBeNull();
    expect(planSourceOf(null)).toBeNull();
  });

  it('tells the conversation how its plan was decided, waking its agent unless the plan was voided', () => {
    const decided: PlanDecided = {
      planId: 'plan-1',
      outcome: 'executed',
      title: 'Tạo issue dịch',
      source: { kind: 'conversation', key: 'conversation:c-1' },
      proposer: null,
      deciderUserId: 'admin',
      decidedById: 'admin',
      failure: null,
      rows: [
        {
          position: 0,
          op: 'issue.create',
          ok: true,
          created: { kind: 'issue', id: 'i3' },
          target: null,
          error: null,
          wakes: [],
        },
      ] as unknown as PlanDecided['rows'],
    };
    const news = planDecidedNews(decided);
    expect(news.notice).toEqual({
      code: 'news',
      type: PLAN_DECIDED_NEWS,
      title: 'Plan "Tạo issue dịch" executed',
      params: {
        planId: 'plan-1',
        outcome: 'executed',
        title: 'Tạo issue dịch',
      },
    });
    expect(news.wake).toBe(true);
    expect(news.input?.type).toBe('signal');
    expect(news.input?.text).toContain('"id":"i3"');
    const voided = planDecidedNews({ ...decided, outcome: 'voided' });
    expect(voided.input).toBeUndefined();
    expect(voided.wake).toBeUndefined();
  });

  it('shows a session’s issues with where they stand and who they wait for', () => {
    expect(
      issueStatusView(
        { statusKey: 'in_review', ownerUserId: 'me' },
        STATUSES,
        'me',
      ),
    ).toEqual({
      label: 'In review',
      tone: 'attention',
      icon: 'review',
      needsYou: 'Chờ bạn nghiệm thu',
    });
    expect(
      issueStatusView(
        { statusKey: 'in_review', ownerUserId: 'x' },
        STATUSES,
        'me',
      ),
    ).toMatchObject({ tone: 'active', needsYou: null });
    expect(
      issueStatusView(
        { statusKey: 'in_progress', ownerUserId: 'x' },
        STATUSES,
        'me',
      ),
    ).toMatchObject({ icon: 'started', tone: 'active' });
    expect(
      issueStatusView(
        { statusKey: 'backlog', ownerUserId: 'x' },
        STATUSES,
        'me',
      ),
    ).toMatchObject({ icon: 'backlog', tone: 'idle' });
    expect(
      issueStatusView({ statusKey: 'done', ownerUserId: 'x' }, STATUSES, 'me'),
    ).toMatchObject({ icon: 'done', tone: 'done' });
    expect(
      issueStatusView(
        { statusKey: 'blocked', ownerUserId: 'x' },
        STATUSES,
        'me',
      ),
    ).toMatchObject({ icon: 'blocked', tone: 'attention' });
  });

  it('ties issues and projects to sessions on people’s computers, as each person sees them', async () => {
    const deps = fakeProjects('admin');
    const links = createIssueLinkResolver(deps);
    const resolved = await links.resolve(['i1', 'i2'], { userId: 'admin' });
    expect(resolved.get('i1')).toMatchObject({
      key: 'PM-9',
      group: 'Sandbox',
      href: '/issues/PM-9',
      startable: false,
      status: { icon: 'done' },
    });
    expect((await links.resolve(['i1'], { userId: 'stranger' })).size).toBe(0);
    expect(
      (
        await links.search!(
          'vi-VN',
          { userId: 'admin' },
          { projectId: null, limit: 5 },
        )
      ).map((found) => found.refId),
    ).toEqual(['i2']);
    expect(
      await links.search!(
        'vi-VN',
        { userId: 'stranger' },
        { projectId: null, limit: 5 },
      ),
    ).toEqual([]);
    expect(
      (await links.progress!(['i2'], { userId: 'admin' })).get('i2'),
    ).toEqual({
      status: 'in_progress',
      executor: 'Project manager',
      owner: 'Chủ dự án',
      project: 'Sandbox',
      blockedBy: 0,
      subIssues: 0,
    });

    const projects = createSessionProjects(deps);
    expect(await projects.list({ userId: 'admin' })).toEqual([
      { id: 'p1', name: 'Sandbox' },
    ]);
    expect(await projects.list({ userId: 'stranger' })).toEqual([]);

    const instructions = sessionInstructions('ds-studio');
    expect(instructions).toContain('ds-studio issue create');
    expect(instructions).toContain('https://nocobase.dsc.edu.vn');

    const linked: string[] = [];
    const integration = createIssueSessionIntegration({
      creationContext: async (userId, sessionId) => ({
        projectId: userId === 'admin' && sessionId === 's-1' ? 'p1' : null,
      }),
      link: async (sessionId, issueId) => {
        linked.push(`${sessionId}:${issueId}`);
      },
    });
    const context = await integration.creationContext(
      { userId: 'admin' } as Viewer,
      's-1',
    );
    expect(context.projectId).toBe('p1');
    await context.link('i9');
    expect(linked).toEqual(['s-1:i9']);
  });
});
