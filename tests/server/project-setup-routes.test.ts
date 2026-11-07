import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { afterEach, expect, vi } from 'vitest';
import { createAppTest } from '@nocobase/app-testing/server';
import {
  signIn,
  DEFAULT_ADMIN_CREDENTIALS,
} from '@nocobase/app-plugin-authentication/testing';
import { agentsToken } from '@nocobase/app-plugin-agents/server/tokens';
import { CONTRIBUTOR_SET_KEY } from '../../server/access/roles.js';
import { BUILTIN_SKILLS } from '../../server/agents/builtin-skills.js';
import { PROJECT_MANAGER_ID } from '../../server/agents/ids.js';
import { CHECK_WORKFLOW } from '../../server/setups/check-workflow.js';
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

const PROTOCOL_VERSION = 14;
const MODEL = 'claude-sonnet-4-5';
const PASSWORD = 'Studio-test-123!';
const API = 'https://github.test/api';
const TOKEN = 'ghp_test_token';

const created: { name: string; private: boolean; auto_init: boolean }[] = [];
interface FilePut {
  path: string;
  authorization: string;
  body: { message: string; content: string; branch: string };
}
const filesPut: FilePut[] = [];

/** GitHub as far as linking `acme/sandbox` asks it. */
function fakeGitHub(): void {
  const original = globalThis.fetch;
  vi.stubGlobal(
    'fetch',
    async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(
        typeof input === 'string' || input instanceof URL ? input : input.url,
      );
      if (!url.href.startsWith(API)) return original(input, init);
      const path = url.pathname.slice('/api'.length);
      const answer = (body: unknown, status = 200) =>
        new Response(JSON.stringify(body), {
          status,
          headers: { 'content-type': 'application/json' },
        });
      if (path === '/user') return answer({ login: 'ds-bot' });
      if (path === '/repos/acme/sandbox')
        return answer({
          id: 42,
          full_name: 'acme/sandbox',
          default_branch: 'main',
          clone_url: 'https://github.test/acme/sandbox.git',
          html_url: 'https://github.test/acme/sandbox',
          permissions: { push: true },
        });
      if (path === '/repos/acme/sandbox/pulls') return answer([]);
      if (path === '/repos/acme/sandbox/branches/main')
        return answer({ name: 'main', commit: { sha: 'a'.repeat(40) } });
      // A repository GitHub knows but that has no commit: its default branch does not exist yet.
      if (path === '/repos/acme/blank')
        return answer({
          id: 44,
          full_name: 'acme/blank',
          default_branch: 'main',
          clone_url: 'https://github.test/acme/blank.git',
          html_url: 'https://github.test/acme/blank',
          permissions: { push: true },
        });
      if (path === '/user/repos' && init?.method === 'POST') {
        const body = JSON.parse(String(init.body)) as {
          name: string;
          private: boolean;
          auto_init: boolean;
        };
        created.push(body);
        if (body.name === 'da-co')
          return answer({ message: 'name exists' }, 422);
        return answer(
          {
            id: 43,
            full_name: `ds-bot/${body.name}`,
            default_branch: 'main',
            clone_url: `https://github.test/ds-bot/${body.name}.git`,
            html_url: `https://github.test/ds-bot/${body.name}`,
            permissions: { push: true },
          },
          201,
        );
      }
      if (init?.method === 'PUT' && path.includes('/contents/')) {
        const headers = new Headers(init.headers);
        filesPut.push({
          path,
          authorization: headers.get('authorization') ?? '',
          body: JSON.parse(String(init.body)) as FilePut['body'],
        });
        if (path.includes('/ci-tu-choi/'))
          return answer({ message: 'Resource not accessible' }, 403);
        return answer({ commit: { sha: 'b'.repeat(40) } }, 201);
      }
      // Created with the person's token, outside what the connection reaches.
      if (path === '/repos/ds-bot/ngoai-app')
        return answer({ message: 'Not Found' }, 404);
      if (path.startsWith('/repos/ds-bot/') && !path.endsWith('/pulls'))
        return answer({
          id: 43,
          full_name: path.slice('/repos/'.length),
          default_branch: 'main',
          clone_url: `https://github.test/${path.slice('/repos/'.length)}.git`,
          html_url: `https://github.test/${path.slice('/repos/'.length)}`,
          permissions: { push: true },
        });
      if (path.startsWith('/repos/ds-bot/')) return answer([]);
      return answer({ message: 'Not Found' }, 404);
    },
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const json = (body: unknown, method = 'POST') => ({
  method,
  headers: {
    'content-type': 'application/json',
    origin: 'http://localhost',
    'Idempotency-Key': `${Date.now()}.${randomUUID()}`,
  },
  body: JSON.stringify(body),
});

test(
  'a project is set up in one step, with its initial issue and the default skills reaching its runs',
  { timeout: 240_000 },
  async ({ testApp, app, request }) => {
    for (const path of [
      '/projectDefaultSkills',
      '/projectSetups/x',
      '/projectSetupTemplate',
    ])
      expect((await request(path)).status).toBe(401);
    expect((await request('/projectSetups', json({}))).status).toBe(401);

    const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
    const agents = app.container.resolve(agentsToken);
    const ownerId = (
      (await (await admin.fetch('/auth/get-session')).json()) as {
        user: { id: string };
      }
    ).user.id;
    fakeGitHub();
    const connectionId = (
      (await (
        await admin.fetch(
          '/git/connections',
          json({ name: 'GitHub', token: TOKEN, apiBaseUrl: API }),
        )
      ).json()) as { data: { id: string } }
    ).data.id;
    const withRepo = (name: string, init: object) =>
      admin.fetch(
        '/projectSetups',
        json({
          name,
          codeLocation: 'existingRepo',
          existingRepo: {
            connectionId,
            cloneUrl: 'https://github.test/acme/sandbox.git',
            defaultBranch: 'main',
            init,
          },
        }),
      );

    // Without a project manager the project is still made, its first issue waiting.
    const waiting = await withRepo('Chưa có trưởng nhóm', {
      method: 'prompt',
      prompt: 'Dựng khung dự án',
    });
    expect(waiting.status).toBe(201);
    const waitingAnswer = (await waiting.json()) as {
      data: { initIssueId: string };
      meta: { message: string };
    };
    expect(waitingAnswer.meta.message.length).toBeGreaterThan(10);
    const waitingIssue = (
      await (
        await admin.fetch(`/projects/issues/${waitingAnswer.data.initIssueId}`)
      ).json()
    ).data as { status: { key: string } } & { statusKey?: string };
    expect(waitingIssue.statusKey ?? waitingIssue.status.key).toBe('blocked');

    await agents.agents.ensureSystem({
      id: PROJECT_MANAGER_ID,
      name: 'Project manager',
      description: 'Coordinates.',
      instructions: null,
      actions: ['pm.issues/view', 'pm.issues/comment'],
      modelEntries: [{ tool: 'claude', model: MODEL }],
    });

    // Studio's own skills exist once, with the project ones as the defaults.
    const library = await agents.skills.list();
    for (const skill of BUILTIN_SKILLS)
      expect(library.map((item) => item.slug)).toContain(skill.slug);
    const defaults = (await (await admin.fetch('/projectDefaultSkills')).json())
      .data as { skillIds: string[] };
    expect(defaults.skillIds).toHaveLength(
      BUILTIN_SKILLS.filter((skill) => skill.reach === 'project').length,
    );

    // A wrong setup makes nothing.
    const countProjects = async () =>
      (
        (await (await admin.fetch('/projects?pageSize=100')).json()) as {
          data: unknown[];
        }
      ).data.length;
    const before = await countProjects();
    expect(
      (
        await admin.fetch(
          '/projectSetups',
          json({ name: 'Thiếu repo', codeLocation: 'newRepo' }),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await admin.fetch(
          '/projectSetups',
          json({
            name: 'Kết nối lạ',
            codeLocation: 'newRepo',
            newRepo: {
              connectionId: 'nowhere',
              name: 'r',
              private: true,
              init: { method: 'empty' },
            },
          }),
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await admin.fetch(
          '/projectSetups',
          json({
            name: 'Thiếu kết nối',
            codeLocation: 'existingRepo',
            existingRepo: {
              cloneUrl: 'https://github.com/a/b.git',
              defaultBranch: 'main',
            },
          }),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await admin.fetch(
          '/projectSetups',
          json({ name: 'Trường lạ', codeLocation: 'none', initPrompt: 'x' }),
        )
      ).status,
    ).toBe(400);
    expect(await countProjects()).toBe(before);

    // Without a repository: just the project, and no initialization to read.
    const bare = await admin.fetch(
      '/projectSetups',
      json({ name: 'Dự án trống', codeLocation: 'none' }),
    );
    expect(bare.status).toBe(201);
    const bareData = (await bare.json()).data as {
      projectId: string;
      initIssueId: string | null;
      init: unknown;
      apps: unknown[];
    };
    expect(bareData).toMatchObject({ initIssueId: null, init: null, apps: [] });
    expect(
      (await (await admin.fetch(`/projectSetups/${bareData.projectId}`)).json())
        .data,
    ).toBeNull();

    // A new project copies the defaults; changing them later leaves it alone.
    expect(
      await agents.skills.attached({
        scope: 'project',
        scopeId: bareData.projectId,
      }),
    ).toEqual(defaults.skillIds);

    // A contributor reads a visible project's setup but changes no defaults.
    expect(
      (
        await admin.fetch(
          '/users',
          json({
            name: 'contributor1',
            username: 'contributor1',
            email: 'contributor1@example.test',
            password: PASSWORD,
            roleScopes: { app: [CONTRIBUTOR_SET_KEY] },
          }),
        )
      ).status,
    ).toBe(201);
    const contributor = await signIn(testApp, {
      username: 'contributor1',
      password: PASSWORD,
    });
    expect(
      (
        await contributor.fetch(
          '/projectDefaultSkills',
          json({ skillIds: [] }, 'PUT'),
        )
      ).status,
    ).toBe(403);
    expect((await admin.fetch('/projectSetups/nowhere')).status).toBe(404);

    expect(
      (
        await admin.fetch(
          '/projectDefaultSkills',
          json({ skillIds: ['nowhere'] }, 'PUT'),
        )
      ).status,
    ).toBe(400);
    const cleared = await admin.fetch(
      '/projectDefaultSkills',
      json({ skillIds: [] }, 'PUT'),
    );
    expect(
      ((await cleared.json()).data as { skillIds: string[] }).skillIds,
    ).toEqual([]);
    expect(
      await agents.skills.attached({
        scope: 'project',
        scopeId: bareData.projectId,
      }),
    ).toEqual(defaults.skillIds);
    expect(
      (
        await admin.fetch(
          '/projectDefaultSkills',
          json({ skillIds: defaults.skillIds }, 'PUT'),
        )
      ).status,
    ).toBe(200);

    // With one, the repository is linked and the first issue goes to the project manager, holding the project's others.
    const made = await withRepo('Từ mẫu', {
      method: 'nocobase',
      template: 'default',
    });
    expect(made.status).toBe(201);
    const setup = (await made.json()) as {
      data: {
        projectId: string;
        resourceId: string;
        repo: { fullName: string; url: string };
        initIssueId: string;
        initIssueIdentifier: string;
        init: {
          method: string;
          state: string;
          appTemplate: string | null;
          firstCommit: boolean;
          issueId: string;
          repo: { fullName: string };
        };
      };
      meta?: unknown;
    };
    expect(setup.meta).toBeUndefined();
    expect(setup.data.repo.fullName).toBe('acme/sandbox');
    expect(setup.data.init).toMatchObject({
      method: 'template',
      state: 'pending',
      appTemplate: 'default',
      firstCommit: true,
      issueId: setup.data.initIssueId,
      repo: { fullName: 'acme/sandbox' },
    });
    const project = (
      await (await admin.fetch(`/projects/${setup.data.projectId}`)).json()
    ).data as { setupIssueId: string };
    expect(project.setupIssueId).toBe(setup.data.initIssueId);
    // The issue names the template at this installation's own version, never a bare `--template default`.
    const { nocobase } = JSON.parse(
      await readFile(new URL('../../package.json', import.meta.url), 'utf8'),
    ) as {
      nocobase: { templatePackage: string; defaultTemplateVersion: string };
    };
    const pinned = `${nocobase.templatePackage}@${nocobase.defaultTemplateVersion}`;
    expect(
      (await (await admin.fetch('/projectSetupTemplate')).json()).data,
    ).toEqual({
      packageName: nocobase.templatePackage,
      version: nocobase.defaultTemplateVersion,
    });
    const templateIssue = (
      await (
        await admin.fetch(`/projects/issues/${setup.data.initIssueId}`)
      ).json()
    ).data as { description: string };
    expect(templateIssue.description).toContain(
      `pnpm create @nocobase/app sandbox --template=${pinned} --no-install`,
    );
    expect(templateIssue.description).not.toContain('--template default');
    expect(templateIssue.description).not.toContain('&#x2F;');

    // An existing repository without a commit is refused before any project is made.
    const projectsBeforeBlank = await countProjects();
    const blankRepo = await admin.fetch(
      '/projectSetups',
      json({
        name: 'Repo rỗng',
        codeLocation: 'existingRepo',
        existingRepo: {
          connectionId,
          fullName: 'acme/blank',
          cloneUrl: 'https://github.test/acme/blank.git',
          defaultBranch: 'main',
          init: { method: 'nocobase' },
        },
      }),
    );
    expect(blankRepo.status).toBe(400);
    expect((await blankRepo.json()).error.reason).toBe('GIT_REPOSITORY_EMPTY');
    expect(await countProjects()).toBe(projectsBeforeBlank);
    // A new repository: made on the host first, so a name it refuses leaves no project behind.
    const projectsBefore = await countProjects();
    const newRepo = (name: string, init: object) =>
      admin.fetch(
        '/projectSetups',
        json({
          name: `Dự án ${name}`,
          codeLocation: 'newRepo',
          newRepo: { connectionId, name, private: true, init },
        }),
      );
    expect((await newRepo('da-co', { method: 'empty' })).status).toBe(409);
    expect(await countProjects()).toBe(projectsBefore);
    const fresh = await newRepo('du-an-moi', {
      method: 'prompt',
      prompt: 'Dựng khung',
    });
    expect(fresh.status).toBe(201);
    const freshData = (await fresh.json()).data as {
      repo: { fullName: string };
      initIssueId: string | null;
    };
    expect(freshData.repo.fullName).toBe('ds-bot/du-an-moi');
    expect(freshData.initIssueId).toBeTruthy();
    expect(created.at(-1)).toMatchObject({
      name: 'du-an-moi',
      private: true,
      auto_init: true,
    });
    // Even "empty" gets a first commit: runs cannot check out a repository without one.
    const blank = await newRepo('du-an-trong', { method: 'empty' });
    expect(blank.status).toBe(201);
    expect(
      ((await blank.json()).data as { initIssueId: unknown }).initIssueId,
    ).toBeNull();
    expect(created.at(-1)?.auto_init).toBe(true);
    // Created, but out of the connection's reach: its own refusal, the repository left in place, no project made.
    const unreachedBefore = await countProjects();
    const unreached = await newRepo('ngoai-app', { method: 'nocobase' });
    expect(unreached.status).toBe(400);
    expect((await unreached.json()).error.reason).toBe(
      'GIT_REPOSITORY_NOT_INSTALLED',
    );
    expect(created.at(-1)?.name).toBe('ngoai-app');
    expect(await countProjects()).toBe(unreachedBefore);

    // Studio's check workflow: pushed only with the person's own token, and its absence never fails the setup.
    const withCheck = (name: string) =>
      admin.fetch(
        '/projectSetups',
        json({
          name: `Dự án ${name}`,
          codeLocation: 'newRepo',
          newRepo: {
            connectionId,
            name,
            private: true,
            init: { method: 'empty' },
          },
          ci: { workflow: 'ds-check' },
        }),
      );
    const noToken = await withCheck('ci-chua-token');
    expect(noToken.status).toBe(201);
    expect(
      ((await noToken.json()).data as { deployError: string | null })
        .deployError,
    ).toContain('ds-check.yml');
    expect(filesPut).toHaveLength(0);

    expect(
      (
        await admin.fetch(
          `/git/authorizations/${connectionId}/useToken`,
          json({ token: 'ghp_person_token' }),
        )
      ).status,
    ).toBe(200);
    const checked = await withCheck('ci-co-token');
    expect(checked.status).toBe(201);
    expect(
      ((await checked.json()).data as { deployError: string | null })
        .deployError,
    ).toBeNull();
    const put = filesPut.at(-1);
    expect(put?.path).toBe(
      '/repos/ds-bot/ci-co-token/contents/.github/workflows/ds-check.yml',
    );
    expect(put?.authorization).toBe('Bearer ghp_person_token');
    expect(put?.body.branch).toBe('main');
    expect(
      Buffer.from(put?.body.content ?? '', 'base64').toString('utf8'),
    ).toBe(CHECK_WORKFLOW);

    const refused = await withCheck('ci-tu-choi');
    expect(refused.status).toBe(201);
    expect(
      ((await refused.json()).data as { deployError: string | null })
        .deployError,
    ).toContain('Workflows');

    // Any other `ci` is the demo's deploy CI, still not applied: nothing is pushed.
    const pushes = filesPut.length;
    const other = await admin.fetch(
      '/projectSetups',
      json({
        name: 'Dự án ci khác',
        codeLocation: 'newRepo',
        newRepo: {
          connectionId,
          name: 'ci-khac',
          private: true,
          init: { method: 'empty' },
        },
        ci: { provider: 'github' },
      }),
    );
    expect(other.status).toBe(201);
    expect(
      ((await other.json()).data as { deployError: string | null }).deployError,
    ).toBeTruthy();
    expect(filesPut).toHaveLength(pushes);

    // A person who may not link repositories changes nothing.
    expect(
      (
        await contributor.fetch(
          '/projectSetups',
          json({
            name: 'Không được nối',
            codeLocation: 'existingRepo',
            existingRepo: {
              connectionId,
              cloneUrl: 'https://github.test/acme/sandbox.git',
              defaultBranch: 'main',
            },
          }),
        )
      ).status,
    ).toBe(403);
    // Reading the initialization is open to who sees the project, and changes nothing.
    const read = (
      await (await admin.fetch(`/projectSetups/${setup.data.projectId}`)).json()
    ).data as { issueId: string };
    expect(read.issueId).toBe(setup.data.initIssueId);

    const registration = await agents.runners.createRegistrationToken(ownerId, {
      trust: 'ownerOnly',
    });
    const registered = await agents.runners.register({
      registrationToken: registration.token,
      name: 'test-runner',
      hostname: 'test-host',
      os: 'linux',
      arch: 'x64',
      version: '0.0.0-test',
      protocolVersion: PROTOCOL_VERSION,
      features: ['input', 'workspaceKey', 'checkout', 'skills'],
      tools: [
        {
          kind: 'claude',
          authenticated: true,
          status: 'ready',
          models: [{ id: MODEL }],
        },
      ],
    });
    const runner = await agents.runners.authenticate(registered.runnerKey);
    // An issue of the new project: the claim carries the project's skills.
    const issue = await admin.fetch(
      '/projects/issues',
      json({
        title: 'Việc của dự án',
        statusKey: 'in_progress',
        projectId: bareData.projectId,
        executor: { type: 'agent', id: PROJECT_MANAGER_ID },
      }),
    );
    expect(issue.status).toBe(201);
    const claimed = await agents.claims.claim(runner, 5);
    const carried = JSON.stringify(
      claimed.find((payload) =>
        JSON.stringify(payload).includes('Việc của dự án'),
      ),
    );
    for (const skill of BUILTIN_SKILLS) expect(carried).toContain(skill.slug);
    // The initialization now has a run.
    const running = (
      await (await admin.fetch(`/projectSetups/${setup.data.projectId}`)).json()
    ).data as { state: string };
    expect(running.state).toBe('running');
  },
);
