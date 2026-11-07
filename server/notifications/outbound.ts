import type { DatabaseConnection } from '@nocobase/db';
import { str, type Row } from '../git/rows.js';

/**
 * Telling people outside Studio, by email and web push, as each of them chose. The inbox stays the record; these only
 * bring someone back to it. A channel that is off or failing never stops anything: it is logged, and the rest go on.
 */
const PREFERENCES = 'dsNotificationPreferences';
const ALERTS = 'dsDecisionAlerts';
const ALERT_BASELINE = '__baseline__';
const EMAIL_CHANNEL = 'studio-email';
const PUSH_CHANNEL = 'webPush';
const SCAN_LIMIT = 500;

export interface NotificationPreferences {
  readonly emailDecisions: boolean;
  readonly emailReports: boolean;
  readonly pushDecisions: boolean;
}

const DEFAULTS: NotificationPreferences = {
  emailDecisions: true,
  emailReports: true,
  pushDecisions: true,
};

export type OutboundKind = 'decision' | 'report';

export interface OutboundMessage {
  readonly key: string;
  readonly kind: OutboundKind;
  readonly title: string;
  readonly body: string;
  /** Inside the application, without its base path. */
  readonly path: string;
}

export interface OutboundDeps {
  readonly conn: () => DatabaseConnection;
  /** `<origin><base path>`, for links; null when no public origin is configured. */
  readonly publicBase: () => string | null;
  /** Whether the email channel is on; nothing is attempted while it is off. */
  readonly emailEnabled: () => boolean;
  /** `<base path>`, as a push notification's URL needs it. */
  readonly basePath: () => string;
  readonly send: (input: {
    readonly idempotencyKey: string;
    readonly source: { readonly type: string; readonly referenceId: string };
    readonly messages: Record<string, unknown>;
  }) => Promise<unknown>;
  readonly devicesOf?: (
    userId: string,
  ) => Promise<readonly { readonly id: string; readonly enabled?: boolean }[]>;
  readonly now?: () => Date;
}

const escapeHtml = (text: string): string =>
  text
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;');

const bool = (value: unknown, fallback: boolean): boolean =>
  value === null || value === undefined
    ? fallback
    : value === true || value === 1 || value === '1' || value === 't';

