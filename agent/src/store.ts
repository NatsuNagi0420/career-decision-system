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
} from "./types.js";
import { AppError, invariant } from "./errors.js";
export const id = () => randomUUID();
export const now = () => new Date().toISOString();
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
        "CREATE TABLE IF NOT EXISTS profiles(id TEXT PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id),data TEXT NOT NULL,secret TEXT);",
        "CREATE TABLE IF NOT EXISTS conversations(id TEXT PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id),data TEXT NOT NULL);",
        "CREATE TABLE IF NOT EXISTS runs(id TEXT PRIMARY KEY,conversation_id TEXT NOT NULL REFERENCES conversations(id),user_id INTEGER NOT NULL REFERENCES users(id),request_id TEXT NOT NULL,status TEXT NOT NULL,data TEXT NOT NULL,UNIQUE(user_id,request_id));",
        "CREATE UNIQUE INDEX IF NOT EXISTS one_active_run ON runs(conversation_id) WHERE status IN ('queued','running','awaiting_approval');",
        "CREATE TABLE IF NOT EXISTS messages(sort INTEGER PRIMARY KEY AUTOINCREMENT,id TEXT NOT NULL UNIQUE,conversation_id TEXT NOT NULL REFERENCES conversations(id),data TEXT NOT NULL);",
        "CREATE TABLE IF NOT EXISTS events(seq INTEGER PRIMARY KEY AUTOINCREMENT,conversation_id TEXT NOT NULL REFERENCES conversations(id),run_id TEXT,kind TEXT NOT NULL,data TEXT NOT NULL,created_at TEXT NOT NULL);",
        "CREATE INDEX IF NOT EXISTS events_by_conversation ON events(conversation_id,seq);",
        "CREATE TABLE IF NOT EXISTS artifacts(id TEXT PRIMARY KEY,conversation_id TEXT NOT NULL REFERENCES conversations(id),data TEXT NOT NULL);",
        "CREATE TABLE IF NOT EXISTS approvals(id TEXT PRIMARY KEY,conversation_id TEXT NOT NULL REFERENCES conversations(id),user_id INTEGER NOT NULL REFERENCES users(id),status TEXT NOT NULL,data TEXT NOT NULL);",
      ].join(" "),
    );
  }
  close() {
    this.db.close();
  }
  transaction<T>(fn: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = fn();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
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
      for (const table of ["approvals", "artifacts", "events", "messages", "runs"])
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

