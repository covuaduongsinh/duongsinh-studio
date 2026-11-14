// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createGitHubClient, GitHubError } from '../../server/git/github.js';

// T3b (plan T): GitHub's auto-merge is switched on through GraphQL, and a refusal is said, never swallowed.
const calls: { method: string; url: string; body: unknown }[] = [];
function stub(graphql: unknown) {
  vi.stubGlobal(
    'fetch',
    async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      calls.push({
        method: init?.method ?? 'GET',
        url,
        body: typeof init?.body === 'string' ? JSON.parse(init.body) : null,
      });
      const body = url.endsWith('/graphql')
        ? graphql
        : { node_id: 'PR_node_1', number: 5 };
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    },
  );
}
const client = () =>
  createGitHubClient({ token: 'tkn', apiBaseUrl: 'https://github.test/api' });

afterEach(() => {
  vi.unstubAllGlobals();
  calls.length = 0;
});

describe('enableAutoMerge', () => {
  it('asks GraphQL for a squash auto-merge on the pull request node', async () => {
    stub({
      data: { enablePullRequestAutoMerge: { pullRequest: { number: 5 } } },
    });
    await client().enableAutoMerge('acme/sandbox', 5);
    const graph = calls.find((c) => c.url.endsWith('/graphql'))!;
    expect(graph.method).toBe('POST');
    expect(JSON.stringify(graph.body)).toContain('enablePullRequestAutoMerge');
    expect(JSON.stringify(graph.body)).toContain('PR_node_1');
    expect(JSON.stringify(graph.body)).toContain('SQUASH');
  });

  it('says so when the repository does not allow auto-merge', async () => {
    stub({
      errors: [
        {
          message: 'Pull request Auto merge is not allowed for this repository',
        },
      ],
    });
    await expect(
      client().enableAutoMerge('acme/sandbox', 5),
    ).rejects.toMatchObject({
      status: 422,
      message: expect.stringContaining('Auto merge is not allowed'),
    });
    await expect(
      client().enableAutoMerge('acme/sandbox', 5),
    ).rejects.toBeInstanceOf(GitHubError);
  });
});

describe('disableAutoMerge', () => {
  it('asks GraphQL to turn auto-merge off on the pull request node', async () => {
    stub({
      data: { disablePullRequestAutoMerge: { pullRequest: { number: 5 } } },
    });
    await client().disableAutoMerge('acme/sandbox', 5);
    const graph = calls.find((c) => c.url.endsWith('/graphql'))!;
    expect(JSON.stringify(graph.body)).toContain('disablePullRequestAutoMerge');
    expect(JSON.stringify(graph.body)).toContain('PR_node_1');
  });

  it('says so when GitHub refuses', async () => {
    stub({ errors: [{ message: 'Auto merge is not enabled' }] });
    await expect(
      client().disableAutoMerge('acme/sandbox', 5),
    ).rejects.toMatchObject({ status: 422 });
  });
});

// S3 (plan S): Studio finds the interface check's run of a head, newest first, by the workflow's name.
describe('workflowRun', () => {
  it('returns the newest run of the named workflow on the commit, or null', async () => {
    vi.stubGlobal('fetch', async (input: string | URL | Request) => {
      calls.push({ method: 'GET', url: String(input), body: null });
      return new Response(
        JSON.stringify({
          workflow_runs: [
            { id: 9, name: 'ci', status: 'completed', conclusion: 'success' },
            {
              id: 8,
              name: 'ds-ui-smoke',
              status: 'completed',
              conclusion: 'failure',
              html_url: 'https://github.test/acme/sandbox/actions/runs/8',
            },
            {
              id: 7,
              name: 'ds-ui-smoke',
              status: 'completed',
              conclusion: 'success',
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });
    expect(
      await client().workflowRun('acme/sandbox', 'abc', 'ds-ui-smoke'),
    ).toEqual({
      id: 8,
      url: 'https://github.test/acme/sandbox/actions/runs/8',
      status: 'completed',
      conclusion: 'failure',
    });
    expect(calls[0]!.url).toContain('head_sha=abc');
    expect(
      await client().workflowRun('acme/sandbox', 'abc', 'other'),
    ).toBeNull();
  });
});
