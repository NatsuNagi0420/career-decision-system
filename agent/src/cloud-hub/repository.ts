/** 青穗集 · Cloud Hub 持久队列：账号隔离、设备配对、租约、任务快照与受控文件。 */
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { basename } from "node:path";
import type { Store } from "../store.js";
import { invariant } from "../errors.js";
import { tokenHash } from "../auth.js";
import { settingsInput, validateSettings, ACTIVE_TASK, type HubDevice, type HubSession, type HubTask, type HubSnapshot, type HubFile, type DeviceSettings, type DeviceLimits, type DeviceCatalogue, type TaskLease } from "./protocol.js";
const now = () => new Date().toISOString();
type DeviceRow = { id: string; user_id: number; name: string; status: HubDevice["status"]; key_hash: string; code_hash: string | null; expires: number; last_seen: number; settings: string; limits: string; catalogue: string; revision: number };
type SessionRow = { id: string; user_id: number; target: "pc" | "cloud"; device_id: string | null; local_id: string | null; title: string; archived: number; deleted: number; snapshot: string | null; created_at: string; updated_at: string; workspace_id: string | null; workspace_access: "read-only" | "workspace-write" };
type TaskRow = { id: string; user_id: number; session_id: string; request_id: string; device_id: string | null; target: "pc" | "cloud"; input: string; settings: string; status: HubTask["status"]; local_run_id: string | null; lease_hash: string | null; expires: number; cancel_requested: number; error: string | null; created_at: string; updated_at: string; decisions: string };
export class HubRepository {
  constructor(readonly store: Store) {
    store.db.exec(`CREATE TABLE IF NOT EXISTS hub_devices(id TEXT PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id),name TEXT NOT NULL,status TEXT NOT NULL,key_hash TEXT NOT NULL,code_hash TEXT,expires INTEGER NOT NULL,last_seen INTEGER NOT NULL DEFAULT 0,settings TEXT NOT NULL,limits TEXT NOT NULL,catalogue TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 1);
      CREATE TABLE IF NOT EXISTS hub_sessions(id TEXT PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id),target TEXT NOT NULL,device_id TEXT,local_id TEXT,title TEXT NOT NULL,archived INTEGER NOT NULL DEFAULT 0,deleted INTEGER NOT NULL DEFAULT 0,snapshot TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,UNIQUE(user_id,device_id,local_id));
      CREATE TABLE IF NOT EXISTS hub_tasks(id TEXT PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id),session_id TEXT NOT NULL REFERENCES hub_sessions(id),request_id TEXT NOT NULL,target TEXT NOT NULL,device_id TEXT,input TEXT NOT NULL,settings TEXT NOT NULL,status TEXT NOT NULL,local_run_id TEXT,lease_hash TEXT,expires INTEGER NOT NULL DEFAULT 0,cancel_requested INTEGER NOT NULL DEFAULT 0,error TEXT,decisions TEXT NOT NULL DEFAULT '{}',created_at TEXT NOT NULL,updated_at TEXT NOT NULL,UNIQUE(user_id,request_id));
      CREATE INDEX IF NOT EXISTS hub_tasks_queue ON hub_tasks(device_id,status,created_at);
      CREATE TABLE IF NOT EXISTS hub_files(id TEXT PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id),session_id TEXT NOT NULL REFERENCES hub_sessions(id),source_id TEXT,name TEXT NOT NULL,kind TEXT NOT NULL,bytes INTEGER NOT NULL,sha256 TEXT NOT NULL,version INTEGER NOT NULL,content BLOB NOT NULL,created_at TEXT NOT NULL,UNIQUE(session_id,source_id));
      CREATE TABLE IF NOT EXISTS hub_career(user_id INTEGER NOT NULL REFERENCES users(id),source TEXT NOT NULL,revision INTEGER NOT NULL,data TEXT NOT NULL,updated_at TEXT NOT NULL,PRIMARY KEY(user_id,source));`);
    const columns = new Set(store.db.prepare("PRAGMA table_info(hub_sessions)").all().map(c => c.name));
    if (!columns.has("workspace_id")) store.db.exec("ALTER TABLE hub_sessions ADD COLUMN workspace_id TEXT");
    if (!columns.has("workspace_access")) store.db.exec("ALTER TABLE hub_sessions ADD COLUMN workspace_access TEXT NOT NULL DEFAULT 'read-only'");
  }
  private deviceRow(userId: number, id: string) {
    const row = this.store.db.prepare("SELECT * FROM hub_devices WHERE id=? AND user_id=?").get(id, userId) as DeviceRow | undefined;
    invariant(row, 404, "设备不存在。"); return row;
  }
  private presentDevice(row: DeviceRow): HubDevice {
    return { id: row.id, name: row.name, status: row.status, online: row.status === "active" && row.last_seen > Date.now() - 15000, last_seen_at: row.last_seen ? new Date(row.last_seen).toISOString() : null, settings: JSON.parse(row.settings), limits: { workspace_ids: JSON.parse(row.catalogue).workspaces.map((w: { id: string }) => w.id), allow_project_write: true }, catalogue: JSON.parse(row.catalogue), revision: row.revision };
  }
  devices(userId: number) { return (this.store.db.prepare("SELECT * FROM hub_devices WHERE user_id=? ORDER BY rowid DESC").all(userId) as DeviceRow[]).map(r => this.presentDevice(r)); }
  device(userId: number, id: string) { return this.presentDevice(this.deviceRow(userId, id)); }
  pair(userId: number, name: string, limits: DeviceLimits, catalogue: DeviceCatalogue) {
    invariant(this.devices(userId).filter(d => d.status !== "revoked").length < 10, 409, "最多连接 10 台电脑，请先移除旧设备。");
    const id = randomUUID(), key = randomBytes(32).toString("base64url"), pairing_token = randomBytes(32).toString("base64url");
    this.store.db.prepare("INSERT INTO hub_devices(id,user_id,name,status,key_hash,code_hash,expires,settings,limits,catalogue) VALUES(?,?,?,'pending',?,?,?,?,?,?)").run(id, userId, name, tokenHash(key), tokenHash(pairing_token), Date.now() + 600000, JSON.stringify(settingsInput.parse({})), JSON.stringify(limits), JSON.stringify(catalogue));
    return { device: this.device(userId, id), key, pairing_token, expires_at: new Date(Date.now() + 600000).toISOString() };
  }
  confirm(userId: number, pairingToken: string) {
    const row = this.store.db.prepare("SELECT * FROM hub_devices WHERE user_id=? AND code_hash=? AND status='pending' AND expires>? ORDER BY rowid DESC").get(userId, tokenHash(pairingToken), Date.now()) as DeviceRow | undefined;
    invariant(row, 400, "二维码已失效，或与当前登录账号不一致，请重新扫码。");
    this.store.db.prepare("UPDATE hub_devices SET status='active',code_hash=NULL,revision=revision+1 WHERE id=?").run(row.id);
    return this.device(userId, row.id);
  }
  worker(userId: number, id: string, key: string, active = true, renew = false) {
    const row = this.deviceRow(userId, id);
    invariant(row.status !== "revoked" && row.key_hash === tokenHash(key), 403, "这台电脑的连接已失效。", "device_revoked");
    invariant(renew || row.status !== "pending" || row.expires > Date.now(), 403, "二维码已过期，请在电脑上刷新。");
    if (active) invariant(row.status === "active", 409, "请先在小程序确认配对。", "pair_pending");
    this.store.db.prepare("UPDATE hub_devices SET last_seen=? WHERE id=?").run(Date.now(), id);
    return this.device(userId, id);
  }
  renewPairing(userId: number, id: string) {
    invariant(this.deviceRow(userId, id).status === "pending", 409, "电脑已绑定，无需重新扫码。");
    const pairing_token = randomBytes(32).toString("base64url"), expires = Date.now() + 600000;
    this.store.db.prepare("UPDATE hub_devices SET code_hash=?,expires=? WHERE id=?").run(tokenHash(pairing_token), expires, id);
    return { pairing_token, expires_at: new Date(expires).toISOString() };
  }
  settings(userId: number, id: string, value: DeviceSettings, revision: number) {
    const device = this.device(userId, id);
    invariant(device.status === "active", 409, "请先完成配对。");
    invariant(device.revision === revision, 409, "设置已更新，请刷新后重试。", "revision_conflict");
    const error = validateSettings(value, device); invariant(!error, 403, error ?? "设置未授权。");
    this.store.db.prepare("UPDATE hub_devices SET settings=?,revision=revision+1 WHERE id=?").run(JSON.stringify(value), id);
    return this.device(userId, id);
  }
  localLimits(userId: number, id: string, limits: DeviceLimits, catalogue: DeviceCatalogue) {
    const row = this.deviceRow(userId, id); const settings = JSON.parse(row.settings) as DeviceSettings;
    if (!catalogue.workspaces.some(w => w.id === settings.workspace_id)) settings.workspace_id = null;
    // 本机模型不可用时保留选择并阻止提交，不能静默切换到可能计费的官方服务。
    this.store.db.prepare("UPDATE hub_devices SET limits=?,catalogue=?,settings=?,revision=revision+1 WHERE id=?").run(JSON.stringify(limits), JSON.stringify(catalogue), JSON.stringify(settings), id);
    return this.device(userId, id);
  }
  revoke(userId: number, id: string) {
    this.deviceRow(userId, id);
    this.store.transaction(() => {
      this.store.db.prepare("UPDATE hub_devices SET status='revoked',code_hash=NULL,revision=revision+1 WHERE id=?").run(id);
      this.store.db.prepare("UPDATE hub_tasks SET cancel_requested=1,status=CASE WHEN status IN ('queued','waiting_pc') THEN 'cancelled' ELSE status END,updated_at=? WHERE device_id=? AND status IN ('queued','waiting_pc','running','awaiting_approval')").run(now(), id);
    }); return { ok: true };
  }
  private sessionRow(userId: number, id: string, includeDeleted = false) {
    const row = this.store.db.prepare("SELECT * FROM hub_sessions WHERE user_id=? AND id=?").get(userId, id) as SessionRow | undefined;
    invariant(row && (includeDeleted || !row.deleted), 404, "对话不存在。"); return row;
  }
  private sessionContext(row: SessionRow) {
    const conversation = row.snapshot ? JSON.parse(row.snapshot).conversation : null;
    return { workspace_id: conversation ? conversation.workspace_id ?? null : row.workspace_id ?? null, workspace_access: conversation?.workspace_access === "workspace-write" ? "workspace-write" as const : conversation ? "read-only" as const : row.workspace_access ?? "read-only", profile_id: conversation?.profile_id as string | null | undefined };
  }
  private presentSession(row: SessionRow): HubSession {
    const context = this.sessionContext(row);
    const device = row.device_id ? this.device(row.user_id, row.device_id) : null;
    return { id: row.id, local_id: row.local_id, title: row.title, target: row.target, device_id: row.device_id, archived: !!row.archived, workspace_id: context.workspace_id, workspace_access: context.workspace_access, workspace_name: device?.catalogue.workspaces.find(w => w.id === context.workspace_id)?.name ?? null, created_at: row.created_at, updated_at: row.updated_at };
  }
  session(userId: number, id: string) { return this.presentSession(this.sessionRow(userId, id)); }
  sessions(userId: number) { return (this.store.db.prepare("SELECT * FROM hub_sessions WHERE user_id=? AND deleted=0 ORDER BY updated_at DESC").all(userId) as SessionRow[]).map(r => this.presentSession(r)); }
  createSession(userId: number, target: "pc" | "cloud", deviceId: string | null, title = "新的对话", localId: string | null = null, workspaceId?: string | null, mirror = false) {
    invariant(this.sessions(userId).length < 1000, 409, "请先整理旧对话。");
    if (target === "pc") { invariant(deviceId, 400, "请选择电脑。"); const status = this.device(userId, deviceId).status; invariant(status === "active" || (mirror && status === "pending" && localId), 409, "电脑尚未配对。"); }
    else invariant(!deviceId, 400, "云端会话不能绑定电脑。");
    const device = deviceId ? this.device(userId, deviceId) : null;
    const selected = workspaceId === undefined ? device?.settings.workspace_id ?? null : workspaceId;
    invariant(!selected || device?.catalogue.workspaces.some(w => w.id === selected), 403, "请从这台电脑已有的项目中选择。");
    const id = randomUUID(), time = now();
    this.store.db.prepare("INSERT INTO hub_sessions(id,user_id,target,device_id,local_id,title,created_at,updated_at,workspace_id,workspace_access) VALUES(?,?,?,?,?,?,?,?,?,?)").run(id, userId, target, deviceId, localId, title, time, time, selected, device?.settings.workspace_access ?? "read-only");
    return this.session(userId, id);
  }
  updateSession(userId: number, id: string, patch: { title?: string; archived?: boolean }) {
    this.sessionRow(userId, id);
    invariant(!this.tasks(userId, id).some(t => (ACTIVE_TASK as readonly string[]).includes(t.status)), 409, "请先停止当前任务。");
    this.store.db.prepare("UPDATE hub_sessions SET title=COALESCE(?,title),archived=COALESCE(?,archived),updated_at=? WHERE id=?").run(patch.title ?? null, patch.archived === undefined ? null : Number(patch.archived), now(), id);
    return this.session(userId, id);
  }
  deleteSession(userId: number, id: string) {
    this.updateSession(userId, id, {});
    this.store.transaction(() => {
      this.store.db.prepare("DELETE FROM hub_files WHERE session_id=?").run(id);
      this.store.db.prepare("DELETE FROM hub_tasks WHERE session_id=?").run(id);
      this.store.db.prepare("UPDATE hub_sessions SET deleted=1,snapshot=NULL,title='已删除' WHERE id=?").run(id);
    }); return { ok: true };
  }
  private presentTask(row: TaskRow): HubTask { return { ...Object.fromEntries(["id", "session_id", "target", "device_id", "status", "input", "created_at", "updated_at", "error", "local_run_id"].map(k => [k, row[k as keyof TaskRow]])), settings: JSON.parse(row.settings), cancel_requested: !!row.cancel_requested } as HubTask; }
  task(userId: number, id: string) {
    const row = this.store.db.prepare("SELECT * FROM hub_tasks WHERE id=? AND user_id=?").get(id, userId) as TaskRow | undefined;
    invariant(row, 404, "任务不存在。"); this.sessionRow(userId, row.session_id); return this.presentTask(row);
  }
  tasks(userId: number, sessionId: string) {
    this.sessionRow(userId, sessionId); this.expire();
    return (this.store.db.prepare("SELECT * FROM hub_tasks WHERE session_id=? ORDER BY rowid").all(sessionId) as TaskRow[]).map(r => this.presentTask(r));
  }
  enqueue(userId: number, sessionId: string, input: string, requestId: string) {
    return this.store.transaction(() => {
      const session = this.sessionRow(userId, sessionId);
      const previous = this.store.db.prepare("SELECT * FROM hub_tasks WHERE user_id=? AND request_id=?").get(userId, requestId) as TaskRow | undefined;
      if (previous) { invariant(previous.session_id === sessionId && previous.input === input, 409, "重复请求的内容不一致。"); return this.presentTask(previous); }
      invariant(!session.archived, 409, "请先恢复这段对话。");
      invariant(!this.tasks(userId, sessionId).some(t => (ACTIVE_TASK as readonly string[]).includes(t.status)), 409, "上一项任务还在执行。");
      invariant(Number(this.store.db.prepare("SELECT COUNT(*) n FROM hub_tasks WHERE user_id=? AND status IN ('queued','waiting_pc','running','awaiting_approval')").get(userId)?.n) < 20, 429, "待处理任务太多，请稍后再试。");
      const device = session.device_id ? this.device(userId, session.device_id) : null;
      const settings = { ...(device?.settings ?? settingsInput.parse({})) }, context = this.sessionContext(session);
      if (device) {
        invariant(device.status === "active" && device.settings.allow_remote, 403, "这台电脑已暂停远程任务。");
        settings.workspace_id = context.workspace_id;
        settings.workspace_access = context.workspace_access;
        if (context.profile_id) {
          const profile = device.catalogue.profiles.find(p => p.id === context.profile_id);
          invariant(profile, 409, "请先在电脑上为这段对话选择可用模型。");
          settings.profile_id = profile.id; settings.model_source = profile.mode === "custom" ? "local" : "official";
        }
        const error = validateSettings(settings, device); invariant(!error, 403, error ?? "设置不可用。");
      }
      const id = randomUUID(), time = now();
      this.store.db.prepare("INSERT INTO hub_tasks(id,user_id,session_id,request_id,target,device_id,input,settings,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)").run(id, userId, sessionId, requestId, session.target, session.device_id, input, JSON.stringify(settings), device ? "waiting_pc" : "queued", time, time);
      this.store.db.prepare("UPDATE hub_sessions SET updated_at=? WHERE id=?").run(time, sessionId);
      return this.task(userId, id);
    });
  }
  expire() { this.store.db.prepare("UPDATE hub_tasks SET status='interrupted',error='执行端连接中断，请核对结果后继续。',lease_hash=NULL,updated_at=? WHERE status IN ('running','awaiting_approval') AND expires>0 AND expires<?").run(now(), Date.now()); }
  claim(userId: number, deviceId: string | null): TaskLease | null {
    return this.store.transaction(() => {
      this.expire();
      if (deviceId) { const d = this.device(userId, deviceId); if (d.status !== "active" || !d.settings.allow_remote) return null; }
      if (this.store.db.prepare("SELECT id FROM hub_tasks WHERE user_id=? AND device_id IS ? AND status IN ('running','awaiting_approval')").get(userId, deviceId)) return null;
      const row = this.store.db.prepare("SELECT * FROM hub_tasks WHERE user_id=? AND device_id IS ? AND status IN ('queued','waiting_pc') ORDER BY rowid LIMIT 1").get(userId, deviceId) as TaskRow | undefined;
      if (!row) return null;
      const lease = randomBytes(32).toString("base64url");
      this.store.db.prepare("UPDATE hub_tasks SET status='running',lease_hash=?,expires=?,updated_at=? WHERE id=?").run(tokenHash(lease), Date.now() + 60000, now(), row.id);
      const session = this.sessionRow(userId, row.session_id);
      return { ...this.task(userId, row.id), lease, uploads: this.files(userId, row.session_id).filter(f => f.kind === "input"), conversation: this.presentSession(session), local_conversation_id: session.local_id };
    });
  }
  private lease(userId: number, deviceId: string | null, id: string, lease: string) {
    const task = this.task(userId, id);
    const row = this.store.db.prepare("SELECT lease_hash,expires FROM hub_tasks WHERE id=?").get(id)!;
    invariant(task.device_id === deviceId && row.lease_hash === tokenHash(lease) && Number(row.expires) > Date.now(), 409, "这次任务的执行租约已失效。", "lease_expired"); return task;
  }
  control(userId: number, deviceId: string | null, id: string, lease: string) {
    const task = this.lease(userId, deviceId, id, lease);
    const row = this.store.db.prepare("SELECT decisions FROM hub_tasks WHERE id=?").get(id)!;
    this.store.db.prepare("UPDATE hub_tasks SET expires=? WHERE id=?").run(Date.now() + 60000, id);
    return { cancel_requested: task.cancel_requested, decisions: JSON.parse(String(row.decisions)) as Record<string, boolean> };
  }
  publish(userId: number, deviceId: string | null, id: string, value: { lease: string; local_run_id: string | null; status: HubTask["status"]; error: string | null; snapshot?: HubSnapshot; career?: Record<string, unknown> }) {
    const task = this.lease(userId, deviceId, id, value.lease);
    invariant(["running", "awaiting_approval"].includes(task.status) || task.status === value.status, 409, "任务已经结束。");
    this.store.transaction(() => {
      this.store.db.prepare("UPDATE hub_tasks SET local_run_id=?,status=?,error=?,expires=?,updated_at=? WHERE id=?").run(value.local_run_id, value.status, value.error, Date.now() + 60000, now(), id);
      if (value.snapshot) this.saveSnapshot(userId, task.session_id, value.snapshot);
      if (value.career) this.saveCareer(userId, deviceId ?? "cloud", value.career);
    }); return this.task(userId, id);
  }
  cancel(userId: number, id: string) {
    const task = this.task(userId, id);
    if (!(ACTIVE_TASK as readonly string[]).includes(task.status)) return task;
    this.store.db.prepare("UPDATE hub_tasks SET cancel_requested=1,status=CASE WHEN status IN ('queued','waiting_pc') THEN 'cancelled' ELSE status END,updated_at=? WHERE id=?").run(now(), id);
    return this.task(userId, id);
  }
  decide(userId: number, id: string, approvalId: string, approved: boolean) {
    const task = this.task(userId, id), snapshot = this.snapshot(userId, task.session_id);
    invariant(task.status === "awaiting_approval" && snapshot.approvals?.some(a => a.id === approvalId && a.run_id === task.local_run_id && a.status === "pending"), 409, "这项确认已处理或不属于当前任务。");
    const decisions = JSON.parse(String(this.store.db.prepare("SELECT decisions FROM hub_tasks WHERE id=?").get(id)!.decisions));
    invariant(!(approvalId in decisions) || decisions[approvalId] === approved, 409, "这项确认已经提交。"); decisions[approvalId] = approved;
    this.store.db.prepare("UPDATE hub_tasks SET decisions=? WHERE id=?").run(JSON.stringify(decisions), id); return { ok: true };
  }
  saveSnapshot(userId: number, sessionId: string, snapshot: HubSnapshot) {
    const session = this.sessionRow(userId, sessionId);
    const sourceTitle = typeof snapshot.conversation.title === "string" ? snapshot.conversation.title.slice(0, 100) : session.title;
    if (session.title === "新的对话" && sourceTitle !== session.title) { this.store.db.prepare("UPDATE hub_sessions SET title=? WHERE id=?").run(sourceTitle, sessionId); session.title = sourceTitle; }
    snapshot = { ...snapshot, conversation: { ...snapshot.conversation, ...this.presentSession({ ...session, snapshot: JSON.stringify(snapshot) }), source_title: sourceTitle } };
    this.store.db.prepare("UPDATE hub_sessions SET snapshot=?,updated_at=? WHERE id=?").run(JSON.stringify(snapshot), now(), sessionId);
  }
  snapshot(userId: number, sessionId: string): HubSnapshot & { tasks: HubTask[]; files: HubFile[] } {
    const row = this.sessionRow(userId, sessionId);
    const value = row.snapshot ? JSON.parse(row.snapshot) : { messages: [], runs: [], events: [], artifacts: [], drafts: {}, approvals: [], last_seq: 0 };
    return { ...value, conversation: this.presentSession(row), tasks: this.tasks(userId, sessionId), files: this.files(userId, sessionId) };
  }
  removeMirror(userId: number, deviceId: string, localId: string) {
    const row = this.store.db.prepare("SELECT id FROM hub_sessions WHERE user_id=? AND device_id=? AND local_id=? AND deleted=0").get(userId, deviceId, localId);
    if (row) this.deleteSession(userId, String(row.id));
    return { ok: true };
  }
  mirror(userId: number, deviceId: string, localId: string, title: string, snapshot: HubSnapshot, sourceSessionId?: string) {
    invariant(this.device(userId, deviceId).settings.sync_chats, 403, "会话同步已关闭。");
    // 远程新建的会话可能先被后台同步；先关联原会话，避免与执行端 bind 竞态产生副本。
    if (sourceSessionId) {
      const source = this.sessionRow(userId, sourceSessionId, true);
      invariant(source.target === "pc" && source.device_id === deviceId && (!source.local_id || source.local_id === localId), 403, "会话不属于这台电脑。");
      if (source.deleted) return { id: source.id, deleted: true };
      this.store.db.prepare("UPDATE hub_sessions SET local_id=? WHERE id=?").run(localId, source.id);
    }
    const existing = this.store.db.prepare("SELECT * FROM hub_sessions WHERE user_id=? AND device_id=? AND local_id=?").get(userId, deviceId, localId) as SessionRow | undefined;
    if (existing?.deleted) return { id: existing.id, deleted: true };
    const session = existing ? this.presentSession(existing) : this.createSession(userId, "pc", deviceId, title, localId, undefined, true);
    const previousSource = existing?.snapshot ? JSON.parse(existing.snapshot).conversation?.source_title : null;
    if (existing && (!previousSource || previousSource === existing.title)) this.store.db.prepare("UPDATE hub_sessions SET title=? WHERE id=?").run(title, session.id);
    const previousArchived = existing?.snapshot ? Boolean(JSON.parse(existing.snapshot).conversation?.source_archived) : false;
    if (!existing || Boolean(existing.archived) === previousArchived) this.store.db.prepare("UPDATE hub_sessions SET archived=? WHERE id=?").run(Number(Boolean(snapshot.conversation.archived)), session.id);
    snapshot = { ...snapshot, conversation: { ...snapshot.conversation, source_archived: Boolean(snapshot.conversation.archived) } };
    this.saveSnapshot(userId, session.id, snapshot);
    return { id: session.id, deleted: false };
  }
  mirrorStates(userId: number, deviceId: string) {
    this.device(userId, deviceId);
    return this.store.db.prepare("SELECT local_id,title,archived,deleted,snapshot FROM hub_sessions WHERE user_id=? AND device_id=? AND local_id IS NOT NULL").all(userId, deviceId).map(row => {
      const source = row.snapshot ? JSON.parse(String(row.snapshot)).conversation : {};
      return { local_id: String(row.local_id), title: String(row.title), archived: Boolean(row.archived), deleted: Boolean(row.deleted), source_title: source?.source_title as string | undefined, source_archived: Boolean(source?.source_archived) };
    });
  }
  files(userId: number, sessionId: string) {
    this.sessionRow(userId, sessionId);
    return this.store.db.prepare("SELECT id,session_id,name,kind,bytes,sha256,version,created_at FROM hub_files WHERE session_id=? ORDER BY rowid").all(sessionId) as unknown as HubFile[];
  }
  file(userId: number, id: string) {
    const row = this.store.db.prepare("SELECT * FROM hub_files WHERE id=? AND user_id=?").get(id, userId) as (HubFile & { content: Uint8Array }) | undefined;
    invariant(row, 404, "文件不存在。"); this.sessionRow(userId, row.session_id); return row;
  }
  putFile(userId: number, sessionId: string, name: string, bytes: Buffer, kind: "input" | "output", sourceId: string | null = null) {
    this.sessionRow(userId, sessionId);
    invariant(bytes.length > 0 && bytes.length <= 4 * 1024 * 1024, 413, "文件大小应在 4MB 以内。");
    invariant(name === basename(name) && !/[\\/\x00-\x1f]/.test(name) && name.length <= 240, 400, "文件名不正确。");
    if (sourceId) {
      const old = this.store.db.prepare("SELECT id FROM hub_files WHERE session_id=? AND source_id=?").get(sessionId, sourceId);
      if (old) return this.files(userId, sessionId).find(f => f.id === old.id)!;
    }
    const total = Number(this.store.db.prepare("SELECT COALESCE(SUM(bytes),0) n FROM hub_files WHERE user_id=?").get(userId)!.n);
    invariant(total + bytes.length <= 64 * 1024 * 1024, 413, "云端文件空间已满，请整理旧对话。");
    const value: HubFile = { id: randomUUID(), session_id: sessionId, name, kind, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex"), version: 1, created_at: now() };
    this.store.db.prepare("INSERT INTO hub_files(id,user_id,session_id,source_id,name,kind,bytes,sha256,version,content,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)").run(value.id, userId, sessionId, sourceId, name, kind, bytes.length, value.sha256, 1, bytes, value.created_at); return value;
  }
  saveCareer(userId: number, source: string, data: Record<string, unknown>) {
    invariant(Buffer.byteLength(JSON.stringify(data)) < 1024 * 1024, 413, "画像同步内容太大。");
    this.store.db.prepare("INSERT INTO hub_career VALUES(?,?,1,?,?) ON CONFLICT(user_id,source) DO UPDATE SET revision=revision+1,data=excluded.data,updated_at=excluded.updated_at").run(userId, source, JSON.stringify(data), now());
  }
  career(userId: number) { return this.store.db.prepare("SELECT source,revision,data,updated_at FROM hub_career WHERE user_id=? ORDER BY updated_at DESC").all(userId).map(row => ({ source: String(row.source), revision: Number(row.revision), updated_at: String(row.updated_at), data: JSON.parse(String(row.data)) as Record<string, unknown> })); }
  cloudOwners() { this.expire(); return this.store.db.prepare("SELECT DISTINCT user_id FROM hub_tasks WHERE target='cloud' AND status='queued'").all().map(r => Number(r.user_id)); }
}
