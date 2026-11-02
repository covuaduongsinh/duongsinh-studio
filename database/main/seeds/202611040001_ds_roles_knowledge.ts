import { defineSeed } from '@nocobase/db';
import { randomUUID } from 'node:crypto';

// Stage S4 adds the knowledge plugin's page and business actions to the built-in Studio roles, on fresh installs and
// on installations seeded before S4. Self-contained like a migration (seeds cannot import the application's modules).
// It only adds a grant a role lacks, so an administrator's other choices stay; it never removes anything.
//
// - Admin: the knowledge page; read, propose, edit and manage every space.
// - Contributor: the knowledge page; read and propose in the system space and the spaces of projects they see, edit
//   and manage the spaces of projects they manage (`server/knowledge/access.ts` says what `related` reaches).

interface Grant {
  resource: { type: string; id: string };
  actions: { action: string }[];
}

const page: Grant = {
  resource: { type: 'page', id: 'knowledge' },
  actions: [{ action: 'access' }],
};
const kb = (level: 'all' | 'related', actions: readonly string[]): Grant => ({
  resource: { type: 'kb', id: 'kb.knowledge' },
  actions: actions.map((action) => ({ action: `${action}.${level}` })),
});

const ADDITIONS: Readonly<Record<string, Grant[]>> = {
  'ds-admin': [page, kb('all', ['read', 'propose', 'edit', 'manage'])],
  'ds-contributor': [
    page,
    kb('related', ['read', 'propose', 'edit', 'manage']),
  ],
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
  name: '202611040001_ds_roles_knowledge',
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
