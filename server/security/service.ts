import { randomUUID } from 'node:crypto';
import type { Application } from '@nocobase/app-server';
import { databaseManagerToken, type DatabaseConnection } from '@nocobase/db';
import { notificationServiceToken } from '@nocobase/app-plugin-notification';
import { i18nToken } from '@nocobase/app-server/i18n';
import { str } from '../git/rows.js';
import type {
  SecretFinding,
  SecretFindingStatus,
  RecordFindingsParams,
} from './types.js';

export const SECRET_FINDINGS_COLLECTION = 'dsSecretFindings';
const INBOX_CHANNEL = 'inbox';
const APP_NS = 'duongsinh-studio';

export class SecretFindingError extends Error {
  readonly status: number;
  readonly reason: string;

  constructor(status: number, reason: string, message: string) {
    super(message);
    this.name = 'SecretFindingError';
    this.status = status;
    this.reason = reason;
  }
}

export class SecretFindingsService {
  constructor(private readonly app: Application) {}

  private connection(): DatabaseConnection {
    return this.app.container.resolve(databaseManagerToken).connection();
  }

  async listFindings(params: {
    readonly issueId?: string;
    readonly status?: SecretFindingStatus;
    readonly limit?: number;
  }): Promise<SecretFinding[]> {
    const conn = this.connection();
    let query = conn.query.selectFrom(SECRET_FINDINGS_COLLECTION).selectAll();

    if (params.issueId) {
      query = query.where('issueId', '=', params.issueId);
    }
    if (params.status) {
      query = query.where('status', '=', params.status);
    }

    const rows = await query
      .orderBy('createdAt', 'desc')
      .limit(params.limit ?? 100)
      .execute();

    return rows.map((row) => ({
      id: str(row.id),
      issueId: row.issueId ? str(row.issueId) : null,
      commentId: row.commentId ? str(row.commentId) : null,
      patternKey: str(row.patternKey),
      fingerprint: str(row.fingerprint),
      status: str(row.status) as SecretFindingStatus,
      createdAt: new Date(row.createdAt as string | Date).toISOString(),
      updatedAt: new Date(row.updatedAt as string | Date).toISOString(),
    }));
  }

  async getFinding(id: string): Promise<SecretFinding> {
    const conn = this.connection();
    const row = await conn.query
      .selectFrom(SECRET_FINDINGS_COLLECTION)
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();

    if (!row) {
      throw new SecretFindingError(
        404,
        'NOT_FOUND',
        `Secret finding ${id} not found.`,
      );
    }

    return {
      id: str(row.id),
      issueId: row.issueId ? str(row.issueId) : null,
      commentId: row.commentId ? str(row.commentId) : null,
      patternKey: str(row.patternKey),
      fingerprint: str(row.fingerprint),
      status: str(row.status) as SecretFindingStatus,
      createdAt: new Date(row.createdAt as string | Date).toISOString(),
      updatedAt: new Date(row.updatedAt as string | Date).toISOString(),
    };
  }

  async recordFindings(params: RecordFindingsParams): Promise<SecretFinding[]> {
    if (!params.matches || params.matches.length === 0) return [];

    const conn = this.connection();
    const created: SecretFinding[] = [];
    const now = new Date();

    for (const match of params.matches) {
      const existing = await conn.query
        .selectFrom(SECRET_FINDINGS_COLLECTION)
        .select('id')
        .where('issueId', '=', params.issueId)
        .where('fingerprint', '=', match.fingerprint)
        .where('status', '=', 'active')
        .executeTakeFirst();

      if (!existing) {
        const id = randomUUID();
        await conn.query
          .insertInto(SECRET_FINDINGS_COLLECTION)
          .values({
            id,
            issueId: params.issueId,
            commentId: params.commentId ?? null,
            patternKey: match.patternKey,
            fingerprint: match.fingerprint,
            status: 'active',
            createdAt: now,
            updatedAt: now,
          })
          .execute();

        created.push({
          id,
          issueId: params.issueId,
          commentId: params.commentId ?? null,
          patternKey: match.patternKey,
          fingerprint: match.fingerprint,
          status: 'active',
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
        });
      }
    }

    if (created.length > 0 && params.ownerUserId) {
      await this.notifySecretAlert({
        ownerUserId: params.ownerUserId,
        issueId: params.issueId,
        issueIdentifier: params.issueIdentifier ?? params.issueId,
        findingsCount: created.length,
      });
    }

    return created;
  }

  async updateFindingStatus(
    id: string,
    status: SecretFindingStatus,
  ): Promise<SecretFinding> {
    const conn = this.connection();
    const existing = await this.getFinding(id);
    const now = new Date();

    await conn.query
      .updateTable(SECRET_FINDINGS_COLLECTION)
      .set({
        status,
        updatedAt: now,
      })
      .where('id', '=', id)
      .execute();

    return {
      ...existing,
      status,
      updatedAt: now.toISOString(),
    };
  }

  private async notifySecretAlert(params: {
    readonly ownerUserId: string;
    readonly issueId: string;
    readonly issueIdentifier: string;
    readonly findingsCount: number;
  }): Promise<void> {
    const { container } = this.app;
    if (!container.has(notificationServiceToken)) return;

    let title = `Cảnh báo bí mật trên việc ${params.issueIdentifier}`;
    let body = `Studio phát hiện chuỗi nghi là bí mật hoặc khoá API trong việc ${params.issueIdentifier}. Vui lòng kiểm tra và thu hồi/xoay khoá ngay nếu là khoá thật.`;

    if (container.has(i18nToken)) {
      try {
        const i18n = container.resolve(i18nToken);
        const locale = i18n.getDefaultLocale();
        await i18n.ensureLocaleLoaded(locale);
        const t = i18n.getFixedT(APP_NS, locale);
        title = t('secretFindings.inboxTitle', {
          identifier: params.issueIdentifier,
        });
        body = t('secretFindings.inboxBody', {
          identifier: params.issueIdentifier,
        });
      } catch {
        // Fallback to default Vietnamese strings
      }
    }

    const key = `secret-finding-alert:${params.issueId}:${Date.now()}`;
    try {
      await container.resolve(notificationServiceToken).send({
        idempotencyKey: key,
        source: {
          type: 'duongsinh-studio/secrets',
          referenceId: params.issueId,
        },
        messages: {
          [INBOX_CHANNEL]: {
            to: [params.ownerUserId],
            title,
            body,
            target: { type: 'route', path: `/issues/${params.issueId}` },
          },
        },
      });
    } catch (error) {
      console.warn('Failed to send secret alert notification:', error);
    }
  }
}
