import { expect } from 'vitest';
import { createAppTest } from '@nocobase/app-testing/server';
import { agentsToken } from '@nocobase/app-plugin-agents/server/tokens';
import { GLOBAL_SKILL_TARGET } from '@nocobase/app-plugin-agents/shared/skills';
import { databaseManagerToken } from '@nocobase/db';
import { BUILTIN_SKILLS } from '../../server/agents/builtin-skills.js';
import {
  ensureBuiltinSkills,
  projectDefaultSkills,
  setProjectDefaultSkills,
} from '../../server/providers/project-defaults.js';
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

test('ds-app-rules', () => {
  const rules = BUILTIN_SKILLS.find((skill) => skill.slug === 'ds-app-rules');
  expect(rules?.reach).toBe('project');
  const content = rules?.content ?? '';
  expect(content.startsWith('---\nname: ds-app-rules\ndescription: ')).toBe(
    true,
  );
  // The commands it asks an agent to paste, exactly as a shell receives them.
  expect(content).toContain(
    `grep -E "^\\s+'?(chessground|chessops|@lichess-org/pgn-viewer|tournament-pairings|stockfish)@" pnpm-lock.yaml`,
  );
  expect(content).toContain(
    'git ls-files | grep -iE "\\.sqlite|\\.env$|config\\.yml$|\\.dump"',
  );
  expect(content).toContain('`pnpm licenses list` (không có `--prod`)');
  for (const banned of [
    'pnpm check',
    'pnpm lint',
    'pnpm test',
    'pnpm build',
    'pnpm typecheck',
  ])
    expect(content).toContain(`\`${banned}\``);
  // Short, because every run of a project carries it.
  expect(content.length).toBeLessThan(4000);
});

test(
  "Studio's skills are created once, as project defaults or globals, and never overwritten",
  { timeout: 240_000 },
  async ({ app }) => {
    const agents = app.container.resolve(agentsToken);
    const conn = app.container.resolve(databaseManagerToken).connection();
    const library = await agents.skills.list();
    const bySlug = new Map(library.map((item) => [item.slug, item]));
    for (const skill of BUILTIN_SKILLS)
      expect(bySlug.has(skill.slug)).toBe(true);
    const rules = bySlug.get('ds-app-rules');
    expect(await projectDefaultSkills(conn)).toContain(rules?.id);
    expect(await agents.skills.attached(GLOBAL_SKILL_TARGET)).not.toContain(
      rules?.id,
    );

    // The team edits one and drops another from the defaults; a second start leaves both as they are.
    const edited = await agents.skills.get(rules?.id ?? '');
    const changed = `${edited.content}\nGhi chú của đội.\n`;
    await agents.skills.save(edited.id, null, {
      content: changed,
      files: [],
      expectedRevision: edited.version,
    });
    const review = bySlug.get('ds-review')?.id;
    const kept = (await projectDefaultSkills(conn)).filter(
      (id) => id !== review,
    );
    await setProjectDefaultSkills(conn, kept);

    await ensureBuiltinSkills(agents, conn);
    expect((await agents.skills.list()).length).toBe(library.length);
    expect((await agents.skills.get(edited.id)).content).toBe(changed);
    expect(await projectDefaultSkills(conn)).toEqual(kept);
  },
);
