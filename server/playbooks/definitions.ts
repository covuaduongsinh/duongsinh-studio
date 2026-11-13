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
4. Không chạy kiểm tra TypeScript toàn repo trên runner dùng chung (hết RAM, mất lượt chạy): chỉ chạy \`tsc\` hoặc test theo file đã đổi, và xác nhận toàn bộ bằng job CI \`static\` xanh.
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
        text: 'Không có lỗi TypeScript ở mọi target: job CI static của PR xanh (không chạy typecheck toàn repo trên runner)',
        checkKind: 'manual',
        checkValue: null,
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
4. Chạy thử khởi động ứng dụng (theo AGENTS.md của app) để đảm bảo lắng nghe đúng port và /api/healthz trả 200; không chạy test hay build toàn repo trên runner dùng chung.
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
        text: 'App mới khởi động thành công, /api/healthz trả 200 và job CI của PR xanh',
        checkKind: 'manual',
        checkValue: null,
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

1. Lệnh nhập (\`edu import-lark\`) nằm trong repo NocoEdu và chỉ chạy được qua kênh job của Studio: \`POST /api/releases/apps/{appId}/jobs\` với \`{"command":"larkImportDry"}\`. Khi kênh trả \`503 NB3_JOB_CHANNEL_DOWN\` thì dừng và báo người; không tự cài lark-cli, không giữ token Lark trên runner, không đặt \`LARK_*\` ở tab Biến của app (bí mật đi qua \`PUT .../jobSecrets/{TÊN}\`, việc của chủ dự án).
2. Agent chỉ được chạy dry-run (\`larkImportDry\`). Đọc kết quả ở \`GET .../jobs/{id}\`: chỉ có số đếm và khác biệt theo cột, không có bản ghi (dữ liệu học viên). Nếu log in ra bản ghi thì dừng và báo người.
3. Báo kết quả dry-run cho người phê duyệt, nhất là khi có xóa hoặc sửa cấu trúc lớn. Lệnh ghi (\`larkImportCommit\`) chỉ chủ dự án chạy, sau khi có sao lưu.
4. Sau khi chủ dự án ghi, kiểm tra số bản ghi theo bảng và các khóa ngoại bằng một dry-run lần nữa.
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
        text: 'Lệnh nhập của app đích có test riêng trong repo của app (ghi đường dẫn test vào PR) và không làm mất dữ liệu hiện có',
        checkKind: 'review',
        checkValue: null,
      },
    ],
  },
  {
    slug: 'noi-app-nb3',
    name: 'Nối app NocoBase 3 với repository',
    description:
      'Đăng ký một app NocoBase 3 cho repository (môi trường, app, liên kết, tệp workflow CI) và liệt kê việc còn lại của chủ dự án.',
    skillName: 'ds-pb-noi-app-nb3',
    instructions: `
# Playbook: Nối app NocoBase 3 với repository

1. Việc đăng ký là của chủ dự án: \`POST /api/nb3Apps/register\` (hoặc trang Phát hành → Đăng ký app) với \`repositoryId\`, \`appId\`, \`host\`, \`role\` (preview / staging / production) và \`database\`. Agent không có quyền này; chuẩn bị đủ thông tin rồi báo người, không tự thử bằng khoá khác.
2. Studio tạo môi trường \`nb3-<role>\` (nếu chưa có), app, liên kết với repository và trả tệp workflow \`.github/workflows/ds-studio-<appId>.yml\`. Chỉ có một mẫu workflow: lấy vé tải lên của plugin releases (\`/api/releases/apps/{appId}/uploadTickets\`), gửi \`dist.tar.gz\`; preview và staging deploy ngay, production chỉ tải lên (chủ dự án duyệt yêu cầu deploy).
3. Các việc Studio không làm, ghi rõ trong PR cho chủ dự án: (a) bản ghi DNS của tên miền; (b) tạo khoá CI hẹp (\`Tạo khoá CI\`, chỉ hiện một lần) và đặt secret GitHub \`DS_STUDIO_API_KEY\`; (c) đẩy tệp workflow vào repository bằng token cá nhân có quyền Workflows (GitHub App không có quyền này).
4. Không in khoá CI hay vé tải lên trong log, PR hay phiên chat.
5. Kiểm: nhãn \`preview\` trên một PR chạy workflow, app xem thử lên và trả \`/api/healthz\`; không chạm \`nocobase.dsc.edu.vn\`.
`.trim(),
    params: [
      {
        name: 'repo',
        description: 'Repository (owner/tên) cần nối',
        required: true,
      },
      {
        name: 'app',
        description: 'Mã app (chữ thường, số, dấu gạch)',
        required: true,
      },
      {
        name: 'role',
        description: 'Vai trò: preview, staging hoặc production',
        defaultValue: 'preview',
        required: false,
      },
    ],
    defaultCriteria: [
      {
        text: 'App đã đăng ký và liên kết với repository (Phát hành → Đăng ký app, do chủ dự án)',
        checkKind: 'manual',
        checkValue: null,
      },
      {
        text: 'Danh sách việc của chủ dự án (DNS, khoá CI + secret GitHub, đẩy workflow) được ghi trong PR; không có khoá hay vé nào trong log',
        checkKind: 'review',
        checkValue: null,
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

1. Tạo bản sao lưu (backup) cơ sở dữ liệu và thư mục uploads trước khi deploy, theo mục "Sao lưu và khôi phục" của docs/trien-khai-vps.md; chỉ người có quyền trên VPS làm bước này.
2. Bản build production do CI hoặc môi trường WSL làm, không build trên runner dùng chung; kiểm tra job CI build xanh và không có lỗi bundle.
3. Kiểm tra biến môi trường và port routing trên Dokploy tránh xung đột container.
4. Xác nhận endpoint health check trả về 200 OK; log container hiện chỉ xem được trong Dokploy (do người làm), Studio chưa đọc được.
5. Nếu container restart liên tục hoặc fail, dừng và báo người để rollback; rollback của Studio chỉ đổi bản phát hành (dist), không khôi phục dữ liệu.
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
        text: 'Build production thành công: job CI build của PR xanh (không build trên runner dùng chung)',
        checkKind: 'manual',
        checkValue: null,
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
