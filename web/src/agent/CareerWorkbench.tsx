/** 青穗集 · 工作台主视图：编辑真实档案、核对岗位原文、确认模型建议与回收行动结果，复用现有文件预览。 */
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { CareerWorkspaceController } from "./career-workspace";
import { AgentIcon } from "./AgentIcon";
import { CareerIcon } from "./CareerVisuals";
import { ResumeStudio, type ResumeStudioProps } from "./ResumeStudio";
import { FileDirectory } from "./FileLinks";
import { usePixelConfirm } from "../components/PixelConfirmDialog";
import { ASSESSMENT_LABEL, ACTION_LABEL, CAREER_TABS, EMPTY_CAREER_PROFILE, PROFILE_FIELDS, careerPrompt, sourceLabel,
  careerProposalStale, type CareerTab, type CareerProfileInput, type CareerState, type CareerChange, type CareerJob,
  type CareerAction, type CareerCheck, type CareerProposal } from "./career";
import { ComponentIcon } from "./ComponentAssets";
import { SKILL_STAGES } from "./CareerComponents";
import { ProfileDossier } from "./ProfileDossier";
import type { AgentFile } from "./types";
import { catalogueReferenceNotice } from "../../../agent/src/job-catalogue-contract";
import { LearningWorkspace } from "./LearningWorkspace";
import type { LearningWorkspaceController } from "./learning-workspace";

