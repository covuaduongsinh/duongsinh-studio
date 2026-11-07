import { agentsToken } from '@nocobase/app-plugin-agents/server/tokens';
import { authorizationToken } from '@nocobase/app-plugin-authorization';
import { notificationServiceToken } from '@nocobase/app-plugin-notification/server';
import { webPushServiceToken } from '@nocobase/app-plugin-notification-web-push/server/tokens';
import type { Application } from '@nocobase/app-server/application';
import { i18nToken } from '@nocobase/app-server/i18n';
import { databaseManagerToken } from '@nocobase/db';
import { APP_NS } from '@nocobase/i18n';
import {
  createServiceToken,
  ServiceProvider,
  type ServiceToken,
} from '@nocobase/service-provider';
import { appText } from '../agents/ids.js';
import { str } from '../git/rows.js';
import {
  createBudgetService,
  type BudgetNotice,
  type BudgetService,
} from '../budgets/service.js';
import { createOutbound, type Outbound } from '../notifications/outbound.js';
import { ROOT_SET_KEY } from '../access/roles.js';
import { publicBaseUrlOf } from './git.js';

export const outboundToken: ServiceToken<Outbound> =
  createServiceToken<Outbound>('app/outbound');
export const budgetServiceToken: ServiceToken<BudgetService> =
  createServiceToken<BudgetService>('app/budgets');

const INBOX_CHANNEL = 'inbox';
const BUDGETS_PATH = '/settings/budgets';

/** Email and web push as each person chose, and budgets of runs and tokens that tell the owners when they near a limit. */
export default class OutboundProvider extends ServiceProvider<Application> {
  readonly name = 'app/outbound';

  override register(): void {
    const { container } = this.app;
    const conn = () => container.resolve(databaseManagerToken).connection();
    container.singleton(outboundToken, () =>
      createOutbound({
        conn,
        publicBase: () => publicBaseUrlOf(this.app),
        emailEnabled: () =>
          this.app.config.get<{
            channels?: Record<string, { enabled?: boolean } | undefined>;
          }>('notification')?.channels?.['studio-email']?.enabled === true,
        basePath: () =>
          `/${String(this.app.publicBasePath ?? '').replace(/^\/+|\/+$/gu, '')}`.replace(
            /^\/$/u,
            '',
          ),
        send: (input) =>
          container.resolve(notificationServiceToken).send(input as never),
        ...(container.has(webPushServiceToken)
          ? {
              devicesOf: (userId: string) =>
                container
                  .resolve(webPushServiceToken)
                  .subscriptions.forUser(userId),
            }
          : {}),
      }),
    );
    container.singleton(budgetServiceToken, () =>
      createBudgetService({
        conn,
        notify: (notice) => this.tellAboutBudget(notice),
        scopeName: (scope, id) => this.scopeName(scope, id),
      }),
    );
  }

  /** Who is told, and in what words: the owners' inbox, and outside once a budget stops work. */
  private async tellAboutBudget(notice: BudgetNotice): Promise<void> {
    const { container } = this.app;
    if (!container.has(notificationServiceToken)) return;
    const owners = (
      await container
        .resolve(authorizationToken)
        .permissionSets.listAssignments(ROOT_SET_KEY)
    )
      .filter((assignment) => assignment.subject.type === 'user')
      .map((assignment) => assignment.subject.id);
    if (owners.length === 0) return;
    const i18n = container.resolve(i18nToken);
    const locale = i18n.getDefaultLocale();
    await i18n.ensureLocaleLoaded(locale);
    const t = i18n.getFixedT(APP_NS, locale);
    const { budget } = notice;
    const scope =
      budget.scope === 'global'
        ? t('studioBudgets.scopeGlobal')
        : await this.scopeName(budget.scope, budget.scopeId);
    const title = t(
      notice.kind === 'blocked'
        ? 'studioBudgets.blockedTitle'
        : 'studioBudgets.warnedTitle',
      { scope },
    );
    const body = t('studioBudgets.usedBody', {
      runs: budget.usedRuns,
      tokens: budget.usedTokens,
      period: t(
        budget.period === 'day'
          ? 'studioBudgets.periodDay'
          : 'studioBudgets.periodMonth',
      ),
    });
    await container.resolve(notificationServiceToken).send({
      idempotencyKey: notice.key,
      source: { type: 'duongsinh-studio/budgets', referenceId: notice.key },
      messages: {
        [INBOX_CHANNEL]: {
          to: owners,
          title,
          body,
          target: { type: 'route', path: BUDGETS_PATH },
        },
      },
    });
    if (notice.kind !== 'blocked') return;
    const outbound = container.resolve(outboundToken);
    for (const userId of owners)
      await outbound.deliver(userId, {
        key: notice.key,
        kind: 'decision',
        title,
        body,
        path: BUDGETS_PATH,
      });
  }

  private async scopeName(
    scope: 'project' | 'agent',
    id: string,
  ): Promise<string> {
    const conn = this.app.container.resolve(databaseManagerToken).connection();
    if (scope === 'agent')
      return (
        (
          await this.app.container.resolve(agentsToken).agents.names(conn, [id])
        ).get(id) ?? id
      );
    const row = await conn.query
      .selectFrom('pmProjects')
      .select(['name'])
      .where('id', '=', id)
      .executeTakeFirst();
    return str(row?.name) || id;
  }

  override async boot(): Promise<void> {
    const { container } = this.app;
    if (!container.has(authorizationToken)) return;
    const authz = container.resolve(authorizationToken);
    authz.settings.add({
      id: 'studio.budgets',
      title: appText('studioBudgets.settingsTitle'),
      actions: [
        { name: 'read', title: appText('studioOrgKeys.read') },
        { name: 'manage', title: appText('studioOrgKeys.manage') },
      ],
    });
    authz.ui.place(
      { type: 'settings', id: 'studio.budgets' },
      { section: 'studio' },
    );
    await Promise.resolve();
  }
}
