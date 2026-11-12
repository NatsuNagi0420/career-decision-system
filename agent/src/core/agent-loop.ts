/** 青穗集 · 通用 Agent 执行循环：模型步骤、工具恢复、流式事件、预算、取消与失败收敛。 */
import { createHash } from "node:crypto";
import { pendingTools, toolIsStalled } from "./tool-history.js";
import { TextStream } from "../text-stream.js";
import { id, now } from "../store.js";
import { estimateModelRequestTokens, estimateTokens, type ContextPack } from "../context.js";
import { AppError, invariant, isRecord, publicError } from "../errors.js";
import { AgentContextManager, type AppendAgentEvent } from "./context-manager.js";
import { AgentTaskMemory } from "./task-memory.js";
import { AgentPolicy } from "./agent-policy.js";
import type { AgentDomain, AgentDomainToolContext } from "./contracts.js";
import type {
  AgentCheckpoint,
  AgentCheckpointStatus,
  Approval,
  Message,
  ModelReply,
  Run,
  Sandbox,
  ToolCall,
  ToolExecution,
  User,
} from "../types.js";
import type { Config } from "../config.js";
import type { Profiles } from "../profiles.js";
import type { Store } from "../store.js";
import type { Workspace } from "../files.js";

export type CreateAgentMessage = (
  conversationId: string,
  runId: string | null,
  role: Message["role"],
  content: string,
  extra?: Partial<Message>,
) => Message;

const LIVE_TOOL_OUTPUT_LIMIT = 16 * 1024;

function utf8Prefix(value: string, maxBytes: number) {
  if (maxBytes <= 0) return "";
  if (Buffer.byteLength(value, "utf8") <= maxBytes) return value;
  let bytes = 0;
  let result = "";
  for (const character of value) {
    const size = Buffer.byteLength(character, "utf8");
    if (bytes + size > maxBytes) break;
    result += character;
    bytes += size;
  }
  return result;
}

export interface AgentLoopHost {
  readonly store: Store;
  readonly workspace: Workspace;
  readonly profiles: Profiles;
  readonly config: Config;
  readonly domain: AgentDomain;
  readonly policy: AgentPolicy;
  executionSandbox(run: Run): Sandbox;
  event: AppendAgentEvent;
  message: CreateAgentMessage;
  settlePending(run: Run, reason: string): void;
  requestExport(user: User, artifactId: string, run: Run, call: ToolCall | null): Promise<Approval>;
  canRetry(run: Run): boolean;
}

export class AgentLoop {
  private readonly contextManager: AgentContextManager;
  private readonly taskMemory: AgentTaskMemory;

  constructor(private readonly host: AgentLoopHost) {
    this.contextManager = new AgentContextManager(host.store, host.config, host.event);
    this.taskMemory = new AgentTaskMemory(host.store);
  }

  async run(run: Run, user: User, controller: AbortController) {
    await this.drive(run, user, controller);
  }

  hasPending(run: Run) {
    return this.pending(run).length > 0;
  }

  recordContextCompaction(run: Run, pack: ContextPack, trigger: "pressure" | "context-overflow" = "pressure") {
    this.contextManager.recordCompaction(run, pack, trigger);
  }

  private pending(run: Run) {
    return pendingTools(this.host.store.messages(run.conversation_id), run.id);
  }

  /**
   * 将当前运行的安全执行现场落到 SQLite；事件日志保留完整审计，检查点只负责续接。
   * 工具结果先写入消息和 tool.finished 事件，再推进这里，恢复时不会凭空重跑已完成工具。
   */
  private persistCheckpoint(
    run: Run,
    status: AgentCheckpointStatus,
    contextSignature: string | null = null,
    parentId?: string,
  ) {
    const messages = this.host.store.messages(run.conversation_id, true).filter(message => message.run_id === run.id);
    const calls = messages.flatMap(message => message.tool_calls ?? []);
    const completed = new Set(messages.filter(message => message.role === "tool" && message.tool_call_id).map(message => message.tool_call_id!));
    const pending = calls.filter(call => !completed.has(call.id)).map(call => call.id);
    const previous = this.host.store.checkpoint(run.user_id, run.id);
    const checkpoint: AgentCheckpoint = {
      id: previous?.id ?? id(),
      run_id: run.id,
      conversation_id: run.conversation_id,
      user_id: run.user_id,
      step: run.steps,
      status,
      completed_tool_call_ids: [...completed],
      pending_tool_call_ids: pending,
      context_signature: contextSignature ?? previous?.context_signature ?? null,
      ...(parentId ?? previous?.parent_id ? { parent_id: parentId ?? previous?.parent_id } : {}),
      created_at: previous?.created_at ?? now(),
      updated_at: now(),
    };
    this.host.store.saveCheckpoint(checkpoint);
    run.checkpoint_id = checkpoint.id;
    run.checkpoint_step = checkpoint.step;
    this.host.store.saveRun(run);
    this.host.event(run.conversation_id, run.id, "run.checkpoint", { checkpoint });
    return checkpoint;
  }

