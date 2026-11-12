/** 青穗集 · 统一 SQLite 主库：账号、会话、岗位、事件、版本与审批共用同一数据库。 */
import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type {
  AgentEvent,
  Approval,
  Artifact,
  Conversation,
  Message,
  Profile,
  Run,
  RunStatus,
  User,
  LocalWorkspace,
  ProjectEdit,
  AgentCheckpoint,
  ToolExecution,
} from "./types.js";
import type { Obligation, ObligationStatus } from "./core/obligation-service.js";
import { AppError, invariant } from "./errors.js";
import { ONBOARDING_VERSION, ONBOARDING_LAST_STEP, type OnboardingState, type OnboardingUpdate } from "./onboarding-contract.js";
export const id = () => randomUUID();
export const now = () => new Date().toISOString();

function obligationFromRow(row: Record<string, unknown>): Obligation {
  return {
    id: String(row.id),
    user_id: Number(row.user_id),
    conversation_id: String(row.conversation_id),
    source_run_id: row.source_run_id == null ? null : String(row.source_run_id),
    capability_id: String(row.capability_id),
    intent: String(row.intent),
    title: String(row.title),
    status: String(row.status) as ObligationStatus,
    trigger: String(row.trigger) as Obligation["trigger"],
    due_at: row.due_at == null ? null : String(row.due_at),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    claimed_at: row.claimed_at == null ? null : String(row.claimed_at),
    resolved_at: row.resolved_at == null ? null : String(row.resolved_at),
  };
}

