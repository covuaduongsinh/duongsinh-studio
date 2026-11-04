import type { AppServerResource } from './en-US.js';

const zhCN: AppServerResource = {
  studioAgents: {
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
        description: '创建、重试和撤下任务拉取请求的预览。可编辑任务的人都拥有此权限。',
      },
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
