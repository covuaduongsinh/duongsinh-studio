import type { Application } from '@nocobase/app-server/application';
import { jobExecutorServiceToken } from '@nocobase/app-server/jobs';
import { authorizationToken } from '@nocobase/app-plugin-authorization';
import { notificationServiceToken } from '@nocobase/app-plugin-notification/server';
import { projectsToken } from '@nocobase/app-plugin-projects/server/tokens';
import {
  releasesAccessToken,
  type ReleasesAccess,
} from '@nocobase/app-plugin-releases/server/tokens';
import {
  BUSINESS_KEYS,
  PAGES,
  RESOURCE_TYPE,
  SETTINGS_KEYS,
  levelActionsOf,
  noPermissions,
  type ReleasesPermissions,
  type Scope,
} from '@nocobase/app-plugin-releases/shared/access';
import { userManagementServiceToken } from '@nocobase/app-plugin-users/server/tokens';
import type { AuthorizationContext } from '@nocobase/authorization/core';
import { databaseManagerToken } from '@nocobase/db';
import type { ScheduleExecutor } from '@nocobase/jobs';
import {
  ServiceProvider,
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';
import { ROOT_SET_KEY } from '../access/roles.js';
import {
  ENVIRONMENTS,
  createReleaseService,
  type ReleaseService,
} from '../releases/service.js';
import { gitServiceToken } from './git.js';
import { userIdentity } from './projects-access.js';

export const releaseServiceToken: ServiceToken<ReleaseService> =
  createServiceToken<ReleaseService>('app/releases');

/** How often the poll looks for repositories whose tags are due (each is read at most every ten minutes). */
const POLL_EVERY_MS = 60_000;
/** The reminder about issues waiting for production, once a day. */
const REMIND_EVERY_MS = 24 * 60 * 60 * 1000;
/** The in-app channel every Studio notice goes through (`server/config/notification.ts`). */
const INBOX_CHANNEL = 'inbox';

/**
 * What a person may do with the releases plugin, from the same permission sets as the Studio roles: each `rel.apps`
 * action's highest level held, the `rel.environments` settings and the `rel-apps` page.
 */
export async function releasesPermissionsFrom(
  context: AuthorizationContext,
  userId: string,
): Promise<ReleasesPermissions> {
  const snapshot = await context.snapshot();
  const base = noPermissions();
  const scopes: Record<string, Scope> = { ...base.scopes };
  const settings: Record<string, boolean> = { ...base.settings };
  const pages: Record<string, boolean> = { ...base.pages };
  for (const { business, key } of BUSINESS_KEYS) {
    let scope: Scope = 'none';
    for (const { level, name } of [...levelActionsOf(key)].reverse()) {
      const held =
        snapshot.unrestricted ||
        (await context.can({
          resource: { type: RESOURCE_TYPE, id: business },
          action: name,
        }));
      if (!held) continue;
      scope = level === 'all' ? 'all' : { users: [userId] };
      break;
    }
    scopes[key] = scope;
  }
  for (const { item, action, key } of SETTINGS_KEYS)
    settings[key] =
      snapshot.unrestricted ||
      (await context.can({ resource: { type: 'settings', id: item }, action }));
  for (const page of PAGES)
    pages[page] =
      snapshot.unrestricted ||
      (await context.can({
        resource: { type: 'page', id: page },
        action: 'access',
      }));
  return { scopes, settings, pages } as ReleasesPermissions;
}

/**
 * Releases (S5.4–S5.5): the releases plugin's access from the Studio roles, the release service over Dương Sinh's
 * recorded environments, tags read when GitHub reports a pushed tag and by a ten-minute poll, and a daily reminder of
 * issues merged but not on production.
 */
export default class ReleasesProvider extends ServiceProvider<Application> {
  readonly name = 'app/releases';
  private releases: (() => void)[] = [];
  private executor?: ScheduleExecutor;

  override register(): void {
    const { container } = this.app;
    const authz = () => container.resolve(authorizationToken);
    container.singleton(releasesAccessToken, (): ReleasesAccess => ({
      permissionsOf: async (identity) =>
        releasesPermissionsFrom(authz().for(identity), identity.principal.id),
      permissionsOfUser: async (userId) =>
        releasesPermissionsFrom(authz().for(userIdentity(userId)), userId),
    }));
    container.singleton(releaseServiceToken, () =>
      createReleaseService({
        database: container.resolve(databaseManagerToken),
        git: () => container.resolve(gitServiceToken),
        owners: async () =>
          (await authz().permissionSets.listAssignments(ROOT_SET_KEY))
            .filter((assignment) => assignment.subject.type === 'user')
            .map((assignment) => assignment.subject.id),
        notify: async (notice) => {
          if (
            !container.has(notificationServiceToken) ||
            notice.to.length === 0
          )
            return;
          await container.resolve(notificationServiceToken).send({
            idempotencyKey: notice.key,
            source: {
              type: 'duongsinh-studio/releases',
              referenceId: notice.key,
            },
            messages: {
              [INBOX_CHANNEL]: {
                to: [...notice.to],
                title: notice.title,
                body: notice.body,
                target: { type: 'route', path: notice.path },
              },
            },
          });
        },
        nameOf: async (userId) => {
          try {
            return (
              await container.resolve(userManagementServiceToken).get(userId)
            ).name;
          } catch {
            return null;
          }
        },
        issueLabels: async (issueIds) => {
          const labels = new Map<string, string>();
          if (!container.has(projectsToken)) return labels;
          const conn = container.resolve(databaseManagerToken).connection();
          for (const issueId of issueIds) {
            const described = await container
              .resolve(projectsToken)
              .issueContext.describe(conn, issueId);
            if (described) labels.set(issueId, described.key);
          }
          return labels;
        },
      }),
    );
  }

  override async boot(): Promise<void> {
    const { container } = this.app;
    this.releases.push(
      container.resolve(gitServiceToken).onTagPush(async (repositoryId) => {
        await container
          .resolve(releaseServiceToken)
          .syncRepository(repositoryId);
      }),
    );
  }

  override async start(): Promise<void> {
    // Command hosts (`pnpm nocobase …`) boot providers too; only the serving process polls.
    if (this.app.consoleLogStream === 'stderr') return;
    const { container } = this.app;
    const database = container.resolve(databaseManagerToken);
    this.executor = container
      .resolve(jobExecutorServiceToken)
      .getScheduleExecutor('duongsinh-studio-releases');
    // An application started without this application's migrations has no release tables (see project-manager.ts).
    const ready = async () =>
      Boolean(await database.collections().getPhysical(ENVIRONMENTS));
    await this.executor.addJob({
      name: 'release-tags',
      options: { every: POLL_EVERY_MS },
      payload: {},
      execute: async () => {
        if (await ready())
          await container.resolve(releaseServiceToken).syncDue();
      },
    });
    await this.executor.addJob({
      name: 'release-pending-reminder',
      options: { every: REMIND_EVERY_MS },
      payload: {},
      execute: async () => {
        if (await ready())
          await container.resolve(releaseServiceToken).remindPending();
      },
    });
    await this.executor.setup();
  }

  override async shutdown(): Promise<void> {
    await this.executor?.shutdown();
    this.executor = undefined;
    for (const release of this.releases.splice(0)) release();
  }
}