type Change = (change: CareerChange, message: string) => Promise<boolean>;
export function CareerWorkbench({ workspace, learning, onJob, tab, onTab, files, hidden, onPrompt, onImport, onPending, uploadDisabled, resumeOpen, onResumeOpen, resume }: {
  learning: LearningWorkspaceController;
  workspace: CareerWorkspaceController; onJob: (id: string) => void; tab: CareerTab; onTab: (tab: CareerTab) => void;
  files: AgentFile[]; hidden: boolean; onPrompt: (value: string) => void;
  onImport: () => void; onPending: (count: number) => void; uploadDisabled: boolean;
  resumeOpen: boolean; onResumeOpen: (open: boolean) => void; resume: Omit<ResumeStudioProps, "hidden" | "onBack">;
}) {
  const { state, error, notice, saving, loading, refresh, change, dismissNotice } = workspace;
  const { confirm, dialog } = usePixelConfirm();
  const [profileEditorOpen, setProfileEditorOpen] = useState(false);
  useEffect(() => { onPending(state?.proposals.length ?? 0); }, [state?.proposals.length, onPending]);
  async function remove(type: "job.delete" | "action.delete", id: string, title: string) {
    if (await confirm({ title: "移除这项内容？", description: <p>将从职业工作台中移除「{title}」。相关的对话和原始文件仍可单独查看。</p>, confirmLabel: "确认移除" })) await change({ type, id }, "已移除。");
  }
  const title = CAREER_TABS.find(item => item.id === tab)!;
  return <><section className="career-workbench" hidden={hidden || resumeOpen} aria-label="职业工作台" aria-busy={saving}>
    <div className="workbench-toolbar">
    <div className="workbench-navigation" role="tablist" aria-label="职业工作台内容" onKeyDown={event => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const current = CAREER_TABS.findIndex(item => item.id === tab);
      const index = event.key === "Home" ? 0 : event.key === "End" ? CAREER_TABS.length - 1 : (current + (event.key === "ArrowRight" ? 1 : -1) + CAREER_TABS.length) % CAREER_TABS.length;
      const next = CAREER_TABS[index].id; onTab(next); document.getElementById("career-tab-" + next)?.focus();
    }}>{CAREER_TABS.map(item => <button key={item.id} id={"career-tab-" + item.id} role="tab" tabIndex={tab === item.id ? 0 : -1} aria-controls={"career-panel-" + item.id} aria-selected={tab === item.id} type="button" onClick={() => onTab(item.id)}><CareerIcon name={item.icon} size={22} />{item.label}</button>)}</div><button className="workbench-refresh" type="button" onClick={() => { void refresh(); if (tab === "learning") void learning.refresh(); }} disabled={saving || loading || learning.saving} aria-label="刷新职业工作台" title="刷新职业工作台"><AgentIcon name="restore" size={15} /></button></div>
    {error && <div className="workbench-feedback workbench-feedback--error" role="alert"><span>{error}</span><button type="button" disabled={saving} onClick={() => void refresh()}>刷新资料</button></div>}
    {notice && <div className="workbench-feedback" role="status"><AgentIcon name="check" size={16} /><span>{notice}</span><button type="button" aria-label="关闭工作台提示" onClick={dismissNotice}><AgentIcon name="close" size={14} /></button></div>}
    {!state ? <div className="workbench-loading" role="status"><CareerIcon name="sprout" size={46} /><p>{loading ? "正在打开你的职业空间…" : "暂时未能读取工作台，请重试。"}</p></div> : <div className="workbench-scroll">
      {tab !== "profile" && tab !== "learning" && <div className="workbench-page-heading"><div><span className="workbench-eyebrow">{state.profile.goal || "从一个小目标开始"}</span><h2>{title.label}</h2></div><span className="workbench-save-state"><i />{state.updated_at ? "已保存到当前账号" : "还没有保存材料"}</span></div>}
      {state.proposals.length > 0 && <section className="workbench-proposals" aria-label="穗奈的待确认建议"><header><span><AgentIcon name="activity" size={17} />穗奈整理了 {state.proposals.length} 份建议</span><small>确认后才写入工作台</small></header>{state.proposals.map(proposal => <Proposal key={proposal.id} proposal={proposal} state={state} saving={saving} change={change} onPrompt={onPrompt} />)}</section>}
      <section id="career-panel-profile" role="tabpanel" aria-labelledby="career-tab-profile" hidden={tab !== "profile"}>
        <ProfileDossier state={state} saving={saving} onResolve={workspace.resolveFact} onEdit={() => setProfileEditorOpen(true)} onPrompt={onPrompt} />
        {state.profile.confirmed_at && <div className="workbench-profile-actions"><button className="workbench-primary" type="button" onClick={() => resume.onChat("我想根据当前职业工作台中已经确认的画像生成一份简历。请先读取职业工作台，复用其中已确认的教育背景、真实经历、技能和行动结果原句，不要让我重复粘贴；岗位样本只能作为目标参考，不能写成我的经历。先把可用材料带入简历整理流程，再按事实核对推进。")}><CareerIcon name="resume" size={18} />根据当前画像生成简历<AgentIcon name="chevron" size={15} /></button></div>}
        <details className="workbench-profile-edit" open={profileEditorOpen} onToggle={event => setProfileEditorOpen(event.currentTarget.open)}>
          <summary><span><ComponentIcon name="edit-record" size={17} />修正已确认材料</span><small>适合纠正一处事实</small></summary>
          <p>补充新经历时，优先继续和穗奈对话；直接编辑后保存的内容也会成为后续对照依据。</p>
          <ProfileEditor profile={state.profile} saving={saving} change={change} />
        </details>
      </section>
      <section id="career-panel-jobs" role="tabpanel" aria-labelledby="career-tab-jobs" hidden={tab !== "jobs"}>
        {!!state.saved_jobs?.length && <section className="saved-job-list" aria-label="收藏的岗位"><h3>我的收藏 <small>{state.saved_jobs.length}</small></h3>{state.saved_jobs.map(job => <div className="saved-job-row" key={job.catalogue_id}><button type="button" disabled={!job.available} onClick={() => onJob(job.catalogue_id)}><ComponentIcon name="employment" size={22}/><span><strong>{job.title}</strong><small>{[job.company, job.city].filter(Boolean).join(" · ") || "岗位资料已移除"}</small></span><ComponentIcon name="open-arrow" size={17}/></button><button type="button" className="component-icon-button bookmark-button" data-saved="true" title="取消收藏" aria-label={"取消收藏：" + job.title} disabled={saving} onClick={() => void change({type:"catalogue.save",catalogue_id:job.catalogue_id,saved:false},"已取消收藏。其他资料保持原样。") }><ComponentIcon name="bookmark-star" size={22}/></button></div>)}</section>}
        <div className="workbench-intro"><div><h3>把方向落到具体岗位上</h3><p>粘贴招聘原文，再与经历逐项对照。这里不计算“适合度”，也不把一个样本当作整个市场。</p></div><button className="workbench-secondary" type="button" onClick={() => onPrompt(state.jobs.length ? careerPrompt("jobs") : "我还没有确定职业方向。请先读取工作台和岗位库的方向资料，结合我的档案讨论几个待验证方向，再查找具体岗位样本。明确哪些只是历史参考；缺少城市、求职阶段等关键信息时先问我，不编造在招岗位。")}>{state.jobs.length ? "请穗奈对照岗位" : "先聊聊职业方向"}<AgentIcon name="chevron" size={15} /></button></div>
        <JobForm saving={saving} change={change} initialOpen={!state.jobs.length} />
        {state.jobs.length > 0 && <div className="workbench-job-grid">{state.jobs.map(job => <Job key={job.id} job={job} state={state} saving={saving} onPrompt={onPrompt} onRemove={() => void remove("job.delete", job.id, job.title)} />)}</div>}
      </section>
      <section id="career-panel-actions" role="tabpanel" aria-labelledby="career-tab-actions" hidden={tab !== "actions"}>
        <div className="workbench-intro"><div><h3>让下一步有一个具体产出</h3><p>学习、练习和作品围绕同一个目标。完成后把材料放回工作台，让穗奈结合结果更新判断。</p></div><button className="workbench-secondary" type="button" onClick={() => onPrompt(careerPrompt("actions"))}><CareerIcon name="growth" size={20} />一起安排下一步</button></div>
        <ActionForm state={state} saving={saving} change={change} />
        {!state.actions.length && <div className="workbench-empty"><CareerIcon name="seedling" size={52} /><h3>先开始一件做得到的小事</h3><p>可以让穗奈根据岗位差距拟定行动，也可以自己添加。记录完成材料，下一次就不用从头介绍。</p></div>}
        <div className="workbench-actions">{state.actions.map(action => <Action key={action.id} action={action} state={state} saving={saving} change={change} onRemove={() => void remove("action.delete", action.id, action.title)} onPrompt={onPrompt} />)}</div>
      </section>
      <section id="career-panel-learning" role="tabpanel" aria-labelledby="career-tab-learning" hidden={tab !== "learning"}>
        <LearningWorkspace workspace={learning} jobs={state.jobs} onPrompt={onPrompt} />
      </section>
      <section id="career-panel-files" role="tabpanel" aria-labelledby="career-tab-files" hidden={tab !== "files"}>
        <div className="workbench-intro"><div><h3>把经历整理成能带走的成果</h3><p>这里展示当前对话的真实文件。点击文件名预览，右键可以选择下载或本地打开。</p></div><button className="workbench-secondary" type="button" disabled={uploadDisabled} onClick={onImport}><AgentIcon name="attach" size={15} />导入资料</button></div>
        <div className="workbench-file-start"><CareerIcon name="resume" size={48} /><div><h3>制作或打磨一份简历</h3><p>先和穗奈聊经历，一次只说一点。需要时再打开简历预览，不必先填一整张表。</p></div><button className="workbench-primary" type="button" onClick={() => resume.onChat("我想根据当前职业工作台中已经确认的画像生成一份简历。请先读取职业工作台，复用其中已确认的教育背景、真实经历、技能和行动结果原句，不要让我重复粘贴；岗位样本只能作为目标参考，不能写成我的经历。先把可用材料带入简历整理流程，再按事实核对推进。")}>根据当前画像开始 <AgentIcon name="chevron" size={15} /></button></div>
        <FileDirectory files={files} />
        <p className="workbench-footnote">目前可直接导入文本、Markdown、CSV、JSON、YAML。PDF / Word 请先转成文本；职业档案会跨对话保留，文件则跟随当前对话。</p>
      </section>
    </div>}
    <footer className="workbench-footer"><span>档案 → 岗位证据 → 行动 → 更新</span><span>你可以从任意一步开始</span></footer>
  </section><ResumeStudio hidden={hidden || !resumeOpen} onBack={() => onResumeOpen(false)} {...resume} />{dialog}</>;
}

