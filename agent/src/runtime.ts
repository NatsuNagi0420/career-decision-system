/** 青穗集 · 自研 Agent 执行核心：持久会话、真实工具循环、预算、审批、取消与可重放事件。 */
import { Store, id, now } from "./store.js";
import { Workspace, inputMime } from "./files.js";
import { Profiles } from "./profiles.js";
import { HostShell } from "./host-shell.js";
import { CareerWorkspace } from "./career.js";
import { CareerDecisions } from "./domain/career/decisions.js";
import { ResumeWorkspace, resumeEditInput } from "./resume.js";
import { RESUME_COACHING_GREETING } from "./resume-skill.js";
import { ConversationGuidance } from "./guidance.js";
import { activeTask } from "./guidance-contract.js";
import { invariant } from "./errors.js";
import { CareerAgentDomain } from "./domain/career/index.js";
import { AgentLoop } from "./core/agent-loop.js";
import { AgentPolicy } from "./core/agent-policy.js";
import { AgentApprovalService } from "./core/approval-service.js";
import { AgentTaskMemory } from "./core/task-memory.js";
import { pendingTools } from "./core/tool-history.js";
import { EventJournal } from "./core/event-journal.js";
import { CapabilityRegistry, type PublicCapability } from "./core/capability-registry.js";
import { ObligationService, type Obligation } from "./core/obligation-service.js";
import { MemoryConsolidator } from "./core/memory-consolidator.js";
import { LongTermMemory } from "./core/long-term-memory.js";
import { toolRegistry } from "./tools.js";
import type { AgentDomain } from "./core/contracts.js";
import type { Config } from "./config.js";
import type { ContextPack } from "./context.js";
import type {
  AgentEvent,
  Run,
  Sandbox,
  ToolCall,
  RunOptions,
  User,
  Message,
  MessageAttachment,
} from "./types.js";

