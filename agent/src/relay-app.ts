/** 青穗集 · 官方模型中转：单一上游凭证、能力路由、独立访问凭证与请求配额，不运行用户电脑工具。 */
import { registerCreditRoutes } from "./relay-credit-routes.js";
import Fastify from "fastify";
import type { IncomingHttpHeaders } from "node:http";
import { DatabaseSync } from "node:sqlite";
import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
const derivePassword = promisify(scrypt);
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { normalizeBaseUrl, validateEndpoint, readLimited } from "./model.js";
import { AppError, invariant, isRecord, publicError } from "./errors.js";
import { validateRelayPayload } from "./relay-policy.js";
import { responseError } from "./provider.js";
import { fetchWithIdleTimeout } from "./idle-timeout.js";
import { systemOnePayload, systemOneResult } from "./systemone.js";
import { decisionTaskSchema } from "./career-decision-contract.js";
import { careerDecisionPayload, interpretCareerDecision } from "./career-decision-templates.js";
import { initializeRelayStore, sqliteRelayStore, type RelayStore } from "./relay-store.js";
import { RelayOperations, estimateRelayInput, issueStoredToken, rotateStoredToken, meteredUsage, type OperationsConfig } from "./relay-operations.js";
import { PublicEventStream, publicModelResponse } from "./relay-public.js";
import { relayMaintenance } from "./relay-maintenance.js";
export interface RelayConfig extends OperationsConfig {
  publicModel?: string;
  imagePollIntervalMs?: number;
  imageTaskTtlMs?: number;
  logRetentionDays?: number;
  alertWebhookUrl?: string;
  alertWebhookToken?: string;
  dataDir: string;
  upstreamUrl: string;
  upstreamKey: string;
  model: string;
  /** 能力到真实上游模型的本地路由；未命中时回退到 model。 */
  modelRoutes?: Readonly<Record<string, string>>;
  /** 能力到上游请求路径的本地路由；未命中时使用标准协议路径。 */
  routePaths?: Readonly<Record<string, string>>;
  /** 独立的 Jev 结构化判断接口，不作为聊天模型路由。 */
  decisionModel?: string;
  decisionPath?: string;
  /** 异步图片任务只在官方中转内部使用；客户端只传公开能力名。 */
  imageModel?: string;
  imagePath?: string;
  imageDisplayName?: string;
  kind: "chat-completions" | "responses";
  maxOutput: number;
  dailyOutput: number;
  dailyRequests: number;
  allowLocal: boolean;
  idleTimeoutMs?: number;
  /** 只用于管理接口；不写入客户端配置。 */
  adminToken?: string;
  /** 只信任同机反向代理提供的客户端地址，禁止信任任意公网代理。 */
  trustLoopbackProxy?: boolean;
}
const digest = (token: string) =>
  createHash("sha256").update(token).digest("hex");
function capabilityHeader(value: string | string[] | undefined) {
  if (Array.isArray(value)) return "";
  const normalized = value?.trim() ?? "";
  return /^[a-z][a-z0-9_-]{0,63}$/.test(normalized) ? normalized : "";
}
function upstreamEndpoint(baseUrl: string, path: string | undefined, defaultPath: string) {
  const base = new URL(baseUrl + "/");
  const endpoint = new URL(path?.trim() || defaultPath, base);
  invariant(
    endpoint.origin === base.origin &&
      !endpoint.username &&
      !endpoint.password &&
      !endpoint.search &&
      !endpoint.hash,
    500,
    "官方模型路由必须使用同一个上游域名，且不能包含查询参数。",
  );
  return endpoint.toString().replace(/\/$/, "");
}
async function writeResponseChunk(response: import("node:http").ServerResponse, chunk: string | Buffer) {
  if (response.destroyed) throw new Error("response_closed");
  if (response.write(chunk)) return;
  await new Promise<void>((resolve, reject) => {
    const cleanup = () => { response.off("drain", onDrain); response.off("close", onClose); response.off("error", onError); };
    const onDrain = () => { cleanup(); resolve(); };
    const onClose = () => { cleanup(); reject(new Error("response_closed")); };
    const onError = () => { cleanup(); reject(new Error("response_failed")); };
    response.once("drain", onDrain); response.once("close", onClose); response.once("error", onError);
  });
}
function publicImageTaskId() {
  return "img_" + randomBytes(18).toString("base64url");
}
function imageStatus(value: unknown) {
  const status = isRecord(value) && typeof value.status === "string" ? value.status : "queued";
  return ["pending", "queued", "running", "in_progress", "processing", "succeeded", "completed", "failed", "cancelled", "expired"].includes(status) ? status : "queued";
}
function rewriteImageResult(value: unknown, publicId: string, displayName: string): unknown {
  if (!isRecord(value)) throw new AppError(502, "图片任务状态无效。", "image_invalid_response");
  const result = isRecord(value.result) ? value.result : null;
  return {
    task_id: publicId, model: displayName, status: imageStatus(value),
    ...(typeof value.expires_at === "string" ? { expires_at: value.expires_at } : {}),
    ...(value.error ? { error: { code: "image_generation_failed", message: "这次图片未能完成，请换个描述再试。" } } : {}),
    ...(result && Array.isArray(result.data) ? { result: { data: result.data.map((item, index) => isRecord(item) ? {
      ...(typeof item.b64_json === "string" ? { b64_json: item.b64_json } : {}),
      ...(typeof item.url === "string" ? { url: "/v1/images/tasks/" + encodeURIComponent(publicId) + "/content/" + index } : {}),
      ...(typeof item.revised_prompt === "string" ? { revised_prompt: item.revised_prompt } : {}),
    } : {}) } } : {}),
  };
}
export function relayDatabase(dir: string) {
  mkdirSync(dir, { recursive: true });
  const db = new DatabaseSync(join(dir, "relay.sqlite"));
  db.exec(
    [
      "PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;",
      "CREATE TABLE IF NOT EXISTS relay_accounts(id INTEGER PRIMARY KEY AUTOINCREMENT,username TEXT NOT NULL UNIQUE,password_hash TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'active',created_at TEXT NOT NULL);",
      "CREATE TABLE IF NOT EXISTS access_tokens(hash TEXT PRIMARY KEY,label TEXT NOT NULL,revoked INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL,account_id INTEGER REFERENCES relay_accounts(id),last_used_at TEXT);",
      "CREATE TABLE IF NOT EXISTS daily_usage(token_hash TEXT NOT NULL,day TEXT NOT NULL,requests INTEGER NOT NULL,output_reserved INTEGER NOT NULL,PRIMARY KEY(token_hash,day));",
      "CREATE TABLE IF NOT EXISTS relay_request_log(id INTEGER PRIMARY KEY AUTOINCREMENT,created_at TEXT NOT NULL,path TEXT NOT NULL,status INTEGER NOT NULL,token_hash TEXT,capability TEXT,duration_ms INTEGER NOT NULL);",
      "CREATE INDEX IF NOT EXISTS relay_request_log_by_day ON relay_request_log(created_at);",
      "CREATE TABLE IF NOT EXISTS relay_active_leases(token_hash TEXT NOT NULL,lane TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(token_hash,lane));",
      "CREATE TABLE IF NOT EXISTS relay_upstream_health(id INTEGER PRIMARY KEY CHECK(id=1),consecutive_failures INTEGER NOT NULL DEFAULT 0,last_success_at TEXT,last_failure_at TEXT,last_error_code TEXT,updated_at TEXT NOT NULL);",
      "CREATE TABLE IF NOT EXISTS relay_image_tasks(id TEXT PRIMARY KEY,upstream_id TEXT NOT NULL,account_id INTEGER REFERENCES relay_accounts(id),owner_token_hash TEXT NOT NULL,model TEXT NOT NULL,status TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,expires_at TEXT);",
      "CREATE INDEX IF NOT EXISTS relay_image_tasks_by_account ON relay_image_tasks(account_id,created_at);",
    ].join(" "),
  );
  // 兼容已经存在的 relay.sqlite；新增字段只做幂等迁移。
  for (const statement of [
    "ALTER TABLE access_tokens ADD COLUMN account_id INTEGER REFERENCES relay_accounts(id)",
    "ALTER TABLE access_tokens ADD COLUMN last_used_at TEXT",
  ]) {
    try { db.exec(statement); } catch { /* 字段已存在 */ }
  }
  return db;
}

