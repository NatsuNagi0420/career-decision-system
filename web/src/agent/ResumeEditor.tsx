/** 青穗集 · 可选正文微调：仅在用户主动打开时提供本地编辑，不再承担材料收集或强制五步向导。 */
import { useEffect, useState } from "react";
import type { ResumeState, ResumeHeader, ResumeBody } from "../../../agent/src/resume-contract";
import type { ApplyResumeChange } from "./resume-workspace";
import { AgentIcon } from "./AgentIcon";
import { FACT_KIND_LABEL } from "./resume-flow";
interface EditorProps { state: ResumeState; disabled: boolean; apply: ApplyResumeChange; onChat: () => void }

export function ResumeEditor({ state, disabled, apply, onChat }: EditorProps) {
  const [header, setHeader] = useState<ResumeHeader>(state.header), [body, setBody] = useState<ResumeBody | null>(state.body);
  const signature = JSON.stringify({ header: state.header, body: state.body });
  useEffect(() => { setHeader(state.header); setBody(state.body); }, [signature]);
  function entry(section: number, index: number, patch: Partial<ResumeBody["sections"][number]["entries"][number]>) {
    setBody(previous => previous ? { ...previous, sections: previous.sections.map((s, i) => i === section ? { ...s, entries: s.entries.map((e, j) => j === index ? { ...e, ...patch } : e) } : s) } : previous);
  }
  return <section><div className="resume-step-heading"><span className="resume-kicker">OPTIONAL / LOCAL EDIT</span><h2>手动微调，只在你需要的时候</h2><p>正文只使用刚才保留的经历。这里手填的联系方式只用于排版；旧简历原文若含联系方式，仍会随材料发送给模型。</p></div>
    {body && <form onSubmit={event => { event.preventDefault(); void apply({ type: "document.save", header, body }); }}>
      <div className="resume-editor-header"><label className="resume-field">姓名<input required value={header.name} maxLength={80} disabled={disabled} placeholder="请手动填写" onChange={event => setHeader({ ...header, name: event.target.value })} /></label><label className="resume-field">求职意向<input value={header.headline} maxLength={120} disabled={disabled} onChange={event => setHeader({ ...header, headline: event.target.value })} /></label><label className="resume-field resume-contact-field">联系方式 / 公开作品链接（选填）<input value={header.contact} maxLength={500} disabled={disabled} placeholder="电话 · 邮箱 · 作品集地址" onChange={event => setHeader({ ...header, contact: event.target.value })} /></label></div>
      {(body.summary.text || body.summary.fact_ids.length > 0) && <label className="resume-field resume-summary">个人简介<textarea value={body.summary.text} rows={3} maxLength={700} disabled={disabled} onChange={event => setBody({ ...body, summary: { ...body.summary, text: event.target.value } })} /></label>}
      {body.sections.map((section, s) => <section className="resume-editor-section" key={section.kind}><h3>{FACT_KIND_LABEL[section.kind]}</h3>{section.entries.map((item, i) => <article key={i}><div className="resume-editor-title"><label className="resume-field">名称 / 标题<input required value={item.title} maxLength={180} disabled={disabled} onChange={event => entry(s, i, { title: event.target.value })} /></label><label className="resume-field">时间（没有就留空）<input value={item.period} maxLength={100} disabled={disabled} onChange={event => entry(s, i, { period: event.target.value })} /></label></div><label className="resume-field">说明（选填）<input value={item.subtitle} maxLength={240} disabled={disabled} onChange={event => entry(s, i, { subtitle: event.target.value })} /></label>{item.bullets.map((bullet, b) => <label className="resume-field resume-bullet-field" key={b}><span>要点 {b + 1}</span><textarea required rows={2} value={bullet} maxLength={1200} disabled={disabled} onChange={event => entry(s, i, { bullets: item.bullets.map((line, n) => n === b ? event.target.value : line) })} /></label>)}<details className="resume-writing-basis"><summary>查看这段的事实依据</summary>{item.fact_ids.map(id => <blockquote key={id}>{state.facts.find(f => f.id === id)?.detail}</blockquote>)}</details></article>)}</section>)}
      <footer className="resume-step-actions"><button className="resume-link" type="button" disabled={disabled} onClick={onChat}>回到对话，请穗奈一起调整</button><button className="resume-primary" type="submit" disabled={disabled}>保存并看 A4 预览<AgentIcon name="chevron" size={16} /></button></footer>
    </form>}
  </section>;
}
