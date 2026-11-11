import { defineSeed } from '@nocobase/db';

export const INITIAL_LESSON_ID = 'lesson-initial-secrets';

export default defineSeed({
  name: '202611110001_ds_initial_lesson',
  transaction: true,
  async run({ query }) {
    const existing = await query
      .selectFrom('dsLessons')
      .select('id')
      .where('id', '=', INITIAL_LESSON_ID)
      .executeTakeFirst();

    if (!existing) {
      const now = new Date();
      await query
        .insertInto('dsLessons')
        .values({
          id: INITIAL_LESSON_ID,
          projectId: null,
          issueId: null,
          reviewId: null,
          mistake:
            'Để lộ bí mật hoặc khoá API trong mô tả hoặc bình luận của việc',
          rule: 'Bí mật chỉ đi qua Biến và bí mật của dự án; thấy chuỗi giống khoá trong mô tả hoặc bình luận thì từ chối dùng và báo người.',
          tag: 'security',
          target: 'skill',
          targetRef: 'ds-development',
          status: 'applied',
          proposedByType: 'user',
          proposedById: 'system',
          decidedBy: 'system',
          appliedRef: 'skill:ds-development:initial',
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }
  },
});
