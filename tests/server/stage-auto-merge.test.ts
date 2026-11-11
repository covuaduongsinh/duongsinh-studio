// @vitest-environment node
// The pull request of a finished stage is merged by Studio itself, so the work goes on to the next stage; nothing else is.
import { randomUUID } from 'node:crypto';
import { afterEach, expect, vi } from 'vitest';
import { createAppTest } from '@nocobase/app-testing/server';
import {
  signIn,
  DEFAULT_ADMIN_CREDENTIALS,
} from '@nocobase/app-plugin-authentication/testing';
import { gitServiceToken } from '../../server/providers/git.js';
import { createStandaloneServer } from '../../server/standalone.js';

const test = createAppTest({
  createServer: createStandaloneServer,
  config: {
    app: { publicOrigin: 'http://localhost' },
    auth: { secret: 'test-auth-secret-at-least-32-characters' },
    secrets: {
      keys: [
        { version: 1, key: 'test-secrets-key-at-least-32-characters-long' },
      ],
    },
  },
});

const API = 'https://github.test/api';
const TOKEN = 'ghp_test_token_never_returned';
const HEAD = 'abc1234def5678';

const json = (body: unknown, method = 'POST') => ({
  method,
  headers: {
    'content-type': 'application/json',
    origin: 'http://localhost',
    'Idempotency-Key': `${Date.now()}.${randomUUID()}`,
  },
  body: JSON.stringify(body),
});

interface Hosted {
  branch: string;
  merged: boolean;
  checks: 'success' | 'failure';
}