  private async modelImages(run: Run, message: Message) {
    // 图片只在它所属的本轮请求中发给模型，避免每次后续对话都重复上传大段 base64。
    if (message.run_id !== run.id || !message.attachments?.length) return [];
    const artifacts = this.host.store.artifacts(run.conversation_id);
    const images: Array<{ url: string }> = [];
    for (const attachment of message.attachments) {
      const artifact = artifacts.find(item => item.id === attachment.artifact_id);
      invariant(artifact?.kind === "input" && artifact.path.startsWith("inputs/"), 409, "图片资料已不可用，请重新粘贴后再试。", "attachment_unavailable");
      const bytes = await this.host.workspace.artifactBytes(artifact);
      images.push({ url: `data:${attachment.mime};base64,${bytes.toString("base64")}` });
    }
    return images;
  }

  private async domainContext(
    run: Run,
    user: User,
    profile: ReturnType<Store["profile"]>,
    call: ToolCall,
    signal: AbortSignal,
  ): Promise<AgentDomainToolContext> {
    const workspaceContext = await this.host.workspace.projectContext(run.conversation_id);
    return {
      run,
      user,
      profile,
      workspace: this.host.workspace,
      workspaceRoot: workspaceContext.sessionRoot,
      workspaceContext,
      sandbox: this.host.executionSandbox(run),
      call,
      signal,
    };
  }

  private toolArgumentsHash(call: ToolCall) {
    return createHash("sha256").update(call.name + "\0" + call.arguments).digest("hex");
  }

  private saveToolExecution(run: Run, call: ToolCall, status: ToolExecution["status"], result?: unknown, error?: string) {
    const previous = this.host.store.toolExecution(run.user_id, call.id);
    const receipt: ToolExecution = {
      call_id: call.id,
      run_id: run.id,
      conversation_id: run.conversation_id,
      user_id: run.user_id,
      name: call.name,
      arguments_hash: this.toolArgumentsHash(call),
      status,
      ...(result !== undefined ? { result: this.host.profiles.secrets.redactValue(compact(result)) } : {}),
      ...(error ? { error: this.host.profiles.secrets.redact(error) } : {}),
      created_at: previous?.created_at ?? now(),
      updated_at: now(),
    };
    this.host.store.saveToolExecution(receipt);
    return receipt;
  }

  private replayToolExecution(run: Run, call: ToolCall, receipt: ToolExecution, uncertain = false) {
    const message = this.host.message(
      run.conversation_id,
      run.id,
      "tool",
      receipt.status === "succeeded"
        ? JSON.stringify({ ok: true, result: receipt.result })
        : JSON.stringify({ ok: false, error: receipt.error ?? "工具执行状态不确定，未自动重试。" }),
      { tool_call_id: call.id },
    );
    this.host.event(run.conversation_id, run.id, "message.added", { message });
    this.host.event(run.conversation_id, run.id, "tool.finished", {
      call_id: call.id,
      name: call.name,
      ok: receipt.status === "succeeded",
      ...(receipt.status === "succeeded" ? { result: receipt.result } : { error: receipt.error }),
      replayed: true,
      uncertain,
    });
    this.persistCheckpoint(run, "active");
    return true;
  }

