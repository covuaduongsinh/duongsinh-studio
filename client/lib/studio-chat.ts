import type {
  NewsNotice,
  Translate,
} from '@nocobase/app-plugin-agents/client/chat';
import type { PlanListQuery } from '@nocobase/app-plugin-projects/shared/plans';

/** Where one conversation shows as a page of its own (`client/routes.ts`). */
export const CHAT_PATH = '/chat';
export const conversationPath = (id: string): string =>
  `${CHAT_PATH}/${encodeURIComponent(id)}`;

/** The plan source Studio's server gives an agent's plans in a conversation (`server/conversations`). */
const CONVERSATION_PLAN = 'conversation';
/** The news a conversation hears when its plan is decided (`PLAN_DECIDED_NEWS` on the server). */
export const PLAN_DECIDED_NEWS = 'ds.plan.decided';
const PLAN_OUTCOMES = new Set([
  'executed',
  'failed',
  'stale',
  'voided',
  'undone',
]);

/** The plans an agent proposed in one conversation, as the projects plugin lists them. */
export function conversationPlansQuery(conversationId: string): PlanListQuery {
  return {
    sourceKind: CONVERSATION_PLAN,
    sourceKey: `${CONVERSATION_PLAN}:${conversationId}`,
    limit: 20,
  };
}

/** The news Studio delivers to a conversation, in the reader's language; null leaves the English line. */
export function studioNewsText(notice: NewsNotice, t: Translate): string | null {
  if (notice.type !== PLAN_DECIDED_NEWS) return null;
  const outcome = notice.params?.outcome;
  if (!outcome || !PLAN_OUTCOMES.has(outcome)) return null;
  return t(`studioChat.planDecided.${outcome}`, {
    title: notice.params?.title ?? '',
  });
}
