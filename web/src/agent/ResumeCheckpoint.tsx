/** 青穗集 · 对话内的轻量核对：按需展开原句和取舍，确认是用户动作，不把后台步骤变成前台问卷。 */
import { useState } from "react";
import { AgentIcon } from "./AgentIcon";
import { CHOICE_LABEL, FACT_KIND_LABEL } from "./resume-flow";
import type { ResumeState } from "../../../agent/src/resume-contract";
import type { ApplyResumeChange } from "./resume-workspace";
export function ResumeCheckpoint({ state, disabled, apply, onContinue, onCorrect, onPreview }: {
  state: ResumeState; disabled: boolean; apply: ApplyResumeChange;
  onContinue: (message: string) => Promise<void>; onCorrect: (message: string) => void; onPreview: () => void;
}) {
  const [sending, setSending] = useState(false), [error, setError] = useState("");
  const facts = state.facts.length > 0 && !state.facts_confirmed;
  const selection = state.selection && !state.selection_confirmed;
  const pending = facts || selection;
  async function confirm() {
    if (disabled || sending) return;
    setSending(true); setError("");
    try {
      const next = await apply(facts ? { type: "facts.confirm", facts: state.facts } : { type: "selection.confirm", choices: state.selection!.choices });
      if (!next) return;
      await onContinue(facts ? "我已逐条核对并确认了这份经历小结。我们继续聊吧：根据现有方向看看哪些经历值得重点写；如果还缺关键信息，请一次只问一个问题。" : "我已核对并确认了这次简历的经历取舍。请依据这些已确认的经历起草简历正文，不补造数字或技能，然后告诉我可以在哪里看预览。");
    } catch (cause) { setError("确认已经保存，但后续对话未发送成功：" + (cause as Error).message); }
    finally { setSending(false); }
  }
  if (!pending && !state.body) return null;
  return <aside className="resume-checkpoint" aria-label={facts ? "经历小结待核对" : selection ? "简历重点待核对" : "简历已起草"}>
    <div className="resume-checkpoint-heading"><AgentIcon name={pending ? "check" : "file"} size={17} /><strong>{facts ? "我记下的经历，想请你看一眼" : selection ? "这次简历的重点，由你决定" : "聊出来的内容，已经有简历的样子了"}</strong><span>{pending ? "待你核对" : "可预览"}</span></div>
    {pending ? <><details key={facts ? "facts-" + state.revision : "selection-" + state.revision} open><summary>{facts ? state.facts.length + " 条经历小结 · 可收起" : "展开 / 收起本次取舍"}</summary><div className="resume-checkpoint-items">{facts ? state.facts.map(fact => <article key={fact.id}><small>{FACT_KIND_LABEL[fact.kind]}</small><h4>{fact.title}</h4><p>{fact.detail}</p><details><summary>我当时是怎么说的</summary><blockquote>{fact.quote}</blockquote></details></article>) : state.selection!.choices.map(choice => <article key={choice.fact_id}><small data-use={choice.use}>{CHOICE_LABEL[choice.use]}</small><h4>{state.facts.find(f => f.id === choice.fact_id)?.title}</h4><p>{choice.reason}</p></article>)}</div></details>
    {!facts && state.selection!.requirements.length > 0 && <details className="resume-jd-basis"><summary>为什么这样取舍 · 查看岗位原句与依据</summary><div className="resume-checkpoint-items">{state.selection!.requirements.map((item, index) => <article key={index}><small>{item.importance === "essential" ? "主要要求" : "加分项"} · {item.status === "supported" ? "有经历依据" : item.status === "partial" ? "部分依据" : "材料还不够"}</small><h4>{item.quote}</h4><p>{item.note}</p></article>)}</div></details>}
    {!facts && <p className="resume-checkpoint-note">{state.target.description ? "判断只依据你提供的岗位要求；材料不足不代表你不会。" : "还没有具体 JD：这里只按方向安排重点，不是岗位匹配评分。"} 本次不展示的经历仍保留在原文中。</p>}
    <div className="resume-checkpoint-actions"><button className="resume-primary" type="button" disabled={disabled || sending} onClick={() => void confirm()}>{sending ? "已确认，正在接着聊…" : facts ? "这些是我做的，继续聊" : "这样安排，帮我起草"}<AgentIcon name="chevron" size={14} /></button><button className="resume-link" type="button" disabled={disabled || sending} onClick={() => onCorrect(facts ? "刚才的经历小结有一点不准确，实际情况是：" : "关于刚才的经历取舍，我希望调整的是：")}>有一点想改，继续和你说</button></div></> : <><p>不用在这里逐项填写。可以先看纸面效果，也可以直接告诉穗奈想改哪里。</p><button className="resume-secondary" type="button" onClick={onPreview}><AgentIcon name="file" size={15} />看看我的简历</button></>}
    {error && <p className="resume-error" role="alert">{error}</p>}
  </aside>;
}
