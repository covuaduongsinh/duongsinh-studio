/**
 * Two approaches for one issue (plan T, T12): asked of two agents of different providers, in read-only mode, and one is
 * chosen with a reason. Pure, so the choice of agents and the words of the comparison are tested without a runner.
 */

export interface AgentChoice {
  readonly id: string;
  readonly name: string;
  readonly tool: string | null;
  readonly status: string;
}

/**
 * The first enabled agent of each of two different tools (so two providers, not one provider twice), leaving out the agent
 * that holds the issue: it is the one that chooses. Null when two such agents do not exist.
 */
export function pickTwoProviders(
  agents: readonly AgentChoice[],
  exceptId?: string | null,
): [AgentChoice, AgentChoice] | null {
  const byTool = new Map<string, AgentChoice>();
  for (const agent of agents) {
    if (agent.status !== 'enabled' || !agent.tool || agent.id === exceptId)
      continue;
    if (!byTool.has(agent.tool)) byTool.set(agent.tool, agent);
  }
  const [first, second] = [...byTool.values()];
  return first && second ? [first, second] : null;
}

/** What the agent that holds the issue is told once both approaches are written. */
export function comparisonText(
  approaches: readonly { agentName: string; runId: string }[],
): string {
  return [
    'Hai phương án đã viết xong. Đọc cả hai bình luận approach:',
    ...approaches.map((a, i) => `${i + 1}. ${a.agentName} (lượt ${a.runId})`),
    '',
    'So sánh theo rủi ro, phạm vi thay đổi và độ rõ ràng, chọn **một** phương án và ghi lý do vào một bình luận; chỉ sau đó mới giao bước đổi code.',
  ].join('\n');
}