function ProfileEditor({ profile, saving, change }: { profile: CareerState["profile"]; saving: boolean; change: Change }) {
  const [draft, setDraft] = useState<CareerProfileInput>({ ...EMPTY_CAREER_PROFILE, ...profile });
  const [dirty, setDirty] = useState(false);
  const [remoteChanged, setRemoteChanged] = useState(false);
  const lastVersion = useRef(profile.confirmed_at);
  useEffect(() => {
    if (profile.confirmed_at !== lastVersion.current) {
      if (dirty) setRemoteChanged(true);
      else { setDraft({ ...profile }); lastVersion.current = profile.confirmed_at; setRemoteChanged(false); }
    }
  }, [profile, dirty]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    const clean = Object.fromEntries(PROFILE_FIELDS.map(field => [field.key, draft[field.key]])) as unknown as CareerProfileInput;
    if (await change({ type: "profile.save", profile: clean }, "档案已确认保存。之后的岗位对照会以这份资料为依据。")) { setDirty(false); setRemoteChanged(false); }
  }
  return <form className="workbench-profile-form" onSubmit={event => void submit(event)}>
    {remoteChanged && <p className="workbench-inline-warning" role="status">已保存档案有新版本，你正在编辑的内容已保留。请核对后再保存。<button type="button" onClick={() => { setDraft({ ...profile }); setDirty(false); setRemoteChanged(false); lastVersion.current = profile.confirmed_at; }}>使用已保存版本</button></p>}
    <div className="workbench-profile-grid">{PROFILE_FIELDS.map(field => <label className={"workbench-field workbench-field--" + field.key} key={field.key}><span>{field.label}</span><textarea value={draft[field.key]} rows={field.rows} maxLength={field.max} disabled={saving} placeholder={field.placeholder} onChange={event => { setDraft(value => ({ ...value, [field.key]: event.target.value })); setDirty(true); }} /></label>)}</div>
    <div className="workbench-form-actions"><span>{dirty ? "有未保存的修改" : profile.confirmed_at ? "由你确认的材料摘要，可继续修改" : "先写一部分也能保存，不需要一次填完"}</span><button className="workbench-primary" type="submit" disabled={saving || !PROFILE_FIELDS.some(field => draft[field.key].trim())}><AgentIcon name="check" size={16} />{saving ? "正在保存…" : "确认并保存档案"}</button></div>
  </form>;
}

