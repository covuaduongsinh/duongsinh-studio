import { defineSeed } from '@nocobase/db';

// The owner's decision (01/11/2026): new members get the Contributor role, as in the Studio demo, so a person invited
// into a project can work in it at once. Administrators see every holder in /api/access/members and may change or clear
// the default with PUT /api/access/settings. An existing settings row is an administrator's choice and is kept.
export default defineSeed({
  name: '202611010004_ds_default_role',
  transaction: true,
  async run({ query }) {
    const existing = await query
      .selectFrom('dsAccessSettings')
      .select('id')
      .where('id', '=', 'default')
      .executeTakeFirst();
    if (existing) return;
    await query
      .insertInto('dsAccessSettings')
      .values({
        id: 'default',
        defaultRole: 'contributor',
        updatedAt: new Date(),
      })
      .execute();
  },
});
