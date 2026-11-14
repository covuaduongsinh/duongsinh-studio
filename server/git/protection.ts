/**
 * How a repository's default branch is protected, read with what the GitHub App already has (plan T, T3a). No
 * Administration permission is asked for (Q2), so classic branch protection shows only whether it exists and which checks
 * it requires; the pull request rule and the review count come from rulesets, which a read-only token can list.
 */

type Json = Record<string, unknown>;
const obj = (value: unknown): Json =>
  typeof value === 'object' && value !== null ? (value as Json) : {};
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const text = (value: unknown): string | null =>
  typeof value === 'string' && value !== '' ? value : null;

export interface ProtectionRead {
  /** The branch has classic protection. */
  readonly protected: boolean;
  readonly requiredChecks: readonly string[];
  /** A ruleset asks for a pull request. */
  readonly pullRequestRequired: boolean;
  /** Approvals a ruleset's pull request rule asks for. */
  readonly requiredApprovals: number;
}

/** The two answers of GitHub (`GET /branches/{b}` and `GET /rules/branches/{b}`) as one reading. */
export function parseProtection(
  branch: unknown,
  rules: readonly unknown[],
): ProtectionRead {
  const answer = obj(branch);
  const checks = new Set<string>();
  const classic = obj(obj(answer.protection).required_status_checks);
  for (const name of list(classic.contexts)) {
    const value = text(name);
    if (value) checks.add(value);
  }
  for (const entry of list(classic.checks)) {
    const value = text(obj(entry).context);
    if (value) checks.add(value);
  }
  let pullRequestRequired = false;
  let requiredApprovals = 0;
  for (const rule of rules.map(obj)) {
    const parameters = obj(rule.parameters);
    if (rule.type === 'required_status_checks')
      for (const entry of list(parameters.required_status_checks)) {
        const value = text(obj(entry).context);
        if (value) checks.add(value);
      }
    if (rule.type === 'pull_request') {
      pullRequestRequired = true;
      const count = parameters.required_approving_review_count;
      requiredApprovals = Math.max(
        requiredApprovals,
        typeof count === 'number' ? count : 0,
      );
    }
  }
  return {
    protected:
      answer.protected === true || obj(answer.protection).enabled === true,
    requiredChecks: [...checks],
    pullRequestRequired,
    requiredApprovals,
  };
}

export type ProtectionProblem =
  'noRequiredCheck' | 'pushAllowed' | 'reviewRequired';
export type ProtectionUnknown = 'pullRequestUnknown';

export interface ProtectionVerdict {
  /** `problem` when something is wrong, `unknown` when nothing is wrong that can be seen but something cannot be, else `ok`. */
  readonly verdict: 'ok' | 'problem' | 'unknown';
  readonly problems: ProtectionProblem[];
  readonly unknowns: ProtectionUnknown[];
}

/**
 * Red when the check Studio relies on is not required, when work can be pushed straight to the branch, or when an approving
 * review is required (the App cannot approve its own pull requests, so nothing would ever merge).
 */
export function evaluateProtection(
  read: ProtectionRead,
  checkName: string,
): ProtectionVerdict {
  const problems: ProtectionProblem[] = [];
  const unknowns: ProtectionUnknown[] = [];
  if (!read.requiredChecks.includes(checkName))
    problems.push('noRequiredCheck');
  if (!read.pullRequestRequired) {
    if (read.protected) unknowns.push('pullRequestUnknown');
    else problems.push('pushAllowed');
  }
  if (read.requiredApprovals > 0) problems.push('reviewRequired');
  return {
    verdict:
      problems.length > 0 ? 'problem' : unknowns.length > 0 ? 'unknown' : 'ok',
    problems,
    unknowns,
  };
}