function JobForm({ saving, change, initialOpen }: { saving: boolean; change: Change; initialOpen: boolean }) {
  const [open, setOpen] = useState(initialOpen);
  const [job, setJob] = useState({ title: "", company: "", url: "", description: "" });
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (await change({ type: "job.add", job }, "岗位原文已保存。可以请穗奈根据档案逐项对照。")) { setJob({ title: "", company: "", url: "", description: "" }); setOpen(false); }
  }
  return <details className="workbench-add-form" open={open} onToggle={event => setOpen(event.currentTarget.open)}><summary><AgentIcon name="attach" size={17} />添加一份真实岗位</summary><form onSubmit={event => void submit(event)}><div className="workbench-form-pair"><label className="workbench-field"><span>岗位名称</span><input required maxLength={120} value={job.title} placeholder="例如：前端开发实习生" disabled={saving} onChange={event => setJob(value => ({ ...value, title: event.target.value }))} /></label><label className="workbench-field"><span>公司 / 来源名称（选填）</span><input maxLength={120} value={job.company} placeholder="便于区分不同样本" disabled={saving} onChange={event => setJob(value => ({ ...value, company: event.target.value }))} /></label></div><label className="workbench-field"><span>原始链接（选填，仅保存，不自动抓取）</span><input type="url" maxLength={2000} value={job.url} placeholder="https://…" disabled={saving} onChange={event => setJob(value => ({ ...value, url: event.target.value }))} /></label><label className="workbench-field"><span>招聘原文</span><textarea required rows={6} maxLength={12000} value={job.description} placeholder="粘贴职责、任职要求和其他限制，尽量保留原文。" disabled={saving} onChange={event => setJob(value => ({ ...value, description: event.target.value }))} /></label><div className="workbench-form-actions"><span>作为岗位样本保留，不推断市场代表性。</span><button className="workbench-primary" type="submit" disabled={saving}>保存岗位原文</button></div></form></details>;
}

