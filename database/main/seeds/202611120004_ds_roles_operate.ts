import { defineSeed } from '@nocobase/db';
import { randomUUID } from 'node:crypto';

// V4.3: the administrator role may run jobs in NocoBase 3 Apps (`rel.apps/operate`, every App). Only adds the grant; a
// command that changes data still needs the owner (the route checks it). Self-contained like a migration.
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
  name: '202611120004_ds_roles_operate',
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
    let target = grants.find(
      (grant) =>
        grant.resource.type === 'rel' && grant.resource.id === 'rel.apps',
    );
    if (!target) {
      target = { resource: { type: 'rel', id: 'rel.apps' }, actions: [] };
      grants.push(target);
    }
    if (target.actions.some((entry) => entry.action === 'operate.all')) return;
    target.actions.push({ action: 'operate.all' });
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
