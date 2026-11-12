import { describe, expect, it } from 'vitest';
import {
  scanSecrets,
  maskSecrets,
  hashSecret,
  MASKED_SECRET_PLACEHOLDER,
} from '../../server/security/secret-patterns.js';

describe('secret patterns and detection', () => {
  it('detects common tokens: ghp, openai, anthropic, google, jwt, pem', () => {
    const text = `
      Here is my token: ghp_123456789012345678901234567890123456
      OpenAI key: sk-abcdefghijklmnopqrstuvwxyz1234567890
      Anthropic key: sk-ant-api03-abcdefghijklmnopqrstuvwxyz1234567890
      Google: AIzaSyD12345678901234567890123456789012
      PEM:
      -----BEGIN RSA PRIVATE KEY-----
      MIIEowIBAAKCAQEA...
      -----END RSA PRIVATE KEY-----
      JWT:
      eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c
      Assign:
      api_key = "abcdefghijklmnopqrstuvwxyz1234567890"
    `;

    const matches = scanSecrets(text);
    const keys = matches.map((m) => m.patternKey);

    expect(keys).toContain('github_token');
    expect(keys).toContain('openai_api_key');
    expect(keys).toContain('anthropic_api_key');
    expect(keys).toContain('google_ai_key');
    expect(keys).toContain('pem_private_key');
    expect(keys).toContain('jwt_token');
    expect(keys).toContain('generic_key_assignment');

    for (const match of matches) {
      expect(match.fingerprint).toEqual(hashSecret(match.match));
      expect(match.fingerprint).toHaveLength(64);
    }
  });

  it('does not trigger on ordinary text, commit SHAs or UUIDs', () => {
    const cleanText = `
      Commit: 077f2ad8949826189ef949219b18751892189012
      UUID: 5fd7e9ec-ebbf-4ec6-9d26-c61837ed635e
      URL: https://github.com/covuaduongsinh/duongsinh-studio/issues/50
      Normal description: Fix bug in user registration flow with valid email address.
    `;

    const matches = scanSecrets(cleanText);
    expect(matches).toHaveLength(0);
  });

  it('masks secret matches with [NGHI LÀ BÍ MẬT]', () => {
    const text =
      'Connect with token ghp_123456789012345678901234567890123456 and continue.';
    const masked = maskSecrets(text);

    expect(masked).toBe(
      `Connect with token ${MASKED_SECRET_PLACEHOLDER} and continue.`,
    );
    expect(masked).not.toContain('ghp_123456789012345678901234567890123456');
  });

  it('handles null, undefined, and empty string safely', () => {
    expect(scanSecrets(null)).toEqual([]);
    expect(scanSecrets(undefined)).toEqual([]);
    expect(scanSecrets('')).toEqual([]);
    expect(maskSecrets(null)).toBe('');
    expect(maskSecrets(undefined)).toBe('');
    expect(maskSecrets('')).toBe('');
  });

  // The samples are assembled at run time so this file does not itself trip the diff scan.
  const assign = (name: string, value: string, glue = '=') =>
    `${name}${glue}${value}`;
  const secretName = (...parts: string[]) => [...parts, 'SECRET'].join('_');
  const passwordName = (...parts: string[]) => [...parts, 'PASSWORD'].join('_');

  describe('named secret assignments (V0.3)', () => {
    it.each([
      ['an app secret', assign(secretName('LARK', 'APP'), 'Qw3rTy9uIoP2aSdF')],
      ['a database password', assign(passwordName('DB'), 'Zk39sLmq02Vx')],
      ['secret keys', assign('SECRETS_KEYS', 'k3y1-k3y2-k3y3-k3y4')],
      ['a bare token name', assign('TOKEN', 'abcdef1234567890')],
      [
        'a YAML value',
        assign(secretName('LARK', 'APP'), 'Qw3rTy9uIoP2aSdF', ': '),
      ],
      ['a quoted value', assign(passwordName('DB'), '"Zk39sLmq02Vx"')],
    ])('catches %s', (_label, text) => {
      const keys = scanSecrets(text).map((m) => m.patternKey);
      expect(keys).toContain('named_secret_assignment');
    });

    it('masks only the value and keeps the name', () => {
      const text = `${assign(secretName('LARK', 'APP'), 'Qw3rTy9uIoP2aSdF')}\nnext line`;
      const masked = maskSecrets(text);
      expect(masked).toBe(
        `${secretName('LARK', 'APP')}=${MASKED_SECRET_PLACEHOLDER}\nnext line`,
      );
    });

    it.each([
      [
        'a variable reference',
        assign(secretName('LARK', 'APP'), '${LARK_APP_SECRET}'),
      ],
      [
        'a compose default',
        assign(passwordName('DB'), '${DB_PASSWORD:?DB_PASSWORD is required}'),
      ],
      [
        'a placeholder in angle brackets',
        assign(passwordName('DB'), '<your-database-password>'),
      ],
      ['a masked value', assign(passwordName('DB'), '************')],
      ['an elided value', assign(passwordName('DB'), '...........')],
      ['repeated x', assign(passwordName('DB'), 'xxxxxxxxxxxx')],
      ['a placeholder word', assign(passwordName('DB'), 'changeme-please-now')],
      [
        'a code reference',
        assign(secretName('LARK', 'APP'), ' process.env.LARK_APP_SECRET', ' ='),
      ],
      ['a short value', assign(passwordName('DB'), 'short')],
      [
        'a name that only contains the word',
        assign('TOKENIZER', 'abcdef1234567890'),
      ],
      [
        'a code assignment with spaces around =',
        assign(secretName('CI'), " 'SomeLongName12345'", ' ='),
      ],
      [
        'a JS property holding an identifier',
        assign('CALLBACK_TOKEN', ' callbackToken,', ':'),
      ],
      [
        'a YAML value without a digit',
        assign(secretName('LARK', 'APP'), 'just-some-words-here', ': '),
      ],
      [
        'no value',
        `${secretName('LARK', 'APP')} is set in the environment of the job`,
      ],
    ])('ignores %s', (_label, text) => {
      expect(scanSecrets(text)).toEqual([]);
    });

    it('catches a bearer token but not a shell variable', () => {
      const real = `Authorization: Bearer ${'a1B2c3D4e5F6g7H8i9J0k1L2'}`;
      expect(scanSecrets(real).map((m) => m.patternKey)).toContain(
        'bearer_token',
      );
      expect(scanSecrets('Authorization: Bearer $token')).toEqual([]);
    });

    it('still catches a Studio key sent as a header', () => {
      const header = `x-api-key: ${'Ab12Cd34Ef56Gh78Ij90Kl12Mn34'}`;
      expect(scanSecrets(header).map((m) => m.patternKey)).toContain(
        'generic_key_assignment',
      );
    });
  });
});
