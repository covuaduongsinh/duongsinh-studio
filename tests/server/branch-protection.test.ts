// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  evaluateProtection,
  parseProtection,
} from '../../server/git/protection.js';

// T3a (plan T): read how the default branch is protected and say what is missing, without asking for Administration.
const branch = (over: Record<string, unknown> = {}) => ({
  protected: true,
  protection: {
    enabled: true,
    required_status_checks: {
      contexts: ['ds-check'],
      checks: [{ context: 'ds-check' }],
    },
  },
  ...over,
});

describe('parseProtection', () => {
  it('reads required checks from the branch and from active rules', () => {
    expect(parseProtection(branch(), []).requiredChecks).toEqual(['ds-check']);
    expect(
      parseProtection({ protected: false, protection: { enabled: false } }, [
        {
          type: 'required_status_checks',
          parameters: {
            required_status_checks: [
              { context: 'ds-check' },
              { context: 'lint' },
            ],
          },
        },
        {
          type: 'pull_request',
          parameters: { required_approving_review_count: 0 },
        },
      ]),
    ).toMatchObject({
      requiredChecks: ['ds-check', 'lint'],
      pullRequestRequired: true,
      requiredApprovals: 0,
    });
  });

  it('counts approvals asked by a pull_request rule', () => {
    expect(
      parseProtection({ protected: false }, [
        {
          type: 'pull_request',
          parameters: { required_approving_review_count: 2 },
        },
      ]).requiredApprovals,
    ).toBe(2);
  });
});

describe('evaluateProtection', () => {
  it('is green when the check is required and a pull request is required', () => {
    const read = parseProtection(branch(), [
      {
        type: 'pull_request',
        parameters: { required_approving_review_count: 0 },
      },
    ]);
    expect(evaluateProtection(read, 'ds-check')).toMatchObject({
      verdict: 'ok',
      problems: [],
    });
  });

  it('is red without protection, without the check, or when a pull request is not required', () => {
    expect(
      evaluateProtection(
        parseProtection(
          { protected: false, protection: { enabled: false } },
          [],
        ),
        'ds-check',
      ).problems,
    ).toEqual(expect.arrayContaining(['noRequiredCheck', 'pushAllowed']));
    expect(
      evaluateProtection(
        parseProtection(branch(), [
          {
            type: 'pull_request',
            parameters: { required_approving_review_count: 0 },
          },
        ]),
        'other',
      ).problems,
    ).toEqual(['noRequiredCheck']);
    // A classically protected branch: whether it asks for a pull request is not in what a read-only token sees.
    expect(
      evaluateProtection(parseProtection(branch(), []), 'ds-check'),
    ).toMatchObject({
      verdict: 'unknown',
      problems: [],
      unknowns: ['pullRequestUnknown'],
    });
  });

  it('is red when an approving review is required, because the App cannot approve its own pull requests', () => {
    const read = parseProtection(branch(), [
      {
        type: 'pull_request',
        parameters: { required_approving_review_count: 1 },
      },
    ]);
    expect(evaluateProtection(read, 'ds-check').problems).toEqual([
      'reviewRequired',
    ]);
  });
});
