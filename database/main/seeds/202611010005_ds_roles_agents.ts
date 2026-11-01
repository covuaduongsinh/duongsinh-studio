import { defineSeed } from '@nocobase/db';
import { randomUUID } from 'node:crypto';

// Stage S2 adds the agents plugin's capabilities to the built-in Studio roles, on fresh installs and on installations
// seeded before S2. Self-contained like a migration (seeds cannot import the application's modules). It only adds a
// grant a role lacks, so an administrator's other choices stay; it never removes anything.
//
// - Admin: the agent pages, every agents settings item (read and manage), and editing every skill.
// - Contributor: the agent pages, reading agents and runners (to pick where an agent runs and add personal runners),
//   and editing the skills they created.

interface Grant {
  resource: { type: string; id: string };
  actions: { action: string }[];
}

const AGENT_PAGES = ['agents', 'runtimes', 'skills', 'usage'];
const pages = (): Grant[] =>
  AGENT_PAGES.map((id) => ({
    resource: { type: 'page', id },
    actions: [{ action: 'access' }],
  }));

const ADDITIONS: Readonly<Record<string, Grant[]>> = {
  'ds-admin': [
    ...pages(),
    ...['agents.agents', 'agents.runners', 'agents.prices', 'agents.services'].map(
      (id) => ({
        resource: { type: 'settings', id },
        actions: [{ action: 'read' }, { action: 'manage' }],
      }),
    ),
    {
      resource: { type: 'agents', id: 'agents.agents' },
      actions: [{ action: 'edit.all' }],
    },
  ],
  'ds-contributor': [
    ...pages(),
    {
      resource: { type: 'settings', id: 'agents.agents' },
      actions: [{ action: 'read' }],
    },
    {
      resource: { type: 'settings', id: 'agents.runners' },
      actions: [{ action: 'read' }],
    },
    {
      resource: { type: 'agents', id: 'agents.agents' },
      actions: [{ action: 'edit.related' }],
    },
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
  name: '202611010005_ds_roles_agents',
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
