import { defineSeed } from '@nocobase/db';
import { randomUUID } from 'node:crypto';

// Stage S5.4 adds the releases plugin's page, settings item and the App actions Studio uses to the built-in roles, on
// fresh installs and on installations seeded before S5. Self-contained like a migration. It only adds a grant a role
// lacks, so an administrator's other choices stay; it never removes anything.
//
// - Admin: the releases page; read and manage environments; view, read the logs of and deploy every App (a protected
//   environment still needs the owner's approval).
// - Contributor: the releases page; view and read the logs of the Apps related to them.
// The owner holds everything already (unrestricted).

interface Grant {
  resource: { type: string; id: string };
  actions: { action: string }[];
}

const page: Grant = {
  resource: { type: 'page', id: 'rel-apps' },
  actions: [{ action: 'access' }],
};
const environments: Grant = {
  resource: { type: 'settings', id: 'rel.environments' },
  actions: [{ action: 'read' }, { action: 'manage' }],
};
const apps = (level: 'all' | 'related', actions: readonly string[]): Grant => ({
  resource: { type: 'rel', id: 'rel.apps' },
  actions: actions.map((action) => ({ action: `${action}.${level}` })),
});

const ADDITIONS: Readonly<Record<string, Grant[]>> = {
  'ds-admin': [page, environments, apps('all', ['view', 'read-logs', 'deploy'])],
  'ds-contributor': [page, apps('related', ['view', 'read-logs'])],
};

function parseGrants(value: unknown): Grant[] {
  let parsed: unknown = value;
  // Database JSON codecs may hand back the serialized value as a string.
  while (typeof parsed === 'string') parsed = JSON.parse(parsed) as unknown;
  return Array.isArray(parsed) ? (parsed as Grant[]) : [];
}

function merge(existing: Grant[], additions: Grant[]): Grant[] {
  const result = existing.map((grant) => ({
    resource: grant.resource,
    actions: [...grant.actions],
  }));
  for (const addition of additions) {
    const target = result.find(
      (grant) =>
        grant.resource.type === addition.resource.type &&
        grant.resource.id === addition.resource.id,
    );
    if (!target) {
      result.push({ resource: addition.resource, actions: [...addition.actions] });
      continue;
    }
    for (const { action } of addition.actions) {
      if (!target.actions.some((entry) => entry.action === action))
        target.actions.push({ action });
    }
  }
  return result;
}

export default defineSeed({
  name: '202611060002_ds_roles_releases',
  transaction: true,
  async run({ query }) {
    for (const [key, additions] of Object.entries(ADDITIONS)) {
      const row = await query
        .selectFrom('authorizationPermissionSets')
        .select(['grants'])
        .where('key', '=', key)
        .executeTakeFirst();
      // A role an administrator deleted stays deleted.
      if (!row) continue;
      await query
        .updateTable('authorizationPermissionSets')
        .set({
          grants: JSON.stringify(merge(parseGrants(row.grants), additions)),
          // A new revision, so an editor holding the old one gets a conflict instead of overwriting this change.
          revision: randomUUID(),
          updatedAt: new Date(),
        })
        .where('key', '=', key)
        .execute();
    }
  },
});