export class Store {
  readonly db: DatabaseSync;
  private readonly deleting = new Set<string>();
  constructor(file: string) {
    if (file !== ":memory:") mkdirSync(dirname(file), { recursive: true });
    this.db = new DatabaseSync(file);
    this.db.exec(
      [
        "PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;",
        "CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY,username TEXT NOT NULL UNIQUE,password_hash TEXT NOT NULL,consent INTEGER NOT NULL DEFAULT 0);",
        "CREATE TABLE IF NOT EXISTS sessions(hash TEXT PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id),expires_at TEXT NOT NULL);",
        "CREATE TABLE IF NOT EXISTS user_onboarding(user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,version INTEGER NOT NULL,status TEXT NOT NULL,step INTEGER NOT NULL,updated_at TEXT NOT NULL);",
        "CREATE TABLE IF NOT EXISTS profiles(id TEXT PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id),data TEXT NOT NULL,secret TEXT);",
        "CREATE TABLE IF NOT EXISTS conversations(id TEXT PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id),data TEXT NOT NULL);",
        "CREATE TABLE IF NOT EXISTS local_workspaces(id TEXT PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id),name TEXT NOT NULL,root_path TEXT NOT NULL,canonical_path TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,last_used_at TEXT,UNIQUE(user_id,canonical_path));",
        "CREATE INDEX IF NOT EXISTS local_workspaces_by_user ON local_workspaces(user_id,updated_at);",
        "CREATE TABLE IF NOT EXISTS runs(id TEXT PRIMARY KEY,conversation_id TEXT NOT NULL REFERENCES conversations(id),user_id INTEGER NOT NULL REFERENCES users(id),request_id TEXT NOT NULL,status TEXT NOT NULL,data TEXT NOT NULL,UNIQUE(user_id,request_id));",
        "CREATE UNIQUE INDEX IF NOT EXISTS one_active_run ON runs(conversation_id) WHERE status IN ('queued','running','awaiting_approval');",
        "CREATE TABLE IF NOT EXISTS agent_checkpoints(id TEXT PRIMARY KEY,run_id TEXT NOT NULL UNIQUE REFERENCES runs(id),conversation_id TEXT NOT NULL REFERENCES conversations(id),user_id INTEGER NOT NULL REFERENCES users(id),updated_at TEXT NOT NULL,data TEXT NOT NULL);",
        "CREATE INDEX IF NOT EXISTS checkpoints_by_conversation ON agent_checkpoints(conversation_id,updated_at);",
        "CREATE TABLE IF NOT EXISTS tool_executions(call_id TEXT PRIMARY KEY,run_id TEXT NOT NULL REFERENCES runs(id),conversation_id TEXT NOT NULL REFERENCES conversations(id),user_id INTEGER NOT NULL REFERENCES users(id),data TEXT NOT NULL);",
        "CREATE INDEX IF NOT EXISTS tool_executions_by_run ON tool_executions(run_id);",
        "CREATE TABLE IF NOT EXISTS messages(sort INTEGER PRIMARY KEY AUTOINCREMENT,id TEXT NOT NULL UNIQUE,conversation_id TEXT NOT NULL REFERENCES conversations(id),data TEXT NOT NULL);",
        "CREATE TABLE IF NOT EXISTS events(seq INTEGER PRIMARY KEY AUTOINCREMENT,conversation_id TEXT NOT NULL REFERENCES conversations(id),run_id TEXT,kind TEXT NOT NULL,data TEXT NOT NULL,created_at TEXT NOT NULL);",
        "CREATE INDEX IF NOT EXISTS events_by_conversation ON events(conversation_id,seq);",
        "CREATE TABLE IF NOT EXISTS artifacts(id TEXT PRIMARY KEY,conversation_id TEXT NOT NULL REFERENCES conversations(id),data TEXT NOT NULL);",
        "CREATE TABLE IF NOT EXISTS approvals(id TEXT PRIMARY KEY,conversation_id TEXT NOT NULL REFERENCES conversations(id),user_id INTEGER NOT NULL REFERENCES users(id),status TEXT NOT NULL,data TEXT NOT NULL);",
         "CREATE TABLE IF NOT EXISTS obligations(id TEXT PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id),conversation_id TEXT NOT NULL REFERENCES conversations(id),source_run_id TEXT,capability_id TEXT NOT NULL,intent TEXT NOT NULL,title TEXT NOT NULL,status TEXT NOT NULL,trigger TEXT NOT NULL,due_at TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,claimed_at TEXT,resolved_at TEXT);",
        "CREATE INDEX IF NOT EXISTS obligations_by_user_status ON obligations(user_id,status,updated_at);",
        "CREATE INDEX IF NOT EXISTS obligations_by_conversation ON obligations(conversation_id,updated_at);",
         "CREATE TABLE IF NOT EXISTS project_edits(id TEXT PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id),conversation_id TEXT NOT NULL REFERENCES conversations(id),data TEXT NOT NULL);",
         "CREATE INDEX IF NOT EXISTS project_edits_by_conversation ON project_edits(conversation_id);",
      ].join(" "),
    );
  }
  close() {
    this.db.close();
  }
  private transactionDepth = 0;
  private transactionSequence = 0;
  transaction<T>(fn: () => T): T {
    const nested = this.transactionDepth > 0, savepoint = "app_" + (++this.transactionSequence);
    this.db.exec(nested ? "SAVEPOINT " + savepoint : "BEGIN IMMEDIATE");
    this.transactionDepth++;
    try {
      const result = fn();
      this.db.exec(nested ? "RELEASE SAVEPOINT " + savepoint : "COMMIT");
      return result;
    } catch (error) {
      this.db.exec(nested ? "ROLLBACK TO SAVEPOINT " + savepoint + "; RELEASE SAVEPOINT " + savepoint : "ROLLBACK");
      throw error;
    } finally { this.transactionDepth--; }
  }
  getUser(userId: number): User {
    const row = this.db
      .prepare("SELECT id,username,consent FROM users WHERE id=?")
      .get(userId) as
      | { id: number; username: string; consent: number }
      | undefined;
    invariant(row, 401, "登录已过期，请重新登录。");
    return {
      id: row.id,
      username: row.username,
      external_ai_consent: row.consent === 1,
    };
  }
  beginOnboarding(userId: number) {
    this.db.prepare("INSERT OR IGNORE INTO user_onboarding(user_id,version,status,step,updated_at) VALUES(?,?,'pending',0,?)").run(userId, ONBOARDING_VERSION, now());
  }
  onboarding(userId: number): OnboardingState {
    const row = this.db.prepare("SELECT version,status,step,updated_at FROM user_onboarding WHERE user_id=?").get(userId);
    // 升级前已有的账号不补弹教学；新注册／新工作区由身份入口显式初始化。
    return row ? { version: ONBOARDING_VERSION, status: row.status as OnboardingState["status"], step: Number(row.step), updated_at: String(row.updated_at) } : { version: ONBOARDING_VERSION, status: "legacy", step: 0, updated_at: null };
  }
  updateOnboarding(userId: number, input: OnboardingUpdate): OnboardingState {
    return this.transaction(() => {
      const current = this.onboarding(userId);
      // 防止稍晚到达的“下一步”请求把完成／跳过状态覆盖回未完成。
      if (input.status === "pending" && current.status !== "pending") return current;
      const step = input.status === "completed" ? ONBOARDING_LAST_STEP : input.status === "pending" ? Math.max(current.step, input.step) : input.step;
      this.db.prepare("INSERT INTO user_onboarding(user_id,version,status,step,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET version=excluded.version,status=excluded.status,step=excluded.step,updated_at=excluded.updated_at").run(userId, ONBOARDING_VERSION, input.status, step, now());
      return this.onboarding(userId);
    });
  }
  setConsent(userId: number, enabled: boolean) {
    this.db
      .prepare("UPDATE users SET consent=? WHERE id=?")
      .run(enabled ? 1 : 0, userId);
  }
  saveProfile(profile: Profile, secret: string | null) {
    this.db
      .prepare(
        "INSERT INTO profiles(id,user_id,data,secret) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,secret=excluded.secret",
      )
      .run(profile.id, profile.user_id, JSON.stringify(profile), secret);
  }
  profile(userId: number, profileId: string): Profile {
    const row = this.db
      .prepare("SELECT data FROM profiles WHERE id=? AND user_id=?")
      .get(profileId, userId);
    invariant(row, 404, "模型配置不存在。");
    return JSON.parse(row.data as string) as Profile;
  }
  profiles(userId: number): Profile[] {
    return this.db
      .prepare("SELECT data FROM profiles WHERE user_id=? ORDER BY rowid DESC")
      .all(userId)
      .map((row) => JSON.parse(row.data as string));
  }
  private localWorkspaceFromRow(row: Record<string, unknown>): LocalWorkspace {
    return {
      id: String(row.id),
      user_id: Number(row.user_id),
      name: String(row.name),
      root_path: String(row.root_path),
      canonical_path: String(row.canonical_path),
      created_at: String(row.created_at),
      updated_at: String(row.updated_at),
      last_used_at: row.last_used_at == null ? null : String(row.last_used_at),
    };
  }
  saveLocalWorkspace(
    userId: number,
    value: Pick<LocalWorkspace, "name" | "root_path" | "canonical_path">,
  ): LocalWorkspace {
    this.getUser(userId);
    const timestamp = now();
    this.db.prepare(
      "INSERT INTO local_workspaces(id,user_id,name,root_path,canonical_path,created_at,updated_at,last_used_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(user_id,canonical_path) DO UPDATE SET name=excluded.name,root_path=excluded.root_path,updated_at=excluded.updated_at",
    ).run(id(), userId, value.name, value.root_path, value.canonical_path, timestamp, timestamp, null);
    return this.localWorkspaceByPath(userId, value.canonical_path);
  }
  localWorkspaces(userId: number): LocalWorkspace[] {
    this.getUser(userId);
    return this.db.prepare(
      "SELECT * FROM local_workspaces WHERE user_id=? ORDER BY COALESCE(last_used_at,updated_at) DESC, name COLLATE NOCASE",
    ).all(userId).map(row => this.localWorkspaceFromRow(row as Record<string, unknown>));
  }
  localWorkspace(userId: number, workspaceId: string): LocalWorkspace {
    const row = this.db.prepare("SELECT * FROM local_workspaces WHERE id=? AND user_id=?").get(workspaceId, userId) as Record<string, unknown> | undefined;
    invariant(row, 404, "本机工作区不存在。", "workspace_not_found");
    return this.localWorkspaceFromRow(row);
  }
  private localWorkspaceByPath(userId: number, canonicalPath: string): LocalWorkspace {
    const row = this.db.prepare("SELECT * FROM local_workspaces WHERE user_id=? AND canonical_path=?").get(userId, canonicalPath) as Record<string, unknown> | undefined;
    invariant(row, 404, "本机工作区登记失败。", "workspace_not_found");
    return this.localWorkspaceFromRow(row);
  }
  touchLocalWorkspace(userId: number, workspaceId: string, usedAt = now()) {
    this.localWorkspace(userId, workspaceId);
    this.db.prepare("UPDATE local_workspaces SET last_used_at=?,updated_at=? WHERE id=? AND user_id=?").run(usedAt, usedAt, workspaceId, userId);
  }
  deleteLocalWorkspace(userId: number, workspaceId: string) {
    this.localWorkspace(userId, workspaceId);
    this.db.prepare("DELETE FROM local_workspaces WHERE id=? AND user_id=?").run(workspaceId, userId);
  }
  /** 内部运行时读取已完成鉴权的会话；HTTP 层仍必须使用 conversation(userId, id)。 */
  conversationById(conversationId: string): Conversation {
    const row = this.db.prepare("SELECT data FROM conversations WHERE id=?").get(conversationId) as { data: string } | undefined;
    invariant(row, 404, "对话不存在。", "conversation_not_found");
    this.assertAvailable(conversationId);
    return JSON.parse(row.data) as Conversation;
  }
  secret(userId: number, profileId: string): string | null {
    this.profile(userId, profileId);
    return (
      (this.db
        .prepare("SELECT secret FROM profiles WHERE id=? AND user_id=?")
        .get(profileId, userId)?.secret as string | null) ?? null
    );
  }
  deleteProfile(userId: number, profileId: string) {
    this.profile(userId, profileId);
    this.db
      .prepare("DELETE FROM profiles WHERE id=? AND user_id=?")
      .run(profileId, userId);
  }
  createConversation(
    userId: number,
    profileId: string | null,
    title = "新的对话",
  ): Conversation {
    const value: Conversation = {
      id: id(),
      user_id: userId,
      title,
      profile_id: profileId,
      created_at: now(),
      updated_at: now(),
    };
    this.db
      .prepare("INSERT INTO conversations VALUES(?,?,?)")
      .run(value.id, userId, JSON.stringify(value));
    return value;
  }
  assertAvailable(conversationId: string) {
    invariant(!this.deleting.has(conversationId), 409, "这段对话正在删除，请稍后再试。");
  }
  lockDeletion(userId: number, conversationId: string) {
    this.conversation(userId, conversationId);
    this.assertIdle(conversationId);
    this.deleting.add(conversationId);
    return () => this.deleting.delete(conversationId);
  }
  deleteConversation(userId: number, conversationId: string) {
    // 文件清理成功后才进入事务；不碰独立保存的职业档案、简历及其历史。
    this.transaction(() => {
      invariant(this.db.prepare("SELECT id FROM conversations WHERE id=? AND user_id=?").get(conversationId, userId), 404, "对话不存在。");
      for (const table of ["approvals", "artifacts", "events", "messages", "tool_executions", "agent_checkpoints", "runs", "obligations", "project_edits"])
        this.db.prepare(`DELETE FROM ${table} WHERE conversation_id=?`).run(conversationId);
      if (this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='resume_task_owners'").get()) this.db.prepare("DELETE FROM resume_task_owners WHERE conversation_id=?").run(conversationId);
      this.db.prepare("DELETE FROM conversations WHERE id=? AND user_id=?").run(conversationId, userId);
    });
  }
  conversation(userId: number, conversationId: string): Conversation {
    const row = this.db
      .prepare("SELECT data FROM conversations WHERE id=? AND user_id=?")
      .get(conversationId, userId);
    invariant(row, 404, "对话不存在。");
    this.assertAvailable(conversationId);
    return JSON.parse(row.data as string);
  }
  conversations(userId: number): Conversation[] {
    return this.db
      .prepare(
        "SELECT data FROM conversations WHERE user_id=? ORDER BY rowid DESC",
      )
      .all(userId)
      .map((row) => JSON.parse(row.data as string));
  }
  updateConversation(value: Conversation) {
    this.assertAvailable(value.id);
    value.updated_at = now();
    this.db
      .prepare("UPDATE conversations SET data=? WHERE id=? AND user_id=?")
      .run(JSON.stringify(value), value.id, value.user_id);
  }
  run(userId: number, runId: string): Run {
    const row = this.db
      .prepare("SELECT data FROM runs WHERE id=? AND user_id=?")
      .get(runId, userId);
    invariant(row, 404, "任务不存在。");
    return JSON.parse(row.data as string);
  }
  saveRun(run: Run, create = false) {
    this.assertAvailable(run.conversation_id);
    run.updated_at = now();
    if (create)
      this.db
        .prepare("INSERT INTO runs VALUES(?,?,?,?,?,?)")
        .run(
          run.id,
          run.conversation_id,
          run.user_id,
          run.request_id,
          run.status,
          JSON.stringify(run),
        );
    else
      this.db
        .prepare("UPDATE runs SET status=?,data=? WHERE id=? AND user_id=?")
        .run(run.status, JSON.stringify(run), run.id, run.user_id);
  }
  findRequest(userId: number, requestId: string): Run | null {
    const row = this.db
      .prepare("SELECT data FROM runs WHERE user_id=? AND request_id=?")
      .get(userId, requestId);
    return row ? JSON.parse(row.data as string) : null;
  }
  saveCheckpoint(value: AgentCheckpoint) {
    this.assertAvailable(value.conversation_id);
    this.db.prepare(
      "INSERT INTO agent_checkpoints(id,run_id,conversation_id,user_id,updated_at,data) VALUES(?,?,?,?,?,?) ON CONFLICT(run_id) DO UPDATE SET id=excluded.id,conversation_id=excluded.conversation_id,user_id=excluded.user_id,updated_at=excluded.updated_at,data=excluded.data",
    ).run(value.id, value.run_id, value.conversation_id, value.user_id, value.updated_at, JSON.stringify(value));
  }
  checkpoint(userId: number, runId: string): AgentCheckpoint | null {
    const row = this.db.prepare("SELECT c.data FROM agent_checkpoints c JOIN runs r ON r.id=c.run_id WHERE c.run_id=? AND c.user_id=? AND r.user_id=?").get(runId, userId, userId) as { data: string } | undefined;
    return row ? JSON.parse(row.data) as AgentCheckpoint : null;
  }
  checkpoints(conversationId: string): AgentCheckpoint[] {
    return this.db.prepare("SELECT data FROM agent_checkpoints WHERE conversation_id=? ORDER BY rowid").all(conversationId).map(row => JSON.parse((row as { data: string }).data) as AgentCheckpoint);
  }
  saveToolExecution(value: ToolExecution) {
    this.assertAvailable(value.conversation_id);
    this.db.prepare(
      "INSERT INTO tool_executions(call_id,run_id,conversation_id,user_id,data) VALUES(?,?,?,?,?) ON CONFLICT(call_id) DO UPDATE SET run_id=excluded.run_id,conversation_id=excluded.conversation_id,user_id=excluded.user_id,data=excluded.data",
    ).run(value.call_id, value.run_id, value.conversation_id, value.user_id, JSON.stringify(value));
  }
  toolExecution(userId: number, callId: string): ToolExecution | null {
    const row = this.db.prepare("SELECT t.data FROM tool_executions t JOIN runs r ON r.id=t.run_id WHERE t.call_id=? AND t.user_id=? AND r.user_id=?").get(callId, userId, userId) as { data: string } | undefined;
    return row ? JSON.parse(row.data) as ToolExecution : null;
  }
  toolExecutions(conversationId: string): ToolExecution[] {
    return this.db.prepare("SELECT data FROM tool_executions WHERE conversation_id=? ORDER BY rowid").all(conversationId).map(row => JSON.parse((row as { data: string }).data) as ToolExecution);
  }
  activeRun(conversationId: string): Run | null {
    const row = this.db
      .prepare(
        "SELECT data FROM runs WHERE conversation_id=? AND status IN ('queued','running','awaiting_approval') ORDER BY rowid DESC LIMIT 1",
      )
      .get(conversationId);
    return row ? JSON.parse(row.data as string) : null;
  }
  runs(conversationId: string, includeSuperseded = false): Run[] {
    return this.db
      .prepare("SELECT data FROM runs WHERE conversation_id=?" + (includeSuperseded ? "" : " AND json_extract(data,'$.superseded_by') IS NULL") + " ORDER BY rowid")
      .all(conversationId)
      .map((row) => JSON.parse(row.data as string));
  }
  message(
    conversationId: string,
    runId: string | null,
    role: Message["role"],
    content: string,
    extra: Partial<Message> = {},
  ): Message {
    this.assertAvailable(conversationId);
    const value: Message = {
      id: id(),
      conversation_id: conversationId,
      run_id: runId,
      role,
      content,
      created_at: now(),
      ...extra,
    };
    this.db
      .prepare("INSERT INTO messages(id,conversation_id,data) VALUES(?,?,?)")
      .run(value.id, conversationId, JSON.stringify(value));
    return value;
  }
  messages(conversationId: string, includeSuperseded = false): Message[] {
    return this.db
      .prepare(
        "SELECT data FROM messages WHERE conversation_id=?" + (includeSuperseded ? "" : " AND json_extract(data,'$.superseded_by') IS NULL") + " ORDER BY sort",
      )
      .all(conversationId)
      .map((row) => JSON.parse(row.data as string));
  }
  /** 仅切换对话分支；保留历史原文、运行记录、文件和已确认资料。由调用者纳入同一事务。 */
  supersedeFrom(userId: number, conversationId: string, messageId: string, replacementRunId: string) {
    this.conversation(userId, conversationId);
    const messages = this.messages(conversationId), index = messages.findIndex(message => message.id === messageId);
    invariant(index >= 0 && messages[index].role === "user", 409, "这条消息已更新，请刷新后重新选择。", "message_stale");
    const hidden = messages.slice(index), runIds = new Set(hidden.flatMap(message => message.run_id ? [message.run_id] : []));
    for (const message of hidden) {
      message.superseded_by = replacementRunId;
      this.db.prepare("UPDATE messages SET data=? WHERE id=? AND conversation_id=?").run(JSON.stringify(message), message.id, conversationId);
    }
    for (const run of this.runs(conversationId)) if (runIds.has(run.id)) { run.superseded_by = replacementRunId; this.db.prepare("UPDATE runs SET data=? WHERE id=? AND conversation_id=?").run(JSON.stringify(run), run.id, conversationId); }
    for (const approval of this.approvals(conversationId)) if (approval.run_id && runIds.has(approval.run_id) && approval.status === "pending") {
      approval.status = "expired"; this.saveApproval(approval);
    }
    return { message_ids: hidden.map(message => message.id), run_ids: [...runIds] };
  }
  appendEvent(
    conversationId: string,
    runId: string | null,
    kind: string,
    data: Record<string, unknown>,
  ): AgentEvent {
    this.assertAvailable(conversationId);
    const createdAt = now();
    const row = this.db
      .prepare(
        "INSERT INTO events(conversation_id,run_id,kind,data,created_at) VALUES(?,?,?,?,?)",
      )
      .run(conversationId, runId, kind, JSON.stringify(data), createdAt);
    return {
      seq: Number(row.lastInsertRowid),
      conversation_id: conversationId,
      run_id: runId,
      kind,
      data,
      created_at: createdAt,
    };
  }
  events(conversationId: string, after = 0, limit = 5000): AgentEvent[] {
    return this.db
      .prepare(
        "SELECT * FROM events WHERE conversation_id=? AND seq>? ORDER BY seq LIMIT ?",
      )
      .all(conversationId, after, limit)
      .map(
        (row) =>
          ({
            ...row,
            data: JSON.parse(row.data as string),
          }) as unknown as AgentEvent,
      );
  }
  /** 查找同一历史表面的未闭合压缩尝试，服务重启或日志写入中断后可以续完原事件链。 */
  incompleteContextCompaction(conversationId: string, sourceSignature: string): {
    compactionId: string;
    runId: string | null;
    hasStart: boolean;
    hasSummary: boolean;
  } | null {
    const rows = this.db.prepare(
      "SELECT run_id,kind,data FROM events WHERE conversation_id=? AND kind IN ('context.compaction.start','context.compaction.summary','context.compaction.end') AND json_extract(data,'$.source_signature')=? ORDER BY seq",
    ).all(conversationId, sourceSignature) as Array<{ run_id: string | null; kind: string; data: string }>;
    const attempts = new Map<string, { compactionId: string; runId: string | null; hasStart: boolean; hasSummary: boolean; hasEnd: boolean }>();
    for (const row of rows) {
      const data = JSON.parse(row.data) as Record<string, unknown>;
      const compactionId = data.compaction_id;
      if (typeof compactionId !== "string") continue;
      const current = attempts.get(compactionId) ?? { compactionId, runId: row.run_id, hasStart: false, hasSummary: false, hasEnd: false };
      if (!current.runId && row.run_id) current.runId = row.run_id;
      if (row.kind === "context.compaction.start") current.hasStart = true;
      else if (row.kind === "context.compaction.summary") current.hasSummary = true;
      else if (row.kind === "context.compaction.end") current.hasEnd = true;
      attempts.set(compactionId, current);
    }
    const pending = [...attempts.values()].reverse().find(item => !item.hasEnd);
    return pending ? { compactionId: pending.compactionId, runId: pending.runId, hasStart: pending.hasStart, hasSummary: pending.hasSummary } : null;
  }

  /** 事件级压缩只在同一份历史表面成功一次；原始消息始终保留，不做破坏性覆盖。 */
  hasCompletedContextCompaction(conversationId: string, sourceSignature: string): boolean {
    const row = this.db.prepare(
      "SELECT 1 AS found FROM events WHERE conversation_id=? AND kind='context.compaction.end' AND json_extract(data,'$.source_signature')=? AND json_extract(data,'$.status')='completed' LIMIT 1",
    ).get(conversationId, sourceSignature) as { found: number } | undefined;
    return Boolean(row?.found);
  }
  recentEvents(conversationId: string, limit = 300): AgentEvent[] {
    return this.db
      .prepare(
        "SELECT * FROM (SELECT e.* FROM events e LEFT JOIN runs r ON r.id=e.run_id WHERE e.conversation_id=? AND e.kind!='answer.delta' AND (r.id IS NULL OR json_extract(r.data,'$.superseded_by') IS NULL) ORDER BY seq DESC LIMIT ?) ORDER BY seq",
      )
      .all(conversationId, limit)
      .map(
        (row) =>
          ({
            ...row,
            data: JSON.parse(row.data as string),
          }) as unknown as AgentEvent,
      );
  }
  draftEvents(conversationId: string, runId: string): AgentEvent[] {
    return this.db
      .prepare(
        "SELECT e.* FROM events e JOIN runs r ON r.id=e.run_id AND r.conversation_id=e.conversation_id WHERE e.conversation_id=? AND e.run_id=? AND e.kind='answer.delta' AND r.status IN ('queued','running','awaiting_approval') AND json_extract(r.data,'$.superseded_by') IS NULL AND e.seq>COALESCE((SELECT MAX(seq) FROM events WHERE conversation_id=? AND run_id=? AND kind IN ('model.started','run.retry')),0) ORDER BY e.seq",
      )
      .all(conversationId, runId, conversationId, runId)
      .map(
        (row) =>
          ({
            ...row,
            data: JSON.parse(row.data as string),
          }) as unknown as AgentEvent,
      );
  }
  lastSeq(conversationId: string): number {
    return Number(
      this.db
        .prepare("SELECT MAX(seq) AS n FROM events WHERE conversation_id=?")
        .get(conversationId)?.n ?? 0,
    );
  }
  addArtifact(value: Artifact) {
    this.assertAvailable(value.conversation_id);
    this.db
      .prepare("INSERT INTO artifacts VALUES(?,?,?)")
      .run(value.id, value.conversation_id, JSON.stringify(value));
  }
  artifacts(conversationId: string): Artifact[] {
    return this.db
      .prepare(
        "SELECT data FROM artifacts WHERE conversation_id=? ORDER BY rowid DESC",
      )
      .all(conversationId)
      .map((row) => JSON.parse(row.data as string));
  }
  artifact(userId: number, artifactId: string): Artifact {
    const row = this.db
      .prepare(
        "SELECT a.data FROM artifacts a JOIN conversations c ON a.conversation_id=c.id WHERE a.id=? AND c.user_id=?",
      )
      .get(artifactId, userId);
    invariant(row, 404, "文件不存在。");
    const artifact: Artifact = JSON.parse(row.data as string);
    this.assertAvailable(artifact.conversation_id);
    return artifact;
  }
  addProjectEdit(value: ProjectEdit) {
    this.assertAvailable(value.conversation_id);
    this.db.prepare("INSERT INTO project_edits VALUES(?,?,?,?)").run(value.id, value.user_id, value.conversation_id, JSON.stringify(value));
  }
  projectEdit(userId: number, editId: string): ProjectEdit {
    const row = this.db.prepare("SELECT data FROM project_edits WHERE id=? AND user_id=?").get(editId, userId) as { data: string } | undefined;
    invariant(row, 404, "项目修改记录不存在。", "project_edit_not_found");
    const value = JSON.parse(row.data) as ProjectEdit;
    this.assertAvailable(value.conversation_id);
    return value;
  }
  projectEdits(conversationId: string): ProjectEdit[] {
    return this.db.prepare("SELECT data FROM project_edits WHERE conversation_id=? ORDER BY rowid DESC").all(conversationId).map(row => JSON.parse((row as { data: string }).data) as ProjectEdit);
  }
  saveProjectEdit(value: ProjectEdit) {
    this.assertAvailable(value.conversation_id);
    this.db.prepare("UPDATE project_edits SET data=? WHERE id=? AND user_id=? AND conversation_id=?").run(JSON.stringify(value), value.id, value.user_id, value.conversation_id);
  }
  saveApproval(value: Approval) {
    this.assertAvailable(value.conversation_id);
    this.db
      .prepare(
        "INSERT INTO approvals VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status,data=excluded.data",
      )
      .run(
        value.id,
        value.conversation_id,
        value.user_id,
        value.status,
        JSON.stringify(value),
      );
  }
  approval(userId: number, approvalId: string): Approval {
    const row = this.db
      .prepare("SELECT data FROM approvals WHERE id=? AND user_id=?")
      .get(approvalId, userId);
    invariant(row, 404, "确认请求不存在。");
    return JSON.parse(row.data as string);
  }
  approvals(conversationId: string): Approval[] {
    return this.db
      .prepare(
        "SELECT data FROM approvals WHERE conversation_id=? ORDER BY rowid DESC",
      )
      .all(conversationId)
      .map((row) => JSON.parse(row.data as string));
  }
  saveObligation(value: Obligation) {
    this.conversation(value.user_id, value.conversation_id);
    this.db.prepare(
      "INSERT INTO obligations(id,user_id,conversation_id,source_run_id,capability_id,intent,title,status,trigger,due_at,created_at,updated_at,claimed_at,resolved_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET source_run_id=excluded.source_run_id,capability_id=excluded.capability_id,intent=excluded.intent,title=excluded.title,status=excluded.status,trigger=excluded.trigger,due_at=excluded.due_at,updated_at=excluded.updated_at,claimed_at=excluded.claimed_at,resolved_at=excluded.resolved_at",
    ).run(value.id, value.user_id, value.conversation_id, value.source_run_id, value.capability_id, value.intent, value.title, value.status, value.trigger, value.due_at, value.created_at, value.updated_at, value.claimed_at, value.resolved_at);
  }
  obligation(userId: number, obligationId: string): Obligation {
    const row = this.db.prepare("SELECT * FROM obligations WHERE id=? AND user_id=?").get(obligationId, userId) as Record<string, unknown> | undefined;
    invariant(row, 404, "下一步记录不存在。", "obligation_not_found");
    return obligationFromRow(row);
  }
  obligations(userId: number, conversationId?: string): Obligation[] {
    const rows = conversationId
      ? this.db.prepare("SELECT * FROM obligations WHERE user_id=? AND conversation_id=? ORDER BY CASE status WHEN 'open' THEN 0 WHEN 'claimed' THEN 1 ELSE 2 END,updated_at DESC").all(userId, conversationId)
      : this.db.prepare("SELECT * FROM obligations WHERE user_id=? ORDER BY CASE status WHEN 'open' THEN 0 WHEN 'claimed' THEN 1 ELSE 2 END,updated_at DESC").all(userId);
    return rows.map(row => obligationFromRow(row as Record<string, unknown>));
  }
  claimObligation(userId: number, obligationId: string, claimedAt: string): boolean {
    const result = this.db.prepare("UPDATE obligations SET status='claimed',claimed_at=?,updated_at=? WHERE id=? AND user_id=? AND status='open' AND (due_at IS NULL OR due_at<=?)").run(claimedAt, claimedAt, obligationId, userId, claimedAt);
    return Number(result.changes) === 1;
  }
  resolveObligation(userId: number, obligationId: string, status: Exclude<ObligationStatus, "open" | "claimed">, resolvedAt: string): boolean {
    const result = this.db.prepare("UPDATE obligations SET status=?,updated_at=?,resolved_at=? WHERE id=? AND user_id=? AND status IN ('open','claimed')").run(status, resolvedAt, resolvedAt, obligationId, userId);
    return Number(result.changes) === 1;
  }
  abandonObligationsForRuns(userId: number, conversationId: string, runIds: readonly string[], resolvedAt: string): Obligation[] {
    if (!runIds.length) return [];
    const marks = runIds.map(() => "?").join(",");
    const rows = this.db.prepare(`SELECT * FROM obligations WHERE user_id=? AND conversation_id=? AND source_run_id IN (${marks}) AND status IN ('open','claimed')`).all(userId, conversationId, ...runIds);
    if (!rows.length) return [];
    this.db.prepare(`UPDATE obligations SET status='abandoned',updated_at=?,resolved_at=? WHERE user_id=? AND conversation_id=? AND source_run_id IN (${marks}) AND status IN ('open','claimed')`).run(resolvedAt, resolvedAt, userId, conversationId, ...runIds);
    return rows.map(row => obligationFromRow({ ...(row as Record<string, unknown>), status: "abandoned", updated_at: resolvedAt, resolved_at: resolvedAt }));
  }
  setStatus(run: Run, status: RunStatus, error: string | null = null) {
    run.status = status;
    run.error = error;
    this.saveRun(run);
  }
  interruptedRuns(): Run[] {
    return this.db
      .prepare("SELECT data FROM runs WHERE status IN ('queued','running')")
      .all()
      .map((row) => JSON.parse(row.data as string));
  }
  assertIdle(conversationId: string) {
    this.assertAvailable(conversationId);
    if (this.activeRun(conversationId))
      throw new AppError(
        409,
        "这段对话还有正在处理或等待确认的任务，请先完成或停止。",
      );
  }
}
