export interface SecretPattern {
  readonly key: string;
  readonly name: string;
  readonly regex: RegExp;
}

export interface SecretFinding {
  readonly patternKey: string;
  readonly line?: number;
  readonly file?: string;
}

/**
 * Common credential, token, and private key regexes for security scanning.
 * Used by pre-review gate (H1d) and secret alert listener (H2b).
 */
export const SECRET_PATTERNS: readonly SecretPattern[] = [
  {
    key: 'github_token',
    name: 'GitHub personal access or OAuth token',
    regex: /\bgh[pousr]_[A-Za-z0-9_]{36,}\b/,
  },
  {
    key: 'anthropic_api_key',
    name: 'Anthropic API key',
    regex: /\bsk-ant-api\d*-[A-Za-z0-9_-]{20,}\b|\bsk-ant-[A-Za-z0-9_-]{20,}\b/,
  },
  {
    key: 'openai_api_key',
    name: 'OpenAI API key',
    regex: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/,
  },
  {
    key: 'slack_token',
    name: 'Slack token',
    regex: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/,
  },
  {
    key: 'stripe_key',
    name: 'Stripe API key',
    regex: /\b(?:sk|pk)_(?:test|live)_[0-9a-zA-Z]{24,}\b/,
  },
  {
    key: 'aws_access_key',
    name: 'AWS Access Key ID',
    regex: /\bAKIA[0-9A-Z]{16}\b/,
  },
  {
    key: 'google_api_key',
    name: 'Google or Firebase API key',
    regex: /\bAIza[0-9A-Za-z-_]{35}\b/,
  },
  {
    key: 'pem_private_key',
    name: 'PEM Private Key block',
    regex:
      /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP |ENCRYPTED )?PRIVATE KEY(?: BLOCK)?-----/,
  },
  {
    key: 'jwt_token',
    name: 'JSON Web Token (JWT)',
    regex:
      /\beyJ[A-Za-z0-9-_=]{10,}\.eyJ[A-Za-z0-9-_=]{10,}\.[A-Za-z0-9-_.+/=]*/,
  },
  {
    key: 'secret_assignment',
    name: 'Secret or credential variable assignment',
    regex:
      /(?:api[_-]?key|secret|password|passwd|auth[_-]?token|access[_-]?token)\s*[:=]\s*['"]?([a-zA-Z0-9_\-./+=]{16,})['"]?/i,
  },
];

/**
 * Scans a single line of text for any known secret pattern.
 * Returns the matched pattern key or null if no secret found.
 */
export function scanLineForSecrets(line: string): string | null {
  for (const pattern of SECRET_PATTERNS) {
    if (pattern.regex.test(line)) {
      return pattern.key;
    }
  }
  return null;
}

/**
 * Scans added lines in a patch/diff (lines starting with '+' except '+++' headers).
 * Does NOT return the raw matched secret value to prevent credential leaking.
 */
export function scanAddedLines(patch: string, file?: string): SecretFinding[] {
  if (!patch) return [];
  const findings: SecretFinding[] = [];
  const lines = patch.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    if (rawLine.startsWith('+') && !rawLine.startsWith('+++')) {
      const addedContent = rawLine.slice(1);
      const patternKey = scanLineForSecrets(addedContent);
      if (patternKey) {
        findings.push({
          patternKey,
          line: i + 1,
          ...(file ? { file } : {}),
        });
      }
    }
  }

  return findings;
}

/**
 * Scans arbitrary text (such as issue descriptions or comments) for secrets.
 */
export function scanTextForSecrets(
  text: string,
  file?: string,
): SecretFinding[] {
  if (!text) return [];
  const findings: SecretFinding[] = [];
  const lines = text.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const patternKey = scanLineForSecrets(lines[i]);
    if (patternKey) {
      findings.push({
        patternKey,
        line: i + 1,
        ...(file ? { file } : {}),
      });
    }
  }

  return findings;
}
