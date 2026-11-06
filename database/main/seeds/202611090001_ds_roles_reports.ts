import { defineSeed } from '@nocobase/db';
import { randomUUID } from 'node:crypto';

// Stage U5 adds the dashboard's page to the built-in roles, on fresh installs and on installations seeded before it. The
// owner holds everything already. What each role then reads is still bounded by what it sees: a Contributor's figures
// cover the issues related to them. Self-contained like a migration; it only adds a grant a role lacks.

interface Grant {
  resource: { type: string; id: string };
  actions: { action: string }[];
}

const PAGE: Grant = {
  resource: { type: 'page', id: 'reports' },
  actions: [{ action: 'access' }],
};

function parseGrants(value: unknown): Grant[] {
  let parsed: unknown = value;
  // Database JSON codecs may hand back the serialized value as a string.
  while (typeof parsed === 'string') parsed = JSON.parse(parsed) as unknown;
  return Array.isArray(parsed) ? (parsed as Grant[]) : [];
}

export default defineSeed({
  name: '202611090001_ds_roles_reports',
  transaction: true,
  async run({ query }) {
    for (const key of ['ds-admin', 'ds-contributor']) {
      const row = await query
        .selectFrom('authorizationPermissionSets')
        .select(['grants'])
        .where('key', '=', key)
        .executeTakeFirst();
      // A role an administrator deleted stays deleted.
      if (!row) continue;
      const grants = parseGrants(row.grants);
      if (
        grants.some(
          (grant) =>
            grant.resource.type === PAGE.resource.type &&
            grant.resource.id === PAGE.resource.id,
        )
      )
        continue;
      await query
        .updateTable('authorizationPermissionSets')
        .set({
          grants: JSON.stringify([...grants, PAGE]),
          // A new revision, so an editor holding the old one gets a conflict instead of overwriting this change.
          revision: randomUUID(),
          updatedAt: new Date(),
        })
        .where('key', '=', key)
        .execute();
    }
  },
});
