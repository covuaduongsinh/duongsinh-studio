import { defineSeed } from '@nocobase/db';
import { randomUUID } from 'node:crypto';

// Admin may upload builds to any App: CI uploads with an organization key, which reaches at most what the Admin role
// holds. Self-contained like a migration; it only adds what is missing.

interface Grant {
  resource: { type: string; id: string };
  actions: { action: string }[];
}

function parseGrants(value: unknown): Grant[] {
  let parsed: unknown = value;
  // Database JSON codecs may hand back the serialized value as a string.
  while (typeof parsed === 'string') parsed = JSON.parse(parsed) as unknown;
  return Array.isArray(parsed) ? (parsed as Grant[]) : [];
}

export default defineSeed({
  name: '202611100002_ds_roles_builds',
  transaction: true,
  async run({ query }) {
    const row = await query
      .selectFrom('authorizationPermissionSets')
      .select(['grants'])
      .where('key', '=', 'ds-admin')
      .executeTakeFirst();
    // A role an administrator deleted stays deleted.
    if (!row) return;
    const grants = parseGrants(row.grants);
    const apps = grants.find(
      (grant) =>
        grant.resource.type === 'rel' && grant.resource.id === 'rel.apps',
    );
    if (apps?.actions.some(({ action }) => action === 'upload.all')) return;
    const next: Grant[] = apps
      ? grants.map((grant) =>
          grant === apps
            ? {
                resource: grant.resource,
                actions: [...grant.actions, { action: 'upload.all' }],
              }
            : grant,
        )
      : [
          ...grants,
          {
            resource: { type: 'rel', id: 'rel.apps' },
            actions: [{ action: 'upload.all' }],
          },
        ];
    await query
      .updateTable('authorizationPermissionSets')
      .set({
        grants: JSON.stringify(next),
        // A new revision, so an editor holding the old one gets a conflict instead of overwriting this change.
        revision: randomUUID(),
        updatedAt: new Date(),
      })
      .where('key', '=', 'ds-admin')
      .execute();
  },
});
