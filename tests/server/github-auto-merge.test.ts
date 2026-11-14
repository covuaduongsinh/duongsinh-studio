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