  private async perform(
    run: Run,
    user: User,
    call: ToolCall,
    signal: AbortSignal,
  ): Promise<boolean> {
    signal.throwIfAborted();
    invariant(!toolIsStalled(this.host.store.messages(run.conversation_id), run.id, call), 409,
      "同一工具连续返回相同结果，已停止重复执行。请补充信息或调整任务后继续。", "agent_stalled");
    const existing = this.host.store.toolExecution(user.id, call.id);
    if (existing) {
      invariant(existing.arguments_hash === this.toolArgumentsHash(call), 409, "工具调用标识已被不同参数复用，已阻止重复执行。", "tool_call_reused");
      if (existing.status === "started") {
        existing.status = "uncertain";
        existing.error = "服务中断时无法确认工具是否完成，未自动重复执行。";
        existing.updated_at = now();
        this.host.store.saveToolExecution(existing);
        return this.replayToolExecution(run, call, existing, true);
      }
      if (existing.status === "uncertain") return this.replayToolExecution(run, call, existing, true);
      if (existing.status === "succeeded" || existing.status === "failed") return this.replayToolExecution(run, call, existing);
      return false;
    }
    this.saveToolExecution(run, call, "started");
    this.host.event(run.conversation_id, run.id, "tool.started", {
      call: { id: call.id, name: call.name, arguments: call.arguments },
    });
    try {
      let liveOutputBytes = 0;
      let liveOutputTruncated = false;
      const onOutput = (stream: "stdout" | "stderr", text: string) => {
        if (signal.aborted || liveOutputTruncated || !text) return;
        const accepted = utf8Prefix(text, LIVE_TOOL_OUTPUT_LIMIT - liveOutputBytes);
        if (accepted) {
          liveOutputBytes += Buffer.byteLength(accepted, "utf8");
          this.host.event(run.conversation_id, run.id, "tool.output", {
            call_id: call.id,
            name: call.name,
            stream,
            text: accepted,
          });
        }
        if (accepted.length < text.length) {
          liveOutputTruncated = true;
          this.host.event(run.conversation_id, run.id, "tool.output", {
            call_id: call.id,
            name: call.name,
            stream,
            text: "",
            truncated: true,
          });
        }
      };
      const context = {
        ...(await this.domainContext(
        run,
        user,
        this.host.store.profile(user.id, run.profile_id),
        call,
        signal,
        )),
        onOutput,
      };
      this.host.policy.assertConsent(this.host.store, user.id);
      invariant(context.profile.capabilities.tools && this.host.domain.tools(context).some(tool => tool.name === call.name),
        403, "当前任务未开放此工具。", "tool_unavailable");
      this.host.domain.validateTool(context);
      const result = await this.host.domain.executeTool(context);
      this.host.domain.afterTool({ ...context, result });
      if (result.pause === "approval") {
        signal.throwIfAborted();
        await this.host.requestExport(user, result.artifactId!, run, call);
        this.saveToolExecution(run, call, "waiting", { artifact_id: result.artifactId, approval: "pending" });
        this.persistCheckpoint(run, "paused");
        this.host.store.setStatus(run, "awaiting_approval");
        this.host.event(run.conversation_id, run.id, "run.status", { run });
        return false;
      }
      const toolOk = !(
        isRecord(result.value) &&
        typeof result.value.exit_code === "number" &&
        result.value.exit_code !== 0
      );
      this.saveToolExecution(run, call, toolOk ? "succeeded" : "failed", result.value, toolOk ? undefined : "命令返回了非零退出码。");
      const message = this.host.message(
        run.conversation_id,
        run.id,
        "tool",
        JSON.stringify({ ok: toolOk, result: compact(result.value) }),
        { tool_call_id: call.id },
      );
      this.host.event(run.conversation_id, run.id, "message.added", { message });
      this.host.event(run.conversation_id, run.id, "tool.finished", {
        call_id: call.id,
        name: call.name,
        ok: toolOk,
        result: compact(result.value),
      });
      this.persistCheckpoint(run, "active");
      if (result.artifact)
        this.host.event(run.conversation_id, run.id, "artifact.created", {
          artifact: result.artifact,
        });
      if (call.name === "plan_tasks")
        this.host.event(run.conversation_id, run.id, "plan.updated", {
          plan: result.value,
        });
      signal.throwIfAborted();
      if (result.complete) {
        const answer = this.host.message(run.conversation_id, run.id, "assistant", result.complete);
        this.host.event(run.conversation_id, run.id, "message.added", { message: answer });
        this.host.settlePending(run, "本步已交由用户确认，后续工具不自动执行。");
        this.persistCheckpoint(run, "completed");
        this.host.store.setStatus(run, "completed");
        this.host.event(run.conversation_id, run.id, "run.status", { run });
        return false;
      }
      if (result.pause === "input") {
        const answer = this.host.message(
          run.conversation_id,
          run.id,
          "assistant",
          result.question!,
        );
        this.host.event(run.conversation_id, run.id, "message.added", {
          message: answer,
        });
        this.host.settlePending(run, "已向用户追问，后续工具尚未执行。");
        this.persistCheckpoint(run, "paused");
        this.host.store.setStatus(run, "waiting_input");
        this.host.event(run.conversation_id, run.id, "run.status", { run });
        return false;
      }
      signal.throwIfAborted();
      return true;
    } catch (error) {
      if (signal.aborted) {
        this.saveToolExecution(run, call, "uncertain", undefined, "服务中断时无法确认工具是否完成，未自动重复执行。");
        throw error;
      }
      const detail =
        (error as NodeJS.ErrnoException).code === "ENOENT"
          ? "文件不存在，请先列出当前资料。"
          : publicError(error);
      this.saveToolExecution(run, call, "failed", undefined, detail);
      const message = this.host.message(
        run.conversation_id,
        run.id,
        "tool",
        JSON.stringify({ ok: false, error: detail }),
        { tool_call_id: call.id },
      );
      this.host.event(run.conversation_id, run.id, "message.added", { message });
      this.host.event(run.conversation_id, run.id, "tool.finished", {
        call_id: call.id,
        name: call.name,
        ok: false,
        error: detail,
      });
      this.persistCheckpoint(run, "active");
      return true;
    }
  }

