// Glossary rewording of the plugins' own vi-VN (docs/thuat-ngu.md): the shipped Vietnamese is machine-translated
// ("Vấn đề" for issue, "Tác nhân"/"đại lý" for agent, "Người thi hành án" for executor). Regenerate after a plugin upgrade.
import type { TranslationOverrides } from '@nocobase/i18n';

const overrides: TranslationOverrides = {
  '@nocobase/app-plugin-agent-sessions': {
    errors: {
      authenticationRequired: 'Đăng nhập để sử dụng phiên agent.',
      agentUnavailable: 'Máy tính không thể chạy agent này.',
      choiceNotFound: 'Agent không đưa ra lựa chọn hoặc giá trị này.',
      discoveryFailed:
        'Không thể tải cài đặt agent. Hãy kiểm tra agent trên máy tính này và thử lại.',
    },
  },
  '@nocobase/app-plugin-agents': {
    access: {
      section: 'Nhóm agent',
      businessSection: 'Nhóm agent',
      businesses: {
        agents: {
          title: 'Agent và skill',
          description: 'Các đặc vụ của đội và skill họ sử dụng.',
          actions: {
            edit: {
              title: 'Thay đổi agent và skill',
              description:
                'Thay đổi cài đặt, skill và biến của agent, lưu trữ, khôi phục và xóa nó cũng như chỉnh sửa skill. Một đại diện không được cấp khả năng nào ngoài khả năng của người biên tập',
              related:
                'Thay đổi agent và skill (agent họ sở hữu và skill họ tạo ra)',
              relatedLabel: 'Agent tôi sở hữu và skill tôi tạo',
              relatedHint: 'Agent mà tôi là chủ sở hữu và các skill tôi đã tạo',
              all: 'Thay đổi agent và skill (tất cả)',
            },
          },
        },
      },
      settings: {
        agents: {
          agents: 'Agent',
          runners: 'Runner',
        },
      },
      keyScopes: {
        agents: {
          title: 'Agent',
          description:
            'Xem các agent, skill và cách chạy; thay đổi agent và skill, hủy và thử lại.',
        },
        runners: {
          title: 'Runner',
          description: 'Xem runner và mã thông báo đăng ký; quản lý runner.',
        },
      },
    },
  },
  '@nocobase/app-plugin-projects': {
    access: {
      sections: {
        issues: 'Công việc',
      },
      businesses: {
        issues: {
          title: 'Công việc',
          description:
            'Các công việc và nhận xét của họ, trong một dự án hoặc của chính họ.',
          actions: {
            view: {
              title: 'Xem công việc',
              description:
                'Xem các công việc trong danh sách, bảng và chi tiết của chúng',
              related: 'Xem công việc (những công việc họ có thể thấy)',
              relatedHint:
                'Các công việc không có dự án và các công việc trong dự án tôi có thể thấy',
              all: 'Xem công việc (tất cả)',
            },
            create: {
              title: 'Tạo công việc',
              description: 'Tạo công việc, trong một dự án hoặc tự mình',
              related: 'Tạo công việc (trong các dự án họ có thể nhìn thấy)',
              relatedHint:
                'Các công việc không có dự án, hoặc trong dự án tôi có thể thấy',
              all: 'Tạo công việc (tất cả)',
            },
            edit: {
              title: 'Công việc chỉnh sửa',
              description:
                'Tiêu đề, mô tả, mức độ ưu tiên, ngày tháng, nhãn, người thực hiện và trạng thái mở',
              related: 'Chỉnh sửa công việc (những công việc họ có thể thấy)',
              relatedHint:
                'Các công việc không có dự án và các công việc trong dự án tôi có thể thấy',
              all: 'Chỉnh sửa công việc (tất cả)',
            },
            comment: {
              title: 'Bình luận về công việc',
              related:
                'Bình luận về các công việc (những công việc họ có thể nhìn thấy)',
              relatedHint:
                'Các công việc không có dự án và các công việc trong dự án tôi có thể thấy',
              all: 'Bình luận về công việc (tất cả)',
            },
            moderateComments: {
              related:
                'Bình luận vừa phải (về các công việc họ sở hữu hoặc dự án mà họ lãnh đạo)',
              relatedLabel:
                'Về những công việc tôi sở hữu hoặc trong những dự án tôi lãnh đạo',
              relatedHint:
                'Nhận xét về các công việc tôi sở hữu và về các công việc trong dự án tôi lãnh đạo',
            },
            close: {
              title: 'Đóng công việc',
              description:
                'Đánh dấu một công việc đã được thực hiện hoặc đã hủy',
              related:
                'Đóng các công việc (những công việc họ sở hữu hoặc dự án mà họ lãnh đạo)',
              relatedHint:
                'Những công việc tôi sở hữu, và những công việc trong dự án tôi lãnh đạo',
              all: 'Đóng các công việc (tất cả)',
            },
            changeOwner: {
              description: 'Đưa công việc ra cho người khác chịu trách nhiệm',
              relatedHint:
                'Những công việc tôi sở hữu, và những công việc trong dự án tôi lãnh đạo',
            },
            delete: {
              title: 'Công việc xóa và khôi phục',
              description:
                'Xóa các công việc và khôi phục những công việc đã xóa',
              all: 'Công việc xóa và khôi phục',
            },
          },
        },
        attachments: {
          description: 'Các tập tin đính kèm các công việc và bình luận.',
          actions: {
            upload: {
              description:
                'Đính kèm tập tin vào các công việc họ có thể chỉnh sửa và vào nhận xét của họ',
              related: 'Tải lên tệp đính kèm (về các công việc họ có thể thấy)',
              relatedLabel: 'Về các công việc trong dự án tôi có thể thấy',
              relatedHint:
                'Tệp về các công việc không có dự án và về các công việc trong dự án tôi có thể xem',
            },
          },
        },
      },
      collections: {
        pmIssues: 'Công việc',
      },
      recordAccess: {
        visible: 'Các dự án và công việc họ có thể thấy',
        managed: 'Các dự án họ lãnh đạo và các công việc họ sở hữu',
      },
      keyScopes: {
        issues: {
          title: 'Công việc',
          description:
            'Xem công việc; tạo, chỉnh sửa, nhận xét, đóng và gán lại chúng; kiểm duyệt bình luận và xóa các công việc.',
        },
      },
    },
    notifications: {
      batchDone: 'Tất cả các công việc phụ của {{identifier}} đã hoàn thành',
      batchDoneStage:
        'Giai đoạn {{stage}} của các công việc phụ của {{identifier}} đã kết thúc',
    },
    status: {
      backlog: 'Chờ làm',
      blocked: 'Đang vướng',
      in_review: 'Chờ nghiệm thu',
      in_progress: 'Đang làm',
      done: 'Xong',
      cancelled: 'Đã huỷ',
    },
  },
};

export default overrides;
