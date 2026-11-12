/** 青穗集 · 每日积分账本：整数计价、上海业务日、原子预留与幂等结算，旧余额保持独立。 */
import { randomUUID } from "node:crypto";
import { invariant } from "./errors.js";
import { CREDIT_CAPABILITIES, type CreditSummary, type OfficialCredits } from "./credits-contract.js";
import { RelayAccountAccess } from "./relay-account-access.js";
import type { RelayRow, RelayStore } from "./relay-store.js";
import type { MeteredUsage } from "./relay-operations.js";
export const POINT_SCALE = 1_000_000;
export interface PointsConfig {
  pointsEnabled?: boolean; dailyPoints?: number; pointsVersion?: string;
  pointsInputRate?: number; pointsCachedRate?: number; pointsOutputRate?: number; pointsImageRate?: number;
}
export function pointMicros(points: number) {
  const result = Math.round(points * POINT_SCALE);
  invariant(Number.isFinite(points) && points >= 0 && Number.isSafeInteger(result) && result <= 1_000_000_000_000, 400, "积分数量不合法。", "points_invalid");
  return result;
}
const points = (micros: number) => micros / POINT_SCALE;
export function pointDay(at = new Date()) {
  const day = new Date(at.getTime() + 8 * 3600000).toISOString().slice(0, 10);
  return { day, resets: new Date(Date.parse(day + "T00:00:00+08:00") + 86400000).toISOString() };
}
function checkedCost(input: number, output: number, cached: number, images: number, rates: number[]) {
  invariant([input, output, cached, images, ...rates].every(x => Number.isSafeInteger(x) && x >= 0), 502, "用量记录异常。", "points_usage_invalid");
  const amount = BigInt(input - Math.min(input, cached)) * BigInt(rates[0]!) + BigInt(Math.min(input, cached)) * BigInt(rates[1]!) + BigInt(output) * BigInt(rates[2]!) + BigInt(images) * BigInt(rates[3]!);
  invariant(amount <= BigInt(Number.MAX_SAFE_INTEGER), 502, "用量记录超出安全范围。", "points_usage_invalid");
  return Number(amount);
}
export class RelayPoints {
  readonly access: RelayAccountAccess;
  readonly rates: number[];
  readonly version: string;
  constructor(readonly store: RelayStore, readonly config: PointsConfig, readonly clock = () => new Date()) {
    this.access = new RelayAccountAccess(store);
    this.rates = [config.pointsInputRate ?? 10000, config.pointsCachedRate ?? 2500, config.pointsOutputRate ?? 40000, config.pointsImageRate ?? 200 * POINT_SCALE];
    invariant(this.rates.every(x => Number.isSafeInteger(x) && x >= 0 && x <= 1_000_000_000_000), 500, "积分价格配置无效。", "points_config_invalid");
    pointMicros(config.dailyPoints ?? 2300);
    this.version = config.pointsVersion || "2026-10-v1";
    invariant(this.version.length <= 80, 500, "积分价格版本过长。", "points_config_invalid");
  }
  private async ensureDay(tx: RelayStore, owner: string, day: string) {
    const policy = owner.startsWith("account:") ? await tx.get("SELECT daily_points_micros FROM relay_account_policies WHERE account_id=?", Number(owner.slice(8))) : undefined;
    const grant = policy?.daily_points_micros == null ? pointMicros(this.config.dailyPoints ?? 2300) : Number(policy.daily_points_micros);
    await tx.run("INSERT INTO relay_point_days(owner_id,day,granted_micros,spent_micros,held_micros,updated_at) VALUES(?,?,?,0,0,?) ON CONFLICT(owner_id,day) DO NOTHING", owner, day, grant, this.clock().toISOString());
    return (await tx.get("SELECT * FROM relay_point_days WHERE owner_id=? AND day=?", owner, day))!;
  }
  private async adjustments(tx: RelayStore, owner: string, day: string) {
    return Number((await tx.get("SELECT COALESCE(SUM(amount_micros),0) AS amount FROM relay_point_adjustments WHERE owner_id=? AND day=?", owner, day))?.amount ?? 0);
  }
  /** 与 usage event 的创建共用调用方事务；不得单独提交预留。 */
  async reserve(tx: RelayStore, operation: string, owner: string, input: number, output: number, image: boolean) {
    if (!this.config.pointsEnabled) return;
    const { day } = pointDay(this.clock());
    const ledger = await this.ensureDay(tx, owner, day);
    const hold = checkedCost(image ? 0 : input, image ? 0 : output, 0, image ? output : 0, this.rates);
    const available = Number(ledger.granted_micros) + await this.adjustments(tx, owner, day) - Number(ledger.spent_micros) - Number(ledger.held_micros);
    invariant(hold <= available, 402, "本次任务所需积分超出剩余积分，可缩短内容或等待每日刷新。", "relay_insufficient_points");
    await tx.run("UPDATE relay_point_days SET held_micros=held_micros+?,updated_at=? WHERE owner_id=? AND day=?", hold, this.clock().toISOString(), owner, day);
    await tx.run("UPDATE relay_usage_events SET points_enabled=1,points_day=?,points_reserved=?,points_input_rate=?,points_cached_rate=?,points_output_rate=?,points_image_rate=?,points_version=? WHERE id=?", day, hold, ...this.rates, this.version, operation);
  }
  /** event.state 的幂等保护由调用方执行；结算使用请求创建时的价格与业务日。 */
  async settle(tx: RelayStore, event: RelayRow, usage: MeteredUsage | null, state: string, images: number) {
    if (Number(event.points_enabled) !== 1) return;
    const cached = Math.min(usage?.input ?? 0, usage?.cachedInput ?? 0);
    const cost = state === "completed" ? checkedCost(usage?.input ?? 0, usage?.output ?? 0, cached, images, [Number(event.points_input_rate), Number(event.points_cached_rate), Number(event.points_output_rate), Number(event.points_image_rate)]) : 0;
    // 估算不足的差额由平台承担，仍保留原始计价用于审计；不让并发结算透支日额度。
    const charge = Math.min(cost, Number(event.points_reserved));
    await tx.run("UPDATE relay_point_days SET held_micros=held_micros-?,spent_micros=spent_micros+?,updated_at=? WHERE owner_id=? AND day=?", Number(event.points_reserved), charge, this.clock().toISOString(), String(event.owner_id), String(event.points_day));
    await tx.run("UPDATE relay_usage_events SET points_charged=?,points_calculated=?,cached_input_tokens=? WHERE id=?", charge, cost, cached, String(event.id));
  }
  async view(owner: string, accountId: number | null, cursor?: string, limit = 30): Promise<OfficialCredits> {
    invariant(Number.isInteger(limit) && limit >= 1 && limit <= 100, 400, "分页数量不合法。", "points_cursor_invalid");
    let after: { at: string; id: string } | undefined;
    if (cursor) {
      try { const v = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")); if (typeof v.at !== "string" || !Number.isFinite(Date.parse(v.at)) || typeof v.id !== "string" || v.id.length > 100) throw Error(); after = v; }
      catch { invariant(false, 400, "用量分页位置无效，请刷新。", "points_cursor_invalid"); }
    }
    return this.store.transaction(async tx => {
      await tx.run("UPDATE relay_coordination SET version=version+1 WHERE id=1");
      const { day, resets } = pointDay(this.clock());
      const ledger = await this.ensureDay(tx, owner, day);
      const adjustment = await this.adjustments(tx, owner, day);
      const summary: CreditSummary = { day, timezone: "Asia/Shanghai", resets_at: resets, daily_points: points(Number(ledger.granted_micros)), adjustment_points: points(adjustment), used_points: points(Number(ledger.spent_micros)), reserved_points: points(Number(ledger.held_micros)), remaining_points: points(Math.max(0, Number(ledger.granted_micros) + adjustment - Number(ledger.spent_micros) - Number(ledger.held_micros))) };
      const rows = await tx.all("SELECT * FROM relay_usage_events WHERE owner_id=? AND points_enabled=1" + (after ? " AND (created_at<? OR (created_at=? AND id<?))" : "") + " ORDER BY created_at DESC,id DESC LIMIT ?", owner, ...(after ? [after.at, after.at, after.id] : []), limit + 1);
      const selected = rows.slice(0, limit), last = selected.at(-1);
      return {
        enabled: Boolean(this.config.pointsEnabled), account: await this.access.describe(accountId, tx), summary,
        pricing: { version: this.version, input_per_1000: points(this.rates[0]! * 1000), cached_input_per_1000: points(this.rates[1]! * 1000), output_per_1000: points(this.rates[2]! * 1000), image_per_item: points(this.rates[3]!) },
        entries: selected.map(row => ({ id: String(row.id), created_at: String(row.created_at), completed_at: row.completed_at == null ? null : String(row.completed_at), capability: CREDIT_CAPABILITIES[String(row.capability)] || "对话", state: row.state as OfficialCredits["entries"][number]["state"], points: points(Number(row.points_charged)), reserved_points: points(Number(row.points_reserved)), input_tokens: row.input_tokens == null ? null : Number(row.input_tokens), output_tokens: row.output_tokens == null ? null : Number(row.output_tokens), cached_input_tokens: Number(row.cached_input_tokens), price_version: row.points_version == null ? null : String(row.points_version) })),
        next_cursor: rows.length > limit && last ? Buffer.from(JSON.stringify({ at: last.created_at, id: last.id })).toString("base64url") : null,
      };
    });
  }
  private async authorizeManager(tx: RelayStore, actorId: number | null) {
    if (actorId !== null) invariant((await this.access.describe(actorId, tx)).permissions.includes("credits.manage"), 403, "当前账号没有积分管理权限。", "account_permission_denied");
  }
  async setLimit(actorId: number | null, accountId: number, daily: number) {
    const amount = pointMicros(daily);
    return this.store.transaction(async tx => {
      await tx.run("UPDATE relay_coordination SET version=version+1 WHERE id=1");
      await this.authorizeManager(tx, actorId);
      await this.access.describe(accountId, tx);
      const owner = "account:" + accountId, { day } = pointDay(this.clock());
      const ledger = await this.ensureDay(tx, owner, day);
      invariant(amount + await this.adjustments(tx, owner, day) >= Number(ledger.spent_micros) + Number(ledger.held_micros), 409, "新额度不能低于今日已使用和预留的积分。", "points_limit_below_usage");
      await tx.run("INSERT INTO relay_account_policies(account_id,role,permissions_json,daily_points_micros,updated_at) VALUES(?,'member','[]',?,?) ON CONFLICT(account_id) DO UPDATE SET daily_points_micros=excluded.daily_points_micros,updated_at=excluded.updated_at", accountId, amount, this.clock().toISOString());
      await tx.run("UPDATE relay_point_days SET granted_micros=?,updated_at=? WHERE owner_id=? AND day=?", amount, this.clock().toISOString(), owner, day);
      await this.access.audit(tx, actorId === null ? "server-console" : "account:" + actorId, accountId, "points.limit", { daily_points: daily, day });
      return { account_id: accountId, daily_points: daily, day };
    });
  }
  async adjust(actorId: number | null, accountId: number, amount: number, reference: string, reason: string) {
    const micros = pointMicros(amount);
    invariant(micros > 0 && /^[\w:-]{8,120}$/.test(reference) && reason.trim().length > 0 && reason.length <= 300, 400, "请提供正数积分、唯一操作编号和原因。", "points_adjustment_invalid");
    return this.store.transaction(async tx => {
      await tx.run("UPDATE relay_coordination SET version=version+1 WHERE id=1");
      await this.authorizeManager(tx, actorId);
      await this.access.describe(accountId, tx);
      const owner = "account:" + accountId, { day } = pointDay(this.clock());
      const old = await tx.get("SELECT * FROM relay_point_adjustments WHERE id=?", reference);
      if (old) {
        invariant(old.owner_id === owner && Number(old.amount_micros) === micros && old.reason === reason, 409, "该操作编号已经使用。", "points_adjustment_conflict");
        return { reference, points: amount, day: String(old.day), duplicate: true };
      }
      const ledger = await this.ensureDay(tx, owner, day);
      invariant(Number(ledger.granted_micros) + await this.adjustments(tx, owner, day) + micros <= 1_000_000_000_000, 400, "今日积分总额超出范围。", "points_invalid");
      const actor = actorId === null ? "server-console" : "account:" + actorId;
      await tx.run("INSERT INTO relay_point_adjustments(id,owner_id,day,amount_micros,actor,reason,created_at) VALUES(?,?,?,?,?,?,?)", reference, owner, day, micros, actor, reason, this.clock().toISOString());
      await this.access.audit(tx, actor, accountId, "points.adjust", { points: amount, day, reason, reference }, randomUUID());
      return { reference, points: amount, day, duplicate: false };
    });
  }
}
