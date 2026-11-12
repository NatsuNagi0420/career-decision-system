/** 青穗集 · 官方积分共享契约：只公开产品积分与本人用量，不暴露上游路由和管理凭证。 */
export const ACCOUNT_PERMISSIONS = ["accounts.read", "credits.manage", "permissions.manage"] as const;
export type AccountPermission = typeof ACCOUNT_PERMISSIONS[number];
export interface CreditSummary {
  day: string; timezone: string; resets_at: string; daily_points: number;
  adjustment_points: number; used_points: number; reserved_points: number; remaining_points: number;
}
export interface CreditEntry {
  id: string; created_at: string; completed_at: string | null; capability: string;
  state: "reserved" | "completed" | "failed" | "interrupted" | "unmetered";
  points: number; reserved_points: number; input_tokens: number | null; output_tokens: number | null;
  cached_input_tokens: number; price_version: string | null;
}
export interface OfficialCredits {
  enabled: boolean;
  account: { id: number | null; username: string; role: "member" | "admin" | "owner"; permissions: AccountPermission[] };
  summary: CreditSummary;
  pricing: { version: string; input_per_1000: number; cached_input_per_1000: number; output_per_1000: number; image_per_item: number };
  entries: CreditEntry[]; next_cursor: string | null;
}
export const CREDIT_CAPABILITIES: Record<string, string> = {
  chat: "对话", conversation_support: "对话", profile_diagnose: "画像整理", direction_explore: "方向探索",
  compare_decide: "方向比较", action_plan: "行动规划", resume_build: "简历制作", artifact_delivery: "文件制作",
  decision: "线索判断", image: "图像制作",
};
