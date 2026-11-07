// Generated from the en-US structure and the reviewed Vietnamese wording (docs/thuat-ngu.md); edit the wording here.
import type { AppServerResource } from './en-US.js';
import overrides from './overrides/vi-VN.js';

const viVN: AppServerResource = {
  studioAgents: {
    scopes: {
      project: 'Dự án',
    },
    subjects: {
      issue: 'Công việc',
    },
    triggers: {
      statusChange: 'Công việc được bắt đầu',
      assigned: 'Được giao',
      comment: 'Bình luận',
      mention: 'Được nhắc tên',
      unblocked: 'Hết bị chặn',
    },
    kinds: {
      agent: 'Agent',
    },
    projectManager: {
      name: 'Trưởng nhóm agent',
    },
    actions: {
      peopleOnly: 'Chỉ con người làm việc này; không bao giờ giao cho agent.',
    },
    runFinished: {
      completed: 'Lượt chạy {{runId}} đã xong.',
      failed: 'Lượt chạy {{runId}} bị lỗi ({{reason}}).',
      cancelled: 'Lượt chạy {{runId}} đã bị dừng.',
    },
  },
  studioGit: {
    comments: {
      merged: 'Pull request {{repo}}#{{number}} đã được gộp.',
      closed: 'Pull request {{repo}}#{{number}} đã bị đóng mà không gộp.',
    },
    errors: {
      GIT_CONNECTION_NOT_FOUND: 'Kết nối Git không tồn tại.',
      GIT_CONNECTION_NO_TOKEN: 'Kết nối Git chưa có token.',
      GIT_CONNECTION_IN_USE:
        'Kết nối Git vẫn đang liên kết repository; hãy gỡ chúng trước.',
      GIT_TOKEN_REJECTED: 'GitHub từ chối token.',
      GIT_PUBLIC_URL_MISSING:
        'Studio chưa cấu hình địa chỉ công khai nên GitHub không gọi lại được.',
      GIT_APP_MANIFEST_EXPIRED:
        'Yêu cầu tạo GitHub App này không còn hợp lệ (lạ, đã dùng hoặc hết hạn); hãy bắt đầu lại từ Cài đặt → Git.',
      GIT_APP_NOT_FOUND: 'Kết nối Git chưa có GitHub App.',
      GIT_APP_NOT_INSTALLED: 'GitHub App của {{name}} chưa được cài.',
      GIT_APP_INSTALLATION_AMBIGUOUS:
        'GitHub App của {{name}} đang được cài trên nhiều tài khoản; hãy cài lại từ đường link của nó.',
      GIT_REPOSITORY_UNREACHABLE:
        'Token của kết nối không truy cập được repository {{repo}}.',
      GIT_REPOSITORY_READ_ONLY:
        'Token của kết nối không được push vào {{repo}}.',
      GIT_REPOSITORY_LINKED: 'Repository {{repo}} đã được liên kết.',
      GIT_REPOSITORY_ATTACHED: 'Repository {{repo}} đã gắn với dự án này.',
      GIT_REPOSITORY_NOT_FOUND: 'Repository chưa được liên kết.',
      GIT_HOST_UNAVAILABLE: 'Hiện không kết nối được GitHub; hãy thử lại sau.',
      SECRETS_NOT_CONFIGURED:
        'Chưa cấu hình khoá bí mật nên không lưu được token.',
      PROJECTS_UNAVAILABLE: 'Chức năng dự án không khả dụng.',
      PULL_REQUEST_NOT_FOUND: 'Pull request không tồn tại.',
      MERGE_BLOCKED: 'Chưa gộp được pull request ({{blocker}}).',
      MERGE_REFUSED_BY_HOST: 'GitHub từ chối gộp pull request.',
      ISSUE_HAS_NO_REPOSITORY:
        'Công việc {{issue}} chưa có repository: hãy gắn một repository vào dự án của nó trước.',
      GIT_REPOSITORY_NOT_IN_PROJECT:
        'Repository đó không thuộc dự án của {{issue}}.',
      PULL_REQUEST_REFUSED_BY_HOST:
        'GitHub từ chối mở pull request từ {{head}}: hãy push nhánh với ít nhất một commit trước.',
    },
    actions: {
      groupTitle: 'Lưu trữ mã nguồn',
      openPr: {
        title: 'Mở pull request',
        description:
          'Mở pull request cho nhánh của công việc qua Studio. Ai được sửa công việc thì có quyền này.',
      },
    },
  },
  studioChat: {
    sources: {
      askAgent: 'Hỏi agent',
    },
    actions: {
      groupTitle: 'Kế hoạch',
      plansUse: {
        title: 'Đề xuất kế hoạch',
        description:
          'Đề xuất kế hoạch thao tác (công việc mới, bình luận, phụ thuộc) để người dùng xem lại và thực hiện trong cuộc trò chuyện. Ai được xem công việc thì có quyền này.',
      },
    },
  },
  studioReleases: {
    actions: {
      groupTitle: 'Preview',
      previewsManage: {
        title: 'Quản lý preview của pull request',
        description:
          'Dựng, dựng lại và gỡ preview cho pull request của công việc. Ai được sửa công việc thì có quyền này.',
      },
    },
  },
  studioBuilds: {
    externalDriver: 'Ngoài Studio',
  },
  studioBudgets: {
    blockedTitle: 'Ngân sách đã hết: {{scope}}',
    warnedTitle: 'Ngân sách sắp hết: {{scope}}',
    usedBody: 'Đã dùng {{runs}} lượt chạy và {{tokens}} token {{period}}.',
    scopeGlobal: 'toàn bộ Studio',
    periodDay: 'hôm nay',
    periodMonth: 'tháng này',
    settingsTitle: 'Ngân sách',
  },
  studioOutbound: {
    decisionTitle: 'Cần bạn quyết định: {{identifier}}',
  },
  studioOrgKeys: {
    checksTitle: 'Báo kết quả check',
    checksDescription: 'Cho CI báo kết quả check của repo lấy check từ CI.',
    report: 'Báo kết quả check',
    section: 'Studio',
    settingsTitle: 'Khoá API của tổ chức',
    read: 'Xem',
    manage: 'Quản lý',
  },
  studioSetups: {
    issueTitle: 'Khởi tạo dự án',
    templateIssue:
      'Khởi tạo repository này từ mẫu ứng dụng NocoBase `{{- packageName}}@{{- version}}`, đúng phiên bản Studio đang dùng.\n\n1. Kiểm `node -v` ≥ 24 và `pnpm -v` ≥ 11; thiếu thì dừng và báo lại, không cài gì thêm.\n2. Trong một thư mục tạm ngoài repo: `pnpm create @nocobase/app {{- name}} --template={{- packageName}}@{{- version}} --no-install`. Không thêm `@beta`, không đổi phiên bản.\n3. Chuyển mọi file của ứng dụng vừa tạo, kể cả file ẩn, vào gốc repo; giữ nguyên `.git`. Xoá `README.md` do GitHub tạo, giữ `README.MD` của mẫu.\n4. Trong gốc repo: `pnpm install`, `pnpm add @nocobase/db-postgres`, `pnpm nocobase config init --dialect sqlite`, `pnpm nocobase config check`.\n5. Không commit `config.yml`, `.env`, `storage/`. Viết `docs/nguon-goc.md`: mẫu và phiên bản, ngày tạo, phiên bản các gói `@nocobase/*` chính, và câu "Tạo bằng create-app, không sao chép từ ứng dụng khác."\n6. Commit mốc gốc thẳng lên nhánh mặc định và push, không force-push. Mọi việc sau làm trên nhánh riêng.\n7. Không chạy kiểm tra toàn repo (`pnpm check`, `pnpm lint`, `pnpm test`, `pnpm build`, `pnpm typecheck`) và không để `pnpm dev` chạy.\n\nBáo lại: phiên bản Node và pnpm, danh sách file đã commit (`git ls-files`), nội dung `docs/nguon-goc.md`.',
    managerUnavailable:
      'Trưởng nhóm agent chưa được cấu hình nên việc này đang chờ. Hãy cấu hình rồi bắt đầu việc.',
    deployLater:
      'Chưa áp dụng thiết lập triển khai: hãy nối ứng dụng ở mục phát hành của dự án.',
    ciNoToken:
      'Đã tạo dự án nhưng chưa thêm CI: bạn chưa nối token GitHub của mình (`git authorization use-token`). Thêm `.github/workflows/ds-check.yml` bằng tay hoặc nối token rồi tạo lại.',
    ciRefused:
      'Đã tạo dự án nhưng GitHub không cho thêm CI: token của bạn cần quyền Workflows (đọc và ghi). Thêm `.github/workflows/ds-check.yml` bằng tay.',
  },
  studioReports: {
    actions: {
      groupTitle: 'Báo cáo',
      read: {
        title: 'Đọc báo cáo',
        description:
          'Đọc số liệu giao việc, chi phí và nghiệm thu thay cho người đã gọi agent.',
      },
    },
    metricsMessage:
      'Số liệu từ {{from}} đến {{to}}\nSử dụng: {{activeDays}} ngày hoạt động trong {{activeWeeks}} tuần, {{activeMembers}} người, tạo {{issuesCreated}} công việc và {{commentsCreated}} bình luận.\nĐã giao: {{deliveredTotal}} công việc, agent làm {{deliveredByAgent}} (tỷ lệ {{share}}).\nReview: đạt {{passed}}, trả lại {{reworked}}.\nLượt chạy: {{runs}} lượt, xong {{completedRuns}}, lỗi {{failedRuns}}, mất {{lostRuns}}; chờ trung vị {{wait}}, chạy trung vị {{duration}}.\nToken: {{inputTokens}} vào và {{outputTokens}} ra.\nQuyết định: {{asked}} cần hỏi, {{decided}} đã quyết (trung vị {{resolve}}), {{open}} đang chờ.',
    usageMessage:
      'Mức dùng từ {{from}} đến {{to}} theo {{groupBy}}: {{runs}} lượt chạy, {{inputTokens}} token vào và {{outputTokens}} token ra.',
    weekly: {
      title: 'Báo cáo tuần {{from}} đến {{to}}',
      body: '### Báo cáo tuần {{from}} đến {{to}}\n\n- **Công việc hoàn thành**: {{completed}} (tuần trước: {{completedBefore}})\n- **Chu kỳ trung vị**: {{cycle}}\n- **Do agent làm**: {{share}}\n- **Token mỗi công việc**: {{tokens}}\n- **Tỷ lệ chạy thành công**: {{success}} trên {{runs}} lượt\n- **Cần chú ý**: {{blocked}} bị vướng, {{overdue}} quá hạn, {{reviews}} chờ review, {{failed}} lượt chạy lỗi',
    },
  },
  studioReviews: {
    actions: {
      groupTitle: 'Review',
      submit: {
        title: 'Nộp phiếu review',
        description:
          'Nộp phiếu review PR có cấu trúc (kết luận, checklist, số must/should fix) ở chế độ read-only.',
      },
    },
  },
  studioAutopilot: {
    actions: {
      groupTitle: 'Tự lái',
      manage: {
        title: 'Quản lý tự lái',
        description: 'Cấu hình và vận hành tính năng tự lái cho các dự án.',
      },
    },
  },
  // Rewording of the plugins' own vi-VN to the glossary (docs/thuat-ngu.md).
  overrides,
};

export default viVN;
