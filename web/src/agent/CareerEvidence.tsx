/** 青穗集 · 证据交互：原话线索、岗位依据与简历核对沿用主对话，不显示未经校准的能力分。 */
import { ComponentIcon } from "./ComponentAssets";
import { AgentIcon } from "./AgentIcon";
import { ComposerMenu } from "./ComposerMenu";
import type { CareerState } from "./career";
import type { CareerFactHandler } from "./career-workspace";
import type { CareerDecisionView, CareerFactCandidate, JobAssessment, ResumeEvidenceReview } from "../../../agent/src/career-decision-contract";
import { followUpReply } from "./career-evidence";
import "./career-evidence.css";

const categories = { actual: "经历", plan: "计划", preference: "偏好", constraint: "现实条件", unknown: "待了解" };
const actualCategories = { goal: "目标", education: "背景", experience: "经历", skills: "技能现状", preferences: "偏好", weekly_hours: "时间安排" };
const fieldOrder = { experience: 0, education: 1, skills: 2, preferences: 3, weekly_hours: 4, goal: 5 };
const labels = { supported: "有依据", partial: "部分有依据", unknown: "待了解", conflict: "需核对" };

export function DecisionActivity({ activity, inline = false }: { activity: CareerDecisionView["activity"] | undefined; inline?: boolean }) {
  if (!activity || activity.phase === "ready") return null;
  return <span className={"career-decision-activity" + (inline ? " career-decision-activity--inline" : "")} aria-label="画像整理状态" role="status" data-active={activity.phase !== "unavailable"}>
    <span className="career-decision-pixels" aria-hidden="true"><i/><i/><i/><i/></span>
    <span>{activity.message}</span>
  </span>;
}

function FactLine({ fact, saving, onResolve, onPrompt }: {
  fact: CareerFactCandidate;
  saving: boolean;
  onResolve?: CareerFactHandler;
  onPrompt: (text: string) => void;
}) {
  return <article className="career-fact-line" data-conflict={fact.conflict || undefined}>
    <div className="career-fact-line__text">
      <span className="career-fact-kind">{fact.conflict ? "需核对" : fact.category === "actual" ? actualCategories[fact.field] : categories[fact.category]}</span>
      <p>{fact.text}</p>
    </div>
    <div className="career-fact-line__actions">
      <button type="button" className="component-icon-button" disabled={saving} aria-label={"补充或更正：" + fact.text} title="补充或更正"
        onClick={() => onPrompt("关于刚才整理的「" + fact.text + "」，我想补充或更正。请先问我具体改哪里，保留原话依据，不要当作已经确认。注意区分计划和已完成经历。线索 ID：" + fact.id)}>
        <ComponentIcon name="edit-record" size={16}/>
      </button>
      {onResolve && <button type="button" className="component-icon-button" disabled={saving} aria-label={"忽略：" + fact.text} title="暂不记录" onClick={() => void onResolve(fact.id, "dismiss")}>
        <ComponentIcon name="close" size={16}/>
      </button>}
      {onResolve && fact.confirmable && <button type="button" className="career-fact-confirm" disabled={saving} title="确认并记入档案" aria-label={"记入档案：" + fact.text} onClick={() => void onResolve(fact.id, "confirm")}>
        <ComponentIcon name="confirm-check" size={15}/>记下
      </button>}
    </div>
    <details className="career-evidence-quotes">
      <summary>原话{fact.support === "unchecked" ? " · 尚未核对" : fact.support === "partial" ? " · 仍需补充" : ""}</summary>
      {fact.evidence.map((evidence, index) => <blockquote key={index}>{evidence.quote}</blockquote>)}
      {fact.category === "plan" && <p>这是一项计划，会记入目标。</p>}
      {fact.conflict && <p>与已有档案存在不同说法，先聊清楚再更新。</p>}
    </details>
  </article>;
}

export function CareerEvidencePanel({ state, saving = false, onResolve, onPrompt, compact = false, conversation = false, showActivity = true }: {
  state: CareerState;
  saving?: boolean;
  onResolve?: CareerFactHandler;
  onPrompt: (text: string) => void;
  compact?: boolean;
  conversation?: boolean;
  showActivity?: boolean;
}) {
  const view = state.insights;
  if (!view) return null;
  const facts = view.facts.filter(fact => !fact.stale).sort((a, b) => Number(a.category === "plan") - Number(b.category === "plan") || fieldOrder[a.field] - fieldOrder[b.field]);
  if (!facts.length && (!showActivity || !view.activity || view.activity.phase === "ready") && (compact || !view.follow_up)) return null;
  const shown = compact ? facts.slice(0, 2) : facts;
  return <section className="career-evidence-panel" data-compact={compact} data-conversation={conversation || undefined} aria-label="对话中的画像线索">
    {showActivity && <DecisionActivity activity={view.activity}/>}
    {facts.length > 0 && <>
      <div className="career-evidence-heading"><h3>刚聊到</h3><span>{facts.length}</span></div>
      {shown.map(fact => <FactLine key={fact.id} fact={fact} saving={saving} onResolve={onResolve} onPrompt={onPrompt}/>)}
      {compact && facts.length > 2 && <details className="career-evidence-more">
        <summary>还有 {facts.length - 2} 条线索</summary>
        {facts.slice(2).map(fact => <FactLine key={fact.id} fact={fact} saving={saving} onResolve={onResolve} onPrompt={onPrompt}/>)}
      </details>}
    </>}
    {!compact && <DecisionFollowUp followUp={view.follow_up} onPrompt={onPrompt} disabled={saving}/>}
  </section>;
}

