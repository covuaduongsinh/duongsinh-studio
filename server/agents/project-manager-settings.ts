import type { DatabaseConnection, DatabaseManager } from '@nocobase/db';

const TABLE = 'dsProjectManager';
const ROW_ID = 'default';

/**
 * The project manager's settings, one row (`database/main/migrations/202611020003_ds_project_manager.ts`), as the Studio
 * demo's `StudioProjectManager` names them. `principles` null means the built-in ones.
 */
export interface ProjectManagerSettings {
  readonly name: string;
  readonly description: string | null;
  /** The agent whose tool and model the project manager runs with. */
  readonly firstChoiceAgentId: string | null;
  /** The agent it falls back to when the first choice cannot start. */
  readonly fallbackAgentId: string | null;
  readonly fallbackAfterSeconds: number;
  readonly delegationQueueTimeoutSeconds: number;
  /** Runs principals' comments may start on one issue in a day. */
  readonly commentRunLimit: number;
  readonly principles: string | null;
}

export const DEFAULT_PROJECT_MANAGER_SETTINGS: ProjectManagerSettings = {
  name: 'Project manager',
  description:
    'Điều phối issue: chọn agent cho từng bước, giao việc bằng comment và chuẩn bị bàn giao để nghiệm thu.',
  firstChoiceAgentId: null,
  fallbackAgentId: null,
  fallbackAfterSeconds: 120,
  delegationQueueTimeoutSeconds: 600,
  commentRunLimit: 20,
  principles: null,
};

type Reader = Pick<DatabaseConnection, 'query'>;

const COLUMNS = [
  'name',
  'description',
  'firstChoiceAgentId',
  'fallbackAgentId',
  'fallbackAfterSeconds',
  'delegationQueueTimeoutSeconds',
  'commentRunLimit',
  'principles',
] as const;

const text = (value: unknown, fallback: string | null): string | null =>
  typeof value === 'string' ? value : value === null ? null : fallback;
const count = (value: unknown, fallback: number): number => {
  const number = typeof value === 'string' ? Number(value) : value;
  return typeof number === 'number' && Number.isFinite(number)
    ? number
    : fallback;
};

export async function readProjectManagerSettings(
  conn: Reader,
): Promise<ProjectManagerSettings> {
  const row: Record<string, unknown> | undefined = await conn.query
    .selectFrom(TABLE)
    .select([...COLUMNS])
    .where('id', '=', ROW_ID)
    .executeTakeFirst();
  const defaults = DEFAULT_PROJECT_MANAGER_SETTINGS;
  if (!row) return defaults;
  return {
    name: text(row.name, defaults.name) ?? defaults.name,
    description: text(row.description, defaults.description),
    firstChoiceAgentId: text(row.firstChoiceAgentId, null),
    fallbackAgentId: text(row.fallbackAgentId, null),
    fallbackAfterSeconds: count(
      row.fallbackAfterSeconds,
      defaults.fallbackAfterSeconds,
    ),
    delegationQueueTimeoutSeconds: count(
      row.delegationQueueTimeoutSeconds,
      defaults.delegationQueueTimeoutSeconds,
    ),
    commentRunLimit: count(row.commentRunLimit, defaults.commentRunLimit),
    principles: text(row.principles, null),
  };
}

export async function writeProjectManagerSettings(
  database: DatabaseManager,
  settings: ProjectManagerSettings,
): Promise<ProjectManagerSettings> {
  await database.transaction(async (conn) => {
    const values = { ...settings, updatedAt: new Date() };
    const existing = await conn.query
      .selectFrom(TABLE)
      .select(['id'])
      .where('id', '=', ROW_ID)
      .executeTakeFirst();
    if (existing)
      await conn.query
        .updateTable(TABLE)
        .set(values)
        .where('id', '=', ROW_ID)
        .execute();
    else
      await conn.query
        .insertInto(TABLE)
        .values({ id: ROW_ID, ...values })
        .execute();
  });
  return settings;
}