function Checks({ checks, state }: { checks: CareerCheck[]; state: CareerState }) {
  return <div className="workbench-checks">{checks.map((check, index) => <div className="workbench-check" key={index}><header><span>{check.requirement}</span><small data-assessment={check.assessment}>{ASSESSMENT_LABEL[check.assessment]}</small></header><p>{check.reason}</p>{check.evidence.map((evidence, n) => <details className="workbench-evidence" key={n}><summary>{sourceLabel(state, evidence.source_id)}</summary><blockquote>{evidence.quote}</blockquote><small>原文关联已检查；是否充分支持判断仍需核对。</small></details>)}</div>)}</div>;
}

function Job({ job, state, saving, onPrompt, onRemove }: { job: CareerJob; state: CareerState; saving: boolean; onPrompt: (value: string) => void; onRemove: () => void }) {
  const comparisons = state.comparisons.filter(item => item.job_id === job.id);
  const comparison = comparisons.at(-1);
  return <article className="workbench-job"><header className="workbench-item-heading"><div><span className="workbench-eyebrow">{job.company || "用户提供的岗位样本"}</span><h3>{job.title}</h3>{job.catalogue && <p className="workbench-footnote">{job.catalogue.city || "城市未注明"} · {catalogueReferenceNotice(job.catalogue)}</p>}</div><button type="button" className="agent-icon-button" aria-label={"移除岗位：" + job.title} disabled={saving} onClick={onRemove}><AgentIcon name="close" size={15} /></button></header><details className="workbench-source"><summary><AgentIcon name="file" size={15} />查看岗位原文</summary><p className="workbench-prewrap">{job.description}</p>{job.url && <a href={job.url} target="_blank" rel="noopener noreferrer">打开原始页面 ↗</a>}<small>保存于 {new Date(job.created_at).toLocaleDateString()}</small></details>
    {comparison ? <><div className="workbench-analysis-label">已确认的穗奈分析 · {new Date(comparison.confirmed_at).toLocaleDateString()}</div>{comparison.stale && <p className="workbench-inline-warning">档案或结果材料已变化，请更新对照；下方保留上次判断。</p>}<p>{comparison.summary}</p><Checks checks={comparison.checks} state={state} />{comparisons.length > 1 && <details className="workbench-history"><summary>查看历史对照（{comparisons.length - 1}）</summary>{comparisons.slice(0, -1).reverse().map(item => <div key={item.confirmed_at}><small>{new Date(item.confirmed_at).toLocaleString()}</small><p>{item.summary}</p><Checks checks={item.checks} state={state} /></div>)}</details>}</> : <div className="workbench-job-empty"><CareerIcon name="search" size={34} /><p>原文已经保留，还没有生成经历对照。</p><span>让穗奈读取档案与原文，整理一份待确认分析。</span></div>}
    <div className="learning-coach"><button className="workbench-secondary" type="button" onClick={() => onPrompt(careerPrompt("jobs", job))}>{comparison ? "请穗奈更新对照" : "请穗奈对照这个岗位"}<AgentIcon name="chevron" size={15} /></button><button className="workbench-primary" type="button" onClick={() => onPrompt("我选择已保存的岗位「" + job.title + "」作为学习目标。请读取职业档案、岗位原文和学习进度，结合现有基础和时间安排学习路线，每节给出目标、练习和B站搜索词，提交到工作台的学习路线让我核对。已有路线请调整并保留进度。")}>为这个岗位规划学习<CareerIcon name="growth" size={18} /></button></div>
  </article>;
}

