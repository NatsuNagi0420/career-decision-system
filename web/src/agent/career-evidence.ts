/** 青穗集 · 对话证据投影：当前线索与追问按会话和最新发言隔离，点击追问进入用户回答。 */
import type { CareerDecisionView } from "../../../agent/src/career-decision-contract";

export function conversationEvidence(view: CareerDecisionView | undefined, conversationId: string | null, latestUserAt?: string): CareerDecisionView | undefined {
  if (!view || !conversationId) return;
  const belongs = (item: { conversation_id: string; updated_at: string } | null) =>
    Boolean(item && item.conversation_id === conversationId && (!latestUserAt || item.updated_at >= latestUserAt));
  return {
    ...view,
    facts: view.facts.filter(fact => !fact.stale && fact.conversation_id === conversationId),
    follow_up: belongs(view.follow_up) ? view.follow_up : null,
    activity: belongs(view.activity) ? view.activity : null,
  };
}

export function followUpReply(question: string): string {
  return "关于你问的「" + question + "」，我的情况是：";
}
