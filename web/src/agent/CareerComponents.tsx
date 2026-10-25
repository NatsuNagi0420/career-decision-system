/** 青穗集 · 六组件交互实现：岗位、收藏、档案、技能依据、本人确认与真实成长行动。 */
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ComponentIcon } from "./ComponentAssets";
import { AgentIcon } from "./AgentIcon";
import { ComposerMenu } from "./ComposerMenu";
import { agentApi } from "./api";
import { jobPrompt, WORK_TYPE_LABEL, type JobCardData, type JobDetail } from "./job-cards";
import { PROFILE_FIELDS, type CareerAction, type CareerProposal, type CareerState } from "./career";
import type { CareerChangeHandler } from "./career-workspace";
import type { CareerSkill } from "../../../agent/src/career-skills";

const PROFILE_SUMMARY_LABELS = { goal: "当前目标", education: "学习与工作", experience: "真实经历", skills: "技能与依据", preferences: "偏好与约束", weekly_hours: "每周时间" };
export const SKILL_STAGES = { contact: "Lv.1 · 开始接触", project: "Lv.2 · 项目实践", independent: "Lv.3 · 独立完成" };
function skillIcon(name: string) { return /react/i.test(name) ? "skill-react" as const : /docker|容器|kubernetes/i.test(name) ? "skill-container" as const : "skill-api" as const; }
export function JobRecommendationCard({ job, saved, saving, disabled, onOpen, onSave, onPrompt }: {
  job: JobCardData; saved: boolean; saving: boolean; disabled: boolean;
  onOpen: () => void; onSave: () => void; onPrompt: (text: string) => void;
}) {
  return <article className="suinai-component job-reference-card" aria-label={job.title}>
    <div className="component-card-heading"><button type="button" className="job-reference-card__title" onClick={onOpen}>{job.title}<ComponentIcon name="open-arrow" size={17} /></button>
      <button type="button" className="component-icon-button bookmark-button" data-saved={saved} aria-pressed={saved} aria-label={(saved ? "取消收藏：" : "收藏：") + job.title} title={saved ? "取消收藏" : "收藏岗位"} disabled={saving} onClick={onSave}><ComponentIcon name="bookmark-star" size={23} /></button></div>
    <div className="component-job-meta">{job.company && <span><ComponentIcon name="company" size={15} />{job.company}</span>}{job.city && <span><ComponentIcon name="location" size={15} />{job.city}</span>}{WORK_TYPE_LABEL[job.work_type] && <span><ComponentIcon name="employment" size={15} />{WORK_TYPE_LABEL[job.work_type]}</span>}</div>
    {job.matched_terms.length > 0 && <div className="component-tags" aria-label="检索关键词">{job.matched_terms.map(term => <span key={term}>{term}</span>)}</div>}
    {job.excerpt && <button type="button" className="job-reference-card__excerpt" onClick={onOpen}>{job.excerpt}</button>}
    <footer><small>{job.reference_notice}</small><div className="component-button-group job-reference-card__actions"><button type="button" className="component-primary" disabled={disabled} onClick={() => onPrompt(jobPrompt(job,"compare"))}><ComponentIcon name="compare" size={18} />和我对照</button>
      <ComposerMenu label={"岗位操作：" + job.title} title="岗位操作" trigger={<ComponentIcon name="more" size={18} />} disabled={disabled} align="end">{close => <>
        <button className="agent-menu-option job-menu-option" role="menuitem" type="button" onClick={() => { close(); onPrompt(jobPrompt(job,"action")); }}><ComponentIcon name="task-list" />加入下一步</button>
        <button className="agent-menu-option job-menu-option" role="menuitem" type="button" onClick={() => { close(); onPrompt(jobPrompt(job,"direction")); }}><ComponentIcon name="career-compass" />考虑这个方向</button>
      </>}</ComposerMenu></div></footer>
  </article>;
}
export function JobDetailPanel({ id, state, saving, disabled, onSave, onClose, onPrompt }: {
  id: string; state: CareerState | null; saving: boolean; disabled: boolean; onSave: (id: string, saved: boolean) => void; onClose: () => void; onPrompt: (text: string) => void;
}) {
  const [detail,setDetail] = useState<JobDetail | null>(null), [error,setError] = useState(""), [attempt,setAttempt]=useState(0);
  const panel=useRef<HTMLElement>(null), latestClose=useRef(onClose); latestClose.current=onClose;
  useEffect(() => { const controller=new AbortController(); setDetail(null); setError(""); void agentApi.catalogueJob(id,controller.signal).then(value=>{if(!controller.signal.aborted)setDetail(value);}).catch(cause=>{if(!controller.signal.aborted)setError(cause.message);}); return ()=>controller.abort(); },[id,attempt]);
  useEffect(() => { panel.current?.focus({preventScroll:true}); const escape=(event:KeyboardEvent)=>{if(event.key==="Escape")latestClose.current();}; window.addEventListener("keydown",escape); return ()=>window.removeEventListener("keydown",escape); },[id]);
  const sample=detail?.sample, saved=Boolean(state?.saved_jobs?.some(item=>item.catalogue_id===id));
  const personalJob=state?.jobs.find(item=>item.catalogue?.catalogue_id===id);
  const comparison=personalJob ? state?.comparisons.filter(item=>item.job_id===personalJob.id).at(-1) : undefined;
  return <aside ref={panel} tabIndex={-1} className="agent-inspector job-detail-panel workspace-detail-panel" id="career-context" aria-label="岗位详情" aria-busy={!detail&&!error}>
    <header className="job-detail-panel__toolbar"><span><ComponentIcon name="employment" />岗位详情</span><button className="component-icon-button" type="button" aria-label="关闭岗位详情" title="关闭岗位详情" onClick={onClose}><ComponentIcon name="close" size={20} /></button></header>
    {error ? <div className="component-empty" role="alert"><p>{error}</p><button type="button" className="component-secondary" onClick={()=>setAttempt(value=>value+1)}>重新读取</button></div> : !sample ? <p className="component-empty" role="status">正在读取岗位原文…</p> : <>
      <div className="job-detail-panel__body"><h2>{sample.title}</h2><div className="component-job-meta"><span>{sample.company || "公司信息未提供"}</span>{sample.city && <span>{sample.city}</span>}{WORK_TYPE_LABEL[sample.work_type]&&<span>{WORK_TYPE_LABEL[sample.work_type]}</span>}</div>
        <p className="job-reference-notice"><ComponentIcon name="source-document" size={17} />{sample.reference_notice}</p>
        <dl className="job-detail-facts">{[["学历",sample.education],["经验",sample.experience_level],["薪资",sample.salary_text],["毕业要求",sample.graduation_eligibility_text]].filter(([,value])=>value).map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
        <section><h3>职责与任职要求</h3><div className="job-original-text">{sample.description}</div></section>
        <section><h3>与我对照</h3>{comparison ? <><p>{comparison.summary}</p>{comparison.stale&&<p className="component-caution">档案或材料已更新，请重新对照。</p>}<ul className="job-comparison-list">{comparison.checks.map((check,index)=><li key={index}><span data-assessment={check.assessment}>{({supported:"有依据",partial:"部分有依据",unknown:"待了解",conflict:"存在冲突"})[check.assessment]}</span><strong>{check.requirement}</strong><p>{check.reason}</p>{check.evidence.map((evidence,i)=><blockquote key={i}>{evidence.quote}</blockquote>)}</li>)}</ul></> : <p>还没有保存这份岗位与你的经历对照，可以让穗奈结合已有材料一起看看。</p>}</section>
        <details className="job-source-details"><summary>来源与时间</summary><dl><dt>发布时间</dt><dd>{sample.published_at||"原文未提供"}</dd><dt>采集时间</dt><dd>{sample.captured_at?.slice(0,10)||"未知"}</dd></dl>{sample.source_url&&<a href={sample.source_url} target="_blank" rel="noopener noreferrer">查看原始页面 <AgentIcon name="external" size={13}/></a>}{sample.review_flags.length>0&&<p>这份参考含待核实项目，判断时请核对原文。</p>}</details>
      </div><footer className="job-detail-panel__actions"><button type="button" className="component-secondary bookmark-button" data-saved={saved} aria-pressed={saved} disabled={saving||!state} onClick={()=>onSave(id,!saved)}><ComponentIcon name="bookmark-star" size={20}/>{saved?"已收藏":"收藏"}</button><button className="component-primary" type="button" disabled={disabled} onClick={()=>onPrompt(jobPrompt({id,title:sample.title},"compare"))}>和我对照<ComponentIcon name="compare" size={18}/></button></footer>
    </>}
  </aside>;
}

export type SkillDisplay = {name:string; stage:CareerSkill["stage"] | null; evidence:CareerSkill["evidence"]; confirmed_at:string|null};
export function displaySkills(state: CareerState): SkillDisplay[] {
  if(state.skills?.length) return state.skills;
  return state.profile.skills ? [{name:"已记录的技能与经历",stage:null,evidence:[{source_id:"profile.skills",quote:state.profile.skills}],confirmed_at:state.profile.confirmed_at}] : [];
}
export function GrowthSummary({ state, loading, error, onOpen, onPrompt, children }: {
  state: CareerState|null; loading:boolean; error:string; onOpen:()=>void; onPrompt:(text:string)=>void; children?:ReactNode;
}) {
  const [skill,setSkill]=useState<SkillDisplay|null>(null);
  const skills=state?displaySkills(state):[];
  return <section className="suinai-component growth-summary" aria-label="我的成长档案">
    <header className="component-card-heading"><h2>我的成长档案</h2><button className="component-icon-button" type="button" title="打开成长档案" aria-label="打开成长档案" onClick={onOpen}><ComponentIcon name="open-arrow" size={19}/></button></header>
    {loading&&!state ? <p role="status">正在读取档案…</p> : error&&!state ? <p role="status">{error}</p> : state ? <>
      {state.profile.confirmed_at ? <><p className="growth-summary__intro">{state.profile.education||state.profile.experience||"你确认过的经历，会留在这里。"}</p>{state.profile.goal&&<p className="growth-summary__direction"><ComponentIcon name="career-compass" size={19}/><span>{state.profile.goal}</span></p>}</> : <div className="growth-summary__empty"><ComponentIcon name="career-compass" size={27}/><p>我们聊过的经历，确认后会留在这里。</p><button className="component-text-button" type="button" onClick={()=>onPrompt("请结合我们已经聊过的真实经历，帮我整理一份职业档案草稿，等我确认后再保存。")}>请穗奈整理 <span aria-hidden="true">→</span></button></div>}
      {skills.length>0&&<div className="growth-summary__skills">{skills.slice(0,3).map(item=><button type="button" key={item.name} className="skill-record" onClick={()=>setSkill(item)}><ComponentIcon name={skillIcon(item.name)} size={22}/><span>{item.name}<small>{item.stage?SKILL_STAGES[item.stage]:"已记录 · 未分级"}</small></span><span className="skill-stage-dots" aria-hidden="true">{["contact","project","independent"].map((stage,index)=><i key={stage} data-filled={item.stage!==null&&index<=["contact","project","independent"].indexOf(item.stage)}/>)}</span></button>)}</div>}
    </> : null}
    {children}
    {skill&&<SkillDetailPopover key={skill.name} skill={skill} state={state} onClose={()=>setSkill(null)} onPrompt={onPrompt}/>}
  </section>;
}
export function SkillDetailPopover({skill,state,onClose,onPrompt}:{skill:SkillDisplay;state:CareerState|null;onClose:()=>void;onPrompt:(text:string)=>void}) {
  const dialog=useRef<HTMLDialogElement>(null), title=useId();
  useEffect(()=>{const popup=dialog.current;popup?.showModal();return()=>popup?.close();},[]);
  const valid=skill.evidence.every(evidence=>state?.sources.some(source=>source.kind!=="job_sample"&&source.id===evidence.source_id&&source.text.includes(evidence.quote)));
  return <dialog ref={dialog} className="skill-detail-dialog" aria-labelledby={title} onCancel={onClose} onClick={event=>{if(event.target===event.currentTarget)onClose();}}><div className="suinai-component skill-detail-surface">
    <header className="component-card-heading"><h2 id={title}><ComponentIcon name={skillIcon(skill.name)} size={28}/>{skill.name}</h2><button type="button" className="component-icon-button" aria-label="关闭技能详情" onClick={onClose}><ComponentIcon name="close"/></button></header>
    <p className="skill-detail-stage">{skill.stage?SKILL_STAGES[skill.stage]:"已记录 · 未分级"}</p><p className="component-muted">{skill.stage?"本人确认的实践记录，不是能力认证。":"这段历史记录尚未按实践阶段整理。"}</p>
    <h3>记录依据</h3>{skill.evidence.map((item,index)=><blockquote key={index}>{item.quote}<cite>{state?.sources.find(source=>source.id===item.source_id)?.kind==="user_result"?"行动结果":"已保存的个人材料"}</cite></blockquote>)}
    {!valid&&<p className="component-caution">原资料已经变化，这条记录的依据需要重新核对。</p>}
    <footer className="component-button-group"><button className="component-secondary" type="button" onClick={()=>{onClose();onPrompt("我想修正档案里的「"+skill.name+"」记录，请先问我具体需要改哪一部分，再提出待确认更新。");}}><ComponentIcon name="edit-record"/>修正记录</button><button className="component-primary" type="button" onClick={()=>{onClose();onPrompt("结合我的目标和「"+skill.name+"」已有实践，帮我选一件有具体产出的下一步练习。不要直接升级技能阶段。");}}>看看下一步<ComponentIcon name="next-arrow"/></button></footer>
  </div></dialog>;
}
export function ProfileUpdateStrip({proposal,state,saving,disabled,onChange,onPrompt}:{proposal:CareerProposal;state:CareerState;saving:boolean;disabled:boolean;onChange:CareerChangeHandler;onPrompt:(text:string)=>void}) {
  const data=proposal.data, stale=proposal.context_version!==state.context_version;
  const changes=data.kind==="profile"?PROFILE_FIELDS.filter(field=>state.profile[field.key]!==data.profile[field.key]).map(field=>({name:PROFILE_SUMMARY_LABELS[field.key],value:data.profile[field.key]||"清空这项内容"})):data.kind==="skills"?data.skills.map(item=>({name:item.name,value:SKILL_STAGES[item.stage]})):data.kind==="catalogue_job"?[{name:"保留岗位材料",value:proposal.catalogue_sample?.title||proposal.title}]:data.kind==="actions"?data.actions.map(item=>({name:"下一步",value:item.title})): [{name:"岗位对照",value:data.summary}];
  return <section className="suinai-component profile-update-strip" aria-label="待确认的职业资料更新"><header><ComponentIcon name="recommendation" size={20}/><h3>穗奈想记下这些</h3></header><dl>{changes.map((item,index)=><div key={index}><dt>{item.name}</dt><dd>{item.value}</dd></div>)}</dl>
    {data.kind==="skills"&&<details><summary>查看实践依据</summary>{data.skills.map(skill=><div key={skill.name}><strong>{skill.name}</strong>{skill.evidence.map((evidence,index)=><blockquote key={index}>{evidence.quote}</blockquote>)}</div>)}</details>}
    {data.kind==="actions"&&<details><summary>查看行动内容</summary>{data.actions.map((action,index)=><div key={index}><h4>{action.title}</h4><dl><div><dt>产出</dt><dd>{action.deliverable}</dd></div>{action.learn&&<div><dt>学习内容</dt><dd>{action.learn}</dd></div>}{action.why&&<div><dt>为什么先做</dt><dd>{action.why}</dd></div>}</dl></div>)}</details>}
    {data.kind==="catalogue_job"&&proposal.catalogue_sample&&<details><summary>查看岗位材料</summary><p>{proposal.catalogue_sample.company} · {proposal.catalogue_sample.catalogue.city}</p><p className="component-muted">保存为参考材料，招聘状态需要另行核实。</p><div className="job-original-text">{proposal.catalogue_sample.description}</div></details>}
    {data.kind==="comparison"&&<details><summary>查看逐项对照</summary>{data.checks.map((check,index)=><div key={index}><h4>{check.requirement}</h4><p>{({supported:"有依据",partial:"部分有依据",unknown:"待了解",conflict:"存在冲突"})[check.assessment]} · {check.reason}</p>{check.evidence.map((evidence,i)=><blockquote key={i}>{evidence.quote}</blockquote>)}</div>)}</details>}
    {stale&&<p className="component-caution">资料已更新，请让穗奈重新整理。</p>}<footer className="component-button-group"><button className="component-text-button" type="button" disabled={disabled||saving} onClick={()=>onPrompt("请"+(stale?"重新读取最新资料并":"")+"调整「"+proposal.title+"」这份待确认建议，先问我想修改哪一部分；不要替我确认。")}>改一下</button><button className="component-secondary" type="button" disabled={disabled||saving} onClick={()=>void onChange({type:"proposal.decide",id:proposal.id,approved:false},"已放下这份建议。")}>暂不记录</button><button className="component-primary" type="button" disabled={disabled||saving||stale} onClick={()=>void onChange({type:"proposal.decide",id:proposal.id,approved:true},"已按你确认的内容更新档案。请在成长档案查看。")}><ComponentIcon name="confirm-check" size={18}/>{saving?"正在保存…":"确认更新"}</button></footer>
  </section>;
}
export function NextActionRow({action,disabled,onPrompt}:{action:CareerAction;disabled:boolean;onPrompt:(text:string)=>void}) {
  return <article className="suinai-component next-action-row" aria-label={"成长行动："+action.title}><ComponentIcon name={action.status==="done"?"confirm-check":"task-list"} size={24}/><div><h3>{action.title}</h3><p>{action.status==="done"?action.result:action.deliverable}</p></div><button className="component-icon-button" type="button" disabled={disabled} aria-label={"继续行动："+action.title} title="继续和穗奈做" onClick={()=>onPrompt("我们接着做成长行动「"+action.title+"」。预期产出是："+action.deliverable+"。先读取职业档案和已有结果，从当前进度继续，不要假装已经完成。")}><ComponentIcon name="next-arrow" size={21}/></button></article>;
}
