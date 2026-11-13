/** 青穗集 · PC 主动连接 Cloud Hub：本机授权、凭据保管、远程执行与会话同步。 */
import { MemorySync } from "../core/memory-sync.js";
import { memoryExchangeResult } from "../core/memory-sync-contract.js";
import { hostname } from "node:os";
import { z } from "zod";
import { createHash } from "node:crypto";
import type { AgentContext } from "./http.js";
import type { Config } from "../config.js";
import type { User } from "../types.js";
import { invariant, AppError, publicError } from "../errors.js";
import { readLimited } from "../provider.js";
import { TaskExecutor, type WorkerClient } from "./executor.js";
import { limitsInput, pairingPayload, uuid, type DeviceLimits, type DeviceCatalogue, type HubDevice, type HubSession, type HubFile, type TaskLease } from "./protocol.js";
import { publicSnapshot, publicValue } from "./sanitize.js";
type Connection = { user_id: number; device_id: string; hub_url: string; secret: string | null; limits: string; pair_code: string | null; expires_at: string | null; error: string | null };
export class PcBridge {
  private executor: TaskExecutor;
  private memorySync: MemorySync;
  private memorySyncedAt = new Map<number, number>();
  private memoryCapability: { enabled: boolean; account: boolean; expires: number } | null = null;
  private stopped = false;
  private timer?: ReturnType<typeof setTimeout>;
  private job?: Promise<void>;
  private controller = new AbortController();
  private deviceCache = new Map<number, HubDevice>();
  private failures = 0;
  private syncing = new Map<number, Promise<void>>();
  constructor(readonly ctx: AgentContext, readonly config: Config) {
    ctx.store.db.exec(`CREATE TABLE IF NOT EXISTS remote_connections(user_id INTEGER PRIMARY KEY,device_id TEXT NOT NULL,hub_url TEXT NOT NULL,secret TEXT,limits TEXT NOT NULL,pair_code TEXT,expires_at TEXT,error TEXT);
      CREATE TABLE IF NOT EXISTS remote_mirrors(user_id INTEGER NOT NULL,device_id TEXT NOT NULL,local_id TEXT NOT NULL,session_id TEXT NOT NULL,digest TEXT NOT NULL,PRIMARY KEY(device_id,local_id));
      CREATE TABLE IF NOT EXISTS remote_synced_files(device_id TEXT NOT NULL,artifact_id TEXT NOT NULL,PRIMARY KEY(device_id,artifact_id));`);
    ctx.store.db.exec("CREATE TABLE IF NOT EXISTS remote_sync_preferences(user_id INTEGER PRIMARY KEY,enabled INTEGER NOT NULL)");
    this.executor = new TaskExecutor(ctx);
    this.memorySync = new MemorySync(ctx.runtime.memory);
  }
  private row(userId: number) { return this.ctx.store.db.prepare("SELECT * FROM remote_connections WHERE user_id=?").get(userId) as Connection | undefined; }
  private async request<T>(user: User, path: string, method = "GET", body?: unknown, connection?: Connection, binary = false): Promise<T> {
    invariant(this.config.cloudAgentUrl, 503, "尚未配置云端同步地址。", "hub_not_configured");
    invariant(!connection || this.row(user.id)?.device_id === connection.device_id, 403, "电脑连接已停止。", "device_disconnected");
    const token = await this.ctx.accounts?.officialKey(user);
    invariant(token, 409, "请先登录官方账号。", "official_login_required");
    const key = connection ? await this.ctx.secrets.get(user.id, "device:" + connection.device_id, connection.secret) : null;
    invariant(!connection || key, 409, "请重新连接这台电脑。", "device_key_missing");
    let response: Response;
    try {
      response = await fetch(this.config.cloudAgentUrl + "/api/v1/hub" + path, { method, headers: { Authorization: "Bearer " + token, ...(key ? { "X-Device-Key": key } : {}), ...(body !== undefined ? { "Content-Type": "application/json" } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}), redirect: "error", signal: AbortSignal.any([this.controller.signal, AbortSignal.timeout(12000)]) });
    } catch { throw new AppError(503, "暂时连接不上云端，电脑上的任务仍可继续。", "hub_unavailable"); }
    if (!response.ok) {
      let code = "hub_request_failed", detail = "云端同步暂未完成。";
      try { const data = JSON.parse(await readLimited(response, 4096)); code = String(data.code || code); detail = String(data.detail || detail); } catch { /* 不透传 HTML 或上游错误正文。 */ }
      throw new AppError(response.status === 401 ? 409 : response.status, response.status === 401 ? "请重新登录官方账号。" : detail, response.status === 401 ? "official_login_required" : code);
    }
    if (binary) {
      invariant(Number(response.headers.get("content-length") || 0) <= 4 * 1024 * 1024, 413, "文件过大。");
      const parts: Uint8Array[] = []; let total = 0;
      invariant(response.body, 502, "文件内容为空。");
      for await (const part of response.body) { total += part.length; if (total > 4 * 1024 * 1024) { await response.body.cancel().catch(() => {}); throw new AppError(413, "文件过大。"); } parts.push(part); }
      return Buffer.concat(parts) as T;
    }
    return JSON.parse(await readLimited(response, 8 * 1024 * 1024)) as T;
  }
  private async catalogue(user: User): Promise<DeviceCatalogue> {
    return { workspaces: this.ctx.store.localWorkspaces(user.id).map(w => ({ id: w.id, name: w.name })), profiles: (await this.ctx.profiles.list(user)).map(p => ({ id: p.id, name: p.mode === "official" ? p.display_name || "Suinai Flash" : p.name, mode: p.mode, ready: p.has_key && p.capabilities.chat && p.capabilities.tools })) };
  }
  async connect(user: User, name: string) {
    invariant(user.official_account, 403, "请先登录官方账号。");
    const catalogue = await this.catalogue(user);
    const limits = { workspace_ids: catalogue.workspaces.map(w => w.id), allow_project_write: true };
    const old = this.row(user.id);
    if (old) { await this.request(user, "/devices/" + old.device_id, "DELETE"); this.executor.stop(String(user.id)); }
    const value = await this.request<{ device: HubDevice; key: string; pairing_token: string; expires_at: string }>(user, "/devices/pair", "POST", { name, limits, catalogue });
    const encrypted = await this.ctx.secrets.save(user.id, "device:" + value.device.id, value.key, process.platform === "win32");
    this.ctx.secrets.protect(value.key); this.ctx.secrets.protect(value.pairing_token);
    this.ctx.store.db.prepare("INSERT INTO remote_connections VALUES(?,?,?,?,?,?,?,NULL) ON CONFLICT(user_id) DO UPDATE SET device_id=excluded.device_id,hub_url=excluded.hub_url,secret=excluded.secret,limits=excluded.limits,pair_code=excluded.pair_code,expires_at=excluded.expires_at,error=NULL").run(user.id, value.device.id, this.config.cloudAgentUrl, encrypted, JSON.stringify(limits), value.pairing_token, value.expires_at);
    this.deviceCache.set(user.id, value.device);
    this.ctx.store.db.prepare("INSERT INTO remote_sync_preferences VALUES(?,1) ON CONFLICT(user_id) DO UPDATE SET enabled=1").run(user.id);
    return { device: value.device, pairing: { payload: pairingPayload(this.config.cloudAgentUrl, value.pairing_token), expires_at: value.expires_at } };
  }
  async refreshPairing(user: User) {
    const row = this.row(user.id); invariant(row, 409, "请先连接这台电脑。");
    const value = await this.request<{ pairing_token: string; expires_at: string }>(user, "/worker/" + row.device_id + "/pairing", "POST", {}, row);
    this.ctx.secrets.protect(value.pairing_token);
    this.ctx.store.db.prepare("UPDATE remote_connections SET pair_code=?,expires_at=?,error=NULL WHERE user_id=?").run(value.pairing_token, value.expires_at, user.id);
    return this.status(user);
  }
  async disconnect(user: User) {
    const row = this.row(user.id);
    this.executor.stop(String(user.id));
    let revoked = false;
    if (row) { try { await this.request(user, "/devices/" + row.device_id, "DELETE"); revoked = true; } catch { /* 先关闭本机接收；云端离线设备仍可在手机移除。 */ } this.ctx.secrets.forget("device:" + row.device_id); }
    this.ctx.store.db.prepare("DELETE FROM remote_connections WHERE user_id=?").run(user.id); this.deviceCache.delete(user.id);
    this.ctx.store.db.prepare("INSERT INTO remote_sync_preferences VALUES(?,0) ON CONFLICT(user_id) DO UPDATE SET enabled=0").run(user.id);
    return { ok: true, revoked };
  }
  async status(user: User) {
    const row = this.row(user.id);
    const loggedIn = Boolean(user.official_account && await this.ctx.accounts?.officialKey(user));
    let devices: HubDevice[] = []; let sessions: HubSession[] = []; let error = row?.error ?? null;
    if (loggedIn && this.config.cloudAgentUrl) {
      const values = await Promise.allSettled([this.request<HubDevice[]>(user, "/devices"), this.request<HubSession[]>(user, "/sessions")]);
      if (values[0].status === "fulfilled") devices = values[0].value; else error = publicError(values[0].reason);
      if (values[1].status === "fulfilled") sessions = values[1].value;
    }
    const device = row ? devices.find(d => d.id === row.device_id) ?? this.deviceCache.get(user.id) ?? null : null;
    return { configured: Boolean(this.config.cloudAgentUrl), logged_in: loggedIn, device, devices, sessions, pairing: device?.status === "pending" && row?.pair_code && row.pair_code.length === 43 ? { payload: pairingPayload(this.config.cloudAgentUrl, row.pair_code), expires_at: row.expires_at } : null, limits: row ? JSON.parse(row.limits) as DeviceLimits : limitsInput.parse({}), error };
  }
  proxy<T>(user: User, path: string, method = "GET", body?: unknown, binary = false) { return this.request<T>(user, path, method, body, undefined, binary); }
  private async heartbeat(user: User, row: Connection) {
    const catalogue = await this.catalogue(user);
    const limits = { workspace_ids: catalogue.workspaces.map(w => w.id), allow_project_write: true };
    const device = await this.request<HubDevice>(user, "/worker/" + row.device_id + "/heartbeat", "POST", { limits, catalogue }, row);
    this.deviceCache.set(user.id, device);
    this.ctx.store.db.prepare("UPDATE remote_connections SET error=NULL,pair_code=CASE WHEN ?='active' THEN NULL ELSE pair_code END WHERE user_id=?").run(device.status, user.id);
    return { device, limits, catalogue };
  }
  private async syncMemory(user: User, row: Connection | undefined) {
    if (!this.memoryCapability || this.memoryCapability.expires < Date.now()) {
      const capability = await this.request<{ memory_sync?: number; account_sync?: number }>(user, "/config");
      this.memoryCapability = { enabled: capability.memory_sync === 1, account: capability.account_sync === 1, expires: Date.now() + 60000 };
    }
    if (this.ctx.runtime.memory.settings(user.id).sync_enabled !== false && Date.now() - (this.memorySyncedAt.get(user.id) ?? 0) >= 15000) {
      this.memorySyncedAt.set(user.id, Date.now());
      if (this.memoryCapability.enabled) {
        const peer = this.config.cloudAgentUrl;
        const sent = this.memorySync.pending(user.id, peer);
        if (!this.memoryCapability.account && (!row || this.deviceCache.get(user.id)?.status !== "active")) return;
        const result = memoryExchangeResult.parse(await this.request(user, this.memoryCapability.account ? "/account/memory" : "/worker/" + row!.device_id + "/memory", "POST", sent, this.memoryCapability.account ? undefined : row));
        if (!this.stopped && await this.ctx.accounts?.officialKey(user) && this.ctx.runtime.memory.settings(user.id).sync_enabled !== false) this.memorySync.accept(user.id, peer, sent, result);
        if (result.more) this.memorySyncedAt.delete(user.id);
      }
    }
  }
  private async mirror(user: User, row: Connection, device: HubDevice) {
    await this.syncMemory(user, row);
    if (!device.settings.sync_chats || this.stopped) return;
    if (this.memoryCapability?.account) {
      const states = await this.request<{ local_id: string; title: string; archived: boolean; deleted: boolean; source_title?: string; source_archived: boolean }[]>(user, "/worker/" + row.device_id + "/mirrors", "GET", undefined, row);
      for (const state of states) {
        const local = this.ctx.store.conversations(user.id).find(c => c.id === state.local_id);
        // 云端只改变元数据和删除状态；绝不把执行记录导入另一台 Runtime。
        if (!local || this.ctx.store.activeRun(local.id)) continue;
        if (state.deleted) { await this.ctx.runtime.deleteConversation(user, local.id); continue; }
        let changed = false;
        if (state.source_title && local.title === state.source_title && local.title !== state.title) { local.title = state.title; local.title_manual = true; changed = true; }
        if (Boolean(local.archived) === state.source_archived && Boolean(local.archived) !== state.archived) { local.archived = state.archived; changed = true; }
        if (changed) this.ctx.store.updateConversation(local);
      }
    }
    let sent = 0;
    const conversations = this.ctx.store.conversations(user.id);
    const mirrors = this.ctx.store.db.prepare("SELECT local_id FROM remote_mirrors WHERE user_id=? AND device_id=?").all(user.id, row.device_id);
    for (const mirror of mirrors) if (!conversations.some(c => c.id === mirror.local_id)) {
      await this.request(user, "/worker/" + row.device_id + "/mirrors/" + mirror.local_id, "DELETE", undefined, row);
      this.ctx.store.db.prepare("DELETE FROM remote_mirrors WHERE device_id=? AND local_id=?").run(row.device_id, String(mirror.local_id));
    }
    for (const conversation of conversations) {
      if (sent >= 2 || this.stopped) break;
      const snapshot = publicSnapshot(this.ctx.runtime.snapshot(user, conversation.id), this.ctx.secrets);
      const career = publicValue(this.ctx.runtime.career.view(user.id), this.ctx.secrets);
      const digest = createHash("sha256").update(JSON.stringify({ snapshot, career })).digest("hex");
      const existing = this.ctx.store.db.prepare("SELECT digest FROM remote_mirrors WHERE device_id=? AND local_id=?").get(row.device_id, conversation.id);
      if (existing?.digest === digest) continue;
      const origin = this.ctx.store.db.prepare("SELECT session_id FROM remote_sessions WHERE user_id=? AND conversation_id=?").get(user.id, conversation.id);
      const result = await this.request<{ id: string; deleted: boolean }>(user, "/worker/" + row.device_id + "/mirror", "POST", { local_id: conversation.id, title: conversation.title, snapshot, career, ...(origin ? { session_id: origin.session_id } : {}) }, row);
      if (!result.deleted) for (const artifact of this.ctx.store.artifacts(conversation.id)) {
        if (artifact.bytes > 4 * 1024 * 1024) continue;
        if (this.ctx.store.db.prepare("SELECT 1 FROM remote_synced_files WHERE device_id=? AND artifact_id=?").get(row.device_id, artifact.id)) continue;
        const bytes = await this.ctx.workspace.artifactBytes(artifact);
        await this.request<HubFile>(user, "/worker/" + row.device_id + "/mirror-file", "POST", { session_id: result.id, source_id: artifact.id, kind: artifact.kind, name: artifact.name, base64: bytes.toString("base64") }, row);
        this.ctx.store.db.prepare("INSERT INTO remote_synced_files VALUES(?,?)").run(row.device_id, artifact.id);
      }
      this.ctx.store.db.prepare("INSERT INTO remote_mirrors VALUES(?,?,?,?,?) ON CONFLICT(device_id,local_id) DO UPDATE SET digest=excluded.digest").run(user.id, row.device_id, conversation.id, result.id, digest);
      sent++;
    }
  }
  private async poll() {
    // 官方登录即可同步；手机配对仍然是认领远程任务的前置条件。
    if (this.config.cloudAgentUrl) for (const user of this.ctx.accounts?.linkedUsers() ?? []) {
      if (this.stopped) break;
      if (!await this.ctx.accounts?.officialKey(user) || this.row(user.id) || this.ctx.store.db.prepare("SELECT 1 FROM remote_sync_preferences WHERE user_id=? AND enabled=0").get(user.id)) continue;
      try { await this.connect(user, hostname()); }
      catch { this.failures++; }
    }
    const rows = this.ctx.store.db.prepare("SELECT * FROM remote_connections").all() as Connection[];
    for (const row of rows) {
      if (this.stopped) break;
      const user = await this.localUser(row.user_id);
      if (!user || !await this.ctx.accounts?.officialKey(user)) { this.executor.stop(String(row.user_id)); continue; }
      try {
        const { device, limits, catalogue } = await this.heartbeat(user, row);
        if (!this.syncing.has(user.id)) {
          const job = this.mirror(user, row, device).catch(error => this.setError(user.id, error)).finally(() => this.syncing.delete(user.id)); this.syncing.set(user.id, job);
        }
        if (device.status !== "active") continue;
        const base = "/worker/" + row.device_id, request = <T>(path: string, method = "POST", body?: unknown) => this.request<T>(user, base + path, method, body, row);
        const client: WorkerClient = {
          claim: async () => (await request<{ task: TaskLease | null }>("/claim", "POST", {})).task,
          control: task => request("/tasks/" + task.id + "/control", "POST", { lease: task.lease }),
          bind: (task, id) => request("/tasks/" + task.id + "/bind", "POST", { lease: task.lease, conversation_id: id }),
          publish: (task, value) => request("/tasks/" + task.id + "/publish", "POST", { lease: task.lease, ...value }),
          download: file => this.request<Buffer>(user, "/files/" + file.id + "/content", "GET", undefined, undefined, true),
          upload: (task, artifact, bytes) => request("/tasks/" + task.id + "/files", "POST", { lease: task.lease, source_id: artifact.id, name: artifact.name, base64: bytes.toString("base64") }),
        };
        await this.executor.tick(String(user.id), user, client, { limits, catalogue });
        this.failures = 0;
      } catch (error) {
        this.setError(user.id, error); this.failures++;
        if (error instanceof AppError && [401, 403, 409].includes(error.status)) this.executor.stop(String(user.id));
      }
    }
  }
  private async localUser(id: number): Promise<User | undefined> { return this.ctx.accounts?.linkedUsers().find(u => u.id === id); }
  private setError(userId: number, error: unknown) { this.ctx.store.db.prepare("UPDATE remote_connections SET error=? WHERE user_id=?").run(this.ctx.secrets.redact(publicError(error)).slice(0, 500), userId); }
  start() {
    const loop = () => { if (this.stopped) return; this.job = this.poll().catch(() => { this.failures++; }).finally(() => { if (!this.stopped) { this.timer = setTimeout(loop, Math.min(15000, 1500 * Math.max(1, this.failures))); this.timer.unref(); } }); }; loop();
  }
  async close() { this.stopped = true; clearTimeout(this.timer); this.controller.abort(); await this.job; await this.executor.close(); await Promise.allSettled([...this.syncing.values()]); }
}
export function installPcBridge(ctx: AgentContext, config: Config, start = true) {
  invariant(config.deploymentMode === "local", 500, "PC 连接器只能在本机启动。");
  const bridge = new PcBridge(ctx, config), { app } = ctx;
  const user = (header?: string) => ctx.accounts!.user(header);
  app.get("/api/v1/agent/remote", async r => bridge.status(await user(r.headers.authorization)));
  app.get("/api/v1/agent/remote/sessions", async r => bridge.proxy(await user(r.headers.authorization), "/sessions"));
  app.patch<{ Params: { id: string } }>("/api/v1/agent/remote/sessions/:id", async r => bridge.proxy(await user(r.headers.authorization), "/sessions/" + uuid.parse(r.params.id), "PATCH", z.object({ title: z.string().trim().min(1).max(80).optional(), archived: z.boolean().optional() }).strict().parse(r.body)));
  app.delete<{ Params: { id: string } }>("/api/v1/agent/remote/sessions/:id", async r => bridge.proxy(await user(r.headers.authorization), "/sessions/" + uuid.parse(r.params.id), "DELETE"));
  app.post<{ Params: { id: string } }>("/api/v1/agent/remote/sessions/:id/tasks", async r => bridge.proxy(await user(r.headers.authorization), "/sessions/" + uuid.parse(r.params.id) + "/tasks", "POST", z.object({ input: z.string().trim().min(1).max(20000), request_id: uuid }).strict().parse(r.body)));
  app.post("/api/v1/agent/remote/connect", async r => { const b = z.object({ name: z.string().trim().min(1).max(80).default(hostname()) }).strict().parse(r.body); return bridge.connect(await user(r.headers.authorization), b.name); });
  app.post("/api/v1/agent/remote/pairing", async r => bridge.refreshPairing(await user(r.headers.authorization)));
  app.post("/api/v1/agent/remote/disconnect", async r => bridge.disconnect(await user(r.headers.authorization)));
  app.get<{ Params: { id: string } }>("/api/v1/agent/remote/sessions/:id", async r => bridge.proxy(await user(r.headers.authorization), "/sessions/" + uuid.parse(r.params.id)));
  app.get<{ Params: { id: string } }>("/api/v1/agent/remote/files/:id", async (r, reply) => reply.type("application/octet-stream").send(await bridge.proxy<Buffer>(await user(r.headers.authorization), "/files/" + uuid.parse(r.params.id) + "/content", "GET", undefined, true)));
  app.post<{ Params: { id: string } }>("/api/v1/agent/remote/tasks/:id/cancel", async r => bridge.proxy(await user(r.headers.authorization), "/tasks/" + uuid.parse(r.params.id) + "/cancel", "POST", {}));
  app.addHook("onClose", async () => bridge.close());
  if (start) bridge.start();
  return bridge;
}
