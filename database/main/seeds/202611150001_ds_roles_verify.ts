import { defineSeed } from '@nocobase/db';
import { randomUUID } from 'node:crypto';

// S4: the administrator role holds `studio.verify/submit`, so a repository's CI key (the organization keys' account has this
// role, and a key reaches the role intersected with its scope) may read the verification plan and submit its result. Only
// adds the grant. Self-contained like a migration.
interface Grant {
  resource: { type: string; id: string };
  actions: { action: string }[];
}

function parseGrants(value: unknown): Grant[] {
  let parsed: unknown = value;
  while (typeof parsed === 'string') parsed = JSON.parse(parsed) as unknown;
  return Array.isArray(parsed) ? (parsed as Grant[]) : [];
}

export default defineSeed({
  name: '202611150001_ds_roles_verify',
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
    if (
      grants.some(
        (grant) =>
          grant.resource.type === 'settings' &&
          grant.resource.id === 'studio.verify',
      )
    )
      return;
    grants.push({
      resource: { type: 'settings', id: 'studio.verify' },
      actions: [{ action: 'submit' }],
    });
    await query
      .updateTable('authorizationPermissionSets')
      .set({
        grants: JSON.stringify(grants),
        revision: randomUUID(),
        updatedAt: new Date(),
      })
      .where('key', '=', 'ds-admin')
      .execute();
  },
});
