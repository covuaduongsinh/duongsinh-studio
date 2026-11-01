import type { DatabaseConnection, DatabaseManager } from '@nocobase/db';

const TABLE = 'dsAccessSettings';
const ROW_ID = 'default';

/** Studio access settings, one row (`database/main/migrations/202611010003_ds_access_settings.ts`). */
export interface AccessSettings {
  /** The role a new member is given once; null gives none. */
  readonly defaultRole: string | null;
}

type Reader = Pick<DatabaseConnection, 'query'>;

export async function readAccessSettings(
  conn: Reader,
): Promise<AccessSettings> {
  const row = await conn.query
    .selectFrom(TABLE)
    .select(['defaultRole'])
    .where('id', '=', ROW_ID)
    .executeTakeFirst();
  const value = (row as { defaultRole?: unknown } | undefined)?.defaultRole;
  return { defaultRole: typeof value === 'string' ? value : null };
}

export async function writeAccessSettings(
  database: DatabaseManager,
  settings: AccessSettings,
): Promise<AccessSettings> {
  await database.transaction(async (conn) => {
    const now = new Date();
    const existing = await conn.query
      .selectFrom(TABLE)
      .select(['id'])
      .where('id', '=', ROW_ID)
      .executeTakeFirst();
    if (existing) {
      await conn.query
        .updateTable(TABLE)
        .set({ defaultRole: settings.defaultRole, updatedAt: now })
        .where('id', '=', ROW_ID)
        .execute();
    } else {
      await conn.query
        .insertInto(TABLE)
        .values({
          id: ROW_ID,
          defaultRole: settings.defaultRole,
          updatedAt: now,
        })
        .execute();
    }
  });
  return settings;
}
