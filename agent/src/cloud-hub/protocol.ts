/** 青穗集 · 多端控制协议：执行位置、设备绑定、不可变任务设置与公开进度。 */
import { z } from "zod";
export const uuid = z.string().uuid();
export const settingsInput = z.object({
  allow_remote: z.boolean().default(true),
  workspace_id: uuid.nullable().default(null),
  workspace_access: z.enum(["read-only", "workspace-write"]).default("read-only"),
  model_source: z.enum(["official", "local"]).default("official"),
  profile_id: uuid.nullable().default(null),
  reasoning_effort: z.enum(["auto", "low", "medium", "high"]).default("auto"),
  sync_chats: z.boolean().default(true),
}).strict();
/** 兼容旧设备记录；项目可见范围由电脑实际登记的 catalogue 决定。 */
export const limitsInput = z.object({
  allow_project_write: z.boolean().default(false),
  workspace_ids: z.array(uuid).max(100).default([]),
}).strict();
export const catalogueInput = z.object({
  workspaces: z.array(z.object({ id: uuid, name: z.string().min(1).max(120) }).strict()).max(100),
  profiles: z.array(z.object({ id: uuid, name: z.string().min(1).max(200), mode: z.enum(["official", "custom"]), ready: z.boolean() }).strict()).max(30),
}).strict();
export type DeviceSettings = z.infer<typeof settingsInput>;
export type DeviceLimits = z.infer<typeof limitsInput>;
export type DeviceCatalogue = z.infer<typeof catalogueInput>;
export interface HubDevice {
  id: string; name: string; status: "pending" | "active" | "revoked";
  online: boolean; last_seen_at: string | null; settings: DeviceSettings;
  limits: DeviceLimits; catalogue: DeviceCatalogue; revision: number;
}
export type TaskStatus = "queued" | "waiting_pc" | "running" | "awaiting_approval" | "waiting_input" | "completed" | "failed" | "cancelled" | "interrupted" | "paused";
export const ACTIVE_TASK = ["queued", "waiting_pc", "running", "awaiting_approval"] as const;
export interface HubSession { workspace_id: string | null; workspace_name: string | null; workspace_access: "read-only" | "workspace-write"; id: string; title: string; target: "pc" | "cloud"; device_id: string | null; archived: boolean; created_at: string; updated_at: string; }
export interface HubTask {
  id: string; session_id: string; target: "pc" | "cloud"; device_id: string | null;
  status: TaskStatus; input: string; settings: DeviceSettings; created_at: string; updated_at: string;
  error: string | null; cancel_requested: boolean; local_run_id: string | null;
}
export interface HubFile { id: string; session_id: string; name: string; kind: "input" | "output"; bytes: number; sha256: string; version: number; created_at: string; }
export interface TaskLease extends HubTask { lease: string; uploads: HubFile[]; conversation: HubSession; local_conversation_id: string | null; }
export const taskInput = z.object({ input: z.string().trim().min(1).max(20000), request_id: uuid }).strict();
export const fileInput = z.object({ name: z.string().min(1).max(240), base64: z.string().max(6_000_000) }).strict();
export const snapshotInput = z.object({ conversation: z.record(z.string(), z.unknown()), messages: z.array(z.record(z.string(), z.unknown())).max(4000), runs: z.array(z.record(z.string(), z.unknown())).max(1000), events: z.array(z.record(z.string(), z.unknown())).max(1000), artifacts: z.array(z.record(z.string(), z.unknown())).max(1000), approvals: z.array(z.record(z.string(), z.unknown())).max(100).optional(), drafts: z.record(z.string(), z.string().max(1000000)), last_seq: z.number().int().nonnegative() }).passthrough();
export type HubSnapshot = z.infer<typeof snapshotInput>;
export const publishInput = z.object({ lease: z.string().min(16).max(128), local_run_id: uuid.nullable(), status: z.enum(["running", "awaiting_approval", "waiting_input", "completed", "failed", "cancelled", "interrupted", "paused"]), error: z.string().max(500).nullable().default(null), snapshot: snapshotInput.optional(), career: z.record(z.string(), z.unknown()).optional() }).strict();
export function validateSettings(settings: DeviceSettings, device: Pick<HubDevice, "catalogue">) {
  if (settings.workspace_id && !device.catalogue.workspaces.some(w => w.id === settings.workspace_id)) return "这个项目已不在电脑的项目列表中，请重新选择。";
  if (settings.model_source === "local" && !device.catalogue.profiles.some(p => p.id === settings.profile_id && p.mode === "custom" && p.ready)) return "请先在 PC 配置并测试这个模型。";
  return null;
}

/** 扫码只交换一次性凭证，长期设备密钥和账号令牌绝不进入二维码。 */
export function pairingPayload(hubUrl: string, token: string) {
  return JSON.stringify({ type: "suinai-device", version: 1, hub: new URL(hubUrl).origin, token });
}
export const pairingToken = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