  private async drive(run: Run, user: User, controller: AbortController) {
    let contextRecovery = false;
    const started = Date.now();
    const elapsed = run.elapsed_ms ?? 0;
    const remaining = this.host.config.runTimeoutMs - elapsed;
    const signal = AbortSignal.any([
      controller.signal,
      AbortSignal.timeout(Math.max(1, remaining)),
    ]);
    try {
      invariant(
        remaining > 0,
        408,
        "任务已达到总时长上限，请检查已有成果后发起下一轮。",
      );
      signal.throwIfAborted();
      this.host.store.setStatus(run, "running");
      this.host.event(run.conversation_id, run.id, "run.status", { run });
      const profile = this.host.store.profile(user.id, run.profile_id);
      const model = await this.host.profiles.model(user, profile);
      for (;;) {
        signal.throwIfAborted();
        this.host.policy.assertConsent(this.host.store, user.id);
        for (const call of this.pending(run)) {
          this.host.policy.assertConsent(this.host.store, user.id);
          if (!(await this.perform(run, user, call, signal))) return;
        }
        signal.throwIfAborted();
        if (this.host.policy.checkpointDue(run, this.host.config)) {
          this.persistCheckpoint(run, "active");
          this.host.event(run.conversation_id, run.id, "model.notice", {
            message: "已整理当前进展，接着处理你的请求。",
          });
        }
        this.host.policy.assertStepBudget(run, this.host.config);
        const allHistory = this.host.store.messages(run.conversation_id);
        const files = await this.host.workspace.list(run.conversation_id);
        const workspaceContext = await this.host.workspace.projectContext(run.conversation_id);
        const projectInstructions = workspaceContext.projectRoot
          ? await this.host.workspace.projectInstructions(run.conversation_id)
          : [];
        signal.throwIfAborted();
        this.host.policy.assertConsent(this.host.store, user.id);
        const domainContext = {
          run,
          user,
          profile,
          workspace: this.host.workspace,
          workspaceRoot: workspaceContext.sessionRoot,
          workspaceContext,
          sandbox: this.host.executionSandbox(run),
        };
        const domainInstructions = this.host.domain.instructions(domainContext);
        const tools = this.host.domain.tools(domainContext);
        const planContext = this.taskMemory.context(run);
        const baseSystem = [
          ...domainInstructions,
          ...(planContext ? [planContext] : []),
          ...this.host.policy.instructions(run, profile, files, workspaceContext, projectInstructions),
        ].join("\n");
        const outputLimit = Math.min(
          this.host.config.maxOutputTokens,
          this.host.config.maxRunOutputTokens -
            (run.output_budget_used ?? run.output_tokens),
        );
        invariant(outputLimit > 0, 408, "已达到本轮输出预算，已停止。", "output_budget");
        const prepared = this.contextManager.prepare(
          run,
          allHistory,
          baseSystem,
          profile.capabilities.tools ? tools : [],
          outputLimit,
          this.host.domain.memorySummary?.(domainContext) ?? null,
          contextRecovery,
        );
        const { budget, pack, history, system } = prepared;
        const messageId = id();
        let partial = "";
        const textStream = new TextStream(
          this.host.profiles.secrets,
          (text) => this.host.event(run.conversation_id, run.id, "answer.delta", {
            message_id: messageId,
            text,
          }),
          signal,
        );
        run.steps++;
        run.total_steps = (run.total_steps ?? 0) + 1;
        this.host.store.saveRun(run);
        this.host.event(run.conversation_id, run.id, "model.started", {
          step: run.steps,
          model:
            profile.mode === "official"
              ? this.host.config.officialModelDisplayName
              : profile.model,
          domain: this.host.domain.id,
          capability_id: this.host.domain.capabilityId?.(run) ?? null,
          tools_fingerprint: createHash("sha256").update(JSON.stringify(profile.capabilities.tools ? tools : [])).digest("hex"),
          instructions_fingerprint: createHash("sha256").update(baseSystem).digest("hex"),
          history_messages: history.length,
          history_source_messages: pack.sourceMessageCount,
          history_estimated_tokens: pack.estimatedTokens,
          history_original_tokens: pack.originalTokens,
          history_omitted_messages: pack.omittedMessages,
          history_pruned_messages: pack.prunedMessageIds.length,
          history_compacted: pack.compacted,
          context_window_tokens: budget.contextWindowTokens,
          context_reserve_tokens: budget.reserveTokens,
          context_history_budget_tokens: budget.historyBudgetTokens,
          system_estimated_tokens: budget.systemTokens,
          tools_estimated_tokens: budget.toolTokens,
          request_estimated_tokens: estimateModelRequestTokens(
            system,
            history,
            profile.capabilities.tools ? tools : [],
            outputLimit,
          ),
        });
        run.output_budget_used =
          (run.output_budget_used ?? run.output_tokens) + outputLimit;
        this.host.store.saveRun(run);
        let answer: ModelReply;
        const modelMessages = await Promise.all(history.map(async (message) => ({
          role: message.role,
          content: message.content,
          images: await this.modelImages(run, message),
          tool_calls: message.tool_calls,
          tool_call_id: message.tool_call_id,
          response_items: message.response_items,
        })));
        const modelStarted = Date.now();
        let firstDeltaMs: number | null = null;
        const previewFrames = new Map<string, { checked: number; signature: string }>();
        const publishPreview = (call: ToolCall, flush = false) => {
          if (signal.aborted) return;
          const preview = this.host.domain.previewTool?.({ ...domainContext, call, signal });
          if (!preview) return;
          const previous = previewFrames.get(call.id), checked = Date.now();
          if (!flush && previous && checked - previous.checked < (preview.minIntervalMs ?? 60)) return;
          if (previous?.signature === preview.signature) return;
          previewFrames.set(call.id, { checked, signature: preview.signature });
          this.host.event(run.conversation_id, run.id, preview.kind, { ...preview.data, call_id: call.id });
        };
        try {
          answer = await model.complete({
            messages: [
              { role: "system", content: system },
              ...modelMessages,
            ],
            tools: profile.capabilities.tools ? tools : [],
            stream: profile.capabilities.stream,
            signal,
            routingCapability: this.host.domain.capabilityId?.(run) ?? undefined,
            maxOutputTokens: outputLimit,
            reasoningEffort: run.reasoning_effort ?? "auto",
            onNotice: (message) => this.host.event(run.conversation_id, run.id, "model.notice", { message }),
            onToolDelta: call => publishPreview(call),
            onDelta: (text) => {
              if (signal.aborted) return;
              firstDeltaMs ??= Date.now() - modelStarted;
              partial += text;
              textStream.push(text);
            },
          });
          if (previewFrames.size) for (const call of answer.tool_calls) publishPreview(call, true);
          this.host.event(run.conversation_id, run.id, "model.finished", { step: run.steps, duration_ms: Date.now() - modelStarted, first_delta_ms: firstDeltaMs });
        } catch (error) {
          this.host.event(run.conversation_id, run.id, "model.failed", { step: run.steps, duration_ms: Date.now() - modelStarted, first_delta_ms: firstDeltaMs, code: error instanceof AppError ? error.code : signal.aborted ? "run_timeout" : "request_failed" });
          if (error instanceof AppError && error.code === "provider_context" && !contextRecovery && !partial && !previewFrames.size && !signal.aborted) {
            contextRecovery = true;
            // 明确的请求窗口拒绝未生成正文；只退回本次预留，不重放已经成功的工具。
            run.output_budget_used = Math.max(0, (run.output_budget_used ?? outputLimit) - outputLimit);
            this.host.store.saveRun(run);
            this.host.event(run.conversation_id, run.id, "model.notice", { message: "正在整理较早的记录，接着处理你的请求。" });
            continue;
          }
          throw error;
        } finally {
          textStream.finish();
        }
        signal.throwIfAborted();
        const estimatedOutputTokens = estimateTokens(
          answer.text + answer.tool_calls.map(call => call.name + call.arguments).join(""),
        );
        const measuredOutputTokens = answer.output_tokens > 0
          ? answer.output_tokens
          : estimatedOutputTokens;
        if (measuredOutputTokens <= outputLimit)
          run.output_budget_used -= outputLimit - measuredOutputTokens;
        run.input_tokens += answer.input_tokens;
        run.output_tokens += answer.output_tokens;
        this.host.store.saveRun(run);
        const previousIds = new Set(
          allHistory
            .flatMap((message) => message.tool_calls ?? [])
            .map((call) => call.id),
        );
        invariant(
          new Set(answer.tool_calls.map((call) => call.id)).size ===
            answer.tool_calls.length &&
            !answer.tool_calls.some((call) => previousIds.has(call.id)),
          502,
          "模型重复了已有工具调用标识，已阻止重复执行。",
        );
        invariant(
          answer.tool_calls.length <= 12,
          502,
          "单步工具请求过多，已停止。",
        );
        const message = this.host.message(
          run.conversation_id,
          run.id,
          "assistant",
          answer.text,
          {
            id: messageId,
            ...(answer.response_items
              ? { response_items: answer.response_items }
              : {}),
            ...(answer.tool_calls.length
              ? { tool_calls: answer.tool_calls }
              : {}),
          },
        );
        this.host.event(run.conversation_id, run.id, "message.added", { message });
        this.persistCheckpoint(run, answer.tool_calls.length ? "active" : "completed", pack.compactionKey);
        if (!partial && answer.text)
          this.host.event(run.conversation_id, run.id, "answer.ready", {
            message_id: messageId,
          });
        if (!answer.tool_calls.length) {
          this.host.store.setStatus(run, "completed");
          this.host.event(run.conversation_id, run.id, "run.status", { run });
          return;
        }
      }
    } catch (error) {
      const current = this.host.store.run(user.id, run.id);
      const cancelled =
        controller.signal.aborted || current.status === "cancelled";
      this.host.settlePending(
        run,
        cancelled
          ? "用户已停止；没有重复执行。"
          : "本轮已中断，尚未执行的工具不会自动重试。",
      );
      if (current.status === "cancelled") return;
      run.elapsed_ms = elapsed + Math.max(0, Date.now() - started);
      run.error_code = cancelled ? "cancelled" : signal.aborted ? "run_timeout" : error instanceof AppError ? error.code : "request_failed";
      const budgetPause = !cancelled && (run.error_code === "agent_step_budget" || run.error_code === "agent_task_budget");
      const nextStatus = cancelled ? "cancelled" : budgetPause ? "paused" : "failed";
      const nextError = cancelled
        ? "已停止后续执行，已有结果保留。"
        : budgetPause
          ? publicError(error)
          : signal.aborted
            ? "任务达到时长上限或请求被中断，已停止。"
            : publicError(error);
      this.host.store.setStatus(run, nextStatus, nextError);
      run.can_retry = this.host.canRetry(run);
      this.host.store.saveRun(run);
      this.persistCheckpoint(run, budgetPause ? "paused" : "failed");
      this.host.event(run.conversation_id, run.id, "run.status", { run });
    } finally {
      const current = this.host.store.run(user.id, run.id);
      current.elapsed_ms = elapsed + Math.max(0, Date.now() - started);
      this.host.store.saveRun(current);
    }
  }
}

function compact(value: unknown): unknown {
  if (typeof value === "string")
    return value.length > 16000
      ? value.slice(0, 16000) + "\n[内容已截短，可分段读取]"
      : value;
  if (Array.isArray(value)) return value.slice(0, 200).map(compact);
  if (isRecord(value))
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, compact(item)]),
    );
  return value;
}
