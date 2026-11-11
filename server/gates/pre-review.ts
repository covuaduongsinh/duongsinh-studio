import type { CiState } from '../git/pull-state.js';
import { ciStateOf } from '../git/pull-state.js';
import type { GitHubCheck } from '../git/github.js';
import { isSensitive } from '../autopilot/evaluator.js';
import {
  scanAddedLines,
  type SecretFinding,
} from '../security/secret-patterns.js';

/**
 * Forbidden file patterns from CI workflow rules (`server/setups/ci-workflow.ts`).
 * Files matching these patterns must never be committed into the repository.
 */
export const FORBIDDEN_FILE_PATTERNS: readonly RegExp[] = [
  /\.sqlite$/i,
  /(^|\/)\.env(\..+)?$/i,
  /(^|\/)config\.yml$/i,
  /\.dump$/i,
];

/**
 * Evaluates whether a file path violates forbidden file rules (CI workflow or project-level forbidden patterns).
 */
export function isForbiddenFile(
  path: string,
  extraPatterns?: readonly (string | RegExp)[],
): boolean {
  const normalized = path.replace(/\\/g, '/').replace(/^\/+/, '');

  for (const pattern of FORBIDDEN_FILE_PATTERNS) {
    if (pattern.test(normalized)) {
      return true;
    }
  }

  if (extraPatterns && extraPatterns.length > 0) {
    const stringPatterns: string[] = [];
    for (const pat of extraPatterns) {
      if (typeof pat === 'string') {
        stringPatterns.push(pat);
      } else if (pat.test(normalized)) {
        return true;
      }
    }
    if (stringPatterns.length > 0 && isSensitive(normalized, stringPatterns)) {
      return true;
    }
  }

  return false;
}

export interface PreReviewGateResult {
  readonly passed: boolean;
  readonly reasons: readonly string[];
  readonly ci: {
    readonly state: CiState;
    readonly passed: boolean;
    readonly reason?: string;
  };
  readonly secretScan: {
    readonly passed: boolean;
    readonly findings: readonly SecretFinding[];
  };
  readonly forbiddenFiles: {
    readonly passed: boolean;
    readonly files: readonly string[];
  };
}

export interface EvaluatePreReviewGateInput {
  readonly pull: {
    readonly number: number;
    readonly ciState?: CiState;
  };
  readonly checks: readonly Pick<GitHubCheck, 'name' | 'outcome'>[];
  readonly requiredChecks?: readonly string[];
  readonly changedFiles: readonly string[];
  readonly patch: string;
  readonly extraForbiddenPatterns?: readonly (string | RegExp)[];
}

/**
 * Evaluates the Pre-Review Gate (H1d) for a pull request before an agent reviewer runs.
 * Checks:
 * 1. CI checks: Must be completed and 'passed' (not 'failed', 'missing', or 'pending').
 * 2. Secret scan: Patch additions must not contain credential/token/key patterns.
 * 3. Forbidden files: Changed files must not include forbidden files (.env, sqlite, config.yml, dump).
 */
export function evaluatePreReviewGate(
  input: EvaluatePreReviewGateInput,
): PreReviewGateResult {
  const reasons: string[] = [];

  // 1. CI state check
  const ci = ciStateOf(input.checks, input.requiredChecks ?? []);
  let ciPassed = false;
  let ciReason: string | undefined;

  if (ci === 'passed') {
    ciPassed = true;
  } else if (ci === 'failed') {
    ciReason = `CI checks failed on pull request #${input.pull.number}.`;
    reasons.push(ciReason);
  } else if (ci === 'missing') {
    ciReason = `CI checks are missing on pull request #${input.pull.number}.`;
    reasons.push(ciReason);
  } else {
    // 'pending'
    ciReason = `CI checks are still pending on pull request #${input.pull.number}.`;
    reasons.push(ciReason);
  }

  // 2. Secret scan on added lines of patch
  const findings = scanAddedLines(input.patch);
  const secretPassed = findings.length === 0;
  if (!secretPassed) {
    const keys = [...new Set(findings.map((f) => f.patternKey))].join(', ');
    reasons.push(
      `Potential secret or credential pattern detected in pull request #${input.pull.number} patch (${keys}).`,
    );
  }

  // 3. Forbidden files check
  const forbidden = input.changedFiles.filter((file) =>
    isForbiddenFile(file, input.extraForbiddenPatterns),
  );
  const forbiddenPassed = forbidden.length === 0;
  if (!forbiddenPassed) {
    reasons.push(
      `Pull request #${input.pull.number} modifies forbidden file(s): ${forbidden.join(', ')}.`,
    );
  }

  const passed = ciPassed && secretPassed && forbiddenPassed;

  return {
    passed,
    reasons,
    ci: {
      state: ci,
      passed: ciPassed,
      ...(ciReason ? { reason: ciReason } : {}),
    },
    secretScan: {
      passed: secretPassed,
      findings,
    },
    forbiddenFiles: {
      passed: forbiddenPassed,
      files: forbidden,
    },
  };
}
