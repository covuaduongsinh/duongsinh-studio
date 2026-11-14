// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  createReactionService,
  DEFAULT_REACTION_RULES,
  type ReactionStore,
} from '../../server/reactions/service.js';

// T1.1 (plan T): one reaction per (issue, event, head), 2 attempts per push, 5 per issue, then a person decides.
function memoryStore(rules: any[] = []) {
  const attempts: any[] = [];
  const blocked: any[] = [];
  let statusKey = 'in_progress';
  const store: ReactionStore = {
    rules: async () => rules,
    attemptsFor: async (issueId, event, headSha) =>
      attempts.filter(
        (a) =>
          a.issueId === issueId &&
          a.event === event &&
          (headSha === undefined || a.headSha === headSha),
      ),
    record: async (a) => {
      attempts.push(a);
    },
    escalate: async (input) => {
      blocked.push(input);
      statusKey = 'blocked';
    },
    issueState: async () => ({ statusKey }),
  };
  return { store, attempts, blocked };
}

const ctx = (headSha = 'sha1') => ({
  issueId: 'i1',
  projectId: 'p1',
  pullRequestId: 'pr1',
  headSha,
  text: 'CI is red',
});

describe('reaction service', () => {
  it('has built-in defaults: ciFailed 2, conflicts 1, reviewChanges 2, runFailed 2', () => {
    const by = Object.fromEntries(
      DEFAULT_REACTION_RULES.map((r) => [r.event, r.maxAttempts]),
    );
    expect(by).toMatchObject({
      ciFailed: 2,
      conflicts: 1,
      reviewChanges: 2,
      runFailed: 2,
    });
  });

  it('leaves the failed-run decision to people until a project turns runFailed on', () => {
    expect(
      DEFAULT_REACTION_RULES.filter((r) => !r.enabled).map((r) => r.event),
    ).toEqual(['runFailed']);
  });

  it('wakes the agent, records the attempt, and stops at 2 per push', async () => {
    const { store, attempts, blocked } = memoryStore();
    const woken: string[] = [];
    const svc = createReactionService({
      store,
      waker: {
        wakeIssue: async ({ text }) => {
          woken.push(text);
          return {
            kind: 'agent',
            principalId: 'a',
            subjectId: 'i1',
            triggerType: 'reaction',
            started: true,
            runId: `run${woken.length}`,
          };
        },
      },
    });
    expect((await svc.react('ciFailed', ctx())).outcome).toBe('woke');
    expect((await svc.react('ciFailed', ctx())).outcome).toBe('woke');
    expect(attempts.map((a) => a.attempt)).toEqual([1, 2]);
    // The third on the same head: a person decides.
    expect((await svc.react('ciFailed', ctx())).outcome).toBe('escalated');
    expect(woken).toHaveLength(2);
    expect(blocked).toHaveLength(1);
    expect(blocked[0].reason).toMatch(/ciFailed/u);
    // The issue waits for a person now: a new push changes nothing until it is back in progress.
    expect((await svc.react('ciFailed', ctx('sha2'))).outcome).toBe('skipped');
  });

  it('caps an issue at 5 reactions across pushes', async () => {
    const { store, blocked } = memoryStore();
    const svc = createReactionService({
      store,
      waker: {
        wakeIssue: async () => ({
          kind: 'agent',
          principalId: 'a',
          subjectId: 'i1',
          triggerType: 'reaction',
          started: true,
          runId: 'r',
        }),
      },
    });
    const outcomes: string[] = [];
    for (let i = 0; i < 7; i += 1)
      outcomes.push((await svc.react('ciFailed', ctx(`s${i}`))).outcome);
    expect(outcomes.slice(0, 5)).toEqual(Array(5).fill('woke'));
    expect(outcomes[5]).toBe('escalated');
    expect(blocked).toHaveLength(1);
    // Already escalated: nothing more is said.
    expect(outcomes[6]).toBe('skipped');
  });

  it('does nothing when the rule is off, and a project rule wins over the global one', async () => {
    const { store } = memoryStore([
      {
        projectId: null,
        event: 'ciFailed',
        enabled: true,
        maxAttempts: 2,
        maxPerIssue: 5,
        action: 'wake',
      },
      {
        projectId: 'p1',
        event: 'ciFailed',
        enabled: false,
        maxAttempts: 2,
        maxPerIssue: 5,
        action: 'wake',
      },
    ]);
    const svc = createReactionService({
      store,
      waker: {
        wakeIssue: async () => {
          throw new Error('must not wake');
        },
      },
    });
    expect((await svc.react('ciFailed', ctx())).outcome).toBe('disabled');
  });

  it('does not record an attempt when the wake is skipped (budget, dormant)', async () => {
    const { store, attempts } = memoryStore();
    const svc = createReactionService({
      store,
      waker: {
        wakeIssue: async () => ({
          kind: 'agent',
          principalId: 'a',
          subjectId: 'i1',
          triggerType: 'reaction',
          started: false,
          skipped: 'limited',
        }),
      },
    });
    const result = await svc.react('ciFailed', ctx());
    expect(result).toMatchObject({ outcome: 'skipped', reason: 'limited' });
    expect(attempts).toHaveLength(0);
  });

  it('leaves an issue that is no longer in progress alone', async () => {
    const { store } = memoryStore();
    store.issueState = async () => ({ statusKey: 'done' });
    const svc = createReactionService({
      store,
      waker: {
        wakeIssue: async () => {
          throw new Error('must not wake');
        },
      },
    });
    expect((await svc.react('ciFailed', ctx())).outcome).toBe('skipped');
  });
});
