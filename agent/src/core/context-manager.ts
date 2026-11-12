/** 青穗集 · Agent 上下文管理器：计算请求预算、裁剪历史并记录可恢复的压缩事件。 */
import { calculateContextBudget, estimateTokens, packModelContext, type ContextBudget, type ContextPack } from "../context.js";
import { Store, id } from "../store.js";
import { AppError, publicError } from "../errors.js";
import type { AgentEvent, Message, Run, ToolDefinition } from "../types.js";

export type AppendAgentEvent = (
  conversationId: string,
  runId: string | null,
  kind: string,
  data: Record<string, unknown>,
  publish?: boolean,
) => AgentEvent;

export interface AgentContextConfig {
  contextMaxTokens: number;
  contextReserveTokens: number;
  contextRecentTokens: number;
  contextMaxToolChars: number;
}

export interface PreparedAgentContext {
  budget: ContextBudget;
  pack: ContextPack;
  history: Message[];
  system: string;
}

export class AgentContextManager {
  constructor(
    private readonly store: Store,
    private readonly config: AgentContextConfig,
    private readonly event: AppendAgentEvent,
  ) {}

  prepare(
    run: Run,
    allHistory: Message[],
    systemPrompt: string,
    tools: ToolDefinition[],
    outputLimit: number,
    memorySummary: string | null,
    recovery = false,
  ): PreparedAgentContext {
    const budget = calculateContextBudget({
      contextWindowTokens: this.config.contextMaxTokens,
      minimumReserveTokens: this.config.contextReserveTokens,
      outputTokens: outputLimit,
      systemPrompt,
      tools,
    });
    if (budget.historyBudgetTokens < 2000) {
      throw new AppError(500, "当前模型配置的上下文窗口不足以容纳 Agent 规则和工具定义，请切换上下文更大的模型。", "context_budget");
    }
    const pack = packModelContext(run, allHistory, {
      maxTokens: recovery ? Math.max(2000, Math.floor(budget.historyBudgetTokens * 0.45)) : budget.historyBudgetTokens,
      recentTokens: Math.min(
        recovery ? 1000 : this.config.contextRecentTokens,
        Math.floor(budget.historyBudgetTokens * 0.45),
      ),
      maxToolChars: recovery ? 800 : this.config.contextMaxToolChars,
      memorySummary,
    });
    if (pack.estimatedTokens > budget.historyBudgetTokens) {
      throw new AppError(400, "当前请求的工具参数或消息超出可用上下文，请拆分资料后继续。", "context_budget");
    }
    this.recordCompaction(run, pack, recovery ? "context-overflow" : "pressure");
    return {
      budget,
      pack,
      history: pack.messages,
      system: [systemPrompt, ...(pack.summary ? [pack.summary] : [])].join("\n"),
    };
  }

  recordCompaction(run: Run, pack: ContextPack, trigger: "pressure" | "context-overflow" = "pressure") {
    const sourceSignature = pack.compactionKey;
    if (!sourceSignature) return;
    let pending: ReturnType<Store["incompleteContextCompaction"]>;
    try {
      if (this.store.hasCompletedContextCompaction(run.conversation_id, sourceSignature)) return;
      pending = this.store.incompleteContextCompaction(run.conversation_id, sourceSignature);
    } catch {
      // 压缩索引只是可观测性；事件表异常时继续使用已经组装好的上下文。
      return;
    }
    const compactionId = pending?.compactionId ?? id();
    const common = {
      compaction_id: compactionId,
      trigger,
      source_signature: sourceSignature,
      source_message_count: pack.sourceMessageCount,
      omitted_message_ids: pack.omittedMessageIds.slice(0, 200),
      omitted_message_count: pack.omittedMessageIds.length,
      pruned_message_count: pack.prunedMessageIds.length,
      recovered_from_run_id: pending?.runId && pending.runId !== run.id ? pending.runId : undefined,
      pruned_message_ids: pack.prunedMessageIds.slice(0, 200),
      before_tokens: pack.originalTokens,
      after_tokens: pack.estimatedTokens,
      omitted_messages: pack.omittedMessages,
    };
    try {
      if (!pending?.hasStart) this.event(run.conversation_id, run.id, "context.compaction.start", common);
      if (!pending?.hasSummary) this.event(run.conversation_id, run.id, "context.compaction.summary", {
        ...common,
        summary: pack.summary,
        summary_tokens: pack.summary ? estimateTokens(pack.summary) : 0,
      });
      this.event(run.conversation_id, run.id, "context.compaction.end", {
        ...common,
        status: "completed",
        recovered: Boolean(pending),
      });
    } catch (error) {
      // 压缩是模型请求的优化层，不应因日志故障阻断已有对话；原始历史仍然完整可回放。
      try {
        this.event(run.conversation_id, run.id, "context.compaction.end", {
          ...common,
          status: "failed",
          error: publicError(error),
        });
      } catch { /* 日志本身不可用时保留当前请求路径。 */ }
    }
  }
}
