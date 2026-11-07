import type { AppServerResource } from './en-US.js';

const zhCN: AppServerResource = {
  studioAgents: {
    scopes: {
      project: '项目',
    },
    subjects: {
      issue: '任务',
    },
    triggers: {
      statusChange: '任务开始',
      assigned: '已指派',
      comment: '评论',
      mention: '提及',
      unblocked: '解除阻塞',
    },
    kinds: {
      agent: '智能体',
    },
    projectManager: {
      name: '项目经理',
    },
    actions: {
      peopleOnly: '只能由人执行，从不授予智能体。',
    },
    runFinished: {
      completed: '运行 {{runId}} 已完成。',
      failed: '运行 {{runId}} 失败（{{reason}}）。',
      cancelled: '运行 {{runId}} 已停止。',
    },
  },
  studioGit: {
    comments: {
      merged: '拉取请求 {{repo}}#{{number}} 已合并。',
      closed: '拉取请求 {{repo}}#{{number}} 已关闭，未合并。',
    },
    errors: {
      GIT_CONNECTION_NOT_FOUND: 'Git 连接不存在。',
      GIT_CONNECTION_NO_TOKEN: '该 Git 连接没有令牌。',
      GIT_CONNECTION_IN_USE: '该 Git 连接仍关联着仓库，请先移除这些仓库。',
      GIT_TOKEN_REJECTED: 'GitHub 拒绝了该令牌。',
      GIT_PUBLIC_URL_MISSING: 'Studio 未配置公开地址，GitHub 无法回调。',
      GIT_APP_MANIFEST_EXPIRED:
        '该 GitHub App 请求未知、已使用或已过期；请从“设置 → Git”重新开始。',
      GIT_APP_NOT_FOUND: '该 Git 连接没有 GitHub App。',
      GIT_APP_NOT_INSTALLED: '{{name}} 的 GitHub App 尚未安装。',
      GIT_APP_INSTALLATION_AMBIGUOUS:
        '{{name}} 的 GitHub App 安装在多个账号上；请从其链接重新安装。',
      GIT_REPOSITORY_UNREACHABLE: '该连接的令牌无法访问仓库 {{repo}}。',
      GIT_REPOSITORY_READ_ONLY: '该连接的令牌不能推送到 {{repo}}。',
      GIT_REPOSITORY_LINKED: '仓库 {{repo}} 已关联。',
      GIT_REPOSITORY_ATTACHED: '仓库 {{repo}} 已属于该项目。',
      GIT_REPOSITORY_NOT_FOUND: '仓库未关联。',
      GIT_HOST_UNAVAILABLE: '暂时无法访问 GitHub，请稍后重试。',
      SECRETS_NOT_CONFIGURED: '未配置密钥，无法保存令牌。',
      PROJECTS_UNAVAILABLE: '项目功能不可用。',
      PULL_REQUEST_NOT_FOUND: '拉取请求不存在。',
      MERGE_BLOCKED: '拉取请求暂不能合并（{{blocker}}）。',
      MERGE_REFUSED_BY_HOST: 'GitHub 拒绝合并该拉取请求。',
      ISSUE_HAS_NO_REPOSITORY:
        '任务 {{issue}} 没有仓库，请先为其项目添加仓库。',
      GIT_REPOSITORY_NOT_IN_PROJECT: '该仓库不属于任务 {{issue}} 所在的项目。',
      PULL_REQUEST_REFUSED_BY_HOST:
        'GitHub 拒绝从 {{head}} 创建拉取请求：请先推送至少包含一个提交的分支。',
    },
    actions: {
      groupTitle: '代码托管',
      openPr: {
        title: '创建拉取请求',
        description:
          '通过 Studio 为任务分支创建拉取请求。可编辑任务的人都拥有此权限。',
      },
    },
  },
  studioChat: {
    sources: {
      askAgent: '询问智能体',
    },
    actions: {
      groupTitle: '计划',
      plansUse: {
        title: '提出计划',
        description:
          '提出操作计划（新建任务、评论、依赖），由本人在对话中审阅并执行。可查看任务的人都拥有此权限。',
      },
    },
  },
  studioReleases: {
    actions: {
      groupTitle: '预览',
      previewsManage: {
        title: '管理拉取请求预览',
        description:
          '创建、重试和撤下任务拉取请求的预览。可编辑任务的人都拥有此权限。',
      },
    },
  },
  studioOrgKeys: {
    section: 'Studio',
    settingsTitle: '组织 API 密钥',
    read: '查看',
    manage: '管理',
  },
  studioSetups: {
    issueTitle: '初始化项目',
    templateIssue:
      '使用 NocoBase 应用模板 `{{template}}` 初始化此项目（`pnpm create @nocobase/app --template {{template}}`），将第一个版本提交到默认分支，并报告创建的内容。',
    managerUnavailable:
      '项目经理尚未配置，此任务正在等待。请先配置，再开始任务。',
    deployLater: '部署设置尚未应用：请在项目的发布中连接应用。',
  },
  studioReports: {
    actions: {
      groupTitle: '报告',
      read: {
        title: '读取报告',
        description: '代唤醒智能体的人读取交付、成本和验收数据。',
      },
    },
    metricsMessage:
      '{{from}} 至 {{to}} 的指标\n使用：{{activeWeeks}} 周内活跃 {{activeDays}} 天，{{activeMembers}} 人，创建 {{issuesCreated}} 个任务和 {{commentsCreated}} 条评论。\n交付：{{deliveredTotal}} 个任务，智能体完成 {{deliveredByAgent}} 个（占比 {{share}}）。\n评审：通过 {{passed}}，退回 {{reworked}}。\n运行：共 {{runs}} 次，完成 {{completedRuns}}，失败 {{failedRuns}}，丢失 {{lostRuns}}；等待中位数 {{wait}}，运行中位数 {{duration}}。\n令牌：输入 {{inputTokens}}，输出 {{outputTokens}}。\n决定：提出 {{asked}} 个，已决定 {{decided}} 个（中位数 {{resolve}}），待决定 {{open}} 个。',
    usageMessage:
      '{{from}} 至 {{to}} 按 {{groupBy}} 的用量：{{runs}} 次运行，输入 {{inputTokens}} 令牌，输出 {{outputTokens}} 令牌。',
    weekly: {
      title: '周报 {{from}} 至 {{to}}',
      body: '### 周报 {{from}} 至 {{to}}\n\n- **完成任务**：{{completed}}（上周：{{completedBefore}}）\n- **周期中位数**：{{cycle}}\n- **智能体完成**：{{share}}\n- **每任务令牌**：{{tokens}}\n- **运行成功率**：{{runs}} 次中 {{success}}\n- **需要关注**：{{blocked}} 个受阻，{{overdue}} 个逾期，{{reviews}} 个等待评审，{{failed}} 次运行失败',
    },
  },
  studioReviews: {
    actions: {
      groupTitle: '审查',
      submit: {
        title: '提交审查单',
        description:
          '在只读模式下为拉取请求提交结构化审查单（结论、清单、待修复项）。',
      },
    },
  },
  studioAutopilot: {
    actions: {
      groupTitle: '自动驾驶',
      manage: {
        title: '管理自动驾驶',
        description: '为项目配置和操作自动驾驶设置。',
      },
    },
  },
};

export default zhCN;
