/** 青穗集 · 穗奈·忆迹场共享契约：有来源的长期记忆、召回记录与用户控制。 */
export const MEMORY_KINDS = ["experience", "skill", "goal", "preference", "plan", "anchor", "emotion"] as const;
export type MemoryKind = typeof MEMORY_KINDS[number];
export const MEMORY_LABELS: Record<MemoryKind, string> = { experience: "经历 · 记忆", skill: "技能", goal: "目标", preference: "偏好与约束", plan: "行动计划", anchor: "长期锚点", emotion: "情绪线索" };
export interface MemorySource { id: string; kind: "message" | "career" | "resume" | "task" | "job" | "correction" | "synced"; original_kind?: "message" | "career" | "resume" | "task" | "job" | "correction"; origin_conversation_id?: string | null; source_id: string; conversation_id: string | null; conversation_title: string; quote: string; created_at: string }
export interface MemoryNode {
  id: string; kind: MemoryKind; text: string; confidence: number; importance: number;
  confirmed: boolean; anchor: boolean; demoted: boolean; status: "active" | "archived";
  revision: number; created_at: string; updated_at: string; last_mentioned_at: string;
  mentions: number; recall_count: number; retention: number; phase: "clear" | "fading" | "dormant" | "archived";
  sources: MemorySource[]; conflict_ids: string[];
}
export interface MemoryRecallItem { id: string; text: string; kind: MemoryKind; score: number; reason: string; source_ids: string[] }
export interface MemoryRecall { id: string; conversation_id: string; run_id: string; created_at: string; query: string; items: MemoryRecallItem[] }
export interface MemorySettings { enabled: boolean; recall_enabled: boolean; sync_enabled?: boolean }
export interface MemoryRelation { from: string; to: string; kind: "related" | "conflict"; evidence: string }
export interface MemoryDocument { id: string; title: string; text: string; memory_ids: string[]; updated_at: string | null }
export interface MemoryProcessing { queued: number; running: number; failed: number; last_error: string | null }
export interface MemorySeaView { processing?: MemoryProcessing; relations: MemoryRelation[]; documents: MemoryDocument[]; nodes: MemoryNode[]; recalls: MemoryRecall[]; settings: MemorySettings; counts: Record<MemoryKind, number>; total: number; updated_at: string | null; search: string; selected_conversation_id: string | null }
export type MemoryAction = "confirm" | "correct" | "demote" | "restore" | "archive" | "anchor" | "unanchor" | "delete";
export interface MemoryChange { action: MemoryAction; revision: number; text?: string }