/** GitHub with several pull requests by number; a merge marks one merged. */
function fakeGitHub(pulls: Map<number, Hosted>, merges: number[]): void {
  const original = globalThis.fetch;
  const body = (number: number, hosted: Hosted) => ({
    number,
    title: `Giai đoạn ${number}`,
    html_url: `https://github.test/acme/sandbox/pull/${number}`,
    state: hosted.merged ? 'closed' : 'open',
    merged: hosted.merged,
    draft: false,
    head: { ref: hosted.branch, sha: `${HEAD}${number}` },
    base: { ref: 'main' },
    mergeable_state: 'clean',
    merged_at: hosted.merged ? new Date().toISOString() : null,
    merge_commit_sha: hosted.merged ? `merge${number}` : null,
    closed_at: hosted.merged ? new Date().toISOString() : null,
    user: { login: 'agent-bot' },
    updated_at: new Date().toISOString(),
  });
  vi.stubGlobal(
    'fetch',
    async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(
        typeof input === 'string' || input instanceof URL ? input : input.url,
      );
      if (!url.href.startsWith(API)) return original(input, init);
      const path = url.pathname.slice('/api'.length);
      const answer = (payload: unknown, status = 200) =>
        new Response(JSON.stringify(payload), {
          status,
          headers: { 'content-type': 'application/json' },
        });
      if (new Headers(init?.headers).get('authorization') !== `Bearer ${TOKEN}`)
        return answer({ message: 'Bad credentials' }, 401);
      const repo = '/repos/acme/sandbox';
      if (path === '/user') return answer({ login: 'ds-bot' });
      if (path === repo)
        return answer({
          id: 42,
          full_name: 'acme/sandbox',
          default_branch: 'main',
          clone_url: 'https://github.test/acme/sandbox.git',
          html_url: 'https://github.test/acme/sandbox',
          permissions: { push: true },
        });
      if (path === `${repo}/pulls`)
        return answer(
          url.searchParams.get('state') === 'open'
            ? [...pulls]
                .filter(([, h]) => !h.merged)
                .map(([n, h]) => body(n, h))
            : [],
        );
      const merge = /^\/repos\/acme\/sandbox\/pulls\/(\d+)\/merge$/u.exec(path);
      if (merge && init?.method === 'PUT') {
        const number = Number(merge[1]);
        const hosted = pulls.get(number);
        if (!hosted) return answer({ message: 'Not Found' }, 404);
        hosted.merged = true;
        merges.push(number);
        return answer({ sha: `merge${number}`, merged: true });
      }
      const one = /^\/repos\/acme\/sandbox\/pulls\/(\d+)$/u.exec(path);
      if (one) {
        const hosted = pulls.get(Number(one[1]));
        return hosted
          ? answer(body(Number(one[1]), hosted))
          : answer({ message: 'Not Found' }, 404);
      }
      const checks =
        /^\/repos\/acme\/sandbox\/commits\/abc1234def5678(\d+)\/check-runs$/u.exec(
          path,
        );
      if (checks)
        return answer({
          check_runs: [
            {
              name: 'verify',
              status: 'completed',
              conclusion: pulls.get(Number(checks[1]))?.checks ?? 'success',
              html_url: 'https://github.test/acme/sandbox/runs/1',
            },
          ],
        });
      if (/\/commits\/.+\/status$/u.test(path))
        return answer({ state: 'success', statuses: [] });
      if (init?.method === 'POST' && /\/issues\/\d+\/comments$/u.test(path))
        return answer({ id: 1 }, 201);
      return answer({ message: 'Not Found' }, 404);
    },
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

test(
  'merges the pull request of a finished stage by itself, and only that',
  { timeout: 240_000 },
  async ({ testApp, app }) => {
    const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
    const pulls = new Map<number, Hosted>();
    const merges: number[] = [];
    fakeGitHub(pulls, merges);

    const connection = (
      (await (
        await admin.fetch(
          '/git/connections',
          json({ name: 'GitHub', token: TOKEN, apiBaseUrl: API }),
        )
      ).json()) as { data: { id: string } }
    ).data;
    const repository = (
      (await (
        await admin.fetch(
          '/git/repositories',
          json({ connectionId: connection.id, repo: 'acme/sandbox' }),
        )
      ).json()) as { data: { id: string } }
    ).data;
    const project = (
      await (
        await admin.fetch(
          '/projects',
          json({ name: 'Sandbox', visibility: 'members' }),
        )
      ).json()
    ).data as { id: string };
    await admin.fetch(
      `/projects/${project.id}/codeLocations`,
      json({ repositoryId: repository.id, primary: true }),
    );

    interface Issue {
      id: string;
      identifier: string;
      revision: number;
    }
    // A new issue starts in progress; one handed over is moved to In review afterwards.
    const make = async (
      body: { statusKey?: string } & Record<string, unknown>,
    ): Promise<Issue> => {
      const { statusKey, ...rest } = body;
      const made = await admin.fetch(
        '/projects/issues',
        json({ projectId: project.id, statusKey: 'in_progress', ...rest }),
      );
      expect(made.status).toBe(201);
      const issue = (await made.json()).data as Issue;
      if (statusKey === 'in_review') {
        const moved = await admin.fetch(
          `/projects/issues/${issue.id}`,
          json({ statusKey, revision: issue.revision }, 'PATCH'),
        );
        expect(moved.status).toBe(200);
      }
      return issue;
    };
    const statusOf = async (id: string): Promise<string> =>
      (
        (await (await admin.fetch(`/projects/issues/${id}`)).json()).data as {
          statusKey: string;
        }
      ).statusKey;

    const parent = await make({ title: 'Việc nhiều giai đoạn' });
    const stageDone = await make({
      title: 'Giai đoạn 1',
      parentIssueId: parent.id,
      stage: 1,
      statusKey: 'in_review',
    });
    const stageWorking = await make({
      title: 'Giai đoạn 2',
      parentIssueId: parent.id,
      stage: 2,
      statusKey: 'in_progress',
    });
    const stageFailing = await make({
      title: 'Giai đoạn 3',
      parentIssueId: parent.id,
      stage: 3,
      statusKey: 'in_review',
    });
    const plain = await make({ title: 'Việc đơn', statusKey: 'in_review' });

    pulls.set(11, {
      branch: `agent/${stageDone.identifier}`,
      merged: false,
      checks: 'success',
    });
    pulls.set(12, {
      branch: `agent/${stageWorking.identifier}`,
      merged: false,
      checks: 'success',
    });
    pulls.set(13, {
      branch: `agent/${stageFailing.identifier}`,
      merged: false,
      checks: 'failure',
    });
    pulls.set(14, {
      branch: `agent/${plain.identifier}`,
      merged: false,
      checks: 'success',
    });

    await app.container.resolve(gitServiceToken).syncRepository(repository.id);

    // Only the finished stage with passing checks is merged; its stage issue is done, the larger issue is not.
    expect(merges).toEqual([11]);
    expect(await statusOf(stageDone.id)).toBe('done');
    expect(await statusOf(parent.id)).not.toBe('done');
    // Still at work, checks failing, or not a stage at all: left for a person.
    expect(await statusOf(stageWorking.id)).toBe('in_progress');
    expect(await statusOf(stageFailing.id)).toBe('in_review');
    expect(await statusOf(plain.id)).toBe('in_review');
  },
);
