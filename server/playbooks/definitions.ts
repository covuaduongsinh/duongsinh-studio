import type { PlaybookDefinition } from './types.js';

export const PLAYBOOK_DEFINITIONS: readonly PlaybookDefinition[] = [
  {
    slug: 'nang-template',
    name: 'Nâng cấp template NocoBase',
    description:
      'Quy trình nâng template lên bản mới (beta.89) theo kế hoạch N.',
    skillName: 'ds-pb-nang-template',
    instructions: `
# Playbook: Nâng cấp template NocoBase (beta.89)

1. Kiểm tra AGENTS.md và tài liệu nâng cấp upstream trước khi bắt đầu.
2. Kiểm tra package.json và pnpm-lock.yaml, giải quyết conflict phụ thuộc.
3. Chạy \`pnpm check:packages\` và đảm bảo không có cảnh báo nghiêm trọng.
4. Chạy kiểm tra TypeScript trên cả 3 target (\`pnpm typecheck\`).
5. Giữ nguyên các module và quy tắc tùy biến của Dương Sinh Studio.
6. Xác nhận migration và database schema tương thích ngược.
`.trim(),
    params: [
      {
        name: 'version',
        description: 'Phiên bản template mục tiêu (mặc định: beta.89)',
        defaultValue: 'beta.89',
        required: false,
      },
    ],
    defaultCriteria: [
      {
        text: 'Dependencies và lockfile sạch, không lỗi mismatch (pnpm check:packages)',
        checkKind: 'command',
        checkValue: 'pnpm check:packages',
      },
      {
        text: 'Không có lỗi TypeScript ở mọi target (pnpm typecheck)',
        checkKind: 'command',
        checkValue: 'pnpm typecheck',
      },
      {
        text: 'Đọc kỹ AGENTS.md và tài liệu nâng cấp của template, giải quyết xung đột giữ lại tính năng Dương Sinh Studio',
        checkKind: 'review',
        checkValue: null,
      },
    ],
  },
  {
    slug: 'tao-app-nocobase',
    name: 'Tạo ứng dụng NocoBase mới',
    description:
      'Khởi tạo và thiết lập dự án NocoBase mới theo chuẩn template Studio.',
    skillName: 'ds-pb-tao-app-nocobase',
    instructions: `
# Playbook: Tạo ứng dụng NocoBase mới

1. Đặt tên package và thư mục dự án theo cấu trúc chuẩn.
2. Thiết lập kết nối cơ sở dữ liệu và các biến môi trường cần thiết (.env).
3. Đăng ký các plugin cốt lõi tối thiểu và đồng bộ quyền hệ thống.
4. Chạy thử nghiệm khởi động để đảm bảo ứng dụng lắng nghe đúng port.
5. Kiểm tra tài nguyên và bộ nhớ runner không vượt quá ngưỡng cho phép.
`.trim(),
    params: [
      {
        name: 'name',
        description: 'Tên định danh của ứng dụng',
        required: true,
      },
      {
        name: 'port',
        description: 'Cổng port lắng nghe (mặc định: 3000)',
        defaultValue: '3000',
        required: false,
      },
    ],
    defaultCriteria: [
      {
        text: 'App mới khởi tạo thành công và vượt qua kiểm tra cơ bản',
        checkKind: 'command',
        checkValue: 'pnpm nocobase app:test',
      },
      {
        text: 'Cấu hình database và biến môi trường kết nối thành công',
        checkKind: 'manual',
        checkValue: null,
      },
    ],
  },
  {
    slug: 'nhap-lark',
    name: 'Nhập dữ liệu từ Lark Base',
    description:
      'Đồng bộ và nhập dữ liệu từ bảng Lark Base sang NocoBase, luôn dry-run trước.',
    skillName: 'ds-pb-nhap-lark',
    instructions: `
# Playbook: Nhập dữ liệu từ Lark Base

1. Lấy schema và mẫu bản ghi từ Lark Base nguồn.
2. Luôn chạy chế độ dry-run trước: in ra số dòng sẽ thêm/sửa/xóa và mapping các cột.
3. Yêu cầu người phê duyệt kết quả dry-run nếu có xóa hoặc sửa đổi cấu trúc lớn.
4. Thực hiện ghi dữ liệu trong transaction có cơ chế rollback an toàn.
5. Kiểm tra tính toàn vẹn dữ liệu và các khóa ngoại sau khi nhập xong.
`.trim(),
    params: [
      {
        name: 'table',
        description: 'Tên bảng hoặc ID bảng Lark Base nguồn',
        required: true,
      },
      {
        name: 'dryRun',
        description: 'Chỉ kiểm tra mà không ghi thật vào DB (true/false)',
        defaultValue: 'true',
        required: false,
      },
    ],
    defaultCriteria: [
      {
        text: 'Chạy dry-run kiểm tra schema và số bản ghi trước khi ghi đè',
        checkKind: 'manual',
        checkValue: null,
      },
      {
        text: 'Dữ liệu đồng bộ chính xác không làm mất dữ liệu hiện có (tests/server/lark-sync.test.ts)',
        checkKind: 'command',
        checkValue: 'pnpm exec vitest run tests/server/lark-sync.test.ts',
      },
    ],
  },
  {
    slug: 'deploy-dokploy',
    name: 'Triển khai qua Dokploy',
    description:
      'Quy trình triển khai ứng dụng lên Dokploy an toàn, phòng tránh 3 lỗi vận hành thực tế.',
    skillName: 'ds-pb-deploy-dokploy',
    instructions: `
# Playbook: Triển khai qua Dokploy

1. Tạo bản sao lưu (backup) cơ sở dữ liệu và thư mục uploads trước khi deploy.
2. Build production artifact (\`pnpm build\`) và kiểm tra không có lỗi bundle.
3. Kiểm tra biến môi trường và port routing trên Dokploy tránh xung đột container.
4. Theo dõi log khởi động container và xác nhận endpoint health check trả về 200 OK.
5. Nếu container restart liên tục hoặc fail, rollback về phiên bản backup ngay lập tức.
`.trim(),
    params: [
      {
        name: 'environment',
        description: 'Môi trường triển khai (staging / production)',
        defaultValue: 'staging',
        required: false,
      },
    ],
    defaultCriteria: [
      {
        text: 'Sao lưu cơ sở dữ liệu và file cấu hình trước khi deploy',
        checkKind: 'manual',
        checkValue: null,
      },
      {
        text: 'Build production thành công (pnpm build)',
        checkKind: 'command',
        checkValue: 'pnpm build',
      },
      {
        text: 'Kiểm tra health check và log sau khi container khởi động',
        checkKind: 'manual',
        checkValue: null,
      },
    ],
  },
];

export function findPlaybookDefinition(
  slug: string,
): PlaybookDefinition | undefined {
  const normalized = slug.trim().toLowerCase().replace(/^!/u, '');
  return PLAYBOOK_DEFINITIONS.find((p) => p.slug === normalized);
}
