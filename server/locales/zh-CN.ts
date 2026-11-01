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
    runFinished: {
      completed: '运行 {{runId}} 已完成。',
      failed: '运行 {{runId}} 失败（{{reason}}）。',
      cancelled: '运行 {{runId}} 已停止。',
    },
  },
};

export default zhCN;
