import type { DatabaseConnection, DatabaseManager } from '@nocobase/db';
import { str, strOrNull, type Row } from '../git/rows.js';

export interface AutopilotDigestDeps {
  readonly database: Pick<DatabaseManager, 'connection'>;
  readonly notify: (notice: {
    readonly to: string[];
    readonly key: string;
    readonly title: string;
    readonly body: string;
    readonly path: string;
  }) => Promise<void>;
  readonly owners: () => Promise<string[]>;
  readonly now?: () => Date;
}

export interface DigestSummary {
  readonly date: string;
  readonly mergedCount: number;
  readonly openedCount: number;
  readonly stalledCount: number;
  readonly blockedCount: number;
  readonly sent: boolean;
}

export interface AutopilotDigest {
  sendDailyDigest(): Promise<DigestSummary>;
}

export function createAutopilotDigest(
  deps: AutopilotDigestDeps,
): AutopilotDigest {
  const conn = (): DatabaseConnection => deps.database.connection();
  const getNow = (): Date => (deps.now ? deps.now() : new Date());

  async function sendDailyDigest(): Promise<DigestSummary> {
    const now = getNow();
    const startOfDay = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      0,
      0,
      0,
      0,
    );
    const dateStr = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;

    // Query today's autopilot events
    const todayEvents = await conn()
      .query.selectFrom('dsAutopilotEvents')
      .selectAll()
      .where('createdAt', '>=', startOfDay)
      .orderBy('createdAt', 'desc')
      .execute();

    const mergedEvents = todayEvents.filter(
      (e: Row) => str(e.kind) === 'merged',
    );
    const openedEvents = todayEvents.filter(
      (e: Row) => str(e.kind) === 'opened',
    );
    const stalledEvents = todayEvents.filter(
      (e: Row) => str(e.kind) === 'stalled',
    );
    const blockedEvents = todayEvents.filter(
      (e: Row) => str(e.kind) === 'blocked',
    );

    // Query current blocked or needsYou issues
    const problematicIssues = await conn()
      .query.selectFrom('pmIssues')
      .select([
        'id',
        'identifier',
        'title',
        'statusKey',
        'needsYou',
        'projectId',
      ])
      .where('needsYou', 'is not', null)
      .execute();

    const owners = await deps.owners();
    if (owners.length === 0) {
      return {
        date: dateStr,
        mergedCount: mergedEvents.length,
        openedCount: openedEvents.length,
        stalledCount: stalledEvents.length,
        blockedCount: blockedEvents.length,
        sent: false,
      };
    }

    const sections: string[] = [
      `### Báo cáo Tự lái hôm nay (${dateStr})\n`,
      `- 🚀 **Đã tự động merge**: ${mergedEvents.length} pull request`,
      `- 📋 **Đã tự động mở**: ${openedEvents.length} công việc`,
      `- ⚠️ **Cảnh báo đứng việc**: ${stalledEvents.length} lần`,
      `- 🛑 **Công việc bị vướng**: ${blockedEvents.length} lần`,
    ];

    if (problematicIssues.length > 0) {
      sections.push('\n#### Các công việc đang cần bạn quyết định:');
      for (const issue of problematicIssues) {
        const iden = str(issue.identifier) || str(issue.id);
        const title = str(issue.title) || 'Không tiêu đề';
        const reason = strOrNull(issue.needsYou) ?? 'Đang vướng';
        sections.push(`- **${iden}** (${title}): ${reason}`);
      }
    } else {
      sections.push(
        '\n✅ Tất cả công việc trong ngày diễn ra trôi chảy, không có việc bị tắc nghẽn.',
      );
    }

    const digestBody = sections.join('\n');
    await deps.notify({
      to: owners,
      key: `ds-autopilot-digest-${now.toISOString().slice(0, 10)}`,
      title: `Báo cáo Tự lái ngày ${dateStr}`,
      body: digestBody,
      path: '/releases',
    });

    return {
      date: dateStr,
      mergedCount: mergedEvents.length,
      openedCount: openedEvents.length,
      stalledCount: stalledEvents.length,
      blockedCount: blockedEvents.length,
      sent: true,
    };
  }

  return { sendDailyDigest };
}
