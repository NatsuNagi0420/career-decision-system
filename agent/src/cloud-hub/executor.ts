/** 青穗集 · 远程任务执行适配器：复用本机 Runtime，以任务 ID 保证认领重试不重复执行。 */
import type { AgentContext } from "./http.js";
import type { User, Run } from "../types.js";
import type { DeviceLimits, DeviceCatalogue, HubSnapshot, HubTask, TaskLease, HubFile } from "./protocol.js";
import { validateSettings } from "./protocol.js";
import { invariant, publicError } from "../errors.js";
import { publicSnapshot, publicValue } from "./sanitize.js";
export interface WorkerClient {
  claim(): Promise<TaskLease | null>;
  control(task: TaskLease): Promise<{ cancel_requested: boolean; decisions: Record<string, boolean> }>;
  publish(task: TaskLease, value: { local_run_id: string | null; status: HubTask["status"]; error: string | null; snapshot?: HubSnapshot; career?: Record<string, unknown> }): Promise<unknown>;
  bind(task: TaskLease, conversationId: string): Promise<unknown>;
  download(file: HubFile): Promise<Buffer>;
  upload(task: TaskLease, artifact: { id: string; name: string }, bytes: Buffer): Promise<unknown>;
}
type Execution = { user: User; task: TaskLease; client: WorkerClient; preparing: boolean; stopped: boolean; conversationId?: string; run?: Run; error?: string; uploaded: Set<string>; published: string; lastPublish: number };
export class TaskExecutor {
  private active = new Map<string, Execution>();
  private preparingJobs = new Set<Promise<void>>();
  constructor(private ctx: AgentContext) {
    ctx.store.db.exec(`CREATE TABLE IF NOT EXISTS remote_executions(task_id TEXT PRIMARY KEY,user_id INTEGER NOT NULL,session_id TEXT NOT NULL,conversation_id TEXT NOT NULL,run_id TEXT);
      CREATE TABLE IF NOT EXISTS remote_imports(file_id TEXT PRIMARY KEY,conversation_id TEXT NOT NULL,artifact_id TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS remote_sessions(session_id TEXT PRIMARY KEY,user_id INTEGER NOT NULL,conversation_id TEXT NOT NULL);`);
  }
  busy(key: string) { return this.active.has(key); }
  private async prepare(e: Execution, limits?: { limits: DeviceLimits; catalogue: DeviceCatalogue }) {
    const { store, runtime, profiles, workspace } = this.ctx, { user, task } = e;
    invariant(user.external_ai_consent, 403, "请在电脑允许模型调用。");
    const receipt = store.db.prepare("SELECT * FROM remote_executions WHERE task_id=? AND user_id=?").get(task.id, user.id) as { conversation_id: string; run_id: string | null } | undefined;
    const linked = store.db.prepare("SELECT conversation_id FROM remote_sessions WHERE session_id=? AND user_id=?").get(task.session_id, user.id);
    const localId = receipt?.conversation_id ?? linked?.conversation_id as string | undefined ?? task.local_conversation_id ?? undefined;
    const previous = localId ? store.conversation(user.id, localId) : null;
    // 继续已有会话时，电脑上的会话才是工作区、模型与读写权限的来源。
    if (!previous && limits) { const error = validateSettings(task.settings, limits); invariant(!error, 403, error ?? "电脑项目已更新。"); }
    let profile = (await profiles.list(user)).find(p => previous?.profile_id ? p.id === previous.profile_id : task.target === "cloud" || task.settings.model_source === "official" ? p.mode === "official" : p.id === task.settings.profile_id);
    invariant(profile, 409, "请在电脑上为这段对话选择可用模型。");
    if (!profile.capabilities.chat || !profile.capabilities.tools) profile = await profiles.test(user, profile.id);
    invariant(profile.capabilities.chat && profile.capabilities.tools, 409, profile.capabilities.note || "模型连接尚未通过测试。");
    invariant(!e.stopped, 409, "远程连接已停止。");
    const conversation = previous ?? store.createConversation(user.id, profile.id, task.conversation.title);
    e.conversationId = conversation.id;
    runtime.assertConversationIdle(user, conversation.id);
    if (!previous) {
      conversation.workspace_id = task.target === "pc" ? task.settings.workspace_id : null;
      conversation.workspace_access = task.settings.workspace_access;
      store.updateConversation(conversation);
    }
    store.db.prepare("INSERT INTO remote_sessions VALUES(?,?,?) ON CONFLICT(session_id) DO NOTHING").run(task.session_id, user.id, conversation.id);
    if (task.target === "pc" && conversation.workspace_id) {
      const registration = store.localWorkspace(user.id, conversation.workspace_id);
      await workspace.inspectExternalRoot(registration.root_path);
    }
    await e.client.bind(task, conversation.id);
    store.db.prepare("INSERT INTO remote_executions VALUES(?,?,?,?,NULL) ON CONFLICT(task_id) DO NOTHING").run(task.id, user.id, task.session_id, conversation.id);
    const attachments: string[] = [];
    for (const file of task.uploads) {
      let imported = store.db.prepare("SELECT artifact_id FROM remote_imports WHERE file_id=? AND conversation_id=?").get(file.id, conversation.id);
      if (!imported) {
        const bytes = await e.client.download(file);
        const artifact = await workspace.import(conversation.id, file.name, bytes.toString("base64"));
        store.db.prepare("INSERT INTO remote_imports VALUES(?,?,?)").run(file.id, conversation.id, artifact.id);
        imported = { artifact_id: artifact.id };
        runtime.event(conversation.id, null, "artifact.created", { artifact });
      }
      if (/\.(png|jpe?g|gif|webp)$/i.test(file.name)) attachments.push(String(imported.artifact_id));
    }
    invariant(!e.stopped, 409, "远程连接已停止。");
    const existing = store.findRequest(user.id, task.id);
    e.run = existing ?? runtime.start(user, conversation.id, profile.id, task.input, task.id, { permission_mode: "default", reasoning_effort: task.settings.reasoning_effort, attachment_ids: attachments.slice(-4) });
    store.db.prepare("UPDATE remote_executions SET run_id=? WHERE task_id=?").run(e.run.id, task.id);
  }
  async tick(key: string, user: User, client: WorkerClient, limits?: { limits: DeviceLimits; catalogue: DeviceCatalogue }) {
    let e = this.active.get(key);
    if (!e) {
      const task = await client.claim(); if (!task) return;
      e = { user, task, client, preparing: true, stopped: false, uploaded: new Set(), published: "", lastPublish: 0 };
      this.active.set(key, e);
      const execution = e;
      const job = this.prepare(execution, limits).catch(error => { execution.error = this.ctx.secrets.redact(publicError(error)); }).finally(() => { execution.preparing = false; this.preparingJobs.delete(job); });
      this.preparingJobs.add(job);
    }
    if (e.stopped) return;
    const control = await client.control(e.task);
    if (control.cancel_requested) {
      e.stopped = true;
      if (e.run) this.ctx.runtime.cancel(user, e.run.id);
      await client.publish(e.task, { local_run_id: e.run?.id ?? null, status: "cancelled", error: null, ...(e.conversationId ? { snapshot: publicSnapshot(this.ctx.runtime.snapshot(user, e.conversationId), this.ctx.secrets) } : {}) });
      this.active.delete(key); return;
    }
    if (e.preparing) return;
    if (e.error) {
      await client.publish(e.task, { local_run_id: e.run?.id ?? null, status: "failed", error: e.error }); this.active.delete(key); return;
    }
    if (!e.run || !e.conversationId) return;
    for (const [approvalId, approved] of Object.entries(control.decisions)) {
      const pending = this.ctx.store.approvals(e.conversationId).find(a => a.id === approvalId && a.run_id === e!.run!.id && a.status === "pending");
      if (pending) await this.ctx.runtime.decide(user, approvalId, approved);
    }
    const run = this.ctx.store.run(user.id, e.run.id);
    const snapshot = publicSnapshot(this.ctx.runtime.snapshot(user, e.conversationId), this.ctx.secrets);
    const finished = !["running", "queued", "awaiting_approval"].includes(run.status);
    for (const artifact of this.ctx.store.artifacts(e.conversationId)) {
      if (artifact.bytes > 4 * 1024 * 1024) continue;
      if (artifact.kind !== "output" || e.uploaded.has(artifact.id)) continue;
      const bytes = await this.ctx.workspace.artifactBytes(artifact);
      await client.upload(e.task, artifact, bytes);
      e.uploaded.add(artifact.id);
    }
    const digest = JSON.stringify(snapshot);
    if (finished || digest !== e.published || Date.now() - e.lastPublish > 10000) {
      const career = publicValue(this.ctx.runtime.career.view(user.id), this.ctx.secrets) as Record<string, unknown>;
      await client.publish(e.task, { local_run_id: run.id, status: run.status === "queued" ? "running" : run.status, error: run.error, snapshot, career });
      e.published = digest; e.lastPublish = Date.now();
    }
    if (finished) this.active.delete(key);
  }
  stop(key: string) {
    const e = this.active.get(key); if (!e) return;
    e.stopped = true;
    if (e.run) this.ctx.runtime.cancel(e.user, e.run.id);
    this.active.delete(key);
  }
  async close() { for (const key of this.active.keys()) this.stop(key); await Promise.allSettled([...this.preparingJobs]); }
}
