/** 青穗集 · 同步快照清理：只传用户可见内容，不传凭据、宿主路径和模型续答状态。 */
import type { Secrets } from "../secrets.js";
import { invariant, isRecord } from "../errors.js";
import type { HubSnapshot } from "./protocol.js";
const hidden = /^(?:api_?key|secret|token|authorization|password|base_url|root_path|canonical_path|response_items|checkpoints?|user_id|backup_path|encrypted.*)$/i;
export function publicValue(value: unknown, secrets: Secrets, depth = 0): unknown {
  if (depth > 18) return null;
  if (typeof value === "string") return secrets.redact(value);
  if (Array.isArray(value)) return value.slice(-4000).map(v => publicValue(v, secrets, depth + 1));
  if (isRecord(value)) return Object.fromEntries(Object.entries(value).filter(([key]) => !hidden.test(key)).map(([key, v]) => [key, publicValue(v, secrets, depth + 1)]));
  return value;
}
export function publicSnapshot(value: unknown, secrets: Secrets): HubSnapshot {
  invariant(isRecord(value), 400, "进度格式不正确。");
  const rows = (key: string, count: number) => Array.isArray(value[key]) ? (value[key] as unknown[]).slice(-count).filter(isRecord) : [];
  const clean = publicValue({
    conversation: isRecord(value.conversation) ? value.conversation : {},
    messages: rows("messages", 1500).map(({ response_items: _private, ...message }) => message),
    runs: rows("runs", 300).map(run => Object.fromEntries(["id", "status", "error", "steps", "created_at", "updated_at"].map(k => [k, run[k]]))),
    events: rows("events", 180).map(event => { const data = isRecord(event.data) ? { ...event.data } : {}; delete data.checkpoint; delete data.response_items; return { ...event, data }; }),
    artifacts: rows("artifacts", 200).map(({ path: _path, ...artifact }) => artifact),
    approvals: rows("approvals", 100),
    drafts: isRecord(value.drafts) ? value.drafts : {},
    last_seq: typeof value.last_seq === "number" ? value.last_seq : 0,
    ...(value.plan ? { plan: value.plan } : {}),
    ...(value.resume ? { resume: value.resume } : {}),
  }, secrets) as HubSnapshot;
  invariant(Buffer.byteLength(JSON.stringify(clean)) <= 4 * 1024 * 1024, 413, "这段对话的同步内容太大，请新开一段对话。");
  return clean;
}