export class Runtime {
  readonly career: CareerWorkspace;
  readonly decisions: CareerDecisions;
  readonly resume: ResumeWorkspace;
  readonly guidance: ConversationGuidance;
  readonly domain: AgentDomain;
  readonly journal: EventJournal;
  readonly hub: EventJournal["hub"];
  readonly loop: AgentLoop;
  readonly policy: AgentPolicy;
  readonly approvals: AgentApprovalService;
  readonly taskMemory: AgentTaskMemory;
  readonly capabilityRegistry: CapabilityRegistry;
  readonly obligations: ObligationService;
  readonly memory: LongTermMemory;
  readonly memoryJobs: MemoryConsolidator;
  private readonly hostShell = new HostShell();
  private executionSandbox(run: Run): Sandbox { return this.policy.executionSandbox(run); }
  private controllers = new Map<string, AbortController>();
  private jobs = new Set<Promise<void>>();
  private runningJobs = new Map<string, Promise<void>>();
  constructor(
    readonly store: Store,
    readonly workspace: Workspace,
    readonly profiles: Profiles,
    readonly sandbox: Sandbox,
    readonly config: Config,
    domain?: AgentDomain,
  ) {
    this.career = new CareerWorkspace(store);
    this.resume = new ResumeWorkspace(store);
    this.decisions = new CareerDecisions(store, this.career, this.resume, profiles, (cid, runId, kind, data) => this.event(cid, runId, kind, data));
    this.obligations = new ObligationService(store);
    this.memory = new LongTermMemory(store, this.career, this.resume, profiles.secrets, (cid, runId, kind, data) => this.event(cid, runId, kind, data));
    this.guidance = new ConversationGuidance(
      store,
      this.resume,
      profiles,
      (cid, guidance) => this.event(cid, null, "guidance.updated", { guidance }),
      this.obligations,
      (cid, obligation) => this.event(cid, null, "obligation.created", { obligation }),
      this.decisions,
      this.memory,
    );
    this.guidance.learningProgress = userId => this.career.learning.progress(userId);
    this.domain = domain ?? new CareerAgentDomain({ store, career: this.career, resume: this.resume, guidance: this.guidance, decisions: this.decisions, memory: this.memory, config, publishResumeState: (cid, runId, state) => { this.event(cid, runId, "resume.state", { state }); } });
    this.capabilityRegistry = new CapabilityRegistry(this.domain.capabilities?.() ?? [], {
      availableTools: toolRegistry.capabilities().map(item => item.name),
      availableProposalTypes: ["profile", "skills", "catalogue_job", "actions", "comparison"],
    });
    this.journal = new EventJournal(store, (value) => this.profiles.secrets.redactValue(value));
    this.policy = new AgentPolicy(this.sandbox, this.hostShell, config.deploymentMode === "server");
    this.taskMemory = new AgentTaskMemory(store);
    this.approvals = new AgentApprovalService({
      store,
      workspace,
      event: (...args) => this.event(...args),
      message: (...args) => this.message(...args),
      waitForRun: (runId) => this.runningJobs.get(runId),
      launch: (run, owner) => this.launch(run, owner),
    });
    this.hub = this.journal.hub;
    this.memoryJobs = new MemoryConsolidator(store, this.guidance, cid => { if (store.db.prepare("SELECT 1 FROM conversations WHERE id=?").get(cid)) this.event(cid, null, "memory.updated", { processing: true }); }, config.memoryBackground);
    this.memoryJobs.start();
    this.loop = new AgentLoop({
      store,
      workspace,
      profiles,
      config,
      domain: this.domain,
      policy: this.policy,
      executionSandbox: (run) => this.executionSandbox(run),
      event: (...args) => this.event(...args),
      message: (...args) => this.message(...args),
      settlePending: (run, reason) => this.settlePending(run, reason),
      requestExport: (owner, artifactId, run, call) => this.requestExport(owner, artifactId, run, call),
      canRetry: (run) => this.canRetry(run),
    });
    for (const run of this.store.interruptedRuns()) {
      const checkpoint = this.store.checkpoint(run.user_id, run.id);
      // 消息和“completed”检查点都已经持久化，只是进程在最后一次状态写入前退出；
      // 这种情况可以确定性收敛为 completed，避免用户看到重复回复。
      if (checkpoint?.status === "completed" && checkpoint.pending_tool_call_ids.length === 0) {
        this.store.setStatus(run, "completed");
        this.event(run.conversation_id, run.id, "run.status", { run });
        continue;
      }
      this.settlePending(
        run,
        "服务重启，无法确认这次工具是否完成。没有自动重复执行。",
      );
      // 模型请求的输出预算只是运行中的预留；请求没有形成正式回复时释放这次预留，
      // 否则用户确认继续后会被旧的半截请求错误地判定为预算耗尽。
      run.output_budget_used = run.output_tokens;
      run.error_code = "runtime_interrupted";
      this.store.setStatus(
        run,
        "interrupted",
        "服务重启中断了运行。已保留资料和记录，请核对结果后再继续。",
      );
      if (checkpoint) {
        checkpoint.status = "failed";
        checkpoint.pending_tool_call_ids = [];
        checkpoint.updated_at = now();
        this.store.saveCheckpoint(checkpoint);
      }
      this.event(run.conversation_id, run.id, "run.status", { run });
    }
  }
  capabilities(): PublicCapability[] {
    return this.capabilityRegistry.list(this.domain.id);
  }
  listObligations(user: User, conversationId?: string): Obligation[] {
    if (conversationId) this.store.conversation(user.id, conversationId);
    return this.obligations.list(user.id, conversationId);
  }
  claimObligation(user: User, obligationId: string): Obligation {
    const obligation = this.obligations.claim(user.id, obligationId);
    this.event(obligation.conversation_id, null, "obligation.updated", { obligation });
    return obligation;
  }
  abandonObligation(user: User, obligationId: string): Obligation {
    const obligation = this.obligations.abandon(user.id, obligationId);
    this.event(obligation.conversation_id, null, "obligation.updated", { obligation });
    return obligation;
  }
  event(
    conversationId: string,
    runId: string | null,
    kind: string,
    data: Record<string, unknown>,
    publish = true,
  ) {
    return this.journal.append(conversationId, runId, kind, data, publish);
  }
  subscribe(conversationId: string, listener: (event: AgentEvent) => void) {
    return this.journal.subscribe(conversationId, listener);
  }
  recordContextCompaction(run: Run, pack: ContextPack, trigger: "pressure" | "context-overflow" = "pressure") {
    this.loop.recordContextCompaction(run, pack, trigger);
  }
  openResumeConversation(user: User, profileId: string | null) {
    if (profileId) this.store.profile(user.id, profileId);
    const existing = this.store.conversations(user.id).filter(item => item.mode === "resume" && !item.archived).sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0];
    if (existing) return existing;
    invariant(this.store.conversations(user.id).length < 1000, 400, "对话数达到上限，请先整理历史。");
    return this.store.transaction(() => {
      const conversation = this.store.createConversation(user.id, profileId, "和穗奈一起写简历");
      conversation.mode = "resume";
      this.store.updateConversation(conversation);
      const state = this.resume.get(user.id);
      const greeting = state.source_text ? "我们接着整理你的简历。之前的经历原文和草稿还在，不用重新填一遍。\n\n你想先补充一段经历，还是让我看看哪些地方还需要说清楚？" : RESUME_COACHING_GREETING;
      const message = this.message(conversation.id, null, "assistant", greeting);
      this.event(conversation.id, null, "message.added", { message });
      return conversation;
    });
  }
  assertConversationIdle(user: User, conversationId: string) {
    this.store.conversation(user.id, conversationId);
    this.store.assertIdle(conversationId);
    invariant(!this.store.runs(conversationId).some(run => this.controllers.has(run.id)), 409, "上一任务仍在清理，请稍等片刻再操作。");
  }
  async deleteConversation(user: User, conversationId: string) {
    this.assertConversationIdle(user, conversationId);
    this.guidance.cancelAnalysis(conversationId);
    const artifacts = this.store.artifacts(conversationId);
    const edits = this.store.projectEdits(conversationId);
    this.workspace.assertIdle(conversationId);
    const unlock = this.store.lockDeletion(user.id, conversationId);
    try {
      await this.workspace.removeConversation(conversationId, artifacts, edits);
      this.memory.purgeConversation(user.id, conversationId);
      this.store.deleteConversation(user.id, conversationId);
      this.hub.emit("conversation.deleted", conversationId);
      return { ok: true as const, id: conversationId };
    } finally { unlock(); }
  }
  snapshot(user: User, conversationId: string) {
    const conversation = this.store.conversation(user.id, conversationId);
    const finalized = new Set(
      this.store.messages(conversationId).map((message) => message.id),
    );
    const drafts: Record<string, string> = {};
    // 流式恢复必须绑定当前运行；新运行排队时，不能拾起上一轮被替换或失败的正文。
    const active = this.store.activeRun(conversationId);
    const runs = this.store.runs(conversationId);
    if (active)
      for (const event of this.store.draftEvents(conversationId, active.id)) {
        const key = String(event.data.message_id);
        if (!finalized.has(key))
          drafts[key] = (drafts[key] ?? "") + String(event.data.text ?? "");
      }
    return {
      conversation,
      plan: this.taskMemory.latest(user.id, conversationId),
      guidance: this.guidance.view(user.id, conversationId),
      obligations: this.obligations.list(user.id, conversationId),
      events: this.store.recentEvents(conversationId),
      resume: { ...this.resume.get(user.id), evidence_review: this.decisions.resumeReview(user.id) },
      drafts,
      messages: this.store
        .messages(conversationId)
        .map(({ response_items: _private, ...message }) => message),
      runs: runs.map((run, index) => ({ ...run, error_code: this.failureCode(run), can_retry: !conversation.archived && index === runs.length - 1 && this.canRetry(run) })),
      artifacts: this.store.artifacts(conversationId),
      approvals: this.store.approvals(conversationId),
      checkpoints: this.store.checkpoints(conversationId),
      last_seq: this.store.lastSeq(conversationId),
    };
  }
  private failureCode(run: Run): string | undefined {
    // 兼容修复前已保存的超时记录，不推断其他未知失败为可重试。
    return run.error_code ?? (run.status === "failed" && /^模型请求超时/.test(run.error ?? "") ? "provider_timeout" : undefined);
  }
  private canRetry(run: Run): boolean {
    const code = this.failureCode(run) ?? "";
    if (!(run.status === "failed" || run.status === "paused" || run.status === "interrupted") || Boolean(run.superseded_by)) return false;
    if (code === "agent_step_budget") {
      return Boolean(this.store.checkpoint(run.user_id, run.id)) &&
        (run.continuation_count ?? 0) < this.config.maxContinuations &&
        (run.total_steps ?? run.steps) < this.config.maxTaskSteps &&
        !this.loop.hasPending(run);
    }
    if (code === "agent_task_budget") return false;
    const runTimeout = code === "run_timeout";
    return ["provider_timeout", "provider_network", "provider_stream", "provider_408", "provider_429", "relay_busy", "relay_daily_request_limit", "relay_daily_output_limit", "provider_500", "provider_502", "provider_503", "provider_504", "run_timeout", "runtime_interrupted"].includes(code) &&
      (run.retry_count ?? 0) < 2 && run.steps < this.config.maxTotalSteps &&
      (runTimeout || (run.elapsed_ms ?? 0) < this.config.runTimeoutMs) &&
      (run.output_budget_used ?? run.output_tokens) < this.config.maxRunOutputTokens;
  }
  private continueFromCheckpoint(user: User, source: Run, requestId: string) {
    const checkpoint = this.store.checkpoint(user.id, source.id);
    invariant(checkpoint, 409, "找不到这次任务的安全检查点，请从当前对话发送新消息。", "checkpoint_missing");
    invariant(checkpoint.pending_tool_call_ids.length === 0, 409, "上一次运行还有未确认的工具结果，请先核对后再继续。", "checkpoint_pending");
    const continuationCount = (source.continuation_count ?? 0) + 1;
    const next: Run = {
      ...source,
      id: id(),
      request_id: requestId,
      status: "queued",
      steps: 0,
      input_tokens: 0,
      output_tokens: 0,
      error: null,
      error_code: undefined,
      can_retry: false,
      retry_count: 0,
      retry_request_id: undefined,
      continuation_run_id: undefined,
      checkpoint_id: undefined,
      checkpoint_step: undefined,
      parent_run_id: source.id,
      continuation_count: continuationCount,
      total_steps: source.total_steps ?? source.steps,
      elapsed_ms: 0,
      output_budget_used: 0,
      created_at: now(),
      updated_at: now(),
    };
    source.retry_request_id = requestId;
    source.continuation_run_id = next.id;
    source.can_retry = false;
    const events: AgentEvent[] = [];
    this.store.transaction(() => {
      this.store.saveRun(source);
      this.store.saveRun(next, true);
      events.push(this.event(source.conversation_id, source.id, "run.continued", {
        source_run_id: source.id,
        continuation_run_id: next.id,
        checkpoint,
        continuation_count: continuationCount,
      }, false));
      events.push(this.event(next.conversation_id, next.id, "run.status", { run: next }, false));
    });
    for (const event of events) this.hub.emit(source.conversation_id, event);
    this.launch(next, user);
    return next;
  }
  retry(user: User, runId: string, requestId: string, fullAccessConfirmed = false) {
    const run = this.store.run(user.id, runId);
    if (run.retry_request_id === requestId)
      return run.continuation_run_id ? this.store.run(user.id, run.continuation_run_id) : run;
    invariant(this.canRetry(run), 409, "这次任务不能直接续接，请核对记录后发送新消息。", "retry_unavailable");
    const conversation = this.store.conversation(user.id, run.conversation_id);
    invariant(!conversation.archived, 409, "请先恢复已归档的对话。", "retry_unavailable");
    this.assertConversationIdle(user, run.conversation_id);
    invariant(this.store.runs(run.conversation_id).at(-1)?.id === run.id, 409, "对话已经继续，请从最新消息接着聊。", "retry_stale");
    invariant(this.store.getUser(user.id).external_ai_consent, 403, "请先同意调用所选模型服务。");
    invariant(run.permission_mode !== "full-access" || fullAccessConfirmed, 403, "续接前请重新确认完全访问权限。");
    invariant(this.config.deploymentMode !== "server" || run.permission_mode === "default", 403, "云端不提供宿主机完全访问。", "local_only");
    const profile = this.store.profile(user.id, run.profile_id);
    invariant(profile.capabilities.chat && profile.capabilities.tested_at, 409, "请先测试当前模型连接。");
    const task = activeTask(conversation.guidance);
    invariant((task?.id ?? undefined) === run.task_id && (task?.kind ?? undefined) === run.task_kind, 409, "当前任务模式已经更改，请从当前进度继续聊天。", "retry_stale");
    invariant(!this.loop.hasPending(run), 409, "存在尚未确认的工具结果，不能自动重跑。");
    this.guidance.cancelAnalysis(run.conversation_id);
    const failureCode = this.failureCode(run);
    if (failureCode === "agent_step_budget") return this.continueFromCheckpoint(user, run, requestId);
    run.retry_count = (run.retry_count ?? 0) + 1;
    run.retry_request_id = requestId;
    run.error_code = undefined;
    run.can_retry = false;
    if (failureCode === "run_timeout") run.elapsed_ms = 0;
    const events: AgentEvent[] = [];
    this.store.transaction(() => {
      this.store.setStatus(run, "queued");
      events.push(this.event(run.conversation_id, run.id, "run.retry", { attempt: run.retry_count }, false));
      events.push(this.event(run.conversation_id, run.id, "run.status", { run }, false));
    });
    for (const event of events) this.hub.emit(run.conversation_id, event);
    this.launch(run, user);
    return run;
  }
  start(
    user: User,
    conversationId: string,
    profileId: string,
    input: string,
    requestId: string,
    options: RunOptions = {},
  ) {
    const permission = options.permission_mode ?? "default";
    invariant(this.config.deploymentMode !== "server" || permission === "default", 403, "云端不提供宿主机完全访问。", "local_only");
    const effort = options.reasoning_effort ?? "auto";
    const resumeEdit = options.resume_edit ? resumeEditInput.parse(options.resume_edit) : undefined;
    const attachmentIds = [...new Set(options.attachment_ids ?? [])].sort();
    invariant(attachmentIds.length <= 4, 400, "一条消息最多附加 4 张图片。", "attachments_limit");
    invariant(permission !== "full-access" || options.full_access_confirmed === true, 403, "完全访问需要你在权限设置中明确确认。");
    this.store.conversation(user.id, conversationId);
    input = this.profiles.secrets.redact(input);
    const attachments: MessageAttachment[] = attachmentIds.map((artifactId) => {
      const artifact = this.store.artifact(user.id, artifactId);
      invariant(artifact.conversation_id === conversationId && artifact.kind === "input" && artifact.path.startsWith("inputs/"), 400, "图片不属于当前对话资料。", "attachment_scope");
      const mime = inputMime(artifact.name);
      invariant(Boolean(mime), 415, "当前只支持 PNG、JPEG、GIF 或 WebP 图片。", "attachment_type");
      return { artifact_id: artifact.id, name: artifact.name, mime: mime! };
    });
    const previous = this.store.findRequest(user.id, requestId);
    if (previous) {
      invariant(
        previous.conversation_id === conversationId &&
          previous.input === input &&
          previous.profile_id === profileId &&
          previous.replaces_message_id === options.replaces_message_id &&
          JSON.stringify(previous.resume_edit) === JSON.stringify(resumeEdit) &&
          (previous.permission_mode ?? "default") === permission &&
          (previous.reasoning_effort ?? "auto") === effort &&
          previous.obligation_id === options.obligation_id &&
          JSON.stringify(previous.attachment_ids ?? []) === JSON.stringify(attachmentIds),
        409,
        "相同提交标识不能用于不同请求。",
      );
      return previous;
    }
    invariant(Number(this.store.db.prepare("SELECT COUNT(*) AS count FROM runs WHERE status IN ('queued','running','awaiting_approval')").get()?.count ?? 0) < this.config.maxActiveRuns, 429, "穗奈正在处理其他任务，请稍后再试。", "agent_busy");
    invariant(
      user.external_ai_consent,
      403,
      "请先在模型设置中同意将请求交给所选模型服务。",
    );
    const conversation = this.store.conversation(user.id, conversationId);
    invariant(!conversation.archived, 409, "请先恢复已归档的对话，再继续发送消息。");
    const profile = this.store.profile(user.id, profileId);
    invariant(
      profile.capabilities.chat && profile.capabilities.tested_at,
      409,
      "请先完成模型连接测试。",
    );
    this.store.assertIdle(conversationId);
    invariant(
      !this.store
        .runs(conversationId)
        .some((value) => this.controllers.has(value.id)),
      409,
      "上一任务仍在清理，请稍等片刻再继续。",
    );
    const replaces = options.replaces_message_id;
    if (replaces) {
      const source = this.store.messages(conversationId).find(message => message.id === replaces);
      invariant(source?.role === "user", 409, "只能编辑当前对话里的用户消息；消息可能已经更新，请刷新后重试。", "message_stale");
    }
    this.guidance.cancelAnalysis(conversationId);
    const task = activeTask(conversation.guidance);
    if (task?.kind === "resume" || resumeEdit) this.guidance.assertResumeAccess(user.id, conversationId);
    if (resumeEdit) invariant(profile.capabilities.tools && !replaces && !attachmentIds.length && !options.obligation_id, 400, "框选修改需要支持工具的模型，且须作为独立请求发送。");
    if (options.obligation_id) {
      const pending = this.store.obligation(user.id, options.obligation_id);
      invariant(pending.conversation_id === conversationId, 409, "这条下一步不属于当前对话。", "obligation_conversation");
      this.obligations.claim(user.id, options.obligation_id);
    }
    const run: Run = {
      task_kind: task?.kind, task_id: task?.id,
      ...(resumeEdit ? { resume_edit: resumeEdit } : {}),
      ...(replaces ? { replaces_message_id: replaces } : {}),
      id: id(),
      conversation_id: conversationId,
      user_id: user.id,
      profile_id: profileId,
      request_id: requestId,
      permission_mode: permission,
      reasoning_effort: effort,
      ...(attachmentIds.length ? { attachment_ids: attachmentIds } : {}),
      ...(options.obligation_id ? { obligation_id: options.obligation_id } : {}),
      input,
      status: "queued",
      steps: 0,
      total_steps: 0,
      input_tokens: 0,
      output_tokens: 0,
      error: null,
      created_at: now(),
      updated_at: now(),
    };
    const committed: AgentEvent[] = [];
    this.store.transaction(() => {
      if (resumeEdit) {
        const state = this.resume.beginEdit(user.id, conversationId, run.id, resumeEdit);
        committed.push(this.event(conversationId, run.id, "resume.state", { state }, false));
      }
      if (replaces) {
        const hidden = this.store.supersedeFrom(user.id, conversationId, replaces, run.id);
        this.memory.invalidateMessages(user.id, conversationId, hidden.message_ids);
        for (const obligation of this.store.abandonObligationsForRuns(user.id, conversationId, hidden.run_ids, now()))
          committed.push(this.event(conversationId, null, "obligation.updated", { obligation }, false));
        if (conversation.guidance) conversation.guidance = { ...conversation.guidance, revision: conversation.guidance.revision + 1, memory: null, suggestion: null, analyzed_message_id: null };
        // 先保存清空的小结，防止新分支继续使用旧对话推断；共享事实档案不在这里回滚。
        this.store.updateConversation(conversation);
        committed.push(this.event(conversationId, null, "conversation.rewound", { ...hidden, guidance: this.guidance.view(user.id, conversationId) }, false));
      }
      this.store.saveRun(run, true);
      const message = this.message(conversationId, run.id, "user", input, attachments.length ? { attachments } : {});
      committed.push(
        this.event(conversationId, run.id, "message.added", { message }, false),
      );
      conversation.profile_id = profileId;
      if (conversation.title === "新的对话" && !conversation.title_manual)
        conversation.title = input.slice(0, 32);
      this.store.updateConversation(conversation);
      committed.push(
        this.event(conversationId, run.id, "run.status", { run }, false),
      );
    });
    for (const event of committed) this.hub.emit(conversationId, event);
    this.launch(run, user);
    return run;
  }
  private launch(run: Run, user: User) {
    if (this.controllers.has(run.id)) return;
    const controller = new AbortController();
    this.controllers.set(run.id, controller);
    const job = new Promise<void>((resolve) => setImmediate(resolve))
      .then(async () => {
        const profile = this.store.profile(user.id, run.profile_id);
        const query = this.store.messages(run.conversation_id).filter(m => m.role === "user").at(-1)?.content ?? "";
        await this.memory.prepareRecall(user.id, run.conversation_id, run.id, query, () => this.profiles.model(user, profile), controller.signal);
        await this.loop.run(run, user, controller);
      })
      .then(() => {
        this.finishObligation(run, user);
        // 职业事实整理由服务端触发，不依赖页面是否仍开着。主回复完成后再运行，不延长任务忙碌状态。
        const current = this.store.run(user.id, run.id);
        const message = this.store.messages(run.conversation_id).filter(m => m.role === "user").at(-1);
        if (!current.superseded_by && ["completed", "waiting_input"].includes(current.status) && message)
          this.memoryJobs.enqueue(user.id, run.conversation_id, run.profile_id, message.id);
      })
      .finally(() => {
        this.memory.releaseRecall(run.id);
        this.controllers.delete(run.id);
        this.jobs.delete(job);
        this.runningJobs.delete(run.id);
      });
    this.jobs.add(job);
    this.runningJobs.set(run.id, job);
  }
  private finishObligation(run: Run, user: User) {
    if (!run.obligation_id) return;
    const current = this.store.run(user.id, run.id);
    if (current.status !== "completed") return;
    try {
      const obligation = this.obligations.fulfill(user.id, run.obligation_id);
      this.event(obligation.conversation_id, run.id, "obligation.updated", { obligation });
    } catch {
      // A user can explicitly abandon a claimed item while its run is finishing.
      // The durable status remains the user's decision; do not resurrect it.
    }
  }
  async waitIdle() {
    await Promise.all([...this.jobs]);
  }
  async shutdown() {
    await this.memoryJobs.close();
    await this.guidance.shutdown();
    for (const controller of this.controllers.values()) controller.abort();
    await this.waitIdle();
    this.hub.removeAllListeners();
  }
  cancel(user: User, runId: string) {
    const run = this.store.run(user.id, runId);
    if (!["queued", "running", "awaiting_approval"].includes(run.status))
      return run;
    this.controllers.get(run.id)?.abort();
    if (!this.controllers.has(run.id))
      this.settlePending(run, "用户已停止，不再执行这次请求。已有输出会保留。");
    for (const approval of this.store.approvals(run.conversation_id))
      if (approval.run_id === run.id && approval.status === "pending") {
        approval.status = "rejected";
        this.store.saveApproval(approval);
        if (approval.tool_call_id) {
          const receipt = this.store.toolExecution(user.id, approval.tool_call_id);
          if (receipt && receipt.status === "waiting") {
            receipt.status = "failed";
            receipt.error = "用户停止任务，未导出。";
            receipt.updated_at = now();
            this.store.saveToolExecution(receipt);
          }
        }
        this.event(run.conversation_id, run.id, "approval.updated", { approval });
      }
    this.store.setStatus(
      run,
      "cancelled",
      "已停止后续执行；已经产生的文件和记录不会被假装撤销。",
    );
    this.event(run.conversation_id, run.id, "run.status", { run });
    return run;
  }
  private message(
    conversationId: string,
    runId: string | null,
    role: Message["role"],
    content: string,
    extra: Partial<Message> = {},
  ) {
    const safeExtra = this.profiles.secrets.redactValue(
      extra,
    ) as Partial<Message>;
    return this.store.message(
      conversationId,
      runId,
      role,
      this.profiles.secrets.redact(content),
      safeExtra,
    );
  }
  private settlePending(run: Run, reason: string) {
    for (const call of pendingTools(this.store.messages(run.conversation_id), run.id)) {
      const receipt = this.store.toolExecution(run.user_id, call.id);
      const replayable = receipt?.status === "succeeded" || receipt?.status === "failed";
      const content = replayable
        ? receipt!.status === "succeeded"
          ? JSON.stringify({ ok: true, result: receipt!.result })
          : JSON.stringify({ ok: false, error: receipt!.error ?? reason })
        : JSON.stringify({ ok: false, error: reason });
      if (receipt?.status === "started") {
        receipt.status = "uncertain";
        receipt.error = reason;
        receipt.updated_at = now();
        this.store.saveToolExecution(receipt);
      }
      const result = this.message(run.conversation_id, run.id, "tool", content, { tool_call_id: call.id });
      this.event(run.conversation_id, run.id, "message.added", { message: result });
      this.event(run.conversation_id, run.id, "tool.finished", {
        call_id: call.id,
        name: call.name,
        ok: replayable && receipt!.status === "succeeded",
        ...(replayable && receipt!.status === "succeeded" ? { result: receipt!.result } : { error: receipt?.error ?? reason }),
        replayed: replayable,
        uncertain: !replayable,
      });
    }
  }

  async requestExport(
    user: User,
    artifactId: string,
    run: Run | null = null,
    call: ToolCall | null = null,
  ) {
    return this.approvals.requestExport(user, artifactId, run, call);
  }
  async decide(user: User, approvalId: string, approved: boolean) {
    return this.approvals.decide(user, approvalId, approved);
  }

}
