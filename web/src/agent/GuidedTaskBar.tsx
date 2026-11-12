/** 青穗集 · 当前对话任务入口：选择会保存真实任务状态，不新开聊天、不自动发送或提升权限。 */
import { CareerIcon } from "./CareerVisuals";
import { activeTask, TASK_LABELS, TASK_KINDS, type GuidanceView, type TaskKind } from "../../../agent/src/guidance-contract";
export function GuidedTaskBar({ guidance, disabled, onChange }: { guidance?: GuidanceView; disabled: boolean; onChange: (kind: TaskKind | null) => void }) {
  const task = activeTask(guidance), icons = { career: "compass", learning: "plan", resume: "resume" } as const;
  return <section className="guided-task" aria-label="当前对话任务">
    <div className="guided-task__choices"><span className="guided-task__label">我想</span>
      <button type="button" aria-pressed={!task} disabled={disabled} onClick={() => onChange(null)} title="暂停当前任务，保留进度和聊天">自由聊聊</button>
      {TASK_KINDS.map(kind => <button key={kind} data-onboarding={kind} type="button" aria-pressed={task?.kind === kind} disabled={disabled} onClick={() => onChange(kind)} title="在当前对话继续，选择后不会自动发送消息"><CareerIcon name={icons[kind]} size={18} />{TASK_LABELS[kind]}</button>)}
    </div>
    {task && guidance?.progress && <div className="guided-task__progress"><span className="guided-task__dot" /><strong>{guidance.progress.stage}</strong><span>{guidance.progress.next_step}</span><button type="button" disabled={disabled} onClick={() => onChange(null)}>暂停</button></div>}
  </section>;
}
