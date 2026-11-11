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
});
