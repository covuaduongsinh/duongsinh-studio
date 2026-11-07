import { defineSeed } from '@nocobase/db';
import { randomUUID } from 'node:crypto';

export const ORGANIZATION_KEYS_USER_ID = 'studio-organization-keys';

// The account organization API keys belong to, so a key outlives whoever created it, and the Admin role's right to
// manage them. Self-contained like a migration; it only adds what is missing. `OrganizationKeysProvider` gives the
// account its role at boot, because assignments go through the authorization service.

interface Grant {
  resource: { type: string; id: string };
  actions: { action: string }[];
}

const GRANT: Grant = {
  resource: { type: 'settings', id: 'studio.apiKeys' },
  actions: [{ action: 'read' }, { action: 'manage' }],
};
const CHECKS: Grant = {
  resource: { type: 'settings', id: 'studio.checks' },
  actions: [{ action: 'report' }],
};

function parseGrants(value: unknown): Grant[] {
  let parsed: unknown = value;
  // Database JSON codecs may hand back the serialized value as a string.
  while (typeof parsed === 'string') parsed = JSON.parse(parsed) as unknown;
  return Array.isArray(parsed) ? (parsed as Grant[]) : [];
}

export default defineSeed({
  name: '202611100001_ds_organization_keys',
  transaction: true,
  async run({ query }) {
    const existing = await query
      .selectFrom('user')
      .select('id')
      .where('id', '=', ORGANIZATION_KEYS_USER_ID)
      .executeTakeFirst();
    if (!existing) {
      const now = new Date();
      await query
        .insertInto('user')
        .values({
          id: ORGANIZATION_KEYS_USER_ID,
          name: 'Studio organization keys',
          username: ORGANIZATION_KEYS_USER_ID,
          email: `${ORGANIZATION_KEYS_USER_ID}@system.internal`,
          emailVerified: true,
          kind: 'service',
          description: 'Owns organization API keys. It cannot sign in.',
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }

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
          grant.resource.type === GRANT.resource.type &&
          grant.resource.id === GRANT.resource.id,
      )
    )
      return;
    await query
      .updateTable('authorizationPermissionSets')
      .set({
        grants: JSON.stringify([...grants, GRANT, CHECKS]),
        // A new revision, so an editor holding the old one gets a conflict instead of overwriting this change.
        revision: randomUUID(),
        updatedAt: new Date(),
      })
      .where('key', '=', 'ds-admin')
      .execute();
  },
});