function ActionForm({ state, saving, change }: { state: CareerState; saving: boolean; change: Change }) {
  const blank = { title: "", job_id: null as string | null, why: "", learn: "", deliverable: "" };
  const [draft, setDraft] = useState(blank), [open, setOpen] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (await change({ type: "action.add", action: draft }, "行动已保存。完成后可以在这里提交结果。")) { setDraft(blank); setOpen(false); }
  }
  return <details className="workbench-add-form" open={open} onToggle={event => setOpen(event.currentTarget.open)}><summary><CareerIcon name="plan" size={20} />自己添加一个行动</summary><form onSubmit={event => void submit(event)}><label className="workbench-field"><span>准备做什么</span><input required maxLength={200} value={draft.title} disabled={saving} placeholder="例如：为课程项目补充表单校验" onChange={event => setDraft(value => ({ ...value, title: event.target.value }))} /></label><div className="workbench-form-pair"><label className="workbench-field"><span>关联岗位（选填）</span><select value={draft.job_id ?? ""} disabled={saving} onChange={event => setDraft(value => ({ ...value, job_id: event.target.value || null }))}><option value="">暂不关联岗位</option>{state.jobs.map(job => <option value={job.id} key={job.id}>{job.title}</option>)}</select></label><label className="workbench-field"><span>为什么做（选填）</span><input maxLength={1000} value={draft.why} disabled={saving} onChange={event => setDraft(value => ({ ...value, why: event.target.value }))} /></label></div><label className="workbench-field"><span>先学哪些内容（选填）</span><textarea rows={2} maxLength={2000} value={draft.learn} disabled={saving} onChange={event => setDraft(value => ({ ...value, learn: event.target.value }))} /></label><label className="workbench-field"><span>完成后留下什么材料</span><textarea required rows={2} maxLength={2000} value={draft.deliverable} disabled={saving} placeholder="例如：代码链接、一段说明，以及测试结果" onChange={event => setDraft(value => ({ ...value, deliverable: event.target.value }))} /></label><button className="workbench-primary" type="submit" disabled={saving}>保存行动</button></form></details>;
}

function Action({ action, state, saving, change, onRemove, onPrompt }: { action: CareerAction; state: CareerState; saving: boolean; change: Change; onRemove: () => void; onPrompt: (value: string) => void }) {
  const [result, setResult] = useState(action.result);
  const job = state.jobs.find(item => item.id === action.job_id);
  const dirty = result !== action.result;
  useEffect(() => { setResult(action.result); }, [action.result]);
  return <article className="workbench-action" data-status={action.status}><header className="workbench-item-heading"><div><span className="workbench-eyebrow">{job?.title || "我的成长行动"}</span><h3>{action.title}</h3></div><span className="workbench-action-status">{action.status === "done" && <AgentIcon name="check" size={14} />}{ACTION_LABEL[action.status]}</span><button type="button" className="agent-icon-button" aria-label={"移除行动：" + action.title} disabled={saving} onClick={onRemove}><AgentIcon name="close" size={15} /></button></header>
    {action.why && <p className="workbench-action-why">{action.why}</p>}
    <div className="workbench-action-materials">{action.learn && <div><span>先学什么</span><p>{action.learn}</p></div>}<div><span>完成材料</span><p>{action.deliverable}</p></div></div>
    <details className="workbench-action-result" open={action.status === "done" || undefined}><summary>{action.status === "done" ? "查看或补充我的结果" : "提交我的行动结果"}{dirty ? " · 未保存" : ""}</summary><form onSubmit={event => { event.preventDefault(); void change({ type: "action.update", id: action.id, status: "done", result }, "结果已保存。可请穗奈重新读取并更新相关判断。"); }}><label className="workbench-field"><span>做了什么、遇到什么、有什么材料？</span><textarea required rows={4} maxLength={6000} value={result} disabled={saving} placeholder="保留作品链接、实际结果与遇到的问题。穗奈不会自动把它当成已验证的能力。" onChange={event => setResult(event.target.value)} /></label><button className="workbench-primary" type="submit" disabled={saving || !result.trim()}>{action.status === "done" ? "保存补充结果" : "提交结果并标记完成"}</button></form></details>
    <footer>{action.status === "todo" && <button className="workbench-secondary" type="button" disabled={saving} onClick={() => void change({ type: "action.update", id: action.id, status: "doing", result: action.result }, "行动已开始，按自己的节奏推进。")}>开始这项行动</button>}{action.status === "done" ? <button className="workbench-secondary" type="button" onClick={() => onPrompt("我提交了行动「" + action.title + "」的结果。请读取工作台中的最新结果，说明它支持什么、尚不能说明什么，并为相关岗位整理更新后的待确认分析，不要直接改写档案。")}>请穗奈更新判断 <AgentIcon name="chevron" size={15} /></button> : <button className="workbench-text-button" type="button" onClick={() => onPrompt("请先读取工作台中的行动「" + action.title + "」。帮我把它拆成今天能开始的步骤，结合关联岗位要求和我的时间，不要重新创建重复行动。")}>帮我拆成能开始的小步骤 ↗</button>}</footer>
  </article>;
}

