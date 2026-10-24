/** 青穗集 · 连续对话任务契约：任务入口、模型建议和程序进度分别保存，建议不等于用户授权。 */
export const TASK_KINDS = ["career", "learning", "resume"] as const;
export type TaskKind = typeof TASK_KINDS[number];
export const TASK_LABELS: Record<TaskKind, string> = { career: "找职业方向", learning: "定学习计划", resume: "写／改简历" };
export interface GuidedTask { id: string; kind: TaskKind; status: "active" | "paused"; created_at: string; updated_at: string }
export interface TaskProgress { stage: string; next_step: string; needs_confirmation: boolean }
export interface IntentSuggestion { id: string; kind: TaskKind; message: string; evidence_message_id: string; created_at: string }
export interface ConversationMemory { summary: string; next_step: string; through_message_id: string; updated_at: string; source: "model" }
export interface GuidanceState {
  revision: number; active_task_id: string | null; tasks: GuidedTask[];
  memory: ConversationMemory | null; suggestion: IntentSuggestion | null; analyzed_message_id: string | null;
}
export interface GuidanceView extends GuidanceState { progress: TaskProgress | null; shared_resume: boolean }
export function emptyGuidance(): GuidanceState { return { revision: 0, active_task_id: null, tasks: [], memory: null, suggestion: null, analyzed_message_id: null }; }
export function activeTask(state: GuidanceState | null | undefined) { return state?.tasks.find(task => task.id === state.active_task_id && task.status === "active") ?? null; }
