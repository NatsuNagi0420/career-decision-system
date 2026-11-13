/** 青穗集 · Hub HTTP 接口：官方账号授权，PC 设备凭证二次校验，快照与文件独立隔离。 */
import { MemorySync } from "../core/memory-sync.js";
import { z } from "zod";
import type { createApp } from "../http.js";
import { invariant } from "../errors.js";
import { settingsInput, limitsInput, catalogueInput, fileInput, taskInput, snapshotInput, publishInput, pairingToken, uuid } from "./protocol.js";
import { HubRepository } from "./repository.js";
import { publicSnapshot, publicValue } from "./sanitize.js";
import type { Conversation, User } from "../types.js";
export type AgentContext = ReturnType<typeof createApp>;
export function registerHub(ctx: AgentContext, options: { cloudEnabled: boolean }) {
  const { app, accounts, secrets } = ctx;
  invariant(accounts, 500, "Cloud Hub 需要统一账号配置。");
  const repo = new HubRepository(ctx.store), memorySync = new MemorySync(ctx.runtime.memory);
  const user = (header?: string) => accounts.user(header);
  const webConversation = (u: User, id: string) => ctx.store.conversations(u.id).find(c => c.id === id);
  const webSession = (c: Conversation) => ({ id: c.id, local_id: c.id, title: c.title, archived: Boolean(c.archived), target: "cloud" as const, device_id: null, workspace_id: null, workspace_name: null, workspace_access: "read-only" as const, created_at: c.created_at, updated_at: c.updated_at });
  const sessionList = (u: User) => {
    const sessions = repo.sessions(u.id), linked = new Set(sessions.filter(s => s.target === "cloud").map(s => s.local_id));
    return [...sessions, ...ctx.store.conversations(u.id).filter(c => !linked.has(c.id)).map(webSession)].sort((a,b) => b.updated_at.localeCompare(a.updated_at));
  };
  const attempts = new Map<number, { count: number; until: number }>();
  const limited = (id: number) => { let b = attempts.get(id); if (!b || b.until < Date.now()) { if (attempts.size > 5000) attempts.clear(); b = { count: 0, until: Date.now() + 60000 }; attempts.set(id, b); } invariant(++b.count <= 10, 429, "配对请求较多，请一分钟后重试。"); };
  app.get("/api/v1/hub/config", () => ({ cloud_enabled: options.cloudEnabled, protocol: 2, pairing: "qr", memory_sync: 1, account_sync: 1 }));
  // 同账号同步独立于手机配对；这里只交换资料，不赋予远程执行权限。
  app.post("/api/v1/hub/account/memory", async r => memorySync.exchange((await user(r.headers.authorization)).id, r.body));
  app.get("/api/v1/hub/devices", async r => repo.devices((await user(r.headers.authorization)).id));
  app.post("/api/v1/hub/devices/pair", async r => {
    const u = await user(r.headers.authorization); limited(u.id);
    const b = z.object({ name: z.string().trim().min(1).max(80), limits: limitsInput.default({ allow_project_write: true, workspace_ids: [] }), catalogue: catalogueInput }).strict().parse(r.body);
    return repo.pair(u.id, b.name, b.limits, b.catalogue);
  });
  app.post("/api/v1/hub/devices/confirm", async r => {
    const u = await user(r.headers.authorization); limited(u.id);
    return repo.confirm(u.id, z.object({ pairing_token: pairingToken }).strict().parse(r.body).pairing_token);
  });
  app.route<{ Params: { id: string } }>({ method: ["POST", "PATCH"], url: "/api/v1/hub/devices/:id/settings", handler: async r => {
    const u = await user(r.headers.authorization), b = z.object({ settings: settingsInput, revision: z.number().int().positive() }).strict().parse(r.body);
    return repo.settings(u.id, uuid.parse(r.params.id), b.settings, b.revision);
  } });
  app.delete<{ Params: { id: string } }>("/api/v1/hub/devices/:id", async r => repo.revoke((await user(r.headers.authorization)).id, uuid.parse(r.params.id)));
  const worker = async (r: { params: { id: string }; headers: { authorization?: string; [key: string]: unknown } }, active = true, renew = false) => {
    const u = await user(r.headers.authorization), deviceId = uuid.parse(r.params.id);
    invariant(typeof r.headers["x-device-key"] === "string" && r.headers["x-device-key"].length <= 128, 403, "缺少电脑连接凭据。");
    const d = repo.worker(u.id, deviceId, String(r.headers["x-device-key"]), active, renew); return { u, d };
  };
  app.post<{ Params: { id: string } }>("/api/v1/hub/worker/:id/memory", async r => {
    const { u, d } = await worker(r);
    invariant(d.settings.sync_chats, 403, "这台电脑已关闭账号同步。", "memory_sync_disabled");
    return memorySync.exchange(u.id, r.body);
  });
  app.post<{ Params: { id: string } }>("/api/v1/hub/worker/:id/pairing", async r => {
    const { u, d } = await worker(r, false, true); limited(u.id);
    return repo.renewPairing(u.id, d.id);
  });
  app.post<{ Params: { id: string } }>("/api/v1/hub/worker/:id/heartbeat", async r => {
    const { u, d } = await worker(r, false, true);
    const b = z.object({ limits: limitsInput, catalogue: catalogueInput }).strict().parse(r.body);
    if (JSON.stringify(b.limits) !== JSON.stringify(d.limits) || JSON.stringify(b.catalogue) !== JSON.stringify(d.catalogue)) return repo.localLimits(u.id, d.id, b.limits, b.catalogue);
    return d;
  });
  app.post<{ Params: { id: string } }>("/api/v1/hub/worker/:id/claim", async r => { const { u, d } = await worker(r); return { task: repo.claim(u.id, d.id) }; });
  app.post<{ Params: { id: string; task: string } }>("/api/v1/hub/worker/:id/tasks/:task/control", async r => {
    const { u, d } = await worker(r), b = z.object({ lease: z.string().min(16).max(128) }).strict().parse(r.body);
    return repo.control(u.id, d.id, uuid.parse(r.params.task), b.lease);
  });
  app.post<{ Params: { id: string; task: string } }>("/api/v1/hub/worker/:id/tasks/:task/publish", async r => {
    const { u, d } = await worker(r), b = publishInput.parse(r.body);
    return repo.publish(u.id, d.id, uuid.parse(r.params.task), { ...b, ...(b.snapshot ? { snapshot: publicSnapshot(b.snapshot, secrets) } : {}), ...(b.career ? { career: publicValue(b.career, secrets) as Record<string, unknown> } : {}) });
  });
  app.post<{ Params: { id: string; task: string } }>("/api/v1/hub/worker/:id/tasks/:task/bind", async r => {
    const { u, d } = await worker(r), b = z.object({ lease: z.string().min(16).max(128), conversation_id: uuid }).strict().parse(r.body);
    repo.control(u.id, d.id, uuid.parse(r.params.task), b.lease);
    const task = repo.task(u.id, r.params.task);
    ctx.store.db.prepare("UPDATE hub_sessions SET local_id=? WHERE id=? AND (local_id IS NULL OR local_id=?)").run(b.conversation_id, task.session_id, b.conversation_id);
    return { ok: true };
  });
  app.post<{ Params: { id: string; task: string } }>("/api/v1/hub/worker/:id/tasks/:task/files", async r => {
    const { u, d } = await worker(r), b = fileInput.extend({ lease: z.string().min(16).max(128), source_id: uuid }).strict().parse(r.body);
    repo.control(u.id, d.id, uuid.parse(r.params.task), b.lease);
    return repo.putFile(u.id, repo.task(u.id, r.params.task).session_id, b.name, Buffer.from(b.base64, "base64"), "output", b.source_id);
  });
  app.post<{ Params: { id: string } }>("/api/v1/hub/worker/:id/mirror", async r => {
    const { u, d } = await worker(r, false, true), b = z.object({ local_id: uuid, session_id: uuid.optional(), title: z.string().min(1).max(100), snapshot: snapshotInput, career: z.record(z.string(), z.unknown()).optional() }).strict().parse(r.body);
    const result = repo.mirror(u.id, d.id, b.local_id, b.title, publicSnapshot(b.snapshot, secrets), b.session_id);
    if (b.career) repo.saveCareer(u.id, d.id, publicValue(b.career, secrets) as Record<string, unknown>);
    return result;
  });
  app.get<{ Params: { id: string } }>("/api/v1/hub/worker/:id/mirrors", async r => { const { u, d } = await worker(r, false, true); return repo.mirrorStates(u.id, d.id); });
  app.delete<{ Params: { id: string; local: string } }>("/api/v1/hub/worker/:id/mirrors/:local", async r => { const { u, d } = await worker(r, false, true); return repo.removeMirror(u.id, d.id, uuid.parse(r.params.local)); });
  app.post<{ Params: { id: string } }>("/api/v1/hub/worker/:id/mirror-file", async r => {
    const { u, d } = await worker(r, false, true), b = fileInput.extend({ session_id: uuid, source_id: uuid, kind: z.enum(["input", "output"]) }).strict().parse(r.body);
    invariant(d.settings.sync_chats && repo.session(u.id, b.session_id).device_id === d.id, 403, "这段对话未允许同步。");
    return repo.putFile(u.id, b.session_id, b.name, Buffer.from(b.base64, "base64"), b.kind, b.source_id);
  });
  app.get("/api/v1/hub/sessions", async r => sessionList(await user(r.headers.authorization)));
  app.post("/api/v1/hub/sessions", async r => {
    const u = await user(r.headers.authorization), b = z.object({ target: z.enum(["pc", "cloud"]), device_id: uuid.nullable().default(null), title: z.string().trim().min(1).max(100).default("新的对话"), workspace_id: uuid.nullable().optional() }).strict().parse(r.body);
    invariant(b.target !== "cloud" || options.cloudEnabled, 503, "云端执行暂未开放，请选择电脑。");
    return repo.createSession(u.id, b.target, b.device_id, b.title, null, b.workspace_id);
  });
  app.get<{ Params: { id: string } }>("/api/v1/hub/sessions/:id", async r => {
    const u = await user(r.headers.authorization), id = uuid.parse(r.params.id), local = webConversation(u, id);
    if (!local) return repo.snapshot(u.id, id);
    const snapshot = publicSnapshot(ctx.runtime.snapshot(u, id), secrets);
    return { ...snapshot, conversation: webSession(local), tasks: snapshot.runs.map(run => ({ ...run, input: "", error: run.error ?? null })), files: ctx.store.artifacts(id).map(file => ({ id: file.id, name: file.name, bytes: file.bytes, kind: file.kind })) };
  });
  app.route<{ Params: { id: string } }>({ method: ["POST", "PATCH"], url: "/api/v1/hub/sessions/:id", handler: async r => {
    const u = await user(r.headers.authorization), id = uuid.parse(r.params.id), local = webConversation(u, id), patch = z.object({ title: z.string().trim().min(1).max(80).optional(), archived: z.boolean().optional() }).strict().parse(r.body);
    if (!local) return repo.updateSession(u.id, id, patch);
    ctx.runtime.assertConversationIdle(u, id);
    if (patch.title) { local.title = patch.title; local.title_manual = true; }
    if (patch.archived !== undefined) local.archived = patch.archived;
    ctx.store.updateConversation(local); return webSession(local);
  } });
  app.delete<{ Params: { id: string } }>("/api/v1/hub/sessions/:id", async r => {
    const u = await user(r.headers.authorization), id = uuid.parse(r.params.id);
    return webConversation(u, id) ? ctx.runtime.deleteConversation(u, id) : repo.deleteSession(u.id, id);
  });
  app.post<{ Params: { id: string } }>("/api/v1/hub/sessions/:id/tasks", async r => {
    const u = await user(r.headers.authorization), b = taskInput.parse(r.body);
    const local = webConversation(u, uuid.parse(r.params.id));
    if (local) {
      invariant(options.cloudEnabled, 503, "云端执行暂未开放。");
      const profile = (await ctx.profiles.list(u)).find(p => p.mode === "official");
      invariant(profile, 503, "官方服务暂时未就绪。");
      return ctx.runtime.start(u, local.id, profile.id, b.input, b.request_id, { permission_mode: "default", reasoning_effort: "auto", full_access_confirmed: false });
    }
    invariant(repo.session(u.id, uuid.parse(r.params.id)).target !== "cloud" || options.cloudEnabled, 503, "云端执行暂未开放，请选择电脑。");
    invariant(u.external_ai_consent, 403, "请先允许将对话发送给模型。", "ai_consent_required");
    return repo.enqueue(u.id, uuid.parse(r.params.id), secrets.redact(b.input), b.request_id);
  });
  app.post<{ Params: { id: string } }>("/api/v1/hub/tasks/:id/cancel", async r => {
    const u = await user(r.headers.authorization), id = uuid.parse(r.params.id);
    return ctx.store.db.prepare("SELECT 1 FROM hub_tasks WHERE id=? AND user_id=?").get(id,u.id) ? repo.cancel(u.id,id) : ctx.runtime.cancel(u,id);
  });
  app.post<{ Params: { id: string } }>("/api/v1/hub/tasks/:id/approve", async r => {
    const u = await user(r.headers.authorization), b = z.object({ approval_id: uuid, approved: z.boolean() }).strict().parse(r.body);
    return repo.decide(u.id, uuid.parse(r.params.id), b.approval_id, b.approved);
  });
  app.post<{ Params: { id: string } }>("/api/v1/hub/sessions/:id/files", async r => {
    const u = await user(r.headers.authorization), id = uuid.parse(r.params.id), b = fileInput.parse(r.body);
    invariant(!repo.tasks(u.id, id).some(t => ["queued", "waiting_pc", "running", "awaiting_approval"].includes(t.status)), 409, "请先等待当前任务完成，再添加资料。");
    return repo.putFile(u.id, id, b.name, Buffer.from(b.base64, "base64"), "input");
  });
  app.get<{ Params: { id: string } }>("/api/v1/hub/files/:id/content", async (r, reply) => {
    const u = await user(r.headers.authorization), id = uuid.parse(r.params.id);
    if (!ctx.store.db.prepare("SELECT 1 FROM hub_files WHERE id=? AND user_id=?").get(id,u.id)) {
      const file = ctx.store.artifact(u.id,id);
      return reply.type("application/octet-stream").header("Content-Disposition", "attachment; filename*=UTF-8''" + encodeURIComponent(file.name)).send(await ctx.workspace.artifactBytes(file));
    }
    const file = repo.file(u.id, id);
    return reply.type("application/octet-stream").header("Content-Disposition", "attachment; filename*=UTF-8''" + encodeURIComponent(file.name)).send(Buffer.from(file.content));
  });
  app.get("/api/v1/hub/career", async r => ({ sources: repo.career((await user(r.headers.authorization)).id) }));
  return repo;
}
