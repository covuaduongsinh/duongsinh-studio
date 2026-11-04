// Generated from the en-US structure and the reviewed Vietnamese wording (docs/thuat-ngu.md); edit the wording here.
import type { AppServerResource } from './en-US.js';
import overrides from './overrides/vi-VN.js';

const viVN: AppServerResource = {
  studioAgents: {
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
