/** 青穗集 · 陪伴交互纯逻辑：仅已发送内容可分析，闲置提醒限频且不伪造用户消息。 */
import { activeTask, type GuidanceView, type TaskKind } from "../../../agent/src/guidance-contract";
export { activeTask, TASK_LABELS, TASK_KINDS } from "../../../agent/src/guidance-contract";
export const TASK_PROMPTS: Record<TaskKind, string> = {
  career: "我想一起找找适合的职业方向。请接着我们已有的交流，从我的真实经历和偏好开始，一次只问一个关键问题。",
  learning: "我想明确接下来学什么、怎么练习。请先了解我的目标、现有基础和可投入的时间，不要直接堆一长串课程。",
  resume: "我想在当前对话里写或优化简历。请接着已经提供的材料继续，只问当前缺少的关键信息；如果我只需要局部修改，就只处理该部分，不编造经历。",
};
export interface ComposerDraft { text: string; task: TaskKind | null }
export type ComposerDraftAction =
  | { type: "edit"; text: string }
  | { type: "task"; kind: TaskKind | null }
  | { type: "reset" };
export const EMPTY_COMPOSER_DRAFT: ComposerDraft = { text: "", task: null };
/** 只替换未编辑的任务提示；在异步任务保存后按最新草稿判断，不覆盖期间的手写内容。 */
export function composerDraftReducer(draft: ComposerDraft, action: ComposerDraftAction): ComposerDraft {
  if (action.type === "reset") return EMPTY_COMPOSER_DRAFT;
  if (action.type === "edit") return { text: action.text, task: null };
  if (draft.task === null && draft.text.trim()) return draft;
  return action.kind
    ? { text: TASK_PROMPTS[action.kind], task: action.kind }
    : EMPTY_COMPOSER_DRAFT;
}
export const IDLE_AFTER_MS = 120_000;
export const IDLE_COOLDOWN_MS = 600_000;
export interface IdleContext { visible: boolean; blocked: boolean; hasDraft: boolean; enabled: boolean; now: number; lastActivity: number; lastNudge: number; shown: number }
export function canNudge(context: IdleContext) { return context.enabled && context.visible && !context.blocked && !context.hasDraft && context.shown < 2 && context.now - context.lastActivity >= IDLE_AFTER_MS && context.now - context.lastNudge >= IDLE_COOLDOWN_MS; }
export function idleMessage(guidance: GuidanceView | undefined) {
  const task = activeTask(guidance);
  if (guidance?.progress?.needs_confirmation) return "刚才的小结不急着确认。想修改哪一点，直接告诉我就好。";
  if (task?.kind === "resume") return "要不要接着整理刚才那段经历？从你负责的那一小部分说起就好。";
  if (task?.kind === "learning") return "计划可以先小一点。要不要一起挑一件今天就能做的练习？";
  if (task?.kind === "career") return "还没想好方向也没关系。我们可以从最近一件让你有成就感的事聊起。";
  return "我在这里。想继续的话，我们可以从最近做过的一件小事聊起；休息一下也很好。";
}
export function acceptGuidance(current: GuidanceView | undefined, incoming: GuidanceView) { return !current || incoming.revision >= current.revision ? incoming : current; }