export function DecisionFollowUp({ followUp, onPrompt, disabled = false }: {
  followUp: CareerDecisionView["follow_up"];
  onPrompt: (text: string) => void;
  disabled?: boolean;
}) {
  if (!followUp) return null;
  return <button className="career-followup career-followup--conversation" type="button" disabled={disabled}
    title={followUp.purpose} aria-description={followUp.purpose} onClick={() => onPrompt(followUpReply(followUp.question))}>
    <ComponentIcon name="recommendation" size={18}/><span>{followUp.question}</span><ComponentIcon name="next-arrow" size={17}/>
  </button>;
}

export function JobEvidenceDetails({ assessment, onPrompt, job, open = false }: {
  assessment?: JobAssessment;
  onPrompt: (text: string) => void;
  job: { id: string; title: string };
  open?: boolean;
}) {
  if (!assessment) return null;
  const stale = assessment.stale;
  const summary = stale ? "资料已更新，等待重新对照" : assessment.label === "conflict" ? "有要求需要核对" : assessment.support_count ? assessment.support_count + " 项有相关依据" : "还有一些经历想了解";
  return <details className="job-evidence" open={open || undefined} data-stale={stale}>
    <summary><span className="job-evidence__signal" data-label={assessment.label} aria-hidden="true"/><span>{summary}</span><ComponentIcon name="compare" size={15}/></summary>
    <div className="job-evidence__content">
      {stale && <button type="button" className="component-text-button" onClick={() => onPrompt("请重新对照岗位库样本 " + job.id + "（" + job.title + "），使用我最新的画像和对话依据，更新已过期的岗位判断。")}>重新对照 <span aria-hidden="true">↗</span></button>}
      {assessment.checks.map((check, index) => <article className="job-evidence-check" key={index} data-assessment={check.assessment}>
        <span className="job-evidence-check__label">{labels[check.assessment]}</span>
        <p>{check.requirement}</p><small>{check.reason}</small>
        {check.evidence.length > 0 && <details className="career-evidence-quotes">
          <summary>查看依据</summary>
          {check.evidence.map((evidence, number) => <blockquote key={number}>{evidence.quote}</blockquote>)}
        </details>}
      </article>)}
      {assessment.preference === "conflict" && <p className="component-caution">已知岗位条件与你表达的偏好存在冲突，需要核对。</p>}
      <time dateTime={assessment.updated_at}>依据截至 {new Date(assessment.updated_at).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</time>
    </div>
  </details>;
}

export function ResumeEvidenceMenu({ review, onPrompt }: { review?: ResumeEvidenceReview; onPrompt?: (text: string) => void }) {
  if (!review) return null;
  const needsReview = review.stale || review.status !== "checked" || review.issues.length > 0;
  const title = review.stale ? "正文或材料有更新，依据需重新核对" : review.status === "unavailable" ? "这次依据核对暂未完成" : review.issues.length ? review.issues.length + " 处表述请核对依据" : review.status === "partial" ? "部分文字尚未完成核对" : review.scope === "changes" ? "本次改写已对照原始经历" : "正文已对照原始经历";
  return <ComposerMenu label={"简历依据核对：" + title} title={title} disabled={false} align="end" className="resume-evidence-menu" panelClassName="resume-evidence-popover"
    trigger={<span className="resume-evidence-trigger" data-warning={needsReview}><AgentIcon name="shield" size={17}/>{needsReview && <i aria-hidden="true"/>}</span>}>
    {close => <>
      <strong>{title}</strong>
      <p>{review.checked_count} / {review.total_count} 处{review.scope === "changes" ? "改写" : "文字"}已核对；不代表经历经过外部核实。</p>
      {review.issues.map(issue => <article key={issue.field_id}>
        <blockquote>{issue.text}</blockquote><p>{issue.reason}</p>
        {onPrompt && !review.stale && <button className="component-text-button" type="button" onClick={() => { close(); onPrompt("简历中「" + issue.text + "」需要核对。" + issue.reason + "请先和我确认实际情况，再给出忠于事实的改写；不要替我补造数字或职责。"); }}>和穗奈核对 <span aria-hidden="true">↗</span></button>}
      </article>)}
    </>}
  </ComposerMenu>;
}
