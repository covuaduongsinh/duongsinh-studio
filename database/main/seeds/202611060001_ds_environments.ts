import { defineSeed } from '@nocobase/db';

// Dương Sinh's three environments (S5.4), added once and never overwritten, so an administrator's later changes stay.
// All three run outside Studio and are recorded only: the previews and the staging NocoBase 2 run on the VPS (S5.6), and
// the owner deploys production through Dokploy, then marks the version here. Production is protected: the owner decides.

interface EnvironmentRow {
  key: string;
  name: string;
  purpose: 'preview' | 'test' | 'production';
  protected: boolean;
  approvers: string[];
  maxApps: number | null;
  idleStopMinutes: number | null;
  removeOnClose: boolean;
  publicUrlPattern: string | null;
  description: string;
  position: number;
}

const ENVIRONMENTS: readonly EnvironmentRow[] = [
  {
    key: 'preview',
    name: 'Preview',
    purpose: 'preview',
    protected: false,
    approvers: [],
    maxApps: 2,
    idleStopMinutes: 30,
    removeOnClose: true,
    publicUrlPattern: 'https://pr-{number}.preview.dsc.edu.vn',
    description:
      'NocoBase 2 dựng tạm cho pull request có nhãn `preview`, dữ liệu mẫu; tối đa 2, rảnh 30 phút thì dừng, xoá khi PR đóng.',
    position: 1,
  },
  {
    key: 'staging',
    name: 'Staging',
    purpose: 'test',
    protected: false,
    approvers: [],
    maxApps: 1,
    idleStopMinutes: null,
    removeOnClose: false,
    publicUrlPattern: 'https://staging-nocobase.dsc.edu.vn',
    description: 'Một NocoBase 2 cố định với dữ liệu mẫu, cập nhật sau khi merge vào main.',
    position: 2,
  },
  {
    key: 'production',
    name: 'Production',
    purpose: 'production',
    protected: true,
    approvers: ['owner'],
    maxApps: 1,
    idleStopMinutes: null,
    removeOnClose: false,
    publicUrlPattern: 'https://nocobase.dsc.edu.vn',
    description:
      'Hệ thống thật. Studio chỉ ghi nhận: chủ dự án deploy bằng Dokploy rồi đánh dấu phiên bản đã lên production.',
    position: 3,
  },
];

export default defineSeed({
  name: '202611060001_ds_environments',
  transaction: true,
  async run({ query }) {
    const now = new Date();
    for (const environment of ENVIRONMENTS) {
      const existing = await query
        .selectFrom('dsEnvironments')
        .select(['key'])
        .where('key', '=', environment.key)
        .executeTakeFirst();
      if (existing) continue;
      await query
        .insertInto('dsEnvironments')
        .values({
          ...environment,
          approvers: JSON.stringify(environment.approvers),
          runsOn: 'external',
          recordOnly: true,
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }
  },
});
