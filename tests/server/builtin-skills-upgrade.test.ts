import { expect } from 'vitest';
import { createAppTest } from '@nocobase/app-testing/server';
import { agentsToken } from '@nocobase/app-plugin-agents/server/tokens';
import { GLOBAL_SKILL_TARGET } from '@nocobase/app-plugin-agents/shared/skills';
import { notificationServiceToken } from '@nocobase/app-plugin-notification/server';
import { databaseManagerToken } from '@nocobase/db';
import {
  BUILTIN_SKILLS,
  type BuiltinSkill,
  skillContentHash,
} from '../../server/agents/builtin-skills.js';
import {
  projectDefaultSkills,
  ensureBuiltinSkills,
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

test(
  'H0: builtin skills lifecycle (create when missing, upgrade when unmodified, retain and notify when customized)',
  { timeout: 180_000 },
  async ({ app }) => {
    const { container } = app;
    const agents = container.resolve(agentsToken);
    const conn = container.resolve(databaseManagerToken).connection();

    // --- Ca 1: Chưa có -> tạo mới ---
    const library = await agents.skills.list();
    for (const builtin of BUILTIN_SKILLS) {
      const match = library.find((item) => item.slug === builtin.slug);
      expect(match).toBeDefined();
      expect(match?.version).toBe(1);

      const detail = await agents.skills.get(match!.id);
      expect(skillContentHash(detail.content)).toBe(
        skillContentHash(builtin.content),
      );
    }

    const globals = await agents.skills.attached(GLOBAL_SKILL_TARGET);
    const defaults = await projectDefaultSkills(conn);
    for (const builtin of BUILTIN_SKILLS) {
      const match = library.find((item) => item.slug === builtin.slug)!;
      if (builtin.reach === 'global') {
        expect(globals).toContain(match.id);
      } else {
        expect(defaults).toContain(match.id);
      }
    }

    // --- Ca 2: Có và chưa sửa tay -> nâng cấp lên revision mới ---
    const existingSkill = library.find((s) => s.slug === 'ds-workflow')!;
    const originalContent = (await agents.skills.get(existingSkill.id)).content;

    const upgradedBuiltin: BuiltinSkill = {
      slug: 'ds-workflow',
      reach: 'project',
      revision: 2,
      content: `---\nname: ds-workflow\ndescription: "Quy trình làm việc cập nhật revision 2"\n---\n\n# Quy trình làm việc mới v2\n`,
      history: [originalContent],
    };

    const reportCa2 = await ensureBuiltinSkills({
      app,
      agents,
      builtins: [upgradedBuiltin],
    });

    expect(reportCa2.upgraded).toContain('ds-workflow');
    expect(reportCa2.retained).not.toContain('ds-workflow');

    const upgradedDetail = await agents.skills.get(existingSkill.id);
    expect(upgradedDetail.version).toBe(2);
    expect(skillContentHash(upgradedDetail.content)).toBe(
      skillContentHash(upgradedBuiltin.content),
    );

    // --- Ca 3: Có và đã sửa tay -> giữ nguyên và gửi thông báo Hộp thư ---
    // Người dùng sửa tay skill 'ds-development'
    const devSkill = library.find((s) => s.slug === 'ds-development')!;
    const userCustomContent = `---\nname: ds-development\ndescription: "Tùy biến bởi người dùng"\n---\n\n# Nội dung sửa tay riêng của dự án\n`;
    await agents.skills.save(devSkill.id, null, {
      content: userCustomContent,
      files: [],
      note: 'Người dùng sửa tay',
      expectedRevision: devSkill.version,
    });

    const modifiedDetail = await agents.skills.get(devSkill.id);
    expect(modifiedDetail.version).toBe(2);

    // Chuẩn bị thông báo để bắt
    const notifications = container.resolve(notificationServiceToken) as {
      send: (input: {
        idempotencyKey?: string;
        messages: Record<string, unknown>;
      }) => Promise<unknown>;
    };
    const sentNotices: {
      idempotencyKey?: string;
      messages: Record<string, unknown>;
    }[] = [];
    const origSend = notifications.send.bind(notifications);
    notifications.send = async (input) => {
      sentNotices.push(input);
      return origSend(input);
    };

    try {
      const devBuiltinRev2: BuiltinSkill = {
        slug: 'ds-development',
        reach: 'project',
        revision: 2,
        content: `---\nname: ds-development\ndescription: "Bản dựng sẵn mới revision 2"\n---\n\n# Hướng dẫn phát triển revision 2\n`,
        history: [
          '---\nname: ds-development\ndescription: "Bản cũ"\n---\n\n# Cũ\n',
        ],
      };

      const reportCa3 = await ensureBuiltinSkills({
        app,
        agents,
        builtins: [devBuiltinRev2],
      });

      expect(reportCa3.retained).toContain('ds-development');
      expect(reportCa3.upgraded).not.toContain('ds-development');

      // Nội dung vẫn giữ nguyên của người dùng
      const retainedDetail = await agents.skills.get(devSkill.id);
      expect(retainedDetail.version).toBe(2);
      expect(skillContentHash(retainedDetail.content)).toBe(
        skillContentHash(userCustomContent),
      );

      // Thông báo Hộp thư được gửi tới quản trị
      expect(sentNotices.length).toBeGreaterThan(0);
      const conflictNotice = sentNotices.find((n) =>
        n.idempotencyKey?.includes('ds-development'),
      );
      expect(conflictNotice).toBeDefined();
      expect(conflictNotice?.messages.inbox).toBeDefined();
    } finally {
      notifications.send = origSend;
    }
  },
);
