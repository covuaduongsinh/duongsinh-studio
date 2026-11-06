// Generated from the en-US structure and the reviewed Vietnamese wording (docs/thuat-ngu.md); edit the wording here.
import settings from './settings-vi-VN.js';
import type { SystemResource } from './en-US.js';
import deviceApprovalViVN from '#extensions/nocobase-device-approval/locales/vi-VN';
import inboxViVN from '#extensions/nocobase-inbox/locales/vi-VN';

/** The Vietnamese copy of what the template ships; see `./en-US.ts`. */
const systemViVN: SystemResource = {
  listFeedback: {
    loading: 'Đang tải',
    empty: 'Chưa có dữ liệu',
    noResults: 'Không có kết quả',
    forbidden: 'Không có quyền truy cập',
    unauthenticated: 'Phiên đăng nhập đã hết hạn',
    failed: 'Không tải được danh sách',
    refreshFailed: 'Làm mới không thành công; đang hiện dữ liệu trước đó',
    retry: 'Thử lại',
    retrying: 'Đang thử lại…',
    clear: 'Xoá bộ lọc',
    signIn: 'Đăng nhập',
  },
  flowDiagram: {
    controls: 'Điều khiển sơ đồ',
    fitView: 'Vừa khung nhìn',
    fullscreen: 'Toàn màn hình',
    exitFullscreen: 'Thoát toàn màn hình',
    escapeHint: 'Nhấn Escape để thoát',
    leavesTo: 'Đi tới',
    arrivesFrom: 'Đến từ',
    otherRoutes: 'Hướng khác',
    minimap: 'Tổng quan sơ đồ',
    configure: 'Cấu hình',
    overview: 'Tổng quan sơ đồ',
    actualSize: 'Kích thước thật',
    states: 'Trạng thái',
    transitions: 'Chuyển trạng thái',
    configurable: 'Tham số',
    current: 'Hiện tại',
    visited: 'Đã qua',
    initial: 'Bắt đầu',
    final: 'Kết thúc',
    state: 'Trạng thái',
    zoomOut: 'Thu nhỏ',
    zoomIn: 'Phóng to',
    fit: 'Vừa khung nhìn',
    empty: 'Không có trạng thái để hiển thị.',
    loading: 'Đang dựng sơ đồ…',
    failed: 'Không dựng được sơ đồ này.',
    nodeHelp: 'Nhấn Enter hoặc Space để chọn một trạng thái.',
    edgeHelp: 'Nhấn Enter hoặc Space để chọn một bước chuyển.',
  },
  settings,
  'auth.preparingSession': 'Đang chuẩn bị phiên làm việc…',
  'auth.connectionFailed': 'Không kết nối được',
  'auth.connectionFailedDescription':
    'Không chuẩn bị được kết nối realtime. Hãy thử lại để vào ứng dụng, hoặc đăng xuất.',
  'auth.passwordResetSuccess':
    'Đã đặt lại mật khẩu. Hãy đăng nhập bằng mật khẩu mới.',
  'auth.requestNewResetLink': 'Yêu cầu đường link đặt lại mới',
  ...deviceApprovalViVN,
  ...inboxViVN,
  'inboxButton.title': 'Hộp thư',
  'inboxButton.pending': 'Hộp thư, {{count}} việc đang chờ',
  'inboxButton.unread': 'Hộp thư, {{count}} chưa đọc',
  'inboxButton.pendingHint':
    '{{count}} việc đang chờ bạn; số này giảm khi bạn xử lý xong.',
  'inboxButton.unreadHint': '{{count}} chưa đọc; số này giảm khi bạn đọc.',
  'auth.welcome': 'Chào mừng trở lại',
  'auth.loginDescription':
    'Đăng nhập bằng tên đăng nhập hoặc email và mật khẩu.',
  'auth.registerTitle': 'Tạo tài khoản',
  'auth.registerDescription': 'Tạo tài khoản để bắt đầu.',
  'auth.registrationAccepted': 'Đã gửi yêu cầu đăng ký',
  'auth.registrationGuidance':
    'Hãy thử đăng nhập bằng tên đăng nhập và mật khẩu vừa gửi. Nếu email này đã có tài khoản thì thông tin mới không có hiệu lực: hãy đăng nhập bằng tài khoản cũ hoặc khôi phục mật khẩu. Nếu ứng dụng yêu cầu xác minh, hãy làm theo hướng dẫn trước khi đăng nhập.',
  'auth.forgotTitle': 'Quên mật khẩu',
  'auth.forgotDescription':
    'Nhập email, chúng tôi sẽ gửi đường link đặt lại nếu tài khoản tồn tại.',
  'auth.passwordResetUnavailable':
    'Chưa bật tự đặt lại mật khẩu. Hãy liên hệ quản trị viên để đặt lại.',
  'auth.capabilityLoadFailed':
    'Không kiểm tra được chức năng đặt lại mật khẩu.',
  'auth.retry': 'Thử lại',
  'auth.loading': 'Đang tải',
  'auth.resetDescription': 'Chọn mật khẩu mới cho tài khoản của bạn.',
  'auth.resetTitle': 'Đặt lại mật khẩu',
  'auth.identifier': 'Tên đăng nhập hoặc email',
  'auth.password': 'Mật khẩu',
  'auth.signIn': 'Đăng nhập',
  'auth.signingIn': 'Đang đăng nhập…',
  'auth.hidePassword': 'Ẩn mật khẩu',
  'auth.showPassword': 'Hiện mật khẩu',
  'auth.forgotLink': 'Quên mật khẩu?',
  'auth.noAccount': 'Chưa có tài khoản?',
  'auth.signUp': 'Đăng ký',
  'auth.createAccount': 'Tạo tài khoản',
  'auth.creatingAccount': 'Đang tạo tài khoản…',
  'auth.name': 'Họ tên',
  'auth.username': 'Tên đăng nhập',
  'auth.email': 'Email',
  'auth.confirmPassword': 'Nhập lại mật khẩu',
  'auth.existingAccount': 'Đã có tài khoản?',
  'auth.passwordMismatch': 'Hai mật khẩu không khớp.',
  'auth.resetting': 'Đang đặt lại…',
  'auth.newPassword': 'Mật khẩu mới',
  'auth.confirmNewPassword': 'Nhập lại mật khẩu mới',
  'auth.invalidResetLink':
    'Đường link đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.',
  'auth.backToSignIn': 'Quay lại đăng nhập',
  'auth.sendResetLink': 'Gửi đường link đặt lại',
  'auth.sending': 'Đang gửi…',
  'auth.resetSent': 'Nếu tài khoản tồn tại, đường link đặt lại đã được gửi.',
  'auth.rememberPassword': 'Nhớ ra mật khẩu?',
  'auth.methods': 'Cách đăng nhập',
  'auth.or': 'Hoặc tiếp tục bằng',
  'auth.continueWith': 'Tiếp tục bằng {provider}',
  'auth.about': 'Về ứng dụng này',
  'auth.platform': 'Cờ vua Dương Sinh · Studio phát triển',
  // Two lines since template 1.0.0-beta.88; the wording stays Dương Sinh's.
  'auth.marketingTitleFirst': 'Agent làm việc, con người',
  'auth.marketingTitleSecond': 'quyết định, chất lượng được giữ.',
  'auth.marketingDescription':
    'Dương Sinh Studio giao việc cho các agent lập trình, theo dõi từng bước từ công việc đến pull request, kiểm tra và review chéo, để chủ dự án chỉ cần nghiệm thu và quyết định.',
  'auth.frontend': 'Đội agent',
  'auth.frontendDescription':
    'Lead agent phân việc, agent viết code, agent khác nhà cung cấp review chéo.',
  'auth.foundation': 'Nền NocoBase',
  'auth.foundationDescription':
    'Dữ liệu, phân quyền và lịch sử thay đổi đáng tin cậy.',
  'auth.marketingFooter': 'Cờ vua Dương Sinh — Studio phát triển nội bộ.',
  'status.loading': 'Đang tải',
  'status.loadingPage': 'Đang tải trang',
  'status.denied': 'Không có quyền truy cập',
  'status.pageFailed': 'Không tải được trang',
  'status.retry': 'Thử lại',
  'navigation.brandHome': 'Trang chủ Dương Sinh Studio',
  'navigation.brandApps': 'Ứng dụng Dương Sinh',
  'routeOverlay.close': 'Đóng',
  'status.deniedDescription': 'Bạn không có quyền truy cập {{label}}.',
  'status.routeFailedDescription':
    'Không tải được trang {{label}} của {{packageName}}.',
  shell: {
    brandPartnership: 'Cờ vua Dương Sinh · <brand>Studio</brand>',
    buildReliableSystems: 'Phát triển nội bộ',
  },
  home: {
    platform: 'Dương Sinh Studio · nền tảng NocoBase',
    title: 'Mô tả nhu cầu, agent sẽ dựng',
    description:
      'Ứng dụng này được phát triển bằng cách trò chuyện với agent lập trình. Hãy nói nhu cầu nghiệp vụ bằng lời thường, agent sẽ viết trang, mô hình dữ liệu, API và quy trình nghiệp vụ trong dự án này.',
    steps: {
      describe: {
        title: 'Mô tả nhu cầu',
        description: 'Nói ai dùng, lưu dữ liệu gì và cần xảy ra điều gì.',
      },
      build: {
        title: 'Để agent dựng',
        description: 'Agent đọc dự án và các tính năng có sẵn, rồi viết code.',
      },
      review: {
        title: 'Kiểm tra và chỉnh',
        description:
          'Tải lại trang để dùng thử, rồi yêu cầu thay đổi theo cách tương tự.',
      },
    },
    example: {
      title: 'Thử một yêu cầu như sau',
      text: 'Xây dựng ứng dụng đơn đặt hàng.\n\nMỗi đơn có số, mặt hàng, người đề nghị, số tiền và trạng thái duyệt. Người đề nghị tạo đơn và chỉ xem đơn của mình; người duyệt xem mọi đơn chờ duyệt và duyệt hoặc từ chối.\nSau khi quyết định, báo cho người đề nghị trong hộp thư kèm đường link tới đơn.',
      hint: 'Dán vào Claude Code, Codex, Cursor hoặc bất kỳ agent lập trình nào đang mở dự án này.',
    },
    capabilitiesTitle: 'Tính năng có sẵn',
    capabilitiesDescription:
      'Agent dùng trực tiếp các tính năng này thay vì tự dựng lại. Mở từng mục để lấy câu lệnh mẫu có thể sửa và sao chép.',
    viewPrompts: 'Xem câu lệnh mẫu ({{count}})',
    prompt: {
      label: 'Câu lệnh',
      hint: 'Sửa câu lệnh cho hợp nghiệp vụ trước khi sao chép. Thay đổi không được lưu sau khi đóng hộp thoại.',
      copy: 'Sao chép',
      copiedShort: 'Đã chép',
      copied: 'Đã sao chép câu lệnh',
      copyFailed: 'Không sao chép được. Hãy chọn đoạn chữ và tự sao chép.',
      reset: 'Khôi phục mặc định',
    },
    capabilities: {
      auth: {
        title: 'Đăng nhập',
        description:
          'Đăng nhập, đăng ký, đặt lại mật khẩu và đăng nhập một lần của công ty.',
        prompts: {
          disableSignUp: {
            label: 'Đóng đăng ký',
            text: 'Ứng dụng này chỉ dành cho nhân viên công ty. Quản trị viên tạo mọi tài khoản.\nTắt tự đăng ký và bỏ đường link đăng ký khỏi trang đăng nhập.\nNhân viên hiện có vẫn phải đăng nhập được bằng tài khoản và mật khẩu.\nGiữ đường link quên mật khẩu.',
          },
          companySso: {
            label: 'SSO công ty',
            text: 'Cho nhân viên đăng nhập bằng nền tảng định danh của công ty qua OIDC.\n\nGiữ đăng nhập bằng tài khoản-mật khẩu và thêm nút Tài khoản công ty.\nNút này mở nền tảng định danh. Đăng nhập thành công thì quay về trang chủ ứng dụng.\n\nCho phép lần đăng nhập đầu tạo tài khoản ứng dụng, nhận diện bằng mã người dùng ổn định của nền tảng.\nKhông tự liên kết tài khoản theo tên hay email. Tài khoản mới dùng quyền mặc định của ứng dụng.\n\nLiệt kê thông tin quản trị viên nền tảng định danh cần cung cấp và địa chỉ callback họ cần đăng ký.',
          },
          apiKeys: {
            label: 'API key',
            text: 'Thêm mục Khoá tích hợp vào menu người dùng, dùng tính năng API key có sẵn của ứng dụng.\nNhân viên chỉ quản lý khoá do mình tạo, nhập mục đích và số ngày hiệu lực.\nChỉ hiện khoá đầy đủ một lần sau khi tạo, kèm nhắc sao chép và cất giữ ngay.\nLiệt kê tên, một đoạn nhận diện, trạng thái, hạn và lần dùng cuối của từng khoá, cho phép thu hồi sau khi xác nhận.\nKhông bao giờ hiện khoá đầy đủ trong danh sách, log hay trang chi tiết.',
          },
        },
      },
      dataSources: {
        title: 'Nguồn dữ liệu',
        description:
          'Chọn cơ sở dữ liệu của ứng dụng và dùng dữ liệu nghiệp vụ từ các cơ sở dữ liệu bên ngoài sẵn có.',
        prompts: {
          postgres: {
            label: 'Đổi cơ sở dữ liệu',
            text: 'Chuyển cơ sở dữ liệu của ứng dụng từ SQLite sang PostgreSQL.\nĐọc thông tin kết nối từ cấu hình chạy của server, không lấy từ mã nguồn.\nGiải thích cần cài driver nào, điền thiết lập nào, và nhắc rằng dữ liệu cũ không tự chuyển sang.',
          },
          externalDatabase: {
            label: 'Cơ sở dữ liệu ngoài',
            text: 'Kết nối cơ sở dữ liệu tài chính sẵn có của công ty làm nguồn dữ liệu ngoài chỉ đọc; không sửa bảng của nó.\nGhép bản ghi theo mã nhà cung cấp và thêm mục Thanh toán vào chi tiết nhà cung cấp, hiện kỳ thanh toán, hạn mức tín dụng và trạng thái thanh toán, có ghi nguồn.\nVẫn đọc thông tin liên hệ nhà cung cấp từ cơ sở dữ liệu của ứng dụng, còn dữ liệu thanh toán đọc thẳng từ cơ sở dữ liệu ngoài, không nhập vào.\nĐọc thông tin đăng nhập kết nối từ cấu hình chạy của server.',
          },
        },
      },
      authorization: {
        title: 'Phân quyền',
        description:
          'Kiểm soát ai mở được trang nào, làm được thao tác nào và thấy được bản ghi nào.',
        prompts: {
          jobs: {
            label: 'Chức danh',
            text: 'Tạo các chức danh Người đề nghị mua hàng và Người duyệt đơn cho ứng dụng.\nNgười đề nghị mua hàng vào được trang đơn hàng và xem các đơn mình đề nghị.\nNgười duyệt đơn vào được trang đơn hàng, xem đơn và duyệt hoặc từ chối đơn đang chờ.\nChỉ quản trị viên ứng dụng được đổi quyền và phân công.\nDùng tính năng phân quyền có sẵn để quản trị viên chỉnh quyền và phân người sau này.',
          },
          dataScopes: {
            label: 'Phạm vi dữ liệu',
            text: 'Cho người đề nghị mua hàng chỉ xem đơn của mình, xác định theo trường người đề nghị của đơn.\nNgười duyệt đơn xem được mọi đơn và xử lý các đơn chờ duyệt.\nQuản trị viên chỉnh được phạm vi xem đơn của từng chức danh trong bộ quyền của nó.',
          },
          restrictions: {
            label: 'Giới hạn',
            text: 'Bob đang tạm hỗ trợ duyệt đơn mua hàng và chỉ được xem đơn từ 2.000 trở xuống.\nThêm giới hạn số tiền vào thao tác Xem đơn của anh ấy, giữ nguyên chức danh và phạm vi dữ liệu hiện có.\nÁp giới hạn cho cả đơn của chính anh ấy và đơn được chia sẻ với anh ấy.\nQuản trị viên đổi được số tiền hoặc bỏ quy tắc; trước khi bỏ, hãy giải thích rằng phạm vi anh ấy thấy có thể rộng ra.',
          },
        },
      },
      workflow: {
        title: 'Quy trình',
        description:
          'Đưa bản ghi nghiệp vụ qua các giai đoạn, có chờ, hết hạn, thử lại và lịch sử ai đã làm gì.',
        prompts: {
          stages: {
            label: 'Giai đoạn',
            text: 'Thêm quy trình cho đơn mua hàng: Chờ duyệt → Chờ mua → Đã nhận hàng → Hoàn thành.\nNgười duyệt duyệt hoặc từ chối; từ chối phải có lý do và trả đơn về người đề nghị để sửa và gửi lại.\nSau khi người mua đặt hàng, đơn ở trạng thái chờ mua; xác nhận giao hàng kèm biên nhận có chữ ký thì chuyển sang Đã nhận hàng, và người đề nghị xác nhận thì hoàn thành.\nChi tiết đơn chỉ cho các thao tác của giai đoạn hiện tại, và sửa thông thường không đổi được giai đoạn.\nKiểm tra giai đoạn và thông tin bắt buộc trên server, không bao giờ ghi đè kết quả người khác đã gửi.',
          },
          backgroundExport: {
            label: 'Xuất dữ liệu nền',
            text: 'Thêm trang báo cáo đơn hàng, xuất các đơn hiện có ra CSV.\nSau khi gửi, yêu cầu xuất chờ xử lý, được tạo ở nền và hoàn tất kèm đường link tải.\nHiện giai đoạn hiện tại, tên tệp, số đơn đã xuất, cùng lịch sử gửi và xử lý của hệ thống.\nThử lại theo quy tắc khi tạo tệp lỗi, giữ lần lỗi cuối cho người phụ trách xử lý; chạy lại không được tạo trùng tệp báo cáo.\nGiữ tiến độ và kết quả sau khi tải lại trang, và chỉ người có quyền mới xuất được đơn.',
          },
          history: {
            label: 'Lịch sử',
            text: 'Hiện giai đoạn hiện tại và lịch sử xử lý trong chi tiết đơn.\nMỗi mục cho biết ai làm, lúc nào, thao tác gì, giai đoạn trước và sau, kèm lý do từ chối hoặc biên nhận có chữ ký nếu có.\nĐánh dấu các thao tác tự động là do hệ thống làm.\nGiữ tiến độ và lịch sử sau khi tải lại trang để xem lại toàn bộ quy trình khi đã xong.',
          },
        },
      },
      scheduler: {
        title: 'Tác vụ định kỳ',
        description:
          'Chạy công việc nghiệp vụ theo giờ đặt sẵn, xem lần chạy tới và kết quả.',
        prompts: {
          reminder: {
            label: 'Nhắc hằng ngày',
            text: 'Thêm lời nhắc Đơn chờ duyệt vào ứng dụng đơn hàng hiện có.\n\nLúc 09:00 giờ Việt Nam mỗi ngày làm việc, tìm các đơn đang chờ duyệt, nhóm theo người duyệt và gửi cho mỗi người một thông báo trong ứng dụng.\nGhi số đơn đang chờ và đường link tới danh sách đơn chờ. Không có đơn chờ thì không gửi gì.\nQuản trị viên xem được lịch, lịch sử chạy, và tạm dừng hoặc bật lại lời nhắc.',
          },
          weeklyReport: {
            label: 'Báo cáo tuần',
            text: 'Lúc 08:00 giờ Việt Nam mỗi thứ Hai, tạo bản tổng hợp doanh số tuần trước và báo cho trưởng phòng kinh doanh.\nGồm doanh thu, số đơn và tổng theo khu vực. Quản trị viên xem được tác vụ và lịch sử chạy.',
          },
        },
      },
      notification: {
        title: 'Thông báo',
        description:
          'Gửi tin nhắn trong ứng dụng, email hoặc tin nhắn bot nhóm khi có sự kiện.',
        prompts: {
          inApp: {
            label: 'Tin nhắn trong ứng dụng',
            text: 'Thêm duyệt đơn hàng vào ứng dụng hiện tại và báo kết quả cho người đề nghị bằng tin nhắn trong ứng dụng.\n\nĐơn gồm số, tên, người đề nghị, số tiền và trạng thái duyệt.\nNgười đề nghị xem được đơn của mình. Người duyệt xem đơn chờ duyệt và duyệt hoặc từ chối. Dùng lại tính năng đơn hàng và duyệt nếu đã có.\n\nSau khi duyệt hoặc từ chối, chỉ gửi một tin nhắn cho người đề nghị của đơn.\nTiêu đề cho biết đơn được duyệt hay bị từ chối. Nội dung gồm số đơn, tên và kết quả duyệt.\nBấm vào tin nhắn thì mở chi tiết đơn tương ứng.\nKhông gửi khi đơn còn chờ duyệt. Mỗi kết quả duyệt chỉ báo một lần.\nGửi thông báo lỗi cũng không ảnh hưởng kết quả duyệt đã lưu.',
          },
          email: {
            label: 'Email',
            text: 'Thêm email vào thông báo duyệt đơn hiện có, dùng kênh email đã cấu hình của ứng dụng.\n\nSau khi đơn được duyệt hoặc bị từ chối, gửi kết quả tới email tài khoản của người đề nghị.\nTiêu đề có số đơn, nội dung có tên đơn và kết quả.\nGiữ tin nhắn trong ứng dụng hiện có. Người đề nghị không có email thì chỉ gửi tin nhắn trong ứng dụng.\nGửi email lỗi không được ảnh hưởng kết quả duyệt hay tin nhắn trong ứng dụng.',
          },
        },
      },
      mail: {
        title: 'Thư điện tử',
        description:
          'Kết nối hộp thư cá nhân, rồi đọc, trả lời và gửi email công việc.',
        prompts: {
          providers: {
            label: 'Nhà cung cấp thư',
            text: 'Cấu hình mailbox.org cho ứng dụng trong mục mail.providers của cấu hình server:\n- Máy chủ nhận IMAP: imap.mailbox.org, cổng 993, SSL/TLS.\n- Máy chủ gửi SMTP: smtp.mailbox.org, cổng 465, SSL/TLS.\nNgười dùng tự nhập địa chỉ email, tên đăng nhập và mật khẩu của mình ở trang tài khoản hộp thư, và chọn ngày bắt đầu đồng bộ lần đầu; không bao giờ ghi mật khẩu hộp thư vào cấu hình hay mã nguồn.',
          },
          mailCenter: {
            label: 'Trung tâm thư',
            text: 'Thư điện tử đã có sẵn trong ứng dụng này; hãy dùng lại thay vì dựng lại hay cài plugin khác.\nThêm các trang Trung tâm thư và Tài khoản hộp thư vào thanh điều hướng, dùng trang làm việc với thư và trang tài khoản hộp thư mà tính năng thư cung cấp.\nNgười dùng kết nối được hộp thư của mình, đồng bộ thư đến, đọc thư và tệp đính kèm, và trả lời, giữ tiêu đề và ngữ cảnh cuộc trao đổi gốc, gửi trả lời tới người gửi ban đầu.\nMỗi người làm việc với hộp thư mình đã kết nối.',
          },
          correspondence: {
            label: 'Email khách hàng',
            text: 'Thêm mục thư từ vào chi tiết khách hàng, dùng lại các thành phần đọc và soạn thư có sẵn của ứng dụng.\nHiện các thư có người gửi hoặc người nhận trùng email liên hệ của khách hàng hiện tại. Nhân viên kinh doanh đọc được thư, xem tệp đính kèm và trả lời bằng hộp thư mình đã kết nối.',
          },
        },
      },
      file: {
        title: 'Tệp',
        description:
          'Tải tệp lên, đính kèm vào bản ghi, xem trước hoặc tải về.',
        prompts: {
          attachments: {
            label: 'Tệp đính kèm',
            text: 'Thêm tệp đính kèm mua hàng vào ứng dụng quản lý đơn hiện có của tôi.\n\nThêm vùng đính kèm vào chi tiết đơn. Mỗi đơn có thể có nhiều tệp, gồm PDF, ảnh và DOCX.\nHiện tên và dung lượng tệp, có thao tác xem trước, tải về và gỡ tệp.\nSau khi tải lên, cho người dùng lưu tệp vào đơn hiện tại. Mở lại đơn vẫn còn tệp.\nAi truy cập được đơn thì xem và tải được tệp của đơn. Người đề nghị và người duyệt thêm hoặc gỡ được tệp.\nGỡ tệp chỉ bỏ liên kết với đơn hiện tại; vẫn giữ tệp.',
          },
          avatar: {
            label: 'Ảnh đại diện',
            text: 'Thêm ảnh đại diện cho mỗi nhân viên, mỗi người một ảnh.\nCho tải lên và thay ảnh đại diện, hiện ảnh trong danh sách và chi tiết nhân viên.\nDùng ảnh mới sau khi thay và vẫn hiện sau khi tải lại trang.',
          },
        },
      },
      i18n: {
        title: 'Ngôn ngữ',
        description:
          'Đổi ngôn ngữ giao diện, thêm ngôn ngữ và đặt ngôn ngữ mặc định.',
        prompts: {
          addLanguage: {
            label: 'Thêm ngôn ngữ',
            text: 'Thêm tiếng Tây Ban Nha vào ứng dụng của tôi. Dịch giao diện và thông báo của server, và thêm tiếng Tây Ban Nha vào menu ngôn ngữ.',
          },
          defaultLanguage: {
            label: 'Ngôn ngữ mặc định',
            text: 'Đặt tiếng Việt làm ngôn ngữ mặc định của ứng dụng cho người chưa chọn ngôn ngữ. Vẫn giữ tiếng Anh trong menu ngôn ngữ.',
          },
        },
      },
      theme: {
        title: 'Giao diện',
        description:
          'Chỉnh màu, phông chữ và độ dày đặc, chuyển giữa sáng và tối.',
        prompts: {
          changeTheme: {
            label: 'Đổi giao diện',
            text: 'Cập nhật giao diện Gọn: dùng màu xanh dương làm màu chính và tăng nhẹ độ bo góc. Giữ phông chữ, cỡ chữ và khoảng cách gọn hiện tại.',
          },
          newTheme: {
            label: 'Giao diện mới',
            text: 'Tạo giao diện Rừng xanh với màu chính xanh lá, nền dịu, bo góc vừa phải và bóng đổ nhẹ.',
          },
        },
      },
    },
  },
  appearance: {
    title: 'Giao diện',
    mode: 'Chế độ màu',
    preset: 'Kiểu giao diện',
    light: 'Sáng',
    dark: 'Tối',
    system: 'Theo hệ thống',
    themes: {
      default: 'Thoáng',
      compact: 'Gọn',
    },
  },
  app: {
    title: 'Dương Sinh Studio',
  },
  actions: {
    close: 'Đóng',
    save: 'Lưu',
    cancel: 'Huỷ',
    confirm: 'Xác nhận',
    language: 'Ngôn ngữ',
  },
  notices: {
    serverLocaleFallback:
      'Server chưa hỗ trợ ngôn ngữ này nên thông báo từ server sẽ dùng tiếng Anh.',
    languageChangeFailed: 'Không đổi được ngôn ngữ. Hãy thử lại.',
  },
  account: {
    signOutFailed: 'Không đăng xuất được. Hãy thử lại.',
    openMenu: 'Mở menu tài khoản',
    fallback: 'Tài khoản',
    signOut: 'Đăng xuất',
    signingOut: 'Đang đăng xuất…',
  },
  navigation: {
    home: 'Trang chủ',
    open: 'Mở thanh điều hướng',
    close: 'Đóng thanh điều hướng',
    expand: 'Mở rộng thanh điều hướng',
    collapse: 'Thu gọn thanh điều hướng',
    toggle: 'Mở rộng hoặc thu gọn thanh điều hướng',
    label: 'Điều hướng ứng dụng',
    description: 'Đi tới một trang của ứng dụng.',
    breadcrumb: 'Đường dẫn',
    breadcrumbMore: 'Hiện các cấp ở giữa',
    back: 'Quay lại',
  },
  dataTable: {
    noResults: 'Không có kết quả',
    sortAscending: 'Tăng dần',
    sortDescending: 'Giảm dần',
    hideColumn: 'Ẩn',
    view: 'Hiển thị',
    toggleColumns: 'Ẩn/hiện cột',
    selectedCount: 'Đã chọn {{selected}}/{{total}} dòng.',
    rowsPerPage: 'Số dòng mỗi trang',
    pageOf: 'Trang {{page}}/{{pageCount}}',
    firstPage: 'Tới trang đầu',
    previousPage: 'Tới trang trước',
    nextPage: 'Tới trang sau',
    lastPage: 'Tới trang cuối',
  },
  datePicker: {
    placeholder: 'Chọn ngày',
    rangePlaceholder: 'Chọn khoảng ngày',
  },
  formFeedback: {
    field: 'Giá trị này không hợp lệ. Hãy kiểm tra rồi thử lại.',
    invalid: 'Hãy kiểm tra các ô được đánh dấu rồi thử lại.',
    failed: 'Không lưu được. Nội dung bạn nhập vẫn được giữ. Hãy thử lại.',
    network:
      'Không kết nối được. Hãy kiểm tra mạng rồi thử lại. Nội dung bạn nhập vẫn được giữ.',
    denied:
      'Với quyền hiện tại bạn không gửi được biểu mẫu này. Nội dung bạn nhập vẫn được giữ.',
  },
};

export default systemViVN;
