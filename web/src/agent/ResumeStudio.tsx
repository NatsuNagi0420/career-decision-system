/** 青穗集 · 按需简历小窗：对话负责引导，本窗口只承载原句核对、可选编辑和纸面交付。 */
import { useEffect, useState, type FormEvent } from "react";
import { TEMPLATES, useResumeTemplate } from "../state/resumeTemplates";
import { CareerIcon } from "./CareerVisuals";
import { AgentIcon } from "./AgentIcon";
import { ResumeCheckpoint } from "./ResumeCheckpoint";
import { ResumeEditor } from "./ResumeEditor";
import { ResumePreview } from "./ResumePreview";
import type { ResumeWorkspaceView } from "./resume-workspace";
import type { AgentFile } from "./types";
import "./resume-studio.css";
export interface ResumeStudioProps {
  hidden: boolean; workspace: ResumeWorkspaceView; busy: boolean;
  onBack: () => void; onChat: (message?: string) => void;
  onContinue: (message: string) => Promise<void>; onExport: (revision: number) => Promise<AgentFile[]>;
}
export function ResumeStudio({ hidden, workspace, busy, onBack, onChat, onContinue, onExport }: ResumeStudioProps) {
  const [templateId, setTemplateId] = useResumeTemplate();
  const { state, saving, error, apply, refresh } = workspace;
  const [editing, setEditing] = useState(false), [header, setHeader] = useState({ name: "", headline: "", contact: "" });
  const signature = JSON.stringify(state?.header);
  useEffect(() => { if (state) setHeader(state.header); }, [signature]);
  const disabled = saving || busy || Boolean(state?.pending);
  const identityDirty = Boolean(state && JSON.stringify(header) !== JSON.stringify(state.header));
  async function saveHeader(event: FormEvent) { event.preventDefault(); if (state?.body) await apply({ type: "document.save", header, body: state.body }); }
  return <section className="resume-studio" hidden={hidden} aria-label="简历与经历" aria-busy={saving}>
    <header className="resume-studio-bar"><button className="resume-back" type="button" onClick={onBack}>← 工作台</button><div><CareerIcon name="resume" size={20} /><strong>简历与经历</strong></div><button className="resume-link" type="button" onClick={() => onChat()}>回到和穗奈聊天 <AgentIcon name="chevron" size={14} /></button></header>
    {error && <div className="resume-feedback" role="alert">{error}<button className="resume-link" type="button" onClick={() => void refresh()}>重新读取</button></div>}
    <div className="resume-review-scroll">
      <div className="resume-template-controls"><span>模板</span><div className="resume-template-options" role="group" aria-label="简历模板">{TEMPLATES.map(template => <button type="button" key={template.id} aria-pressed={templateId === template.id} onClick={() => setTemplateId(template.id)}>{template.name}</button>)}</div></div>
      {!state ? <p role="status">正在读取你的草稿…</p> : !state.body ? <>
        <div className="resume-review-intro"><span className="resume-kicker">YOUR STORY, NOT A FORM</span><h2>不着急填满一张简历</h2><p>先和穗奈聊聊做过的事。她会帮你发现重点、解释为什么值得写；需要核对的内容才会出现在这里。</p><button className="resume-primary" type="button" onClick={() => onChat("我想在当前对话里整理一份简历。请接着已有的经历和方向继续，一次只问一个关键问题，不要让我重新填表，也不要编造经历。")}>在当前对话，按需整理简历 <AgentIcon name="chevron" size={15} /></button></div>
        <ResumeCheckpoint state={state} disabled={disabled} apply={apply} onContinue={onContinue} onCorrect={onChat} onPreview={() => {}} />
        {state.source_text && <details className="resume-saved-notes"><summary>已经聊到的原句 · 只收集，未必全部进入简历</summary><pre>{state.source_text}</pre></details>}
      </> : editing ? <ResumeEditor state={state} disabled={disabled} apply={async change => { const next = await apply(change); if (next) setEditing(false); return next; }} onChat={() => onChat("我想一起调整当前这份简历，主要是：")} /> : <>
        <details className="resume-local-identity" open={!state.header.name}><summary>简历上的姓名与联系方式 · 只用于本地排版</summary><p>这些信息不用交给穗奈问，也不会因这里的填写发送给模型。</p><form onSubmit={event => void saveHeader(event)}><label className="resume-field">姓名<input required maxLength={80} value={header.name} disabled={disabled} onChange={event => setHeader({ ...header, name: event.target.value })} /></label><label className="resume-field">求职意向<input maxLength={120} value={header.headline} disabled={disabled} onChange={event => setHeader({ ...header, headline: event.target.value })} /></label><label className="resume-field resume-contact-field">联系方式 / 作品链接（选填）<input maxLength={500} value={header.contact} disabled={disabled} onChange={event => setHeader({ ...header, contact: event.target.value })} /></label><button className="resume-secondary" type="submit" disabled={disabled}>保存到本地排版</button></form>{identityDirty && <p role="status">姓名或联系方式有未保存的修改，保存后才能确认并导出。</p>}</details>
        <ResumePreview state={state} demo={false} active={!hidden} disabled={disabled || identityDirty} apply={apply} onExport={value => onExport(value.revision)} onEdit={() => setEditing(true)} />
      </>}
    </div>
    <footer className="resume-studio-status"><span>对话里慢慢整理 · 重要事实由你确认</span><span>青穗集 / Resume</span></footer>
  </section>;
}