export function createOutbound(deps: OutboundDeps) {
  const now = () => (deps.now ? deps.now() : new Date());

  const preferencesOf = async (
    userId: string,
  ): Promise<NotificationPreferences> => {
    const row: Row | undefined = await deps
      .conn()
      .query.selectFrom(PREFERENCES)
      .selectAll()
      .where('userId', '=', userId)
      .executeTakeFirst();
    if (!row) return DEFAULTS;
    return {
      emailDecisions: bool(row.emailDecisions, true),
      emailReports: bool(row.emailReports, true),
      pushDecisions: bool(row.pushDecisions, true),
    };
  };

  const emailOf = async (userId: string): Promise<string | null> => {
    const row: Row | undefined = await deps
      .conn()
      .query.selectFrom('user')
      .select(['email', 'kind'])
      .where('id', '=', userId)
      .executeTakeFirst();
    // A service account has an address of the form only.
    if (!row || str(row.kind) === 'service') return null;
    return str(row.email) || null;
  };

  /** Sends what this person chose to receive, each channel on its own. */
  const deliver = async (
    userId: string,
    message: OutboundMessage,
  ): Promise<{ email: boolean; push: boolean }> => {
    const preferences = await preferencesOf(userId);
    const result = { email: false, push: false };
    const wantsEmail =
      message.kind === 'decision'
        ? preferences.emailDecisions
        : preferences.emailReports;
    const address =
      wantsEmail && deps.emailEnabled() ? await emailOf(userId) : null;
    if (address) {
      const base = deps.publicBase();
      const link = base ? `${base}${message.path}` : null;
      try {
        await deps.send({
          idempotencyKey: `${message.key}:email:${userId}`,
          source: {
            type: 'duongsinh-studio/outbound',
            referenceId: message.key,
          },
          messages: {
            [EMAIL_CHANNEL]: {
              to: [address],
              subject: message.title,
              text: link ? `${message.body}\n\n${link}` : message.body,
              html: `<p>${escapeHtml(message.body).replace(/\n/gu, '<br>')}</p>${
                link
                  ? `<p><a href="${escapeHtml(link)}">${escapeHtml(link)}</a></p>`
                  : ''
              }`,
            },
          },
        });
        result.email = true;
      } catch (error) {
        console.warn('Studio could not send an email', error);
      }
    }
    if (
      message.kind === 'decision' &&
      preferences.pushDecisions &&
      deps.devicesOf
    ) {
      try {
        const devices = (await deps.devicesOf(userId)).filter(
          (device) => device.enabled !== false,
        );
        if (devices.length > 0) {
          await deps.send({
            idempotencyKey: `${message.key}:push:${userId}`,
            source: {
              type: 'duongsinh-studio/outbound',
              referenceId: message.key,
            },
            messages: {
              [PUSH_CHANNEL]: {
                to: devices.map((device) => ({ id: device.id, userId })),
                title: message.title,
                body: message.body.slice(0, 600),
                url: `${deps.basePath()}${message.path}`,
                dedupeKey: message.key.slice(0, 180),
              },
            },
          });
          result.push = true;
        }
      } catch (error) {
        console.warn('Studio could not send a web push', error);
      }
    }
    return result;
  };

  return {
    preferencesOf,
    deliver,
    emailAvailable: () => deps.emailEnabled(),

    async setPreferences(
      userId: string,
      input: Partial<NotificationPreferences>,
    ): Promise<NotificationPreferences> {
      const conn = deps.conn();
      const next = { ...(await preferencesOf(userId)), ...input };
      const seen: Row | undefined = await conn.query
        .selectFrom(PREFERENCES)
        .select(['userId'])
        .where('userId', '=', userId)
        .executeTakeFirst();
      if (seen)
        await conn.query
          .updateTable(PREFERENCES)
          .set({ ...next, updatedAt: now() })
          .where('userId', '=', userId)
          .execute();
      else
        await conn.query
          .insertInto(PREFERENCES)
          .values({ userId, ...next, updatedAt: now() })
          .execute();
      return next;
    },

    /**
     * Tells each owner about the decisions that are new since the last look, once each. A question that changes is a
     * new decision. The first look at a person only notes what already waits, so turning this on sends no backlog.
     */
    async sendDecisionAlerts(texts: {
      readonly title: (identifier: string) => string;
      readonly body: (issue: {
        readonly title: string;
        readonly needsYou: string | null;
      }) => string;
    }): Promise<number> {
      const conn = deps.conn();
      const issues: Row[] = await conn.query
        .selectFrom('pmIssues')
        .select([
          'id',
          'identifier',
          'title',
          'ownerUserId',
          'needsYou',
          'statusKey',
        ])
        .where('deletedAt', 'is', null)
        .where('statusKey', 'not in', ['done', 'cancelled'])
        .where((eb) =>
          eb.or([
            eb('needsYou', 'is not', null),
            eb('statusKey', '=', 'in_review'),
          ]),
        )
        .limit(SCAN_LIMIT)
        .execute();
      const byOwner = new Map<string, Row[]>();
      for (const issue of issues) {
        const owner = str(issue.ownerUserId);
        byOwner.set(owner, [...(byOwner.get(owner) ?? []), issue]);
      }
      let sent = 0;
      for (const [owner, own] of byOwner) {
        const rows: Row[] = await conn.query
          .selectFrom(ALERTS)
          .select(['alertKey'])
          .where('userId', '=', owner)
          .execute();
        const seen = new Set(rows.map((row) => str(row.alertKey)));
        const first = !seen.has(ALERT_BASELINE);
        const keyOf = (issue: Row) =>
          `${str(issue.id)}:${str(issue.statusKey)}:${str(issue.needsYou).slice(0, 80)}`.slice(
            0,
            190,
          );
        const fresh = own.filter((issue) => !seen.has(keyOf(issue)));
        const at = now();
        if (first)
          await conn.query
            .insertInto(ALERTS)
            .values({ userId: owner, alertKey: ALERT_BASELINE, sentAt: at })
            .execute();
        for (const issue of fresh) {
          const key = keyOf(issue);
          await conn.query
            .insertInto(ALERTS)
            .values({ userId: owner, alertKey: key, sentAt: at })
            .execute();
          if (first) continue;
          const delivered = await deliver(owner, {
            key: `ds-decision-${key}`,
            kind: 'decision',
            title: texts.title(str(issue.identifier)),
            body: texts.body({
              title: str(issue.title),
              needsYou: issue.needsYou ? str(issue.needsYou) : null,
            }),
            path: `/issues/${str(issue.id)}`,
          });
          if (delivered.email || delivered.push) sent += 1;
        }
      }
      return sent;
    },
  };
}

export type Outbound = ReturnType<typeof createOutbound>;
