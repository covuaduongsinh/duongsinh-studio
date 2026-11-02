// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  AGENT_ACTOR,
  SYSTEM_SPACE,
  createKnowledgeAccess,
  normalSpace,
  type KbAction,
  type KbLevel,
  type KnowledgeAccessDeps,
} from '../../server/knowledge/access.js';

const PROJECT = { scope: 'project', scopeId: 'p1' };
const MISSING = { scope: 'project', scopeId: 'gone' };

interface Person {
  readonly unrestricted?: boolean;
  readonly levels?: Partial<Record<KbAction, KbLevel>>;
  /** What they are to project p1. */
  readonly p1?: { visible: boolean; manage: boolean };
}

function resolverFor(
  people: Record<string, Person>,
  agents: Record<string, string[]> = {},
) {
  const deps: KnowledgeAccessDeps = {
    unrestricted: async (userId) => people[userId]?.unrestricted ?? false,
    level: async (userId, action) => people[userId]?.levels?.[action] ?? 'none',
    project: async (userId, projectId) =>
      projectId === 'p1'
        ? (people[userId]?.p1 ?? { visible: false, manage: false })
        : null,
    projectName: async (projectId) =>
      projectId === 'p1' ? 'Dương Sinh NocoBase' : null,
    agentActions: async (agentId) =>
      agents[agentId] ? new Set(agents[agentId]) : null,
    names: async () => new Map(),
  };
  return createKnowledgeAccess(deps);
}

const CONTRIBUTOR: Person = {
  levels: {
    read: 'related',
    propose: 'related',
    edit: 'related',
    manage: 'related',
  },
};
const ADMIN: Person = {
  levels: { read: 'all', propose: 'all', edit: 'all', manage: 'all' },
};

describe('Studio knowledge spaces', () => {
  it('names the system space and one space per project, the latter inheriting the former', async () => {
    const resolver = resolverFor({});
    expect(normalSpace({ scope: 'system', scopeId: '' })).toEqual(SYSTEM_SPACE);
    expect(normalSpace({ scope: 'system', scopeId: 'x' })).toBeNull();
    expect(normalSpace({ scope: 'project', scopeId: ' ' })).toBeNull();
    expect(normalSpace({ scope: 'default', scopeId: '' })).toBeNull();
    expect(resolver.inherits(PROJECT)).toEqual([SYSTEM_SPACE]);
    expect(resolver.inherits(SYSTEM_SPACE)).toEqual([]);
    expect(await resolver.title(SYSTEM_SPACE)).toBe('Dương Sinh');
    expect(await resolver.title(PROJECT)).toBe('Dương Sinh NocoBase');
    expect(await resolver.title(MISSING)).toBeNull();
  });

  it('gives the owner everything and an administrator every level everywhere', async () => {
    const resolver = resolverFor({
      owner: { unrestricted: true },
      admin: ADMIN,
    });
    const all = { read: true, propose: true, edit: true, manage: true };
    for (const userId of ['owner', 'admin']) {
      expect(await resolver.forReader({ userId }).access(SYSTEM_SPACE)).toEqual(
        all,
      );
      expect(await resolver.forReader({ userId }).access(PROJECT)).toEqual(all);
      // A project that does not exist has no space, whoever asks.
      expect((await resolver.forReader({ userId }).access(MISSING)).read).toBe(
        false,
      );
    }
  });

  it('lets a contributor read and propose in the system space, and work in the spaces of their projects', async () => {
    const resolver = resolverFor({
      member: { ...CONTRIBUTOR, p1: { visible: true, manage: false } },
      lead: { ...CONTRIBUTOR, p1: { visible: true, manage: true } },
      outsider: CONTRIBUTOR,
      nobody: {},
    });
    const readPropose = {
      read: true,
      propose: true,
      edit: false,
      manage: false,
    };
    const none = { read: false, propose: false, edit: false, manage: false };
    expect(
      await resolver.forReader({ userId: 'member' }).access(SYSTEM_SPACE),
    ).toEqual(readPropose);
    expect(
      await resolver.forReader({ userId: 'member' }).access(PROJECT),
    ).toEqual(readPropose);
    expect(
      await resolver.forReader({ userId: 'lead' }).access(PROJECT),
    ).toEqual({
      read: true,
      propose: true,
      edit: true,
      manage: true,
    });
    // The lead of a project still only reads and proposes in the shared space.
    expect(
      await resolver.forReader({ userId: 'lead' }).access(SYSTEM_SPACE),
    ).toEqual(readPropose);
    expect(
      await resolver.forReader({ userId: 'outsider' }).access(PROJECT),
    ).toEqual(none);
    expect(
      await resolver.forReader({ userId: 'outsider' }).access(SYSTEM_SPACE),
    ).toEqual(readPropose);
    // Without any knowledge grant, nothing.
    expect(
      await resolver.forReader({ userId: 'nobody' }).access(SYSTEM_SPACE),
    ).toEqual(none);
  });

  it('holds an agent to the lower of its configuration and its person, and never above propose', async () => {
    const resolver = resolverFor(
      { owner: { unrestricted: true }, outsider: CONTRIBUTOR },
      {
        reader: ['kb.knowledge/read'],
        proposer: ['kb.knowledge/read', 'kb.knowledge/propose'],
        blind: ['pm.issues/view'],
      },
    );
    const as = (userId: string, agentId: string) =>
      resolver.forReader({
        userId,
        actor: { kind: AGENT_ACTOR, id: agentId, runId: 'r1' },
      });
    expect(await as('owner', 'reader').access(PROJECT)).toEqual({
      read: true,
      propose: false,
      edit: false,
      manage: false,
    });
    expect(await as('owner', 'proposer').access(PROJECT)).toEqual({
      read: true,
      propose: true,
      edit: false,
      manage: false,
    });
    expect((await as('owner', 'blind').access(PROJECT)).read).toBe(false);
    // The agent reads no more than the person it acts for.
    expect((await as('outsider', 'proposer').access(PROJECT)).read).toBe(false);
    expect(
      (await as('outsider', 'proposer').access(SYSTEM_SPACE)).propose,
    ).toBe(true);
    // An unknown agent, or an actor of a kind Studio does not know, reads nothing.
    expect((await as('owner', 'gone').access(SYSTEM_SPACE)).read).toBe(false);
    expect(
      (
        await resolver
          .forReader({
            userId: 'owner',
            actor: { kind: 'online-agent', id: 'x' },
          })
          .access(SYSTEM_SPACE)
      ).read,
    ).toBe(false);
  });
});
