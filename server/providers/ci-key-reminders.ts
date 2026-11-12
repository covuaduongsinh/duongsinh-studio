import { authorizationToken } from '@nocobase/app-plugin-authorization';
import { scopedApiKeysToken } from '@nocobase/app-plugin-api-keys/server';
import { notificationServiceToken } from '@nocobase/app-plugin-notification/server';
import type { Application } from '@nocobase/app-server/application';
import { jobExecutorServiceToken } from '@nocobase/app-server/jobs';
import { i18nToken } from '@nocobase/app-server/i18n';
import { databaseManagerToken } from '@nocobase/db';
import { APP_NS } from '@nocobase/i18n';
import { ServiceProvider } from '@nocobase/service-provider';
import { ROOT_SET_KEY } from '../access/roles.js';
import { str } from '../git/rows.js';
import { ORGANIZATION_KEYS_USER } from './organization-keys.js';

const WARN_DAYS = 14;
const DAY_MS = 86_400_000;
const EVERY_MS = 6 * 3_600_000;

/** @returns how many reminders were sent */
export async function sendCiKeyReminders(
  app: Application,
  at = new Date(),
): Promise<number> {
  const { container } = app;
  if (!container.has(notificationServiceToken)) return 0;
  const conn = container.resolve(databaseManagerToken).connection();
  if (
    !(await container
      .resolve(databaseManagerToken)
      .collections()
      .getPhysical('dsRepositoryCiKeys'))
  )
    return 0;
  const rows = await conn.query
    .selectFrom('dsRepositoryCiKeys')
    .select(['repositoryId', 'keyId'])
    .execute();
  if (rows.length === 0) return 0;
  const live = await container
    .resolve(scopedApiKeysToken)
    .list(ORGANIZATION_KEYS_USER);
  const owners = (
    await container
      .resolve(authorizationToken)
      .permissionSets.listAssignments(ROOT_SET_KEY)
  )
    .filter((assignment) => assignment.subject.type === 'user')
    .map((assignment) => assignment.subject.id);
  if (owners.length === 0) return 0;
  const i18n = container.resolve(i18nToken);
  const locale = i18n.getDefaultLocale();
  await i18n.ensureLocaleLoaded(locale);
  const t = i18n.getFixedT(APP_NS, locale);
  let sent = 0;
  for (const row of rows) {
    const key = live.find((item) => item.id === str(row.keyId));
    if (!key?.expiresAt) continue;
    const left = Date.parse(key.expiresAt) - at.getTime();
    if (left <= 0 || left > WARN_DAYS * DAY_MS) continue;
    const repository = await conn.query
      .selectFrom('dsRepositories')
      .select(['fullName'])
      .where('id', '=', str(row.repositoryId))
      .executeTakeFirst();
    const idempotencyKey = `ci-key-expiry:${key.id}`;
    await container.resolve(notificationServiceToken).send({
      idempotencyKey,
      source: {
        type: 'duongsinh-studio/ci-keys',
        referenceId: idempotencyKey,
      },
      messages: {
        inbox: {
          to: owners,
          title: t('studioCiKey.expiringTitle', {
            repo: str(repository?.fullName) || str(row.repositoryId),
            days: Math.max(1, Math.ceil(left / DAY_MS)),
          }),
          body: t('studioCiKey.expiringBody'),
          target: {
            type: 'route',
            path: `/releases?repositoryId=${str(row.repositoryId)}`,
          },
        },
      },
    });
    sent += 1;
  }
  return sent;
}

/**
 * Tells the owners in their inbox, once per key, when a repository's CI key has 14 days or less left (plan V, V4.4; it also
 * closes the M5 line "remind about the CI key"). A key that is already past its date is not reminded: renewing it is on the
 * repository's deployment page, where the key shows as expired.
 */
export default class CiKeyRemindersProvider extends ServiceProvider<Application> {
  readonly name = 'app/ci-key-reminders';

  private executor?: { shutdown(): Promise<void> };

  override async start(): Promise<void> {
    if (this.app.consoleLogStream === 'stderr') return;
    const executor = this.app.container
      .resolve(jobExecutorServiceToken)
      .getScheduleExecutor('duongsinh-studio-ci-key-reminders');
    this.executor = executor;
    await executor.addJob({
      name: 'ci-key-expiry',
      options: { every: EVERY_MS },
      payload: {},
      execute: async () => {
        await sendCiKeyReminders(this.app);
      },
    });
    await executor.setup();
  }

  override async shutdown(): Promise<void> {
    await this.executor?.shutdown();
  }
}
