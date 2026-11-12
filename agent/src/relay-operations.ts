/** 青穗集 · 官方运营事务：账号级租约、真实用量结算、积分账本与脱敏告警。 */
import { createHash, randomBytes } from "node:crypto";
import type { IncomingHttpHeaders } from "node:http";
import type { RelayStore } from "./relay-store.js";
import { invariant, isRecord } from "./errors.js";
export type RelayLane = "chat" | "decision" | "image";
import { RelayPoints, type PointsConfig } from "./relay-points.js";
export interface OperationsConfig extends PointsConfig {
  dailyRequests: number; dailyOutput: number; idleTimeoutMs?: number;
  tokenTtlMs?: number; leaseTtlMs?: number; billingEnabled?: boolean;
  inputMicrosPerToken?: number; outputMicrosPerToken?: number; imageMicros?: number;
  initialCreditMicros?: number;
}
export interface MeteredUsage { input: number; output: number; cachedInput?: number }
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const id = () => randomBytes(24).toString("base64url");
const now = () => new Date().toISOString();
export function meteredUsage(value: unknown): MeteredUsage | null {
  if (!isRecord(value)) return null;
  const u = isRecord(value.usage) ? value.usage : isRecord(value.response) && isRecord(value.response.usage) ? value.response.usage : null;
  if (!u) return null;
  const input = u.prompt_tokens ?? u.input_tokens;
  const output = u.completion_tokens ?? u.output_tokens;
  const details = isRecord(u.prompt_tokens_details) ? u.prompt_tokens_details : isRecord(u.input_tokens_details) ? u.input_tokens_details : {};
  const cached = details.cached_tokens;
  return Number.isSafeInteger(input) && Number(input) >= 0 && Number.isSafeInteger(output) && Number(output) >= 0
    ? { input: Number(input), output: Number(output), ...(Number.isSafeInteger(cached) && Number(cached) > 0 ? { cachedInput: Math.min(Number(input), Number(cached)) } : {}) } : null;
}
/** 图片按视觉输入预算估算，不把 base64 传输字节误算为文本 tokens；最终仍按真实 usage 结算。 */
export function estimateRelayInput(value: unknown) {
  let images = 0;
  const text = JSON.stringify(value, (_key, item: unknown) => {
    if (isRecord(item) && ["image_url", "input_image"].includes(String(item.type))) { images++; return { type: item.type, image: "[image]" }; }
    if (typeof item === "string" && item.startsWith("data:image/")) { images++; return "[image]"; }
    return item;
  });
  return Math.ceil(Buffer.byteLength(text, "utf8") / 4) + 750 + images * 4096;
}
export async function issueStoredToken(store: RelayStore, label: string, accountId: number | null = null) {
  const token = "qsg_" + id();
  const tokenHash = hash(token);
  await store.run("INSERT INTO access_tokens(hash,label,revoked,created_at,account_id,last_used_at) VALUES(?,?,0,?,?,NULL)", tokenHash, label, now(), accountId);
  return { token, hash: tokenHash };
}
export async function rotateStoredToken(store: RelayStore, oldHash: string, label?: string) {
  return store.transaction(async tx => {
    await tx.run("UPDATE relay_coordination SET version=version+1 WHERE id=1");
    const old = await tx.get("SELECT label,account_id,revoked FROM access_tokens WHERE hash=?", oldHash);
    invariant(old && Number(old.revoked) === 0, 409, "官方凭证已失效，请重新登录。", "relay_token_revoked");
    await tx.run("UPDATE access_tokens SET revoked=1 WHERE hash=?", oldHash);
    return issueStoredToken(tx, label || String(old.label), old.account_id == null ? null : Number(old.account_id));
  });
}
export class RelayOperations {
  private active = new Map<string, string>();
  readonly points: RelayPoints;
  constructor(readonly store: RelayStore, readonly config: OperationsConfig) { this.points = new RelayPoints(store, config); }
  async limitAuth(key: string) {
    await this.store.transaction(async tx => {
      await tx.run("UPDATE relay_coordination SET version=version+1 WHERE id=1");
      const time = Date.now(), keyHash = hash(key);
      const row = await tx.get("SELECT started_at,attempts FROM relay_auth_limits WHERE key_hash=?", keyHash);
      const recent = row && time - Number(row.started_at) < 60000;
      const attempts = recent ? Number(row.attempts) + 1 : 1;
      await tx.run("INSERT INTO relay_auth_limits(key_hash,started_at,attempts) VALUES(?,?,?) ON CONFLICT(key_hash) DO UPDATE SET started_at=excluded.started_at,attempts=excluded.attempts", keyHash, recent ? Number(row.started_at) : time, attempts);
      // 限流状态必须提交后再返回错误，不能因回滚而无限尝试。
      return attempts;
    }).then(attempts => invariant(attempts <= 12, 429, "登录请求过于频繁，请稍后再试。", "relay_auth_rate_limited"));
  }
  async authorize(headers: IncomingHttpHeaders) {
    invariant(!headers.origin, 403, "请通过本机应用连接官方服务。", "relay_browser_forbidden");
    invariant(headers.authorization?.startsWith("Bearer "), 401, "请先连接官方账号。", "relay_auth_required");
    const tokenHash = hash(headers.authorization!.slice(7));
    const row = await this.store.get("SELECT t.hash,t.created_at,t.account_id,a.status FROM access_tokens t LEFT JOIN relay_accounts a ON a.id=t.account_id WHERE t.hash=? AND t.revoked=0", tokenHash);
    invariant(row && (row.account_id == null || row.status === "active") && Date.now() - Date.parse(String(row.created_at)) < (this.config.tokenTtlMs ?? 30 * 86400000), 401, "官方连接已失效，请重新登录。", "relay_token_expired");
    await this.store.run("UPDATE access_tokens SET last_used_at=? WHERE hash=?", now(), tokenHash);
    return tokenHash;
  }
  async owner(tokenHash: string, store = this.store) {
    const row = await store.get("SELECT account_id FROM access_tokens WHERE hash=? AND revoked=0", tokenHash);
    invariant(row, 401, "官方连接已失效，请重新登录。", "relay_auth_required");
    return row.account_id == null ? "token:" + tokenHash : "account:" + row.account_id;
  }
  async reserve(tokenHash: string, output: number, lane: RelayLane = "chat", inputUpperBound = 0, capability: string = lane) {
    const operation = id();
    const key = tokenHash + ":" + lane;
    invariant(!this.active.has(key), 429, "穗奈正在处理这项任务。", "relay_busy");
    await this.store.transaction(async tx => {
      await tx.run("UPDATE relay_coordination SET version=version+1 WHERE id=1");
      await this.expire(tx);
      const owner = await this.owner(tokenHash, tx);
      invariant(!await tx.get("SELECT lease_id FROM relay_leases WHERE owner_id=? AND lane=?", owner, lane), 429, "穗奈正在处理这项任务。", "relay_busy");
      const count = await tx.get("SELECT COUNT(*) AS count FROM relay_leases");
      invariant(Number(count?.count) < 20, 429, "当前任务较多，请稍后再试。", "relay_busy");
      const day = now().slice(0, 10);
      const usage = owner.startsWith("account:")
        ? await tx.get("SELECT COALESCE(SUM(u.requests),0) AS requests,COALESCE(SUM(u.output_reserved),0) AS output_reserved FROM daily_usage u JOIN access_tokens t ON t.hash=u.token_hash WHERE t.account_id=? AND u.day=?", Number(owner.slice(8)), day)
        : await tx.get("SELECT requests,output_reserved FROM daily_usage WHERE token_hash=? AND day=?", tokenHash, day);
      invariant(this.config.pointsEnabled || Number(usage?.requests ?? 0) < this.config.dailyRequests, 429, "今日可用次数已用完，请稍后再来。", "relay_daily_request_limit");
      invariant(this.config.pointsEnabled || Number(usage?.output_reserved ?? 0) + output <= this.config.dailyOutput, 429, "今日可用额度已用完，请稍后再来。", "relay_daily_output_limit");
      const hold = this.config.billingEnabled && !this.config.pointsEnabled ? (lane === "image" ? output * (this.config.imageMicros ?? 1000000) : inputUpperBound * (this.config.inputMicrosPerToken ?? 1) + output * (this.config.outputMicrosPerToken ?? 4)) : 0;
      await tx.run("INSERT INTO relay_wallets(owner_id,balance_micros,held_micros,updated_at) VALUES(?,0,0,?) ON CONFLICT(owner_id) DO NOTHING", owner, now());
      const wallet = await tx.get("SELECT balance_micros,held_micros FROM relay_wallets WHERE owner_id=?", owner);
      invariant(!this.config.billingEnabled || this.config.pointsEnabled || Number(wallet?.balance_micros) - Number(wallet?.held_micros) >= hold, 402, "官方可用积分不足。", "relay_insufficient_credit");
      await tx.run("UPDATE relay_wallets SET held_micros=held_micros+?,updated_at=? WHERE owner_id=?", hold, now(), owner);
      await tx.run("INSERT INTO relay_usage_events(id,owner_id,token_hash,capability,day,state,reserved_output,reserved_micros,input_rate,output_rate,image_rate,billing_enabled,created_at) VALUES(?,?,?,?,?,'reserved',?,?,?,?,?,?,?)", operation, owner, tokenHash, capability, day, output, hold, this.config.inputMicrosPerToken ?? 1, this.config.outputMicrosPerToken ?? 4, this.config.imageMicros ?? 1000000, this.config.billingEnabled && !this.config.pointsEnabled ? 1 : 0, now());
      await this.points.reserve(tx, operation, owner, inputUpperBound, output, lane === "image");
      await tx.run("INSERT INTO relay_leases(owner_id,lane,lease_id,expires_at) VALUES(?,?,?,?)", owner, lane, operation, new Date(Date.now() + (this.config.leaseTtlMs ?? Math.max(300000, (this.config.idleTimeoutMs ?? 120000) * 3))).toISOString());
      await tx.run("INSERT INTO daily_usage(token_hash,day,requests,output_reserved) VALUES(?,?,1,?) ON CONFLICT(token_hash,day) DO UPDATE SET requests=daily_usage.requests+1,output_reserved=daily_usage.output_reserved+excluded.output_reserved", tokenHash, day, output);
    });
    this.active.set(key, operation);
    return operation;
  }
  async heartbeat() {
    for (const operation of this.active.values()) await this.store.run("UPDATE relay_leases SET expires_at=? WHERE lease_id=?", new Date(Date.now() + (this.config.leaseTtlMs ?? 300000)).toISOString(), operation);
  }
  async expire(tx: RelayStore) {
    const expired = await tx.all("SELECT lease_id FROM relay_leases WHERE expires_at<?", now());
    for (const row of expired) await this.settleIn(tx, String(row.lease_id), null, "interrupted");
    await tx.run("DELETE FROM relay_leases WHERE expires_at<?", now());
  }
  async settleIn(tx: RelayStore, operation: string, usage: MeteredUsage | null, state: "completed" | "failed" | "interrupted" | "unmetered", images = 0) {
    const event = await tx.get("SELECT * FROM relay_usage_events WHERE id=?", operation);
    if (!event || event.state !== "reserved") return;
    images = Math.min(images, Number(event.reserved_output));
    await this.points.settle(tx, event, usage, state, images);
    const cost = usage ? usage.input * Number(event.input_rate) + usage.output * Number(event.output_rate) : images * Number(event.image_rate);
    invariant(Number.isSafeInteger(cost) && cost >= 0, 502, "用量记录异常，已保留本次记录。", "relay_invalid_usage");
    const charged = Number(event.billing_enabled) === 1 && state === "completed" ? cost : 0;
    const settledOutput = state === "failed" || state === "interrupted" ? 0 : usage?.output ?? Number(event.reserved_output);
    await tx.run("UPDATE daily_usage SET output_reserved=output_reserved-?+? WHERE token_hash=? AND day=?", Number(event.reserved_output), settledOutput, String(event.token_hash), String(event.day));
    await tx.run("UPDATE relay_wallets SET held_micros=held_micros-?,balance_micros=balance_micros-?,updated_at=? WHERE owner_id=?", Number(event.reserved_micros), charged, now(), String(event.owner_id));
    await tx.run("UPDATE relay_usage_events SET state=?,input_tokens=?,output_tokens=?,image_count=?,cost_micros=?,charged_micros=?,completed_at=? WHERE id=?", state, usage?.input ?? null, usage?.output ?? null, images, cost, charged, now(), operation);
    if (charged) await tx.run("INSERT INTO relay_credit_ledger(id,owner_id,amount_micros,kind,created_at) VALUES(?,?,?,'usage',?) ON CONFLICT(id) DO NOTHING", operation, String(event.owner_id), -charged, now());
  }
  async settle(operation: string, usage: MeteredUsage | null, state: "completed" | "failed" | "interrupted" | "unmetered", images = 0) {
    await this.store.transaction(async tx => {
      await tx.run("UPDATE relay_coordination SET version=version+1 WHERE id=1");
      await this.settleIn(tx, operation, usage, state, images);
    });
  }
  async complete(tokenHash: string, usage: MeteredUsage | null, lane: RelayLane = "chat") {
    const operation = this.active.get(tokenHash + ":" + lane);
    if (operation) await this.settle(operation, usage, usage ? "completed" : "unmetered");
  }
  async detach(tokenHash: string, lane: RelayLane) {
    const key = tokenHash + ":" + lane;
    const operation = this.active.get(key);
    if (operation) await this.store.run("DELETE FROM relay_leases WHERE lease_id=?", operation);
    this.active.delete(key);
    return operation;
  }
  async release(tokenHash: string, lane: RelayLane = "chat") {
    const operation = this.active.get(tokenHash + ":" + lane);
    if (!operation) return;
    await this.settle(operation, null, "failed");
    await this.detach(tokenHash, lane);
  }
  async credit(owner: string, amount: number, key: string, kind = "topup") {
    invariant(Number.isSafeInteger(amount) && amount > 0, 400, "积分数量不合法。", "relay_credit_invalid");
    await this.store.transaction(async tx => {
      await tx.run("UPDATE relay_coordination SET version=version+1 WHERE id=1");
      const previous = await tx.get("SELECT owner_id,amount_micros FROM relay_credit_ledger WHERE id=?", key);
      if (previous) { invariant(previous.owner_id === owner && Number(previous.amount_micros) === amount, 409, "该入账编号已经使用。", "relay_credit_conflict"); return; }
      await tx.run("INSERT INTO relay_credit_ledger(id,owner_id,amount_micros,kind,created_at) VALUES(?,?,?,?,?)", key, owner, amount, kind, now());
      await tx.run("INSERT INTO relay_wallets(owner_id,balance_micros,held_micros,updated_at) VALUES(?,?,0,?) ON CONFLICT(owner_id) DO UPDATE SET balance_micros=relay_wallets.balance_micros+excluded.balance_micros,updated_at=excluded.updated_at", owner, amount, now());
    });
  }
  async summary(tokenHash: string) {
    const owner = await this.owner(tokenHash);
    const wallet = await this.store.get("SELECT balance_micros,held_micros FROM relay_wallets WHERE owner_id=?", owner);
    const day = now().slice(0, 10);
    const usage = await this.store.get("SELECT COUNT(*) AS requests,COALESCE(SUM(input_tokens),0) AS input_tokens,COALESCE(SUM(output_tokens),0) AS output_tokens,COALESCE(SUM(charged_micros),0) AS charged_micros,COALESCE(SUM(image_count),0) AS images FROM relay_usage_events WHERE owner_id=? AND day=?", owner, day);
    return { day, billing_enabled: Boolean(this.config.billingEnabled), balance_micros: Number(wallet?.balance_micros ?? 0), held_micros: Number(wallet?.held_micros ?? 0), requests: Number(usage?.requests ?? 0), input_tokens: Number(usage?.input_tokens ?? 0), output_tokens: Number(usage?.output_tokens ?? 0), charged_micros: Number(usage?.charged_micros ?? 0), images: Number(usage?.images ?? 0) };
  }
  async health() {
    const row = await this.store.get("SELECT * FROM relay_upstream_health WHERE id=1");
    return { status: Number(row?.consecutive_failures ?? 0) >= 3 ? "degraded" : "ready", consecutive_failures: Number(row?.consecutive_failures ?? 0), last_success_at: row?.last_success_at ?? null, last_failure_at: row?.last_failure_at ?? null, last_error_code: row?.last_error_code ?? null, updated_at: row?.updated_at ?? null };
  }
  async markUpstream(ok: boolean, code = "provider_error") {
    await this.store.transaction(async tx => {
      await tx.run("UPDATE relay_coordination SET version=version+1 WHERE id=1");
      const old = await tx.get("SELECT * FROM relay_upstream_health WHERE id=1");
      const failures = ok ? 0 : Number(old?.consecutive_failures ?? 0) + 1, timestamp = now();
      await tx.run("INSERT INTO relay_upstream_health(id,consecutive_failures,last_success_at,last_failure_at,last_error_code,updated_at) VALUES(1,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET consecutive_failures=excluded.consecutive_failures,last_success_at=excluded.last_success_at,last_failure_at=excluded.last_failure_at,last_error_code=excluded.last_error_code,updated_at=excluded.updated_at", failures, ok ? timestamp : old?.last_success_at ?? null, ok ? old?.last_failure_at ?? null : timestamp, ok ? null : code, timestamp);
      if ((Number(old?.consecutive_failures ?? 0) < 3 && failures >= 3) || (Number(old?.consecutive_failures ?? 0) >= 3 && ok)) {
        await tx.run("INSERT INTO relay_alerts(id,kind,created_at,failures,code,status,attempts,next_attempt_at) VALUES(?,?,?,?,?,'pending',0,?)", id(), ok ? "upstream_recovered" : "upstream_degraded", timestamp, failures, ok ? null : code, timestamp);
      }
    });
  }
}