function Proposal({ proposal, state, saving, change, onPrompt }: { proposal: CareerProposal; state: CareerState; saving: boolean; change: Change; onPrompt: (value: string) => void }) {
  const data = proposal.data;
  const stale = careerProposalStale(proposal, state);
  const kind = data.kind === "skills" ? "技能实践记录" : data.kind === "profile" ? "档案草稿" : data.kind === "actions" ? "行动建议" : data.kind === "catalogue_job" ? "保留岗位参考" : "岗位对照";
  return <details className="workbench-proposal"><summary><span>{proposal.title}</span><small>{kind}{stale ? " · 资料已更新" : " · 待你确认"}</small></summary><div className="workbench-proposal-body">
    {stale && <p className="workbench-inline-warning">{proposal.stale_reason || "这份草稿基于旧资料，暂不能确认。请让穗奈重新整理。"}</p>}
    {data.kind === "catalogue_job" && proposal.catalogue_sample && <><h4>{proposal.catalogue_sample.title}</h4><p>{proposal.catalogue_sample.company} · {proposal.catalogue_sample.catalogue.city}</p><p className="workbench-inline-warning">{catalogueReferenceNotice(proposal.catalogue_sample.catalogue)}确认后加入你的岗位材料。</p><details className="workbench-source"><summary>查看岗位原文</summary><p className="workbench-prewrap">{proposal.catalogue_sample.description}</p>{proposal.catalogue_sample.url && <a href={proposal.catalogue_sample.url} target="_blank" rel="noopener noreferrer">打开原始页面 ↗</a>}</details></>}
    {data.kind === "skills" && data.skills.map(skill => <div key={skill.name}><h4>{skill.name} · {SKILL_STAGES[skill.stage]}</h4>{skill.evidence.map((evidence, index) => <blockquote key={index}>{evidence.quote}</blockquote>)}</div>)}
    {data.kind === "profile" && <dl className="workbench-profile-review">{PROFILE_FIELDS.map(field => <div key={field.key}><dt>{field.label}</dt><dd>{state.profile[field.key] !== data.profile[field.key] && <span className="workbench-before">原内容：{state.profile[field.key] || "未填写"}</span>}<span>{data.profile[field.key] || "未填写"}</span></dd></div>)}</dl>}
    {data.kind === "comparison" && <><h4>{state.jobs.find(job => job.id === data.job_id)?.title || "岗位对照"}</h4><p>{data.summary}</p><Checks checks={data.checks} state={state} /><p className="workbench-footnote">模型整理的分析；引文真实存在不等于结论已被独立验证。</p></>}
    {data.kind === "actions" && data.actions.map((action, index) => <div className="workbench-proposed-action" key={index}><h4>{action.title}</h4>{action.why && <p>原因：{action.why}</p>}{action.learn && <p>学习：{action.learn}</p>}<p>完成材料：{action.deliverable}</p></div>)}
    <div className="workbench-proposal-actions"><button className="workbench-primary" type="button" disabled={saving || stale} onClick={() => void change({ type: "proposal.decide", id: proposal.id, approved: true }, "已按你确认的建议更新工作台。")}>确认并应用</button><button className="workbench-secondary" type="button" disabled={saving} onClick={() => void change({ type: "proposal.decide", id: proposal.id, approved: false }, "已放弃这份建议，原资料未改变。")}>放弃这份建议</button>{stale && <button className="workbench-text-button" type="button" onClick={() => onPrompt("请重新读取工作台中的最新资料，再整理「" + proposal.title + "」，提出一份基于最新资料的待确认草稿。")}>重新整理 ↗</button>}</div>
  </div></details>;
}
