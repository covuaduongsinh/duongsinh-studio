// @vitest-environment node
import sodium from 'libsodium-wrappers';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  createGitHubClient,
  GitHubError,
  sealForGitHub,
} from '../../server/git/github.js';
import {
  missingPermissions,
  REQUIRED_APP_PERMISSIONS,
} from '../../server/git/github-app.js';

const API = 'https://github.test/api';
const REPO = 'acme/nocolms';

interface Call {
  readonly method: string;
  readonly path: string;
  readonly body: Record<string, unknown> | null;
}

/** Answers each request with the first handler whose `METHOD path` matches, recording every call. */
function stubGitHub(
  handlers: Record<
    string,
    (call: Call) => { readonly status: number; readonly body?: unknown }
  >,
) {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      const call: Call = {
        method: init.method ?? 'GET',
        path: url.slice(API.length),
        body: init.body ? JSON.parse(String(init.body)) : null,
      };
      calls.push(call);
      const handler = handlers[`${call.method} ${call.path}`];
      if (!handler) return new Response('{"message":"Not Found"}', { status: 404 });
      const { status, body } = handler(call);
      return new Response(
        status === 204 ? null : JSON.stringify(body ?? {}),
        { status, headers: { 'content-type': 'application/json' } },
      );
    }),
  );
  return calls;
}

let keys: { publicKey: Uint8Array; privateKey: Uint8Array };

beforeAll(async () => {
  await sodium.ready;
  keys = sodium.crypto_box_keypair();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const client = () => createGitHubClient({ token: 'ghs_test', apiBaseUrl: API });
const b64 = (value: Uint8Array) =>
  sodium.to_base64(value, sodium.base64_variants.ORIGINAL);
const open = (sealed: string) =>
  sodium.to_string(
    sodium.crypto_box_seal_open(
      sodium.from_base64(sealed, sodium.base64_variants.ORIGINAL),
      keys.publicKey,
      keys.privateKey,
    ),
  );

describe('putSecret', () => {
  it('seals the value with the repository key so only its private key opens it', async () => {
    const calls = stubGitHub({
      [`GET /repos/${REPO}/actions/secrets/public-key`]: () => ({
        status: 200,
        body: { key_id: 'key-7', key: b64(keys.publicKey) },
      }),
      [`PUT /repos/${REPO}/actions/secrets/STUDIO_API_KEY`]: () => ({
        status: 201,
      }),
    });

    await expect(
      client().putSecret(REPO, 'STUDIO_API_KEY', 'ds_secret-value'),
    ).resolves.toBe('created');

    const put = calls.find((call) => call.method === 'PUT');
    expect(put?.body?.key_id).toBe('key-7');
    expect(JSON.stringify(put?.body)).not.toContain('ds_secret-value');
    expect(open(String(put?.body?.encrypted_value))).toBe('ds_secret-value');
  });

  it('answers updated when GitHub replaced an existing secret', async () => {
    stubGitHub({
      [`GET /repos/${REPO}/actions/secrets/public-key`]: () => ({
        status: 200,
        body: { key_id: 'key-7', key: b64(keys.publicKey) },
      }),
      [`PUT /repos/${REPO}/actions/secrets/STUDIO_URL`]: () => ({
        status: 204,
      }),
    });

    await expect(
      client().putSecret(REPO, 'STUDIO_URL', 'https://studio.test/main'),
    ).resolves.toBe('updated');
  });

  it('refuses a name GitHub would reject without calling GitHub', async () => {
    const calls = stubGitHub({});
    await expect(
      client().putSecret(REPO, 'GITHUB_TOKEN', 'x'),
    ).rejects.toBeInstanceOf(GitHubError);
    await expect(client().putSecret(REPO, '1KEY', 'x')).rejects.toThrow();
    expect(calls).toEqual([]);
  });

  it('carries GitHub’s refusal, such as a missing secrets permission', async () => {
    stubGitHub({
      [`GET /repos/${REPO}/actions/secrets/public-key`]: () => ({
        status: 403,
        body: { message: 'Resource not accessible by integration' },
      }),
    });
    await expect(
      client().putSecret(REPO, 'STUDIO_URL', 'x'),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('seals differently every time (an ephemeral key per value)', async () => {
    const first = await sealForGitHub(b64(keys.publicKey), 'same');
    const second = await sealForGitHub(b64(keys.publicKey), 'same');
    expect(first).not.toBe(second);
    expect(open(first)).toBe('same');
  });
});

describe('createLabel', () => {
  const input = {
    name: 'preview',
    color: '1d76db',
    description: 'Deploy this pull request to the preview App',
  };

  it('creates the label', async () => {
    const calls = stubGitHub({
      [`POST /repos/${REPO}/labels`]: () => ({ status: 201, body: {} }),
    });
    await expect(client().createLabel(REPO, input)).resolves.toBe('created');
    expect(calls[0].body).toEqual(input);
  });

  it('leaves an existing label untouched', async () => {
    const calls = stubGitHub({
      [`POST /repos/${REPO}/labels`]: () => ({
        status: 422,
        body: { message: 'Validation Failed' },
      }),
      [`GET /repos/${REPO}/labels/preview`]: () => ({
        status: 200,
        body: { name: 'Preview' },
      }),
    });
    await expect(client().createLabel(REPO, input)).resolves.toBe('exists');
    expect(calls.filter((call) => call.method !== 'GET')).toHaveLength(1);
  });

  it('fails on a 422 that is not an existing label', async () => {
    stubGitHub({
      [`POST /repos/${REPO}/labels`]: () => ({
        status: 422,
        body: { message: 'Validation Failed' },
      }),
    });
    await expect(client().createLabel(REPO, input)).rejects.toMatchObject({
      status: 422,
    });
  });
});

describe('required App permissions', () => {
  it('include writing secrets, labels and workflow files', () => {
    expect(REQUIRED_APP_PERMISSIONS).toMatchObject({
      secrets: 'write',
      issues: 'write',
      workflows: 'write',
    });
  });

  it('list the three as missing for an App created before they were needed', () => {
    expect(
      missingPermissions({
        metadata: 'read',
        contents: 'write',
        pull_requests: 'write',
        checks: 'write',
        statuses: 'read',
        actions: 'read',
      }),
    ).toEqual(['secrets:write', 'issues:write', 'workflows:write']);
  });
});
