import { defineSeed } from '@nocobase/db';

export const AUTOPILOT_USER_ID = 'studio-autopilot';
export const AUTOPILOT_USER_NAME = 'Studio Autopilot';
export const AUTOPILOT_USER_EMAIL = 'studio-autopilot@system.internal';

// System service user for Studio Autopilot (AP2, `server/autopilot/evaluator.ts`):
// Acts as the merging actor for autopilot merge operations.
export default defineSeed({
  name: '2026110803_ds_autopilot_user',
  transaction: true,
  async run({ query }) {
    const existing = await query
      .selectFrom('user')
      .select('id')
      .where('id', '=', AUTOPILOT_USER_ID)
      .executeTakeFirst();

    const now = new Date();
    if (!existing) {
      await query
        .insertInto('user')
        .values({
          id: AUTOPILOT_USER_ID,
          name: AUTOPILOT_USER_NAME,
          username: AUTOPILOT_USER_ID,
          email: AUTOPILOT_USER_EMAIL,
          emailVerified: true,
          kind: 'service',
          description: 'Internal system account for Studio Autopilot operations.',
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }

    try {
      const assignment = await query
        .selectFrom('authorizationAssignments')
        .select('id')
        .where('subjectType', '=', 'user')
        .where('subjectId', '=', AUTOPILOT_USER_ID)
        .where('permissionSet', '=', 'ds-admin')
        .executeTakeFirst();
      if (!assignment) {
        await query
          .insertInto('authorizationAssignments')
          .values({
            id: `assign:${AUTOPILOT_USER_ID}:ds-admin`,
            subjectType: 'user',
            subjectId: AUTOPILOT_USER_ID,
            permissionSet: 'ds-admin',
            createdAt: now,
            updatedAt: now,
          })
          .execute();
      }
    } catch {
      // ignore if authorizationAssignments table is structured differently or not present
    }
  },
});
