// Glossary rewording of the plugins' own vi-VN (docs/thuat-ngu.md): the shipped Vietnamese is machine-translated
// ("Vấn đề" for issue, "Tác nhân"/"đại lý" for agent, "Người thi hành án" for executor). Regenerate after a plugin upgrade.
import type { TranslationOverrides } from '@nocobase/i18n';

const overrides: TranslationOverrides = {
  '@nocobase/app-plugin-agent-sessions': {
    navigation: {
      agentSessions: 'Agent trên máy tôi',
    },
    list: {
      title: 'Agent trên máy tôi',
      empty:
        'Chưa có phiên nào. Bắt đầu một cuộc nói chuyện với một agent trên máy tính của bạn.',
    },
    links: {
      startHint: 'Agent trong runner có kế hoạch và thực hiện công việc.',
    },
    newSession: {
      settingsFailed: 'Không thể tải cài đặt agent.',
      settingsReset: 'Sử dụng mặc định của agent',
      settingsUnsupported:
        'Agent này không hiển thị cài đặt. Mặc định của nó sẽ được sử dụng.',
      settingsEmpty:
        'Agent này không có cài đặt có thể định cấu hình. Mặc định của nó sẽ được sử dụng.',
      noAgent: 'Không có agent',
      accessHint:
        'Các agent chạy với toàn quyền truy cập vào thư mục bạn chọn, như trong thiết bị đầu cuối của riêng bạn.',
      noComputerHint:
        'Phiên chạy trên máy tính của riêng bạn: nhân viên làm việc ở đó đã đăng nhập bằng tài khoản của chính bạn, trong các thư mục bạn cho phép và các cuộc hội thoại được lưu giữ ở đây. Kết nối nó một lần và nó trực tuyến bất cứ khi nào máy tính bật. Đại diện của tôi giúp thảo luận và làm rõ các yêu cầu, ghi lại các nhiệm vụ và theo dõi tiến độ; sau khi bạn khởi động chúng, người quản lý dự án của Studio sẽ điều phối các agent để phát triển chúng.',
      noAgentTitle: 'Không có agent nào sẵn sàng trên máy tính này',
      agents: 'Agent trên máy tính này',
      availableAgents: 'Agent có sẵn',
      agentsHint:
        'Chỉ các agent được cài đặt mới được liệt kê. Cây cầu kiểm tra từng phút; quá trình thiết lập và khởi động phải hoàn tất trước khi agent sẵn sàng.',
    },
    session: {
      startup: {
        starting: 'Khởi động agent trên máy tính của bạn…',
        opening: 'Khai mạc phiên agent…',
      },
      agent: 'Agent',
    },
    computers: {
      description:
        'Những máy tính này chỉ chạy các phiên của riêng bạn và các agent hoạt động như bạn. Các máy chạy công việc nền của nhóm được quản lý riêng.',
      recheckHint:
        'Trong khi được kết nối, cầu nối sẽ tự động kiểm tra lại các agent mỗi phút.',
      steps: {
        agent: 'Cài đặt agent mã hóa và đăng nhập vào nó',
      },
    },
  },
  '@nocobase/app-plugin-agents': {
    agents: {
      title: 'Agent',
      description:
        'Thêm agent từ các mô hình do runner báo cáo. Lead Agent giao từng bước của công việc cho agent có mô tả phù hợp.',
      fromRunners: 'Agent từ runner',
      filterLabel: 'Hiển thị agent',
      filters: {
        unreported: 'Không có runner {{count}}',
      },
      loadFailed: 'Không thể tải các agent',
      emptyTitle: 'Chưa có agent',
      emptyDescription:
        'Kết nối runner có công cụ lập trình đã đăng nhập, rồi thêm agent từ “Các mô hình khả dụng”.',
      noneInFilter: 'Không có agent ở đây.',
      howToAdd:
        'Để thêm agent, hãy cài đặt công cụ lập trình trên runner và đăng nhập để sử dụng mô hình khả dụng. Sau khi runner báo cáo mô hình, hãy thêm agent từ “Các mô hình khả dụng” và mô tả thế mạnh của agent. Agent được bật ngay khi thêm. Agent chỉ có trên runner cá nhân chỉ xử lý các công việc do chủ sở hữu runner đó bắt đầu.',
      columns: {
        agent: 'Agent',
      },
      where: {
        none: 'Không có runner',
        personal_one: 'Runner cá nhân {{count}} trực tuyến',
        noneOnline: 'Hiện tại không có runner nào trực tuyến',
      },
      state: {
        unreported: 'Không có runner',
      },
      enable: {
        noRunnerNow: 'Hiện tại không có runner nào có nó trực tuyến.',
        personalOnly:
          'Chỉ những runner bộ cá nhân mới có nó: Lead Agent giao nó chỉ giải quyết các công việc mà chủ sở hữu của họ bắt đầu.',
      },
      available: {
        description:
          'Chỉ những công cụ được chọn trên runner mới được phát hiện và xuất hiện ở đây. Các tổ hợp được ứng dụng đề xuất sẽ tự tạo và tự bật ngay khi một runner báo cáo chúng; hãy thêm agent từ bất kỳ tổ hợp nào khác.',
        setupCommand: 'Chạy {{command}} trên runner.',
      },
    },
    agentTypes: {
      label: 'Loại agent',
      question: 'Agent kiểu gì thế?',
      runner: 'Runner',
      onlineHint:
        'Câu trả lời trong vài giây trên máy chủ thông qua dịch vụ mẫu. Không cần runner; nó không thể chạm vào mã.',
      runnerHint:
        'Điều khiển công cụ mã hóa trong runner và hoạt động trong thư mục đang hoạt động: mã, tệp, lệnh.',
      immutable:
        'Một agent giữ nguyên loại của nó; tạo một agent khác cho loại khác.',
      noneOfType: 'Không có agent thuộc loại này.',
    },
    agentSkills: {
      title: 'Skill',
      description:
        'Hướng dẫn sử dụng mà agent đọc khi một nhiệm vụ phù hợp với mô tả của họ. Được đặt trong thư mục làm việc của nó trước mỗi lần chạy.',
      manage: 'Quản lý skill',
      placeholder: 'Chọn skill',
      empty: 'Chưa có skill.',
      save: 'Lưu skill',
      descriptionOnline:
        'Hướng dẫn agent đọc khi tác vụ khớp với mô tả của họ, trong hộp cát chỉ đọc trên máy chủ.',
      onlineScripts:
        'Các tập lệnh không được thực thi cho các agent trực tuyến: agent có thể đọc chúng chứ không thể chạy chúng.',
    },
    brief: {
      platformNote:
        'Quy tắc nền tảng được gửi bằng tiếng Anh; agent vẫn trả lời bằng ngôn ngữ của bạn.',
      agentPrompt: 'Lời nhắc của agent (do bạn viết)',
      noAgentPrompt: 'Agent này không có lời nhắc riêng.',
      previewPlaceholders:
        'Các ghi chú trong ngoặc về runner được điền vào bởi runner chạy nó: các thư mục làm việc của nó và lời nhắc khởi tạo của các thư mục mà nó vừa chuẩn bị.',
      placeholders:
        'Trình giữ chỗ {{runner.…}} được điền vào bởi runner chạy nó: các thư mục làm việc của nó và lời nhắc khởi tạo của các thư mục mà nó vừa chuẩn bị.',
      layers: {
        agent: 'Lời nhắc của agent',
      },
    },
    envVars: {
      description:
        'Được chuyển đến công cụ mã hóa trong mỗi lần chạy và được ẩn trong các bản ghi lần chạy; các giá trị không được hiển thị lại sau khi lưu. Bất kỳ ai có thể sử dụng agent dùng chung đều có thể nhận các giá trị này trên máy tính của riêng họ; đánh dấu các bí mật có rủi ro cao "Chỉ runner của nhóm".',
      teamRunnersOnly: 'Chỉ runner của nhóm',
      teamRunnersOnlyHint:
        'Nếu không có nó, một lần chạy sẽ gửi giá trị đến runner thực hiện nó, bao gồm cả runner cá nhân của bất kỳ ai có thể sử dụng agent. Với nó, chỉ có runner nhóm mới thực hiện các lần chạy có biến này.',
      teamRunnersOnlyBadge: 'Chỉ runner của nhóm',
      fromRunner: 'Lấy từ runner',
      fromRunnerHint:
        'Không có giá trị nào được giữ ở đây: runner thực hiện một lần chạy cung cấp giá trị đó từ máy của chính nó, được đặt ở đó bằng {{command}} hoặc được truyền bằng `--pass-env`. Một runner không cung cấp nó sẽ không chạy được trước khi bắt đầu.',
      fromRunnerBadge: 'Từ runner',
      valueRequired: 'Nhập một giá trị hoặc tiếp tục lấy giá trị đó từ runner.',
      runner: 'Runner {{id}}',
    },
    scopeVariables: {
      description:
        'Trao cho mọi đặc vụ làm việc ở đây. Các biến cụ thể hơn (của thư mục làm việc, sau đó của agent) sẽ vượt qua được những biến này.',
    },
    usage: {
      otherUse: {
        description:
          'Mô hình gọi các hoạt động agent bên ngoài, chẳng hạn như lập chỉ mục và tìm kiếm cơ sở tri thức.',
      },
      description:
        'Agent nào đang chạy đã được sử dụng và giá của chúng ở mức giá mẫu hiện tại.',
      filters: {
        agent: 'Agent',
        allAgents: 'Tất cả agent',
      },
      groups: {
        agent: 'Agent',
        type: 'Loại agent',
      },
    },
    defaultSkills: {
      title: 'Skill mặc định',
      description: 'Mọi đặc vụ làm việc ở đây đều có những skill này.',
      save: 'Lưu skill',
      saved: 'Đã lưu các skill mặc định.',
    },
    runs: {
      unknownAgent: 'Agent',
      filters: {
        agent: 'Agent',
        allAgents: 'Tất cả agent',
      },
      briefDescription:
        'Những gì agent đã được thông báo khi lần chạy này được yêu cầu lần cuối.',
      workspaceReset: {
        description:
          'Lần chạy tiếp theo bắt đầu từ lần thanh toán mới và được đưa ra lời nhắc khởi tạo lại. Những thay đổi không được đẩy sẽ bị mất trong runner đó. Một thư mục được sử dụng tại chỗ sẽ không bao giờ bị xóa.',
      },
    },
    transcript: {
      waiting: 'Đang chờ agent bắt đầu…',
      pendingInputs_one: '{{count}} bình luận chờ agent',
      pendingInputs_other: '{{count}} bình luận chờ agent',
      inputDelivered_one: 'Giao cho agent',
      inputDelivered_other: 'Đầu vào {{count}} được gửi tới agent',
      kinds: {
        text: 'Agent',
      },
    },
    failures: {
      runnerOfflineBeforeStart: 'Runner ngoại tuyến trước khi bắt đầu chạy.',
      runnerOffline: 'Runner ngoại tuyến.',
      leaseExpired: 'Runner đã ngừng báo cáo.',
      startTimeout: 'Runner không bắt đầu chạy đúng lúc.',
      idleTimeout: 'Agent ngừng tiến triển.',
      cliUnavailable: 'Runner không thể cài đặt ứng dụng CLI.',
      toolAuth: 'Công cụ mã hóa không được đăng nhập trong runner.',
      queuedExpired: 'Không có runner nào được thực hiện kịp thời.',
      modelUnavailable: 'Không có mô hình của agent.',
      policyRefused:
        'Không có chính sách nào của runner cho phép nó thực hiện công việc này.',
      prepareNetwork:
        'Runner không thể tiếp cận máy chủ lưu trữ trong khi chuẩn bị chạy.',
    },
    runtimes: {
      quota: {
        queueHint:
          'Một agent đạt hạn ngạch vẫn có thể được chọn. Công việc sẽ xếp hàng với thời hạn chờ đợi hiện có.',
        runColumns: {
          issue: 'Công việc/cuộc trò chuyện',
          agent: 'Agent',
        },
        hint: 'Thời gian đặt lại đã biết sẽ tự động khôi phục tính đủ điều kiện. Đối với các lần đặt lại không xác định, hãy khôi phục hạn ngạch và xóa dấu. Chỉ chủ sở hữu runner và quản trị viên mới có thể xóa điểm.',
      },
      workspaces: {
        oldRunner: 'Runner này chưa cung cấp lý do chẩn đoán',
        decision: {
          ownershipUnknown:
            'Không thể xác nhận: không thể xác minh quyền sở hữu của runner',
        },
      },
      title: 'Runner',
      description: 'Runner chạy agent và từng công cụ mã hóa được báo cáo.',
      add: 'Thêm runner',
      loadFailed: 'Không thể tải runner',
      emptyTitle: 'Chưa có runner nào được kết nối',
      emptyDescription:
        'Sau khi runner được kết nối, các agent chạy sẽ đảm nhận công việc ở đó bằng các công cụ mã hóa của nó.',
      noneConnected: 'Không có runner nào được kết nối.',
      revokedList_one: '{{count}} đã thu hồi runner',
      revokedList_other: '{{count}} đã thu hồi runner',
      policy: {
        description:
          'Chủ sở hữu runner cho phép nó lấy những gì, như đã báo cáo. Nó được thay đổi trên máy chứ không phải ở đây.',
        agents: 'Agent',
      },
      variables: {
        description:
          'Các biến mà nó cung cấp để chạy lấy chúng từ runner, theo tên; các giá trị vẫn còn trên máy. Đặt một cái ở đó với `nocobase-runner env set NAME` hoặc chuyển nó bằng `--pass-env NAME`.',
        none: 'Không: một lần chạy lấy một biến từ runner không thành công ở đây trước khi nó bắt đầu.',
        unknown:
          'Không được báo cáo: nhân vật chạy của nó cũ hơn tính năng này. Cập nhật runner để xem chúng.',
      },
      jobs: {
        hint: 'Bản dựng và các bước khác mà ứng dụng này định cấu hình, chạy mà không cần mô hình. Báo cáo runner này: {{kinds}}.',
        unsupported:
          'Runner của runner này không nhận công việc. Cập nhật runner để bật tính năng này.',
      },
      columns: {
        version: 'Runner',
      },
      upgradeRequired: {
        title: 'Runner này cần nâng cấp',
        older:
          'Runner {{version}} của nó nói giao thức agent {{protocol}}; ứng dụng này cần giao thức {{required}}. Nó vẫn được kết nối nhưng không chạy gì cho đến khi được cập nhật.',
        newer:
          'Runner {{version}} của nó nói giao thức agent {{protocol}}, mới hơn ứng dụng này (giao thức {{required}}). Nó vẫn được kết nối nhưng không chạy gì cho đến khi chạy một runner mà ứng dụng này phục vụ.',
        noLatest:
          'Cài đặt runner nói giao thức {{required}} hoặc chạy runner này trên máy chủ của nó để cập nhật:',
        reinstall:
          'Runner của nó không nói nó được cài đặt như thế nào. Cài đặt lại nó trên máy chủ của nó bằng lệnh từ Thêm runner.',
      },
      tool: {
        offHint:
          'Tắt: công việc cho công cụ này không được gửi tới runner này.',
      },
      trust: {
        ownerOnlyHint:
          'Chỉ chạy công việc bạn bắt đầu. Giá trị mặc định cho runner mà bạn thêm vào.',
        personalOnly:
          'Runner này sẽ mang tính cá nhân: nó chỉ chạy công việc bạn bắt đầu. Bạn có thể chia sẻ nó với nhóm sau.',
      },
      share: {
        description:
          'Các lần chạy của người khác sẽ chạy trong runner này, với các biến và bí mật của họ, đồng thời có thể đọc nội dung trên đó. Chỉ chia sẻ nó nếu điều đó tốt.',
      },
      edit: {
        slotsHint: 'Runner mất bao nhiêu lần cùng một lúc.',
      },
      upgrade: {
        hint: 'Nó tự cập nhật khi không có agent nào đang chạy. Để cập nhật nó ngay bây giờ, hãy chạy cái này trên máy chủ của nó.',
      },
      revoke: {
        description:
          'Á hậu của nó dừng lại ở yêu cầu tiếp theo và các lần chạy của nó quay trở lại hàng đợi. Để kết nối lại, hãy thêm lại runner.',
      },
      delete: {
        description:
          'Runner bị thu hồi sẽ bị xóa khỏi danh sách. Quá khứ của nó chạy ở lại.',
      },
    },
    connect: {
      title: 'Thêm runner',
      description:
        'Chạy lệnh bên dưới trên máy chủ đã cài đặt công cụ mã hóa: máy chủ, VM hoặc thiết bị của riêng bạn. Các tác nhân chạy ở đó với toàn quyền truy cập, với tư cách là người dùng chạy runner, đồng thời có thể đọc và thay đổi bất kỳ thứ gì mà người dùng có thể, bao gồm cả khóa SSH và các thông tin xác thực khác. Runner không phải là ranh giới bảo mật: chạy nó với tư cách là người dùng chuyên dụng, trong vùng chứa hoặc trong máy ảo.',
      run: 'Chạy cái này trên máy chủ đó. Nó tải xuống runner (nocobase-runner) và CLI của ứng dụng này từ ứng dụng này, đăng ký runner và khởi động nó khi đăng nhập:',
      tokenOnce:
        'Lệnh mang thông tin xác thực một lần cho runner "{{trust}}". Nó hoạt động một lần, cho đến {{time}}.',
      after:
        'Trong vài giây, runner xuất hiện trong danh sách, với mỗi công cụ mã hóa được tìm thấy…',
      toolsHint:
        'Runner này chỉ được cung cấp cho các công cụ đã được kiểm tra. Bạn có thể thay đổi nó trên trang Runtimes bất cứ lúc nào.',
      slotsHint:
        'Runner mất bao nhiêu lần cùng một lúc. Bạn có thể thay đổi nó trên trang Runtimes bất cứ lúc nào.',
    },
    chat: {
      availability: {
        noRunner: 'Không có runner trực tuyến, không thể chọn',
      },
      offline: {
        fallbackDone: 'Cuộc trò chuyện này hiện sử dụng một agent khác',
      },
      notice: {
        switchedToOnline:
          '{{own}} hiện không có runner nào dành cho bạn, vì vậy {{name}} sẽ trả lời cho đến khi {{own}} quay trở lại.',
        onlineFallbackUnavailable:
          'Agent dự phòng trực tuyến không thể trả lời ({{reason}}). Cuộc trò chuyện này vẫn ở lại với {{own}} trong khi chờ runner.',
      },
      consultation: {
        unavailableTitle: 'Agent được tư vấn không có sẵn',
      },
      agents: {
        hint: 'Liệt kê các agent được kích hoạt và cho biết lý do tại sao hiện tại người ta không thể trả lời bạn. Các câu trả lời chạy theo trình tự: câu trả lời đầu tiên đợi một người nhận, thường là vài giây.',
        chooseFor: 'Chọn agent',
        empty: 'Không có agent nào bạn có thể chọn',
        none: 'Không có agent',
        placeholder: 'Chọn agent',
      },
    },
    chatProfile: {
      loadFailed: 'Không thể tải cài đặt agent của bạn',
      defaultAgent: 'Agent trò chuyện mặc định của tôi',
      saved: 'Đã lưu agent trò chuyện mặc định',
    },
    models: {
      description:
        'Các dịch vụ mô hình gọi agent trực tuyến và các mô hình mà mỗi dịch vụ cung cấp: mô hình trò chuyện cho các agent, mô hình nhúng và xếp hạng lại để tìm kiếm.',
    },
    defaultModel: {
      description:
        'Các agent trực tuyến không có mô hình trả lời riêng của họ với nó, chẳng hạn như một agent mới hoặc một agent đi kèm với ứng dụng.',
    },
    services: {
      empty: {
        description:
          'Sau khi bạn thêm dịch vụ mẫu, các agent trực tuyến có thể trả lời thông qua dịch vụ đó.',
      },
      service: {
        enabledHint:
          'Các agent trực tuyến chỉ có thể sử dụng các mô hình của nó khi nó đang bật.',
        deleteDescription:
          'Các agent sử dụng mô hình của nó sẽ ngừng trả lời cho đến khi họ được cung cấp một mô hình khác và giá mô hình của nó sẽ bị xóa.',
      },
      models: {
        description:
          'Kiểm tra các mô hình mà dịch vụ này cung cấp và cho biết mỗi mô hình dùng để làm gì: mô hình trò chuyện trả lời agent, mô hình nhúng văn bản chỉ mục cho tìm kiếm, sắp xếp lại mô hình theo thứ tự kết quả tìm kiếm. Một mô hình nhúng có thể yêu cầu các vectơ có kích thước.',
      },
    },
    skills: {
      globalMountDescription:
        'Lưu ngay lập tức. Tất cả các lần chạy trong tương lai đều nhận được skill này.',
      title: 'Skill',
      new: 'Skill mới',
      newTitle: 'Skill mới',
      newDescription:
        'Viết SKILL.md: tên đầu của nó và mô tả skill. Thêm tập tin ngay bây giờ hoặc sau này.',
      breadcrumb: 'Skill',
      loadFailed: 'Không thể tải skill',
      backToList: 'Trở lại skill',
      emptyTitle: 'Chưa có skill',
      emptyDescription:
        'Sau khi bạn thêm một skill, các đặc vụ sẽ đọc SKILL.md của nó bất cứ khi nào có nhiệm vụ yêu cầu.',
      emptyReadOnly: 'Yêu cầu quản trị viên thêm một skill.',
      contentHint:
        'Tên của vấn đề phía trước là tên thư mục của skill: thay đổi nó sẽ đổi tên skill. Mô tả cho các agent biết khi nào nên đọc nó.',
      emptyContent: 'Skill này chưa có nội dung.',
      created: 'Tạo ra skill "{{name}}"',
      deleted: 'Đã xóa skill "{{name}}".',
      delete: 'Xóa skill',
      deleteTitle: 'Xóa skill "{{name}}"?',
      deleteDescription:
        'Mọi đặc vụ và mọi nơi sử dụng skill này làm mặc định đều sẽ mất nó.',
      readOnly:
        'Chỉ người tạo skill và quản trị viên không gian làm việc mới có thể thay đổi skill này.',
      conflict:
        'Người khác vừa thay đổi skill này. Phiên bản mới nhất đã được tải; thử lại.',
      conflictTitle: 'Có người khác vừa thay đổi skill này',
      mountedAgents: 'Agent kèm theo',
      noAgents: 'Chưa gắn bó với bất kỳ agent nào.',
      defaults: 'Skill mặc định của: {{places}}.',
      skillTooLarge: 'Một skill có tối đa {{max}}.',
      tooManyFiles: 'Một skill có thể giữ được hầu hết các tệp {{max}}.',
      scriptsNote:
        'Có tập lệnh: agent trực tuyến có thể đọc chúng nhưng không bao giờ chạy chúng',
      imported: 'Nhập skill "{{name}}".',
      tree: {
        label: 'Tệp skill',
      },
      entry: {
        root: 'Thư mục skill (/)',
        conventional: {
          scripts: 'Agent mã có thể chạy. Agent trực tuyến chỉ đọc nó.',
          references: 'Agent tài liệu đọc khi họ cần.',
        },
        problems: {
          reserved: 'SKILL.md bản thân nó là skill; chọn tên khác.',
        },
      },
      frontMatter: {
        reasons: {
          taken: 'Một skill khác có tên này; chọn cái khác.',
        },
      },
      template: {
        description:
          'Skill này có tác dụng gì và khi nào đặc vụ nên sử dụng nó.',
        title: 'Skill mới',
        whenToUseHint: 'Mô tả các nhiệm vụ đòi hỏi skill này.',
      },
      columns: {
        agents: 'Agent',
      },
      versions: {
        restoreDescription:
          'Nó được lưu lại dưới dạng phiên bản mới nhất; các agent có được nó trong lần chạy tiếp theo của họ. Không có gì bị mất: phiên bản hiện tại vẫn còn trong lịch sử.',
      },
    },
    runWait: {
      reasons: {
        incompatible:
          'Runner được kết nối không hỗ trợ khối lượng công việc này; yêu cầu nâng cấp',
        restricted: 'Chính sách của runner, thư mục hoặc hạn chế biến',
        agentArchived: 'Agent được lưu trữ',
        noRunnerOnline: 'Không có runner trực tuyến',
        toolQuota: 'Công cụ đã hết hạn mức; giờ hồi: {{until}}',
        runnersOffline: 'Runner của nó đang ngoại tuyến',
        missingFeatures: 'Không có runner hỗ trợ {{features}}',
        secretsNotAllowed:
          'Cần runner nhóm: {{variables}} chỉ dành cho runner nhóm',
        next: 'Tiếp theo để có runner miễn phí',
      },
    },
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
  '@nocobase/app-plugin-foundation': {
    capabilities: {
      aiAgents: {
        tagline: 'Dịch vụ mô hình, tác tử và runner',
        onceInUse:
          'Bật dịch vụ mô hình cho OnlineAgent và cổng mô hình, hoặc đăng ký runner để thực thi tác tử.',
      },
    },
    reasons: {
      noModelOrRunner: 'Chưa bật dịch vụ mô hình nào và chưa đăng ký runner.',
    },
    facts: {
      runners: '{{count}} runner đã đăng ký hỗ trợ thực thi tác tử.',
    },
    parts: {
      runners: 'Runner',
    },
    metrics: {
      runners: 'runner',
    },
  },
  '@nocobase/app-plugin-knowledge': {
    indexing: {
      description: 'Cấu hình chỉ mục tìm kiếm cho tất cả không gian tri thức.',
    },
    access: {
      businessSection: 'Tri thức',
      businesses: {
        knowledge: {
          title: 'Tri thức',
          actions: {
            read: {
              title: 'Đọc tri thức',
              description:
                'Đọc tri thức hệ thống và các không gian liên quan đến chúng',
              related: 'Đọc tri thức (các không gian liên quan đến chúng)',
              all: 'Đọc tri thức (tất cả)',
            },
            propose: {
              title: 'Đề xuất tri thức',
              description:
                'Đề xuất thay đổi để người có thể chỉnh sửa quyết định; những agent nào có thể được cung cấp',
              related: 'Đề xuất tri thức (không gian liên quan đến chúng)',
              all: 'Đề xuất tri thức (tất cả)',
            },
            edit: {
              title: 'Chỉnh sửa tri thức',
              description:
                'Chỉnh sửa, lưu trữ và đánh dấu đã xác minh và quyết định các đề xuất; tri thức hệ thống cần tất cả',
              related: 'Chỉnh sửa tri thức (không gian liên quan đến chúng)',
              all: 'Chỉnh sửa tri thức (tất cả)',
            },
            manage: {
              title: 'Quản lý truy cập tri thức',
              description:
                'Thay đổi người có thể truy cập từng thư mục và bài viết, đồng thời giữ quyền truy cập vào tất cả chúng; tri thức hệ thống cần tất cả',
            },
          },
        },
      },
    },
    knowledge: {
      directory: {
        title: 'Tri thức',
        system: 'Tri thức hệ thống',
        chooseTarget: 'Chọn một dự án hoặc tri thức hệ thống để tạo trong',
        empty: 'Không có không gian tri thức có thể tiếp cận được',
        emptyAccessHint:
          'Yêu cầu quản trị viên cấp quyền truy cập vào tri thức về dự án hoặc hệ thống.',
        noAccess:
          'Tri thức này không có sẵn hoặc bạn không còn quyền truy cập.',
        topResults:
          'Các phần được xếp hạng hàng đầu trên tất cả các dự án và tri thức hệ thống.',
        welcome:
          'Mở rộng một dự án hoặc tri thức hệ thống được chia sẻ để duyệt tài liệu. Chọn một không gian để tạo ở đó hoặc tìm kiếm trên tất cả kiến ​​thức được ủy quyền.',
      },
      title: 'Tri thức',
      loadFailed: 'Không thể tải tri thức',
      files: {
        statusHint: {
          ready:
            'Văn bản của nó được trích xuất, vì vậy bộ phận tìm kiếm và agent sẽ đọc nó.',
        },
      },
      spaces: {
        default: 'Tri thức',
      },
      doc: {
        archiveDescription:
          'Nó biến mất khỏi cây và khỏi các agent. Bạn có thể khôi phục nó sau; phiên bản của nó được giữ lại.',
      },
      editor: {
        propertiesHint: 'Những agent và liên kết nào đọc về tài liệu này.',
        slugHint:
          'Chữ thường, chữ số và dấu gạch nối; làm thế nào các agent và liên kết đặt tên cho nó. Để trống, nó được làm từ tiêu đề.',
        summaryHint: 'Một dòng agent đọc trong chỉ mục.',
      },
      search: {
        placeholder: 'Tìm kiếm tri thức',
        label: 'Tìm kiếm tri thức',
      },
      access: {
        agents:
          'Agent thay mặt ai đó đọc và cầu hôn nhiều nhất; họ không bao giờ chỉnh sửa hoặc quyết định.',
      },
      permissions: {
        managers:
          'Người quản lý không gian luôn có quyền truy cập. Các agent đọc và đề xuất nhiều nhất và chỉ những gì cả họ và người của họ có thể.',
      },
    },
    ui: {
      nav: {
        knowledge: 'Tri thức',
      },
    },
  },
  '@nocobase/app-plugin-mail': {
    dev: {
      syncLogsCategory: 'Lịch sử runner',
    },
  },
  '@nocobase/app-plugin-projects': {
    activity: {
      actions: {
        stageActionSkipped: 'bỏ qua một hành động theo giai đoạn',
        stageActionSuppressed:
          'đã chặn một hành động theo giai đoạn (quá nhiều lần chạy)',
        stageActionBlocked:
          'đã bỏ qua một hành động ở giai đoạn: công việc đang chờ xử lý',
        workBlocked: 'chưa bắt đầu hoạt động: công việc đang chờ xử lý',
        workDormant: 'không bắt đầu hoạt động trong khi công việc đang diễn ra',
        workLimited:
          'không bắt đầu hoạt động: nhận xét của nhân viên đã đạt đến giới hạn chạy của công việc',
        workWithdrawn:
          'đã rút công việc đã xếp hàng đợi của mình: công việc hiện đang chờ xử lý',
        created: 'đã tạo ra công việc',
        deleted: 'đã xóa công việc',
        executorChanged: 'đã thay đổi người thực hiện',
        executorRemoved: 'người thực hiện {{name}} đã bị xóa',
        parentChanged: 'đã thay đổi công việc gốc',
        projectChanged: 'đã chuyển công việc này sang một dự án khác',
        restored: 'đã khôi phục công việc',
        titleChanged: 'đã đổi tên công việc',
        updated: 'đã cập nhật công việc',
        subtaskAdded: 'đã thêm công việc phụ',
        autoMoveSkipped: 'không thể tự động chuyển công việc sang',
      },
    },
    board: {
      announce: {
        instructions:
          'Nhấn phím cách hoặc enter để chọn công việc, sử dụng các phím mũi tên để chuyển sang trạng thái khác, sau đó nhấn phím cách hoặc nhập lại để thả công việc hoặc thoát để hủy.',
      },
      cardRole: 'Công việc kéo thả được',
      emptyColumn: 'Không có công việc gì',
      label: 'Bảng công việc',
    },
    config: {
      labels: {
        deleteDescription:
          'Nó bị loại bỏ khỏi mọi công việc có nó. Điều này không thể hoàn tác được.',
        description: 'Dán nhãn các công việc của nhóm trong các dự án.',
        emptyDescription: 'Tạo nhãn cho các công việc nhóm.',
      },
    },
    errors: {
      INVALID_EXECUTOR: 'Người thực hiện này không thể được chọn.',
      INVALID_PARENT: 'Không thể sử dụng công việc gốc.',
      OWNER_REQUIRED: 'Một công việc cần có chủ nhân.',
      TRANSITION_NOT_ALLOWED:
        'Bạn không thể chuyển công việc sang trạng thái này.',
      DEPENDENCY_GRAPH_CHANGED:
        'Công việc phụ thuộc đã thay đổi. Tải lại và thử lại.',
      INVALID_DEPENDENCY:
        'Công việc đó không thể là công việc phụ thuộc ở đây.',
      ISSUE_BLOCKED: 'Công việc vẫn đang chờ các công việc chặn nó.',
      SUBTASKS_OPEN:
        'Trước tiên hãy hoàn thành hoặc hủy bỏ các công việc phụ của nó.',
    },
    dependencies: {
      add: 'Thêm công việc chặn',
      addPlaceholder: 'Tìm công việc để thêm làm việc chặn',
      blockedBy: 'Đang vướng bởi',
      hidden_one: '{{count}} có thêm công việc chặn mà bạn không thể thấy.',
      hidden_other:
        '{{count}} có thêm nhiều công việc chặn mà bạn không thể thấy.',
    },
    filters: {
      anyExecutor: 'Bất cứ người thực hiện nào',
      executor: 'Lọc theo người thực hiện',
    },
    issue: {
      backToList: 'Quay lại công việc',
      delete: 'Xóa công việc',
      conflict: 'Công việc này đã thay đổi, đang tải lại.',
      loadFailed: 'Không thể tải công việc này',
      parent: 'Công việc phụ của',
    },
    issuePicker: {
      empty: 'Không có công việc trùng khớp',
    },
    issueForm: {
      ownerHint: 'Người chịu trách nhiệm về công việc này. Mặc định cho bạn.',
      startLaterHint: 'Nó chờ trong Backlog; bắt đầu nó từ trang công việc.',
    },
    issues: {
      columns: {
        executor: 'Người thực hiện',
      },
      agentsDescription:
        'Làm việc cho mọi người và các agent mã hóa. Chỉ định một agent làm người thực hiện để bắt đầu chạy.',
      agentsEmptyDescription:
        'Tạo một công việc và chọn một agent làm người thực hiện để giao công việc cho nó.',
      emptyDescription: 'Tạo một công việc và chọn người thực hiện nó.',
      emptyTitle: 'Chưa có công việc gì',
      loadFailed: 'Không thể tải công việc',
      new: 'Tạo công việc',
      noResults: 'Không có công việc trùng khớp.',
      searchLabel: 'Tìm công việc',
      title: 'Công việc',
    },
    myIssues: {
      description:
        'Những công việc bạn phải chịu trách nhiệm và những công việc bạn đang tự mình giải quyết.',
      empty: {
        executing: 'Bạn hiện không thực hiện bất kỳ công việc nào',
        owned: 'Bạn không sở hữu bất kỳ công việc nào',
      },
      emptyDescription:
        'Các công việc được giao cho bạn sẽ hiển thị ở đây. Tạo một hoặc chọn một từ danh sách công việc.',
      title: 'Công việc của tôi',
      tabsLabel: 'Các kiểu xem công việc của tôi',
    },
    nav: {
      issues: 'Công việc',
      myIssues: 'Công việc của tôi',
    },
    newIssue: {
      title: 'Tạo công việc',
    },
    projectForm: {
      description:
        'Các công việc của nhóm dự án và các kho lưu trữ mà họ quan tâm.',
    },
    projectMore: {
      deleteDescription:
        'Dự án, các thành viên và kho lưu trữ của nó bị xóa. Các công việc của nó vẫn tồn tại và không còn thuộc về một dự án nữa.',
    },
    projectPage: {
      noIssues: 'Chưa có công việc gì.',
      openInList: 'Mở trong danh sách công việc',
      stats: {
        review: 'Chờ nghiệm thu',
        total: 'Công việc',
      },
      tabs: {
        issues: 'Công việc',
      },
    },
    projects: {
      description:
        'Nhóm các công việc, liên kết các kho lưu trữ của họ và theo dõi tiến trình.',
      emptyDescription:
        'Tạo một dự án để nhóm các công việc và liên kết các kho lưu trữ mà chúng quan tâm.',
      progressLabel: 'Xong {{done}}/{{total}} công việc',
      visibilityHint: {
        members:
          'Chỉ các thành viên dự án và quản trị viên không gian làm việc mới có thể xem dự án này và các công việc của nó.',
      },
    },
    properties: {
      executor: 'Người thực hiện',
    },
    resources: {
      noRunners: 'Chưa có runner',
      pathHint:
        'Đường dẫn tuyệt đối của thư mục trong runner đó. Các agent làm việc tại chỗ, mỗi lần một nhiệm vụ.',
      runner: 'Runner',
      runnerHint: 'Chỉ runner này hoạt động trong thư mục.',
      runnerIdPlaceholder: 'Id runner',
      runnerPlaceholder: 'Chọn runner',
      runnerRequired: 'Chọn runner của thư mục.',
      types: {
        directory: 'Thư mục trong runner',
      },
    },
    roles: {
      abilities: {
        issues: {
          changeOwner: {
            hint: 'Đưa công việc ra cho người khác chịu trách nhiệm',
          },
          close: {
            hint: 'Đánh dấu một công việc đã được thực hiện hoặc đã hủy',
            title: 'Đóng công việc',
          },
          create: {
            hint: 'Tạo công việc, trong một dự án hoặc tự mình',
            title: 'Tạo công việc',
          },
          delete: {
            hint: 'Xóa các công việc và khôi phục những công việc đã xóa',
            title: 'Công việc xóa và khôi phục',
          },
          edit: {
            hint: 'Tiêu đề, mô tả, mức độ ưu tiên, ngày tháng, nhãn, người thực hiện và trạng thái mở',
            title: 'Công việc chỉnh sửa',
          },
          view: {
            hint: 'Xem các công việc trong danh sách, bảng và chi tiết của chúng',
            title: 'Xem công việc',
          },
        },
      },
      capabilities: {
        general: {
          update: 'Thay đổi tiền tố công việc',
        },
      },
      legend: {
        issues:
          'Những công việc có thể nhìn thấy: các công việc không có dự án và các công việc trong dự án mà họ có thể nhìn thấy. Những công việc họ lãnh đạo hoặc sở hữu: các công việc họ sở hữu và các công việc trong dự án họ lãnh đạo. Tất cả: mọi công việc.',
      },
      modules: {
        issues: 'Công việc',
      },
    },
    search: {
      description: 'Tìm kiếm công việc theo tiêu đề hoặc mã định danh.',
      hint: 'Nhập để tìm kiếm công việc.',
      issues: 'Công việc',
      noResults: 'Không có công việc trùng khớp.',
      title: 'Tìm công việc',
    },
    settingsPage: {
      general: {
        prefix: 'Tiền tố định danh công việc',
        prefixHint:
          'Các công việc mới được đánh số như {{example}}. Các công việc hiện tại giữ nguyên số nhận dạng của chúng.',
        title: 'Công việc về số nhận dạng',
      },
    },
    subtasks: {
      blockedByPlaceholder: 'Chọn anh chị em tiểu công việc',
      count_one: 'Công việc phụ {{count}}',
      count_other: 'Các công việc phụ của {{count}}',
      new: 'Công việc phụ mới',
      newDescription:
        'Các công việc phụ ở giai đoạn sau chỉ bắt đầu sau khi mọi giai đoạn trước đó được hoàn thành.',
      newTitle: 'Công việc phụ mới',
      noSiblings: 'Chưa có công việc phụ nào khác.',
      title: 'Các công việc phụ',
    },
    status: {
      backlog: 'Chờ làm',
      blocked: 'Đang vướng',
      in_review: 'Chờ nghiệm thu',
      todo: 'Cần làm',
      in_progress: 'Đang làm',
      done: 'Xong',
      cancelled: 'Đã huỷ',
    },
    subscribers: {
      reason: {
        executor: 'người thực hiện',
      },
      subscribed: 'Bạn sẽ được thông báo về công việc này.',
      unsubscribed: 'Bạn sẽ không còn được thông báo về công việc này nữa.',
    },
    plans: {
      backToList: 'Quay lại công việc',
      createIssues_one: 'Tạo {{count}} công việc',
      createIssues_other: 'Tạo {{count}} công việc',
      executedIssues_one: 'Đã tạo {{count}} công việc.',
      executedIssues_other: 'Đã tạo {{count}} công việc.',
      undoPreview: {
        ops: {
          'issue.retract': 'Xóa công việc {{target}}',
        },
      },
      wakeSkip: {
        blocked: 'công việc đang bị chặn',
        dormant: 'công việc chờ làm',
      },
      flags: {
        startsRun: 'Bắt đầu hoạt động của agent',
        finalStatus: 'Đóng một công việc',
        agentExecutor: 'Làm cho một agent trở thành người thực hiện',
      },
      ops: {
        'issue.create': 'Tạo công việc',
        'issue.update': 'Công việc thay đổi',
        'issue.retract': 'Xóa công việc',
      },
      indent: 'Đặt {{title}} thành công việc phụ của hàng trên',
      unknownIssue: 'Một công việc',
      columns: {
        executor: 'Người thực hiện',
      },
      fields: {
        parentIssueId: 'Công việc gốc',
        executor: 'Người thực hiện',
      },
    },
    intake: {
      textHint:
        'Tiêu đề trở thành công việc cha, mục trong danh sách thành công việc, mục thụt lề thành công việc con. ! hoặc [high] đặt độ ưu tiên, #nhãn thêm nhãn và @stage2 đặt giai đoạn. CSV cần có cột title.',
      filesHint:
        'Tối đa các tệp {{count}}, mỗi tệp {{size}} MB. Văn bản, Markdown, CSV, Word, Excel, PowerPoint và PDF được đọc; Cho phép một agent tổ chức có thể đọc hình ảnh PNG/JPEG bằng các công cụ hình ảnh của mình; nếu đọc không thành công, hãy quay lại chỉnh sửa và thử lại. Phân chia quy tắc chỉ sử dụng tên tệp hình ảnh.',
      projectHint:
        'Mọi công việc đều đi đến đó; bạn có thể thay đổi từng cái bên dưới.',
      splitAction: 'Công việc dự thảo',
      draftCreated: 'Những công việc này đã được tạo ra.',
      draftClosed:
        'Bản nháp này đã được thay thế hoặc hết hạn; soạn thảo lại các công việc.',
      invalidDraft:
        'Một số công việc vẫn chưa được giải quyết. Sửa chúng trong văn bản và chia lại.',
      dropped_one:
        'Chỉ có 50 công việc đầu tiên là dự thảo; {{count}} còn nhiều hơn nữa.',
      dropped_other:
        'Chỉ có 50 công việc đầu tiên là dự thảo; {{count}} còn nhiều hơn nữa.',
    },
    intakeAi: {
      breakdown: 'Chia thành các công việc phụ',
      breakdownHint:
        'Bản nháp của các công việc phụ cho {{issue}}: xem xét và chỉnh sửa chúng, sau đó tạo chúng. Không có gì được tạo ra cho đến khi bạn làm điều đó.',
      drafted: 'AI soạn thảo các công việc',
      failed: 'AI không thể soạn thảo các công việc. Hãy thử lại.',
      failedWhy: 'AI không thể soạn thảo các công việc: {{message}}',
      progress: {
        split: 'AI đang soạn thảo các công việc…',
        breakdown: 'AI đang chia nhỏ {{issue}}…',
      },
      waitsHint:
        'Hiện tại không có runner nào trực tuyến: yêu cầu sẽ đợi cho đến khi một yêu cầu kết nối.',
      unavailable: {
        noAgent:
          'AI không khả dụng: chọn một agent trò chuyện mặc định trong hồ sơ của bạn hoặc yêu cầu quản trị viên thiết lập một agent.',
      },
    },
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
  },
  '@nocobase/app-plugin-releases': {
    ui: {
      actors: {
        agent: 'agent',
      },
      variables: {
        environmentDescription:
          'Mọi ứng dụng trong môi trường này, bao gồm cả bản xem trước pull request, đều nhận được những bản xem trước này trừ khi nó tự thiết lập. Được liệt kê với nội dung mà bản dựng gần đây nhất của mỗi ứng dụng khai báo. Các thay đổi được lưu cùng một lúc và tiếp cận ứng dụng trong lần triển khai tiếp theo.',
      },
    },
  },
};

/**
 * What P8 (matching the plugin pages to the demo) still found machine-translated in the agents plugin ("Mã thông báo"
 * for tokens, "đặc vụ" and "vấn đề" for agent and issue). Kept apart and merged below so the older block above stays as
 * generated; fold them in at the next regeneration.
 */
const agentsAdditions: Record<string, unknown> = {
  modelSuggestions: {
    design:
      'Suy luận mạnh nhất: đề xuất, kiến trúc, điều tra sự cố khó và đánh giá thay đổi quan trọng; cũng triển khai thông thường và thay đổi nhiều gói.',
    review:
      'Đánh giá mã và phân tích lỗi CI; cũng viết đề xuất và điều tra sự cố khó.',
  },
  brief: {
    previewDescription:
      'Đúng như agent này sẽ nhận nếu được gọi lúc này, với một chủ đề giả định. Không có gì được xếp hàng.',
    platform:
      'Quy tắc và nhiệm vụ của nền tảng · khoảng {{size}} ký tự (tiếng Anh)',
  },
  usage: { chart: { tokens: 'Token' } },
  runs: {
    processDataCleared:
      'Dữ liệu quá trình chạy đã bị xoá theo chính sách lưu giữ.',
  },
  transcript: { tokens: 'Token vào {{input}}, ra {{output}}' },
  runtimes: {
    quota: {
      workspaceStatus: {
        ambiguousSubject: 'Được giữ lại: công việc không rõ ràng',
        subjectUnknown: 'Được giữ lại: không xác định được công việc',
      },
    },
  },
  chat: { agents: { unknown: 'Agent không rõ' } },
  prices: {
    section: {
      description:
        'Trên một triệu token, vào / ra. Các báo cáo tính chi phí từ đây.',
    },
    tool: { seen: 'Các mô hình thấy được trong các lượt chạy' },
  },
  skills: {
    frontMatter: {
      reasons: { yaml: 'Phần đầu (front matter) không phải YAML hợp lệ.' },
    },
  },
};

/** The same for the other plugins: "nhiệm vụ"/"tác vụ" for issue, "tổng đài viên" and "đặc vụ" for agent, "mã thông báo" for token. */
const otherAdditions: Record<string, Record<string, unknown>> = {
  '@nocobase/app-plugin-projects': {
    resources: {
      initPromptHint:
        'Tuỳ chọn. Hướng dẫn ngắn mà agent làm theo lần đầu tiên làm việc ở đây cho một công việc, trước khi bắt đầu. Không phải một tập lệnh: nó không tự chạy.',
    },
    plans: {
      // The plugin's keys carry the dot themselves (`'issue.retract'`).
      undoPreview: { ops: { 'issue.retract': 'Xoá công việc {{target}}' } },
      ops: {
        'issue.update': 'Đổi công việc',
        'issue.retract': 'Xoá công việc',
      },
    },
  },
  '@nocobase/app-plugin-releases': {
    ui: { registries: { password: 'Mật khẩu hoặc token' } },
  },
  '@nocobase/app-plugin-agent-sessions': {
    links: {
      count_one: '{{count}} công việc',
      count_other: '{{count}} công việc',
      none: 'Không có công việc',
      empty:
        'Phiên này chưa có công việc nào. Hãy nhờ agent chuyển những gì bạn đã thảo luận thành công việc.',
      created_one: 'Đã tạo {{count}} công việc',
      created_other: 'Đã tạo {{count}} công việc',
      start_one: 'Bắt đầu {{count}} công việc',
      start_other: 'Bắt đầu {{count}} công việc',
    },
    session: {
      offlineBody:
        'Cuộc hội thoại và các công việc của nó được giữ ở đây để đọc như bình thường. Phiên tiếp tục khi máy tính hoạt động trở lại.',
    },
    composer: {
      commands: 'Lệnh của agent',
      mentions: 'Nhắc tới một công việc',
    },
  },
};

function merge(
  base: Record<string, unknown>,
  extra: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(extra)) {
    const current = result[key];
    result[key] =
      typeof value === 'object' &&
      value !== null &&
      typeof current === 'object' &&
      current !== null
        ? merge(
            current as Record<string, unknown>,
            value as Record<string, unknown>,
          )
        : value;
  }
  return result;
}

const merged: TranslationOverrides = {
  ...overrides,
  '@nocobase/app-plugin-agents': merge(
    overrides['@nocobase/app-plugin-agents'] as Record<string, unknown>,
    agentsAdditions,
  ) as TranslationOverrides[string],
  ...Object.fromEntries(
    Object.entries(otherAdditions).map(([name, extra]) => [
      name,
      merge(
        (overrides[name] ?? {}) as Record<string, unknown>,
        extra,
      ) as TranslationOverrides[string],
    ]),
  ),
};

export default merged;
