import { createHash } from 'node:crypto';

export interface SecretPatternDef {
  readonly key: string;
  readonly description: string;
  readonly regex: RegExp;
  readonly valueGroupIndex?: number;
}

export interface SecretMatch {
  readonly patternKey: string;
  readonly match: string;
  readonly fingerprint: string;
}

export type SecretFinding = SecretMatch;

/**
 * Common high-confidence secret and token patterns according to H2b specification.
 */
export const SECRET_PATTERNS: readonly SecretPatternDef[] = [
  {
    key: 'github_token',
    description: 'GitHub personal access token',
    regex: /\bghp_[A-Za-z0-9_]{36,}\b/g,
  },
  {
    key: 'github_fine_grained_pat',
    description: 'GitHub fine-grained personal access token',
    regex: /\bgithub_pat_[A-Za-z0-9_]{82}\b/g,
  },
  {
    key: 'github_oauth_token',
    description: 'GitHub OAuth access token',
    regex: /\bgho_[A-Za-z0-9_]{36,}\b/g,
  },
  {
    key: 'github_app_token',
    description: 'GitHub app user-to-server or server-to-server token',
    regex: /\b(ghu|ghs)_[A-Za-z0-9_]{36,}\b/g,
  },
  {
    key: 'gitlab_pat',
    description: 'GitLab personal access token',
    regex: /\bglpat-[A-Za-z0-9-]{20,}\b/g,
  },
  {
    key: 'slack_token',
    description: 'Slack API token',
    regex: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g,
  },
  {
    key: 'anthropic_api_key',
    description: 'Anthropic API key',
    regex: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g,
  },
  {
    key: 'openai_api_key',
    description: 'OpenAI API key',
    regex: /\bsk-(?!ant-)(?:proj-)?[A-Za-z0-9_-]{20,}\b/g,
  },
  {
    key: 'google_ai_key',
    description: 'Google AI / Cloud API key',
    regex: /\bAIza[0-9A-Za-z_-]{35}\b/g,
  },
  {
    key: 'pem_private_key',
    description: 'PEM formatted private key header',
    regex: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g,
  },
  {
    key: 'jwt_token',
    description: 'JSON Web Token (JWT)',
    regex:
      /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
  },
  {
    key: 'generic_key_assignment',
    description: 'Generic API key / token assignment with long entropy value',
    regex:
      /(?:api[_-]?key|secret[_-]?key|access[_-]?token|auth[_-]?token|private[_-]?key)\s*[:=]\s*['"]?([A-Za-z0-9\-_.~+/=]{20,})['"]?/gi,
    valueGroupIndex: 1,
  },
  {
    key: 'named_secret_assignment',
    description:
      'Environment-style assignment of a secret, password or token (LARK_APP_SECRET=…, DB_PASSWORD=…, SECRETS_KEYS=…)',
    // Two shapes only, so code is left alone: `NAME=value` with no space around `=` (dotenv, shell, compose, docs), and
    // YAML `NAME: value` where the value also contains a digit (a JS property such as `CALLBACK_TOKEN: callbackToken` or
    // `const X_SECRET = 'SOME_NAME'` is not a literal secret). The name ends in SECRET, PASSWORD, PASSWD or TOKEN, or is
    // SECRETS_KEY(S); the value is 12+ characters of a secret-ish alphabet. Not matched: `${VAR}`, `<…>` (first character
    // outside the alphabet), `process.env.X` or `config.token` (identifier chains), `***`/`...`/`xxxx` and placeholder words.
    regex:
      /\b(?:[A-Z][A-Z0-9]*_)*(?:SECRETS_KEYS?|SECRET|PASSWORD|PASSWD|TOKEN)(?:=['"]?|:[ \t]+['"]?(?=[A-Za-z0-9\-_.~+/=@#%!^*]*[0-9]))(?![A-Za-z_][A-Za-z0-9_]*\.[A-Za-z_])(?!\*{3}|\.{3}|x{6}|X{6}|[Cc]hange|[Yy]our|[Ee]xample|[Pp]laceholder|[Rr]eplace|[Dd]ummy|[Rr]edacted|REDACTED)([A-Za-z0-9\-_.~+/=@#%!^*]{12,})/g,
    valueGroupIndex: 1,
  },
  {
    key: 'bearer_token',
    description: 'Bearer token in an Authorization header',
    regex: /\bBearer[ \t]+([A-Za-z0-9\-_.~+/=]{24,})/g,
    valueGroupIndex: 1,
  },
];

export const MASKED_SECRET_PLACEHOLDER = '[NGHI LÀ BÍ MẬT]';

/**
 * Computes a SHA-256 fingerprint hex of a secret match.
 * Raw secret values are NEVER stored in persistent storage or returned in API responses.
 */
export function hashSecret(secret: string): string {
  return createHash('sha256').update(secret.trim()).digest('hex');
}

/**
 * Scans a text string for known secret patterns.
 * Returns unique matches with their pattern key, raw matched string, and sha256 fingerprint.
 */
export function scanSecrets(text: string | null | undefined): SecretMatch[] {
  if (!text || typeof text !== 'string') return [];

  const matches: SecretMatch[] = [];
  const seenFingerprints = new Set<string>();

  for (const pattern of SECRET_PATTERNS) {
    const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
      const matchedString =
        pattern.valueGroupIndex !== undefined && match[pattern.valueGroupIndex]
          ? match[pattern.valueGroupIndex]
          : match[0];

      if (!matchedString) continue;

      const fingerprint = hashSecret(matchedString);
      if (!seenFingerprints.has(fingerprint)) {
        seenFingerprints.add(fingerprint);
        matches.push({
          patternKey: pattern.key,
          match: matchedString,
          fingerprint,
        });
      }
    }
  }

  return matches;
}

/**
 * Scans only added lines from a unified diff patch for secrets.
 */
export function scanAddedLines(patch: string): SecretMatch[] {
  if (!patch) return [];
  const addedLines = patch
    .split('\n')
    .filter((line) => line.startsWith('+') && !line.startsWith('+++'))
    .map((line) => line.slice(1))
    .join('\n');
  return scanSecrets(addedLines);
}

/**
 * Replaces any detected secret strings with `[NGHI LÀ BÍ MẬT]` placeholder.
 * Safe to call on issue descriptions or comments before delivering to agents.
 */
export function maskSecrets(text: string | null | undefined): string {
  if (!text || typeof text !== 'string') return '';

  let masked = text;
  const matches = scanSecrets(text);

  for (const item of matches) {
    masked = masked.split(item.match).join(MASKED_SECRET_PLACEHOLDER);
  }

  return masked;
}

export const scanTextForSecrets = scanSecrets;
