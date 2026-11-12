/** 青穗集 · 右侧会话小结：展示模型整理与下一步，不冒充已确认画像，也不是隐藏推理过程。 */
import type { AgentTaskPlan } from "../../../agent/src/core/task-memory";
import { AnimatedDisclosure } from "./AnimatedDisclosure";
import { CareerIcon } from "./CareerVisuals";
import { activeTask, TASK_LABELS, type GuidanceView } from "../../../agent/src/guidance-contract";
import type { AgentObligation } from "./types";
export function ConversationMemory({ guidance, analyzing, error, enabled, canRefresh, onRefresh, plan, obligations = [], onContinue, onAbandon }: { guidance?: GuidanceView; analyzing: boolean; error: string; enabled: boolean; canRefresh: boolean; onRefresh: () => void; plan?: AgentTaskPlan | null; obligations?: AgentObligation[]; onContinue?: (input: string, obligationId?: string) => void; onAbandon?: (obligationId: string) => void }) {
  const memory = guidance?.memory, task = activeTask(guidance);
  const next = plan?.steps.find(step => step.status !== "done");
  const obligation = obligations.find(item => item.status === "open" || item.status === "claimed");
  return <section className="conversation-memory" aria-label="这段对话的小结" aria-busy={analyzing}>
    <header><CareerIcon name="sprout" size={23} /><h2>聊到了这里</h2><button type="button" title="重新读取会话小结" aria-label="刷新会话小结" disabled={analyzing || !canRefresh || !enabled} onClick={onRefresh}>↻</button></header>
    <div className="conversation-memory__meta"><span>{analyzing ? "正在整理已发送的对话…" : memory ? "更新于 " + new Date(memory.updated_at).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }) : "还没有会话小结"}</span>{task && <span>{TASK_LABELS[task.kind]}</span>}</div>
    {memory ? <AnimatedDisclosure className="conversation-memory__detail" summary={memory.summary}><div className="conversation-memory__expanded"><p>{memory.summary}</p><small>这是模型整理，不是已确认的职业档案；有误时直接在对话里纠正。</small></div></AnimatedDisclosure> : <p className="conversation-memory__empty">{enabled ? "继续聊就好。我会把这段对话的重点和下一步留在这里，不用反复回翻。" : "已关闭自动整理，已有小结仍会保留。可在穗奈小窗菜单中开启。"}</p>}
    {(guidance?.progress?.next_step || memory?.next_step) && <div className="conversation-memory__next"><span>下一小步</span><p>{guidance?.progress?.next_step || memory?.next_step}</p></div>}
    {obligation && <div className="conversation-memory__obligation"><span>可以接着做</span><p>{obligation.title}</p><div>{onContinue && <button type="button" disabled={!canRefresh || obligation.status === "claimed"} onClick={() => onContinue("请接着做这件事，先核对当前进度，再继续：" + obligation.intent, obligation.id)}>{obligation.status === "claimed" ? "已接手" : "接着做 →"}</button>}{onAbandon && <button type="button" disabled={!canRefresh} onClick={() => onAbandon(obligation.id)}>不需要</button>}</div></div>}
    {plan && <div className="conversation-memory__plan"><ol aria-label="任务计划">{plan.steps.map((step, index) => <li key={index} data-status={step.status}><span aria-hidden="true">{step.status === "done" ? "✓" : step.status === "working" ? "›" : "·"}</span>{step.title}</li>)}</ol>{next && onContinue && <button type="button" disabled={!canRefresh} onClick={() => onContinue("请接着这段对话的计划，先核对当前进度，再继续：" + next.title)}>接着做 →</button>}</div>}
    {guidance?.shared_resume && <p className="conversation-memory__shared">正在使用账号共享简历草稿 · 切换对话不另建版本</p>}
    {error && <p className="conversation-memory__error" role="status">小结暂未更新，聊天不受影响。<button type="button" disabled={analyzing || !canRefresh || !enabled} onClick={onRefresh}>重试</button></p>}
    <footer>仅整理已发送的消息 · 不读取输入框草稿</footer>
  </section>;
}