async function passwordHash(password: string) {
  const salt = randomBytes(16).toString("hex");
  return salt + ":" + (await derivePassword(password, salt, 64) as Buffer).toString("hex");
}
async function verifyPassword(password: string, value: string) {
  const [salt, digestValue] = value.split(":");
  if (!salt || !digestValue) return false;
  const actual = await derivePassword(password, salt, 64) as Buffer;
  const expected = Buffer.from(digestValue, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
export function issueRelayToken(db: DatabaseSync, label: string, accountId: number | null = null) {
  const token = "qsg_" + randomBytes(32).toString("base64url");
  const hash = digest(token);
  db.prepare("INSERT INTO access_tokens(hash,label,revoked,created_at,account_id,last_used_at) VALUES(?,?,0,?,?,NULL)").run(
    hash, label, new Date().toISOString(), accountId,
  );
  return { token, hash };
}
export function rotateRelayToken(db: DatabaseSync, oldHash: string, label?: string) {
  const row = db.prepare("SELECT label,account_id,revoked FROM access_tokens WHERE hash=?").get(oldHash) as { label: string; account_id: number | null; revoked: number } | undefined;
  invariant(row, 404, "官方访问凭证不存在。", "relay_token_not_found");
  invariant(row.revoked === 0, 409, "官方访问凭证已经撤销，不能轮换。", "relay_token_revoked");
  const next = issueRelayToken(db, label?.trim() || row.label, row.account_id);
  db.prepare("UPDATE access_tokens SET revoked=1 WHERE hash=?").run(oldHash);
  return next;
}
export function relayUsage(db: DatabaseSync, day = new Date().toISOString().slice(0, 10)) {
  return db.prepare(
    "SELECT u.day,t.label,t.revoked,u.requests,u.output_reserved FROM daily_usage u LEFT JOIN access_tokens t ON t.hash=u.token_hash WHERE u.day=? ORDER BY u.output_reserved DESC,t.label",
  ).all(day).map(row => ({ ...(row as Record<string, unknown>), day: String((row as Record<string, unknown>).day), label: String((row as Record<string, unknown>).label ?? "unknown") }));
}
export function backupRelayDatabase(db: DatabaseSync, target: string) {
  const escaped = target.replaceAll("'", "''");
  db.exec("VACUUM INTO '" + escaped + "'");
  return target;
}
export function createRelay(config: RelayConfig, fetcher: typeof fetch = fetch) {
  const db = relayDatabase(config.dataDir);
  return { ...createRelayWithStore(config, sqliteRelayStore(db), fetcher), db };
}
export function createRelayWithStore(config: RelayConfig, store: RelayStore, fetcher: typeof fetch = fetch) {
  invariant(
    config.upstreamKey && config.model,
    500,
    "官方中转需要配置上游 Key 和模型。",
  );
  const baseUrl = normalizeBaseUrl(config.upstreamUrl, config.allowLocal);
  const app = Fastify({
    logger: false,
    trustProxy: config.trustLoopbackProxy ? ["127.0.0.1", "::1"] : false,
    // 图片以内联 data URL 进入当前请求；仍由 relay-policy 限制为受支持的图片格式和大小。
    bodyLimit: 8 * 1024 * 1024,
    requestTimeout: 70000,
  });
  const operations = new RelayOperations(store, config);
  registerCreditRoutes(app, operations);
  app.addHook("onReady", async () => { await initializeRelayStore(store); });
  const limitAuth = (key: string) => operations.limitAuth(key);
  const release = (tokenHash: string, lane: "chat" | "decision" | "image" = "chat") => operations.release(tokenHash, lane);
  const upstreamHealth = () => operations.health();
  const markUpstream = (ok: boolean, code?: string) => operations.markUpstream(ok, code);
  /**
   * Only failures that happened while talking to the configured upstream should
   * affect the relay health signal.  Authentication, local quota exhaustion and
   * concurrency limits are client/service state; counting them as upstream
   * failures would make /healthz report a false degradation during a busy day.
   */
  function upstreamFailureCode(error: unknown): string | null {
    if (error instanceof AppError) {
      if (error.code.startsWith("provider_") || error.code === "decision_invalid_response") return error.code;
      return error.status >= 500 ? "provider_error" : null;
    }
    if (error instanceof Error && error.name === "AbortError") return null;
    if (error instanceof Error && error.name === "TimeoutError") return "provider_timeout";
    return "provider_network";
  }
  async function markUpstreamFailure(error: unknown) {
    const code = upstreamFailureCode(error);
    if (code) await markUpstream(false, code);
  }
  const authorize = (headers: IncomingHttpHeaders, _lane: "chat" | "decision" | "image" = "chat") => operations.authorize(headers);
  const reserve = (tokenHash: string, output: number, lane: "chat" | "decision" | "image" = "chat", input = 0, capability: string = lane) => operations.reserve(tokenHash, output, lane, input, capability);
  const estimatedInput = estimateRelayInput;
  app.addHook("onRequest", async request => {
    (request as unknown as { relayStartedAt?: number }).relayStartedAt = Date.now();
  });
  app.addHook("onResponse", async (request, reply) => {
    if (!request.url.startsWith("/v1/")) return;
    const authorization = request.headers.authorization;
    const tokenHash = authorization?.startsWith("Bearer ") ? digest(authorization.slice(7)) : null;
    const started = (request as unknown as { relayStartedAt?: number }).relayStartedAt ?? Date.now();
    (await store.run("INSERT INTO relay_request_log(created_at,path,status,token_hash,capability,duration_ms) VALUES(?,?,?,?,?,?)", new Date().toISOString(), request.routeOptions.url || "/v1/unknown", reply.statusCode, tokenHash, capabilityHeader(request.headers["x-suinai-capability"] || ""), Math.max(0, Date.now() - started)));
  });
  app.setErrorHandler((error, _request, reply) =>
    reply
      .code(
        error instanceof AppError
          ? error.status
          : error instanceof z.ZodError
            ? 400
            : 500,
      )
      .send({ error: { message: publicError(error), type: "relay_error", code: error instanceof AppError ? error.code : "request_failed" } }),
  );
  function requireAdmin(headers: IncomingHttpHeaders) {
    invariant(config.adminToken, 503, "官方服务管理入口尚未配置。", "relay_admin_not_configured");
    const supplied = headers["x-relay-admin-token"];
    invariant(typeof supplied === "string" && timingSafeEqual(Buffer.from(digest(supplied)), Buffer.from(digest(config.adminToken))), 403, "官方服务管理凭证无效。", "relay_admin_forbidden");
  }
  app.post("/v1/auth/register", { bodyLimit: 32 * 1024 }, async request => {
    await limitAuth("register:" + request.ip);
    const body = z.object({ username: z.string().trim().min(3).max(64).regex(/^[a-zA-Z0-9_.-]+$/), password: z.string().min(12).max(200) }).strict().parse(request.body);
    invariant(!(await store.get("SELECT id FROM relay_accounts WHERE username=?", body.username)), 409, "这个官方账号已被使用。", "relay_account_exists");
    const result = await store.get("INSERT INTO relay_accounts(username,password_hash,status,created_at) VALUES(?,?,?,?) RETURNING id", body.username, await passwordHash(body.password), "active", new Date().toISOString());
    const accountId = Number(result!.id);
    const token = await issueStoredToken(store, "account:" + body.username, accountId);
    if (config.initialCreditMicros) await operations.credit("account:" + accountId, config.initialCreditMicros, "welcome:" + accountId, "welcome");
    return { token: token.token, account: { id: accountId, username: body.username } };
  });
  app.post("/v1/auth/login", { bodyLimit: 32 * 1024 }, async request => {
    await limitAuth("login:" + request.ip);
    const body = z.object({ username: z.string().trim().min(3).max(64), password: z.string().min(1).max(200) }).strict().parse(request.body);
    const row = (await store.get("SELECT id,username,password_hash,status FROM relay_accounts WHERE username=?", body.username)) as { id: number; username: string; password_hash: string; status: string } | undefined;
    invariant(row && row.status === "active" && await verifyPassword(body.password, row.password_hash), 401, "官方账号或密码不正确。", "relay_account_login");
    const token = await issueStoredToken(store, "account:" + row.username, Number(row.id));
    return { token: token.token, account: { id: row.id, username: row.username } };
  });
  app.get("/v1/auth/me", async request => {
    const tokenHash = await authorize(request.headers);
    const account = (await store.get("SELECT id,username,status FROM relay_accounts WHERE id=(SELECT account_id FROM access_tokens WHERE hash=? AND revoked=0)", tokenHash)) as { id: number; username: string; status: string } | undefined;
    invariant(account && account.status === "active", 401, "官方账号已不可用。", "relay_account_inactive");
    return { account: { id: Number(account.id), username: account.username }, usage: await operations.summary(tokenHash) };
  });
  app.post("/v1/auth/logout", async request => {
    const tokenHash = await authorize(request.headers);
    (await store.run("UPDATE access_tokens SET revoked=1 WHERE hash=?", tokenHash));
    return { ok: true };
  });
  app.get("/healthz", async () => ({ ok: true, service: "official-model-relay", upstream: await upstreamHealth() }));
  app.get("/admin/usage", async request => {
    requireAdmin(request.headers);
    const day = z.object({ day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }).parse(request.query).day;
    return { day: day ?? new Date().toISOString().slice(0, 10), usage: await store.all("SELECT u.day,t.label,t.revoked,u.requests,u.output_reserved FROM daily_usage u LEFT JOIN access_tokens t ON t.hash=u.token_hash WHERE u.day=?", day ?? new Date().toISOString().slice(0,10)) };
  });
  app.get("/admin/upstream", async request => { requireAdmin(request.headers); return upstreamHealth(); });
  app.post<{ Params: { hash: string } }>("/admin/tokens/:hash/revoke", async request => {
    requireAdmin(request.headers);
    invariant(/^[a-f0-9]{64}$/.test(request.params.hash), 400, "官方访问凭证摘要不合法。", "relay_token_hash");
    (await store.run("UPDATE access_tokens SET revoked=1 WHERE hash=?", request.params.hash));
    return { ok: true, hash: request.params.hash };
  });
  app.post<{ Params: { hash: string } }>("/admin/tokens/:hash/rotate", async request => {
    requireAdmin(request.headers);
    invariant(/^[a-f0-9]{64}$/.test(request.params.hash), 400, "官方访问凭证摘要不合法。", "relay_token_hash");
    const label = z.object({ label: z.string().trim().max(120).optional() }).strict().parse(request.body ?? {});
    return rotateStoredToken(store, request.params.hash, label.label);
  });
  app.get("/v1/account/usage", async request => operations.summary(await authorize(request.headers)));
  app.post("/v1/auth/rotate", async request => rotateStoredToken(store, await authorize(request.headers)));
  app.post("/v1/auth/logout-all", async request => {
    const tokenHash = await authorize(request.headers), owner = await operations.owner(tokenHash);
    if (owner.startsWith("account:")) await store.run("UPDATE access_tokens SET revoked=1 WHERE account_id=?", Number(owner.slice(8)));
    else await store.run("UPDATE access_tokens SET revoked=1 WHERE hash=?", tokenHash);
    return { ok: true };
  });
  app.get("/admin/accounts", async request => {
    requireAdmin(request.headers);
    return { accounts: await store.all("SELECT a.id,a.username,a.status,a.created_at,w.balance_micros,w.held_micros FROM relay_accounts a LEFT JOIN relay_wallets w ON w.owner_id='account:' || CAST(a.id AS TEXT) ORDER BY a.id DESC LIMIT 100") };
  });
  app.post<{ Params: { id: string } }>("/admin/accounts/:id/status", async request => {
    requireAdmin(request.headers);
    const accountId = z.coerce.number().int().positive().parse(request.params.id);
    const { status } = z.object({ status: z.enum(["active", "suspended"]) }).strict().parse(request.body);
    invariant(await store.get("SELECT id FROM relay_accounts WHERE id=?", accountId), 404, "官方账号不存在。", "relay_account_not_found");
    await store.transaction(async tx => {
      await tx.run("UPDATE relay_accounts SET status=? WHERE id=?", status, accountId);
      if (status === "suspended") await tx.run("UPDATE access_tokens SET revoked=1 WHERE account_id=?", accountId);
    });
    return { ok: true };
  });
  app.post<{ Params: { id: string } }>("/admin/accounts/:id/credits", async request => {
    requireAdmin(request.headers);
    const accountId = z.coerce.number().int().positive().parse(request.params.id);
    const body = z.object({ amount_micros: z.number().int().positive().max(1000000000000), reference: z.string().min(8).max(120).regex(/^[a-zA-Z0-9_.:-]+$/) }).strict().parse(request.body);
    invariant(await store.get("SELECT id FROM relay_accounts WHERE id=?", accountId), 404, "官方账号不存在。", "relay_account_not_found");
    await operations.credit("account:" + accountId, body.amount_micros, "topup:" + body.reference);
    return { ok: true };
  });
  app.get("/admin/alerts", async request => { requireAdmin(request.headers); return { alerts: await store.all("SELECT id,kind,created_at,failures,code,status,attempts,next_attempt_at FROM relay_alerts ORDER BY created_at DESC LIMIT 100") }; });
  app.get("/admin/metrics", async (request, reply) => {
    requireAdmin(request.headers);
    const health = await upstreamHealth();
    const leases = await store.get("SELECT COUNT(*) AS count FROM relay_leases WHERE expires_at>?", new Date().toISOString());
    const failures = await store.get("SELECT COUNT(*) AS count FROM relay_request_log WHERE status>=500 AND created_at>?", new Date(Date.now() - 3600000).toISOString());
    return reply.type("text/plain; version=0.0.4").send("suinai_upstream_degraded " + Number(health.status === "degraded") + "\nsuinai_upstream_consecutive_failures " + health.consecutive_failures + "\nsuinai_active_leases " + Number(leases?.count ?? 0) + "\nsuinai_request_errors_last_hour " + Number(failures?.count ?? 0) + "\n");
  });
  const imageDisplayName = config.imageDisplayName?.trim() || "Suinai Image";
  const imageKeys = new Set(["model", "prompt", "size", "quality", "n", "response_format", "action", "image", "mask", "input", "extra_fields"]);
  async function imageTaskFor(tokenHash: string, publicId: string) {
    const task = (await store.get("SELECT * FROM relay_image_tasks WHERE id=?", publicId)) as {
      id: string; upstream_id: string; account_id: number | null; owner_token_hash: string; status: string; expires_at: string | null; result_json: string | null; next_poll_at: string | null; operation_id: string | null;
    } | undefined;
    invariant(task, 404, "图片任务不存在或已过期。", "image_task_not_found");
    const owner = (await store.get("SELECT account_id FROM access_tokens WHERE hash=? AND revoked=0", tokenHash)) as { account_id: number | null } | undefined;
    invariant(owner && (task.account_id == null ? task.owner_token_hash === tokenHash : String(owner.account_id) === String(task.account_id)), 404, "图片任务不存在或已过期。", "image_task_not_found");
    invariant(!task.expires_at || Date.parse(task.expires_at) > Date.now(), 410, "图片任务已过期。", "image_task_expired");
    return task;
  }
  function imageUpstreamError(error: unknown): AppError {
    if (error instanceof AppError) return error;
    return new AppError(502, "图片任务暂时无法完成，请稍后重试。", error instanceof Error && error.name === "TimeoutError" ? "provider_timeout" : "provider_network");
  }
  app.post("/v1/images/tasks", { bodyLimit: 8 * 1024 * 1024 }, async (request, reply) => {
    const tokenHash = await authorize(request.headers, "image");
    invariant(config.imageModel, 503, "官方图片服务尚未配置。", "image_not_configured");
    const body = z.record(z.string(), z.unknown()).parse(request.body);
    invariant(Object.keys(body).every(key => imageKeys.has(key)), 400, "图片请求包含不支持的字段。", "image_invalid_request");
    invariant(body.model === undefined || body.model === imageDisplayName, 403, "该图片入口不允许切换到其他模型。", "image_model_forbidden");
    invariant(typeof body.prompt === "string" && body.prompt.trim().length > 0 && body.prompt.length <= 20000, 400, "图片提示词不能为空或过长。", "image_prompt_invalid");
    const count = body.n === undefined ? 1 : Number(body.n);
    invariant(Number.isInteger(count) && count >= 1 && count <= 4, 400, "图片数量必须是 1 到 4。", "image_count_invalid");
    const forwarded = { ...body, model: config.imageModel };
    const imageOperation = await reserve(tokenHash, count, "image");
    const abort = new AbortController();
    const onClose = () => { if (!reply.raw.writableEnded) abort.abort(); };
    reply.raw.once("close", onClose);
    try {
      await validateEndpoint(baseUrl, config.allowLocal);
      const response = await fetchWithIdleTimeout(upstreamEndpoint(baseUrl, config.imagePath, "images/tasks"), {
        method: "POST",
        headers: { Authorization: "Bearer " + config.upstreamKey, "Content-Type": "application/json" },
        body: JSON.stringify(forwarded),
        redirect: "error",
        signal: abort.signal,
      }, config.idleTimeoutMs ?? 120000, fetcher);
      if (!response.ok) {
        const error = await responseError(response);
        throw new AppError(error.upstreamStatus === 429 ? 429 : 502, "官方图片服务暂时不可用（HTTP " + error.upstreamStatus + "）。", error.code);
      }
      let parsed: unknown;
      try { parsed = JSON.parse(await readLimited(response, 512 * 1024)); }
      catch { throw new AppError(502, "官方图片服务返回无效任务。", "image_invalid_response"); }
      invariant(isRecord(parsed) && typeof parsed.task_id === "string" && parsed.task_id.length <= 240, 502, "官方图片服务没有返回有效任务。", "image_invalid_response");
      const publicId = publicImageTaskId();
      const account = (await store.get("SELECT account_id FROM access_tokens WHERE hash=?", tokenHash)) as { account_id: number | null } | undefined;
      const timestamp = new Date().toISOString();
      const expires = typeof parsed.expires_at === "string" && Number.isFinite(Date.parse(parsed.expires_at)) ? parsed.expires_at : new Date(Date.now() + (config.imageTaskTtlMs ?? 86400000)).toISOString();
      await store.run("INSERT INTO relay_image_tasks(id,upstream_id,account_id,owner_token_hash,model,status,created_at,updated_at,expires_at,next_poll_at,operation_id,result_json) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)", publicId, parsed.task_id, account?.account_id ?? null, tokenHash, config.imageModel, imageStatus(parsed), timestamp, timestamp, expires, timestamp, imageOperation, JSON.stringify(rewriteImageResult(parsed, publicId, imageDisplayName)));
      if (["succeeded", "completed", "failed", "cancelled"].includes(imageStatus(parsed))) {
        const generated = isRecord(parsed.result) && Array.isArray(parsed.result.data) ? parsed.result.data.length : 0;
        await operations.settle(imageOperation, null, ["succeeded", "completed"].includes(imageStatus(parsed)) ? "completed" : "failed", generated);
      }
      await operations.detach(tokenHash, "image");
      await markUpstream(true);
      return reply.code(202).send({ task_id: publicId, status: imageStatus(parsed) });
    } catch (error) {
      await markUpstreamFailure(error);
      throw imageUpstreamError(error);
    } finally {
      reply.raw.removeListener("close", onClose);
      await release(tokenHash, "image");
    }
  });
  const terminalImages = new Set(["succeeded", "completed", "failed", "cancelled", "expired"]);
  async function pollImageTask(task: NonNullable<Awaited<ReturnType<typeof imageTaskFor>>>) {
    if (terminalImages.has(task.status) && task.result_json) return JSON.parse(task.result_json) as unknown;
    const lease = "poll_" + randomBytes(18).toString("base64url");
    const acquired = await store.transaction(async tx => {
      await tx.run("UPDATE relay_coordination SET version=version+1 WHERE id=1");
      const existing = await tx.get("SELECT expires_at FROM relay_leases WHERE owner_id=? AND lane='poll'", "image:" + task.id);
      if (existing && String(existing.expires_at) > new Date().toISOString()) return false;
      await tx.run("DELETE FROM relay_leases WHERE owner_id=? AND lane='poll'", "image:" + task.id);
      await tx.run("INSERT INTO relay_leases(owner_id,lane,lease_id,expires_at) VALUES(?,'poll',?,?)", "image:" + task.id, lease, new Date(Date.now() + 180000).toISOString());
      return true;
    });
    if (!acquired) return task.result_json ? JSON.parse(task.result_json) as unknown : { task_id: task.id, status: task.status };
    try {
      await validateEndpoint(baseUrl, config.allowLocal);
      const response = await fetchWithIdleTimeout(upstreamEndpoint(baseUrl, config.imagePath, "images/tasks") + "/" + encodeURIComponent(task.upstream_id), {
        method: "GET", headers: { Authorization: "Bearer " + config.upstreamKey, Accept: "application/json" }, redirect: "error", signal: new AbortController().signal,
      }, config.idleTimeoutMs ?? 120000, fetcher);
      if (!response.ok) {
        if (response.status === 404 || response.status === 410) {
          await store.run("UPDATE relay_image_tasks SET status='expired',expires_at=?,result_json=NULL WHERE id=?", new Date().toISOString(), task.id);
          if (task.operation_id) await operations.settle(task.operation_id, null, "failed");
          throw new AppError(410, "图片任务已过期。", "image_task_expired");
        }
        throw await responseError(response);
      }
      let parsed: unknown;
      try { parsed = JSON.parse(await readLimited(response, 2_000_000)); }
      catch { throw new AppError(502, "图片任务状态无效。", "image_invalid_response"); }
      const status = imageStatus(parsed), result = rewriteImageResult(parsed, task.id, imageDisplayName);
      const count = isRecord(parsed) && isRecord(parsed.result) && Array.isArray(parsed.result.data) ? parsed.result.data.length : 0;
      if (task.operation_id && terminalImages.has(status)) await operations.settle(task.operation_id, null, status === "succeeded" || status === "completed" ? "completed" : "failed", count);
      const expires = isRecord(parsed) && typeof parsed.expires_at === "string" && Number.isFinite(Date.parse(parsed.expires_at)) ? parsed.expires_at : task.expires_at;
      await store.run("UPDATE relay_image_tasks SET status=?,updated_at=?,expires_at=?,result_json=?,next_poll_at=? WHERE id=?", status, new Date().toISOString(), expires, JSON.stringify(result), new Date(Date.now() + (config.imagePollIntervalMs ?? 5000)).toISOString(), task.id);
      await markUpstream(true);
      return result;
    } catch (error) {
      await store.run("UPDATE relay_image_tasks SET next_poll_at=? WHERE id=?", new Date(Date.now() + 30000).toISOString(), task.id);
      if (!(error instanceof AppError && error.code === "image_task_expired")) await markUpstreamFailure(error);
      throw imageUpstreamError(error);
    } finally { await store.run("DELETE FROM relay_leases WHERE lease_id=?", lease); }
  }
  app.get<{ Params: { id: string } }>("/v1/images/tasks/:id", async request => {
    const tokenHash = await authorize(request.headers, "image");
    const task = await imageTaskFor(tokenHash, request.params.id);
    if (task.next_poll_at && task.next_poll_at > new Date().toISOString() && task.result_json) return JSON.parse(task.result_json) as unknown;
    return pollImageTask(task);
  });
  app.get<{ Params: { id: string; index: string } }>("/v1/images/tasks/:id/content/:index", async (request, reply) => {
    const tokenHash = await authorize(request.headers, "image");
    invariant(config.imageModel, 503, "官方图片服务尚未配置。", "image_not_configured");
    const task = await imageTaskFor(tokenHash, request.params.id);
    const index = Number(request.params.index);
    invariant(Number.isInteger(index) && index >= 0 && index < 16, 400, "图片序号不合法。", "image_index_invalid");
    const abort = new AbortController();
    const onClose = () => { if (!reply.raw.writableEnded) abort.abort(); };
    reply.raw.once("close", onClose);
    try {
      await validateEndpoint(baseUrl, config.allowLocal);
      const response = await fetchWithIdleTimeout(upstreamEndpoint(config.upstreamUrl, config.imagePath, "images/tasks") + "/" + encodeURIComponent(task.upstream_id) + "/content/" + index, {
        method: "GET",
        headers: { Authorization: "Bearer " + config.upstreamKey },
        redirect: "error",
        signal: abort.signal,
      }, config.idleTimeoutMs ?? 120000, fetcher);
      if (!response.ok) {
        const error = await responseError(response);
        throw new AppError(error.upstreamStatus === 404 || error.upstreamStatus === 410 ? error.upstreamStatus : 502, "图片内容暂时无法读取。", error.code);
      }
      const mime = (response.headers.get("content-type") || "image/png").split(";", 1)[0];
      invariant(["image/png", "image/jpeg", "image/webp", "image/gif"].includes(mime), 502, "图片格式暂不支持。", "image_invalid_response");
      await markUpstream(true);
      reply.hijack();
      reply.raw.writeHead(200, { "Content-Type": mime, "Cache-Control": "private, max-age=300", "X-Content-Type-Options": "nosniff" });
      if (!response.body) { reply.raw.end(); return reply; }
      let bytes = 0;
      for await (const chunk of response.body) {
        bytes += chunk.byteLength;
        invariant(bytes <= 20 * 1024 * 1024, 502, "图片内容超过本次上限。", "image_invalid_response");
        await writeResponseChunk(reply.raw, Buffer.from(chunk));
      }
      reply.raw.end();
      return reply;
    } catch (error) {
      await markUpstreamFailure(error);
      if (reply.raw.headersSent) { reply.raw.end(); return reply; }
      throw imageUpstreamError(error);
    } finally { reply.raw.off("close", onClose); }
  });
  app.post(
    "/v1/" + (config.kind === "responses" ? "responses" : "chat/completions"),
    async (request, reply) => {
      const tokenHash = await authorize(request.headers);
      const body = z.record(z.string(), z.unknown()).parse(request.body);
      invariant(
        body.model === (config.publicModel || config.model),
        403,
        "该官方入口不允许切换到其他上游模型。",
      );
      const capability = capabilityHeader(request.headers["x-suinai-capability"]);
      const routedModel =
        (capability && config.modelRoutes?.[capability]) || config.model;
      const routedPath = capability && config.routePaths?.[capability];
      invariant(
        !new URL(upstreamEndpoint(baseUrl, routedPath || undefined, config.kind === "responses" ? "responses" : "chat/completions")).pathname.endsWith("/systemone"),
        409,
        "结构化判断需通过独立的 /v1/systemone 接口调用，不能转发聊天请求。",
        "structured_route_required",
      );
      const allowed = new Set(
        config.kind === "responses"
          ? [
              "model",
              "input",
              "tools",
              "tool_choice",
              "max_output_tokens",
              "stream",
              "store",
              "include",
              "reasoning",
            ]
          : [
              "model",
              "messages",
              "tools",
              "tool_choice",
              "max_tokens",
              "max_completion_tokens",
              "stream",
              "stream_options",
              "reasoning_effort",
            ],
      );
      invariant(
        Object.keys(body).every((key) => allowed.has(key)),
        400,
        "中转请求包含不支持的字段。",
      );
      const items = config.kind === "responses" ? body.input : body.messages;
      invariant(
        Array.isArray(items) && items.length > 0 && items.length <= 150,
        400,
        "对话数量不符合要求。",
      );
      invariant(
        typeof body.stream === "boolean" || body.stream === undefined,
        400,
        "stream 必须是布尔值。",
      );
      validateRelayPayload(body, config.kind);
      body.model = routedModel;
      const maxKey =
        config.kind === "responses"
          ? "max_output_tokens"
          : body.max_completion_tokens !== undefined
            ? "max_completion_tokens"
            : "max_tokens";
      const requested = Number(body[maxKey] ?? config.maxOutput);
      invariant(
        Number.isInteger(requested) && requested > 0,
        400,
        "输出上限不合法。",
      );
      body[maxKey] = Math.min(requested, config.maxOutput);
      if (config.kind === "responses") body.store = false;
      else if (body.stream && config.pointsEnabled) body.stream_options = { include_usage: true };
      await reserve(tokenHash, Number(body[maxKey]), "chat", estimatedInput(body), capability || "chat");
      const abort = new AbortController();
      const onClose = () => {
        if (!reply.raw.writableEnded) abort.abort();
      };
      reply.raw.on("close", onClose);
      try {
        await validateEndpoint(baseUrl, config.allowLocal);
        const requestUpstream = () => fetchWithIdleTimeout(
          upstreamEndpoint(
            baseUrl,
            routedPath,
            config.kind === "responses" ? "responses" : "chat/completions",
          ),
          {
            method: "POST",
            headers: {
              Authorization: "Bearer " + config.upstreamKey,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
            redirect: "error",
            signal: abort.signal,
          },
          config.idleTimeoutMs ?? 120000,
          fetcher,
        );
        let response = await requestUpstream();
        let firstError: Awaited<ReturnType<typeof responseError>> | undefined;
        if (!response.ok && body.stream_options) {
          firstError = await responseError(response);
          // 有些兼容网关不支持流式 usage 参数；仅对此参数重试一次，不重复预留积分。
          if (firstError.rejectedParameter === "stream_options") {
            delete body.stream_options;
            response = await requestUpstream();
            firstError = undefined;
          }
        }
        if (!response.ok) {
          // 仅转发经过连接层分类的参数名，绝不回显可能含密钥或对话的上游原始错误。
          const error = firstError ?? await responseError(response);
          if (error.rejectedParameter)
            return reply.code(response.status).send({
              error: {
                message: "接口不支持参数 " + error.rejectedParameter + "。",
                type: "invalid_request_error",
                code: "unsupported_parameter",
                param: error.rejectedParameter,
              },
            });
          throw new AppError(
            response.status === 429 ? 429 : 502,
            "官方上游暂时不可用（HTTP " + response.status + "）。",
            error.code,
          );
        }
        if (body.stream) {
          await markUpstream(true);
          invariant(
            response.body &&
              response.headers
                .get("content-type")
                ?.includes("text/event-stream"),
            502,
            "上游不支持此流式请求。",
          );
          reply.hijack();
          reply.raw.writeHead(200, {
            "Content-Type": "text/event-stream; charset=utf-8",
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",
          });
          let size = 0;
          const stream = new PublicEventStream(config.publicModel || "Suinai Flash");
          try {
            for await (const chunk of response.body) {
              size += chunk.byteLength;
              if (size > 2_000_000)
                throw new AppError(502, "上游输出超过上限。");
              for (const event of stream.push(chunk)) await writeResponseChunk(reply.raw, event);
            }
            for (const event of stream.push(new Uint8Array(), true)) await writeResponseChunk(reply.raw, event);
            invariant(stream.completed, 502, "模型回复未完整接收。", "provider_stream");
            await operations.complete(tokenHash, stream.usage);
          } catch (error) {
            if (!abort.signal.aborted && !reply.raw.destroyed) {
              const code = error instanceof Error && error.name === "TimeoutError" ? "provider_timeout" : "provider_stream";
              await markUpstream(false, code);
              reply.raw.write("data: " + JSON.stringify({ error: { code, message: "官方模型本次回复未完成。" } }) + "\n\n");
            }
          } finally {
            reply.raw.end();
          }
          return reply;
        }
        await markUpstream(true);
        const text = await readLimited(response);
        let parsed: unknown;
        try {
          parsed = JSON.parse(text);
        } catch {
          throw new AppError(502, "官方上游返回无效响应。");
        }
        invariant(isRecord(parsed), 502, "官方上游返回无效响应。");
        await operations.complete(tokenHash, meteredUsage(parsed));
        return reply.type("application/json").send(publicModelResponse(parsed, config.publicModel || "Suinai Flash"));
      } catch (error) {
        await markUpstreamFailure(error);
        if (reply.raw.headersSent) {
          reply.raw.end();
          return reply;
        }
        if (error instanceof AppError) throw error;
        throw new AppError(502, "官方模型请求未完成，请稍后重试。", error instanceof Error && error.name === "TimeoutError" ? "provider_timeout" : "provider_network");
      } finally {
        reply.raw.removeListener("close", onClose);
        await release(tokenHash, "chat");
      }
    },
  );
  app.post("/v1/systemone", { bodyLimit: 512 * 1024 }, async (request, reply) => {
    const tokenHash = await authorize(request.headers, "decision");
    invariant(config.decisionModel, 503, "官方结构化判断服务尚未配置。", "decision_not_configured");
    const body = systemOnePayload(request.body);
    invariant(body.model === (config.publicModel || config.decisionModel), 403, "该判断入口不允许切换到其他模型。");
    body.model = config.decisionModel;
    const endpoint = upstreamEndpoint(baseUrl, config.decisionPath, "systemone");
    // Jev 没有 max_tokens；沿用本机输出预算预留规则，不代表上游实际计费。
    await reserve(tokenHash, config.maxOutput, "decision", estimatedInput(body));
    const abort = new AbortController();
    const onClose = () => { if (!reply.raw.writableEnded) abort.abort(); };
    reply.raw.on("close", onClose);
    try {
      await validateEndpoint(baseUrl, config.allowLocal);
      const response = await fetchWithIdleTimeout(endpoint, {
        method: "POST",
        headers: { Authorization: "Bearer " + config.upstreamKey, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        redirect: "error",
        signal: abort.signal,
      }, config.idleTimeoutMs ?? 120000, fetcher);
      if (!response.ok) {
        const error = await responseError(response);
        throw new AppError(response.status === 429 ? 429 : 502,
          "官方判断服务暂时不可用（HTTP " + response.status + "）。", error.code);
      }
      let parsed: unknown;
      try { parsed = JSON.parse(await readLimited(response)); }
      catch { throw new AppError(502, "官方判断服务返回无效响应。", "decision_invalid_response"); }
      await markUpstream(true);
      const result = systemOneResult(parsed, body.questions);
      await operations.complete(tokenHash, meteredUsage(parsed), "decision");
      return reply.type("application/json").send(config.publicModel ? publicModelResponse(result, config.publicModel) : result);
    } catch (error) {
      await markUpstreamFailure(error);
      if (error instanceof AppError) throw error;
      throw new AppError(502, "本次判断未完成，请先核对使用记录后再试。",
        error instanceof Error && error.name === "TimeoutError" ? "provider_timeout" : "provider_network");
    } finally {
      reply.raw.removeListener("close", onClose);
      await release(tokenHash, "decision");
    }
  });
  app.post("/v1/career/decisions", { bodyLimit: 128 * 1024 }, async (request, reply) => {
    const tokenHash = await authorize(request.headers, "decision");
    invariant(config.decisionModel, 503, "官方职业判断服务尚未配置。", "decision_not_configured");
    const task = decisionTaskSchema.parse(request.body);
    const payload = careerDecisionPayload(config.decisionModel, task);
    await reserve(tokenHash, Math.min(config.maxOutput, 64 + Object.keys(payload.questions).length * 24), "decision", estimatedInput(payload));
    const abort = new AbortController(), started = Date.now();
    const onClose = () => { if (!reply.raw.writableEnded) abort.abort(); };
    reply.raw.once("close", onClose);
    try {
      await validateEndpoint(baseUrl, config.allowLocal);
      const response = await fetchWithIdleTimeout(upstreamEndpoint(baseUrl, config.decisionPath, "systemone"), {
        method: "POST", headers: { Authorization: "Bearer " + config.upstreamKey, "Content-Type": "application/json" },
        body: JSON.stringify(payload), redirect: "error", signal: abort.signal,
      }, Math.min(config.idleTimeoutMs ?? 30000, 30000), fetcher);
      if (!response.ok) { throw await responseError(response); }
      let raw: unknown;
      try { raw = JSON.parse(await readLimited(response, 512 * 1024)); }
      catch (error) { if (error instanceof AppError) throw error; throw new AppError(502, "职业判断返回无效响应。", "decision_invalid_response"); }
      await markUpstream(true);
      const result = interpretCareerDecision(task, payload, raw, Date.now() - started);
      if (config.publicModel) { result.model = config.publicModel; result.trace = { questions: {}, answers: {} }; }
      await operations.complete(tokenHash, meteredUsage(raw), "decision");
      return result;
    } catch (error) {
      await markUpstreamFailure(error);
      if (error instanceof AppError) throw error;
      throw new AppError(502, "本轮判断暂未完成，已保留原资料。", error instanceof Error && error.name === "TimeoutError" ? "provider_timeout" : "provider_network");
    } finally {
      reply.raw.off("close", onClose); await release(tokenHash, "decision");
    }
  });
  const maintenance = relayMaintenance(store, operations, config, fetcher, async () => {
    if (!config.imageModel) return;
    const tasks = await store.all("SELECT * FROM relay_image_tasks WHERE status IN ('queued','pending','running','in_progress','processing') AND (next_poll_at IS NULL OR next_poll_at<=?) ORDER BY created_at LIMIT 4", new Date().toISOString());
    for (const task of tasks) {
      if (task.expires_at && String(task.expires_at) <= new Date().toISOString()) continue;
      try { await pollImageTask(task as NonNullable<Awaited<ReturnType<typeof imageTaskFor>>>); } catch { /* 状态和退避时间已持久化；留待下一次维护。 */ }
    }
  });
  const worker = setInterval(() => { void maintenance.tick().catch(() => {}); }, config.imagePollIntervalMs ?? 5000);
  worker.unref();
  const heartbeat = setInterval(() => { void operations.heartbeat().catch(() => {}); }, 30000);
  heartbeat.unref();
  app.addHook("onClose", async () => { clearInterval(heartbeat); clearInterval(worker); await maintenance.close(); await store.close(); });
  return { app, store, operations, maintenance };
}
