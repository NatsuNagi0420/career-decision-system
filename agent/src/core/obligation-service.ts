/** 青穗集 · 跨运行待办承诺：记录穗奈建议的下一步，但不自动切换任务或执行操作。 */
import { invariant } from "../errors.js";
import { id, now, type Store } from "../store.js";

export type ObligationStatus = "open" | "claimed" | "fulfilled" | "abandoned";
export type ObligationTrigger = "guidance_next_step" | "agent_commitment";

export interface Obligation {
  id: string;
  user_id: number;
  conversation_id: string;
  source_run_id: string | null;
  capability_id: string;
  intent: string;
  title: string;
  status: ObligationStatus;
  trigger: ObligationTrigger;
  due_at: string | null;
  created_at: string;
  updated_at: string;
  claimed_at: string | null;
  resolved_at: string | null;
}

export interface CreateObligationInput {
  userId: number;
  conversationId: string;
  sourceRunId?: string | null;
  capabilityId: string;
  intent: string;
  title: string;
  trigger?: ObligationTrigger;
  dueAt?: string | null;
}

export class ObligationService {
  constructor(private readonly store: Store) {}

  create(input: CreateObligationInput): Obligation {
    const intent = input.intent.trim();
    const title = input.title.trim();
    invariant(intent.length >= 1 && intent.length <= 500, 400, "待办建议内容长度不合法。", "obligation_invalid");
    invariant(title.length >= 1 && title.length <= 160, 400, "待办建议标题长度不合法。", "obligation_invalid");
    this.store.conversation(input.userId, input.conversationId);

    const existing = this.store.obligations(input.userId, input.conversationId).find(item =>
      item.status === "open" && item.capability_id === input.capabilityId && item.intent === intent,
    );
    if (existing) return existing;

    const timestamp = now();
    const value: Obligation = {
      id: id(),
      user_id: input.userId,
      conversation_id: input.conversationId,
      source_run_id: input.sourceRunId ?? null,
      capability_id: input.capabilityId,
      intent,
      title,
      status: "open",
      trigger: input.trigger ?? "guidance_next_step",
      due_at: input.dueAt ?? null,
      created_at: timestamp,
      updated_at: timestamp,
      claimed_at: null,
      resolved_at: null,
    };
    this.store.saveObligation(value);
    return value;
  }

  list(userId: number, conversationId?: string): Obligation[] {
    return this.store.obligations(userId, conversationId);
  }

  claim(userId: number, obligationId: string): Obligation {
    const current = this.store.obligation(userId, obligationId);
    const conversation = this.store.conversation(userId, current.conversation_id);
    invariant(!conversation.archived, 409, "这条下一步所在的对话已归档，请先恢复对话。", "obligation_archived");
    if (current.status === "claimed") return current;
    invariant(current.status === "open", 409, "这条下一步已经被处理，请刷新后再继续。", "obligation_stale");
    const claimedAt = now();
    invariant(this.store.claimObligation(userId, obligationId, claimedAt), 409, "这条下一步刚刚被其他窗口接手，请刷新后再继续。", "obligation_stale");
    return this.store.obligation(userId, obligationId);
  }

  abandon(userId: number, obligationId: string): Obligation {
    const current = this.store.obligation(userId, obligationId);
    invariant(current.status === "open" || current.status === "claimed", 409, "这条下一步已经结束，不能重复放弃。", "obligation_stale");
    invariant(this.store.resolveObligation(userId, obligationId, "abandoned", now()), 409, "这条下一步刚刚被更新，请刷新后再试。", "obligation_stale");
    return this.store.obligation(userId, obligationId);
  }

  fulfill(userId: number, obligationId: string): Obligation {
    const current = this.store.obligation(userId, obligationId);
    invariant(current.status === "claimed", 409, "这条下一步还没有被接手，不能标记完成。", "obligation_stale");
    invariant(this.store.resolveObligation(userId, obligationId, "fulfilled", now()), 409, "这条下一步刚刚被更新，请刷新后再试。", "obligation_stale");
    return this.store.obligation(userId, obligationId);
  }

  /** 运行失败时保留 claimed 状态，方便用户重试或明确放弃，不制造虚假的完成记录。 */
  keepClaimed(userId: number, obligationId: string): Obligation {
    return this.store.obligation(userId, obligationId);
  }
}

