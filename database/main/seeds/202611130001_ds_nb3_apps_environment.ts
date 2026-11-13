import { defineSeed } from '@nocobase/db';

// V5.1b: the Apps' composes made before `dsNb3Apps.environmentId` existed (migration 202611120005) have no environment, so
// each counts against every environment's places. Give each the environment its App belongs to (`relApps.environmentId`).
// A row that has one stays as it is, and an App that no longer exists in the releases plugin is left alone.
export default defineSeed({
  name: '202611130001_ds_nb3_apps_environment',
  transaction: true,
  async run({ query }) {
    const rows = await query
      .selectFrom('dsNb3Apps')
      .select(['appId'])
      .where('environmentId', 'is', null)
      .execute();
    for (const row of rows) {
      const app = await query
        .selectFrom('relApps')
        .select(['environmentId'])
        .where('id', '=', row.appId)
        .executeTakeFirst();
      if (!app?.environmentId) continue;
      await query
        .updateTable('dsNb3Apps')
        .set({ environmentId: app.environmentId })
        .where('appId', '=', row.appId)
        .where('environmentId', 'is', null)
        .execute();
    }
  },
});
