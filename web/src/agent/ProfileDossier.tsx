/** 青穗集 · 用户画像档案页：按原型分组展示事实、方向、经历、技能、偏好与待追问内容。 */
import { assetUrl } from "../assets";
import { ComponentIcon } from "./ComponentAssets";
import { displaySkills, SKILL_STAGES } from "./CareerComponents";
import { PROFILE_FIELDS, sourceLabel, type CareerState } from "./career";
import type { SkillDisplay } from "./CareerComponents";

const PROFILE_ASSETS = {
  sprout: "suinai-sprout.png",
  confirmed: "status-confirmed.png",
  judgement: "status-judgement.png",
  pending: "status-pending.png",
  background: "profile-background.png",
  target: "profile-target.png",
  project: "profile-project.png",
  react: "skill-react-practice.png",
  api: "skill-api-development.png",
  container: "skill-container-deployment.png",
  file: "source-file.png",
  conversation: "source-conversation.png",
  updated: "updated-time.png",
  location: "location.png",
  preference: "preference-constraint.png",
  followUp: "follow-up.png",
  industry: "industry-direction.png",
} as const;
type ProfileAssetName = keyof typeof PROFILE_ASSETS;

type ProfileStatus = "confirmed" | "judgement" | "pending";
const STATUS_META: Record<ProfileStatus, { label: string; asset: ProfileAssetName }> = {
  confirmed: { label: "已确认事实", asset: "confirmed" },
  judgement: { label: "暂时判断", asset: "judgement" },
  pending: { label: "待确认", asset: "pending" },
};

const FIELD_PROMPTS: Record<string, string> = {
  goal: "我还没想清楚当前最想解决的职业问题。请通过一两个问题帮我厘清，不要直接替我下结论。",
  education: "请先问我专业、学历和当前所处阶段，把事实记录下来，不要替我补全。",
  experience: "请从我做过的一件项目、工作或学习任务开始追问，帮我还原负责的部分和实际产出。",
  skills: "请根据我们聊过的经历，继续追问我实际用过哪些工具或方法，并区分接触、实践和独立完成。",
  preferences: "请问我希望在哪座城市、以什么工作方式发展，以及有哪些现实限制需要纳入考虑。",
  weekly_hours: "请问我每周实际能用于学习和实践的时间，再帮我安排能完成的下一步。",
};

function ProfileAssetIcon({ name, size = 22, className = "" }: { name: ProfileAssetName; size?: number; className?: string }) {
  return <img className={"profile-dossier-icon " + className} src={assetUrl("brand/career-profile/" + PROFILE_ASSETS[name])} width={size} height={size} alt="" aria-hidden="true" draggable={false} />;
}

function StatusPill({ status, label }: { status: ProfileStatus; label?: string }) {
  const meta = STATUS_META[status];
  return <span className={"profile-dossier-status-pill profile-dossier-status-pill--" + status}><ProfileAssetIcon name={meta.asset} size={14} />{label ?? meta.label}</span>;
}

function formatUpdated(value: string | null) {
  if (!value) return "尚未更新";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(date);
}

function sourceIcon(kind: string): ProfileAssetName {
  return kind === "user_result" ? "file" : "conversation";
}

function sourceKindLabel(kind: string) {
  return kind === "user_result" ? "行动结果" : "对话整理";
}

function sourcePreview(text: string) {
  const compact = text.replace(/\s+/g, " ").trim();
  return compact.length > 120 ? compact.slice(0, 120) + "…" : compact;
}

function ProfileSource({ state, sourceId, kind = "user_confirmed" }: { state: CareerState; sourceId?: string; kind?: string }) {
  return <div className="profile-dossier-source"><ProfileAssetIcon name={sourceIcon(kind)} size={14} /><span>{sourceId ? sourceLabel(state, sourceId) : "信息缺口 · 等待对话补充"}</span>{sourceId && <small>{sourceKindLabel(kind)}</small>}</div>;
}

function ProfileRecord({ state, label, value, sourceId, status, asset, emptyText = "尚未从对话中确认" }: {
  state: CareerState; label: string; value: string; sourceId?: string; status: ProfileStatus; asset: ProfileAssetName; emptyText?: string;
}) {
  const filled = Boolean(value.trim());
  return <article className="profile-dossier-record" data-empty={!filled}>
    <div className="profile-dossier-record-icon"><ProfileAssetIcon name={asset} size={23} /></div>
    <div className="profile-dossier-record-main"><div className="profile-dossier-record-label">{label}</div><div className="profile-dossier-record-value">{filled ? value : emptyText}</div><ProfileSource state={state} sourceId={sourceId} /></div>
    <StatusPill status={filled ? status : "pending"} />
  </article>;
}

function skillAsset(name: string): ProfileAssetName {
  if (/react/i.test(name)) return "react";
  if (/docker|容器|kubernetes/i.test(name)) return "container";
  if (/接口|api|后端|服务/i.test(name)) return "api";
  return "project";
}

function SkillRecord({ skill, state, onPrompt }: { skill: SkillDisplay; state: CareerState; onPrompt: (text: string) => void }) {
  const stage = skill.stage ? SKILL_STAGES[skill.stage] : "已记录 · 未分级";
  const status: ProfileStatus = skill.confirmed_at ? "confirmed" : "judgement";
  return <article className="profile-dossier-skill" data-stage={skill.stage ?? "ungraded"}>
    <header>
      <div className="profile-dossier-skill-title"><ProfileAssetIcon name={skillAsset(skill.name)} size={28} /><div><h4>{skill.name}</h4><span>{stage}</span></div></div>
      <button className="profile-dossier-record-action" type="button" title={"修正「" + skill.name + "」记录"} aria-label={"修正「" + skill.name + "」记录"} onClick={() => onPrompt("我想修正档案里的「" + skill.name + "」记录，请先问我具体需要改哪一部分，再提出待确认更新。")}><ComponentIcon name="edit-record" size={17} /></button>
    </header>
    <div className="profile-dossier-skill-use">{skill.stage ? "实践阶段记录" : "经历中提到，尚未分级"}</div>
    {skill.evidence.map((evidence, index) => <div className="profile-dossier-quote" key={index}><blockquote>{evidence.quote}</blockquote><ProfileSource state={state} sourceId={evidence.source_id} kind={state.sources.find(source => source.id === evidence.source_id)?.kind} /></div>)}
    <StatusPill status={status} label={skill.stage ? undefined : "待分级"} />
  </article>;
}

function ModuleHeader({ index, title, hint, asset }: { index: string; title: string; hint: string; asset: ProfileAssetName }) {
  return <header className="profile-dossier-module-head"><span className="profile-dossier-module-number">{index}</span><span className="profile-dossier-module-icon"><ProfileAssetIcon name={asset} size={23} /></span><h3>{title}</h3><span className="profile-dossier-module-hint">{hint}</span></header>;
}

export function ProfileDossier({ state, onEdit, onPrompt }: { state: CareerState; onEdit: () => void; onPrompt: (text: string) => void }) {
  const confirmed = Boolean(state.profile.confirmed_at);
  const confirmedFields = PROFILE_FIELDS.filter(field => state.profile[field.key].trim());
  const missingFields = PROFILE_FIELDS.filter(field => !state.profile[field.key].trim());
  const skills = displaySkills(state);
  const evidence = state.sources.filter(source => source.kind !== "job_sample" && source.text.trim());
  const profileStatus: ProfileStatus = state.proposals.length ? "judgement" : confirmed ? "confirmed" : "pending";
  const profileStatusLabel = state.proposals.length ? "持续校准中" : confirmed ? "已确认版本" : "正在建立";
  const statusSummary = state.proposals.length ? state.proposals.length + " 项更新待确认" : missingFields.length ? missingFields.length + " 项待继续了解" : "当前资料已覆盖";

  return <div className="profile-dossier">
    <header className="profile-dossier-page-header">
      <div className="profile-dossier-page-title"><div className="profile-dossier-brand-mark"><ProfileAssetIcon name="sprout" size={34} /></div><div><span className="profile-dossier-kicker">SUINAI · CAREER PROFILE</span><h3>你的职业画像</h3><p>不是评分结果，而是穗奈基于真实经历持续更新的理解。</p></div></div>
      <div className="profile-dossier-page-meta"><StatusPill status={profileStatus} label={profileStatusLabel} /><span><ProfileAssetIcon name="updated" size={15} />最近更新：{formatUpdated(state.updated_at ?? state.profile.confirmed_at)}</span></div>
    </header>

    <div className="profile-dossier-understanding"><strong>穗奈目前怎样理解你</strong><span>每条记录都区分确认状态，并保留来源。新的证据出现后，暂时判断会调整，待确认项会回到对话继续补充。</span><div className="profile-dossier-legend"><StatusPill status="confirmed" /><StatusPill status="judgement" /><StatusPill status="pending" /></div></div>

    <section className="profile-dossier-overview" aria-labelledby="profile-dossier-overview-title">
      <div className="profile-dossier-overview-label"><span className="profile-dossier-module-number">01</span><span id="profile-dossier-overview-title">画像概览</span><small>穗奈当前的整体理解</small></div>
      <div className="profile-dossier-overview-main"><div className="profile-dossier-identity"><div className="profile-dossier-identity-icon"><ProfileAssetIcon name="sprout" size={35} /></div><div><h4>{state.profile.goal || "职业画像正在形成"}</h4><p>{confirmed ? "一份由已确认材料组成、可以继续修正的成长记录" : "从对话中逐步收集事实，确认后才会进入画像"}</p></div></div><div className="profile-dossier-overview-stats"><div><span>当前阶段</span><strong>{confirmed ? "已确认资料 · " + confirmedFields.length + " 项" : "对话建立中"}</strong></div><div><span>当前主要目标</span><strong>{state.profile.goal || "待确认"}</strong></div><div><span>画像状态</span><strong>{statusSummary}</strong></div><div><span>最近更新时间</span><strong>{formatUpdated(state.updated_at ?? state.profile.confirmed_at)}</strong></div></div></div>
      <div className="profile-dossier-overview-footer"><span>你可以查看每条记录的依据，也可以随时修正穗奈的理解。</span><button type="button" className="profile-dossier-edit-link" onClick={onEdit}><ProfileAssetIcon name="updated" size={15} />修正画像</button></div>
    </section>

    <div className="profile-dossier-grid profile-dossier-grid--two">
      <section className="profile-dossier-module" aria-labelledby="profile-dossier-background-title"><ModuleHeader index="02" title="基本背景" hint="身份与教育信息" asset="background" /><div className="profile-dossier-record-list"><ProfileRecord state={state} label="学习与工作背景" value={state.profile.education} sourceId={state.profile.education ? "profile.education" : undefined} status={confirmed ? "confirmed" : "pending"} asset="background" /></div></section>
      <section className="profile-dossier-module" aria-labelledby="profile-dossier-target-title"><ModuleHeader index="03" title="目标与方向" hint="还在探索，可以继续修正" asset="target" /><div className="profile-dossier-record-list"><ProfileRecord state={state} label="当前想解决的问题" value={state.profile.goal} sourceId={state.profile.goal ? "profile.goal" : undefined} status={confirmed ? "confirmed" : "pending"} asset="target" /></div><div className="profile-dossier-module-footer"><button type="button" className="profile-dossier-small-action" onClick={() => onPrompt(FIELD_PROMPTS.goal)}><ProfileAssetIcon name="industry" size={15} />继续聊方向</button></div></section>
    </div>

    <section className="profile-dossier-module profile-dossier-module--wide" aria-labelledby="profile-dossier-experience-title"><ModuleHeader index="04" title="真实经历" hint="项目、课程、实践与活动；只记录做过的事" asset="project" />{state.profile.experience.trim() ? <article className="profile-dossier-experience"><div className="profile-dossier-experience-title"><h4>已记录的经历</h4><StatusPill status={confirmed ? "confirmed" : "pending"} /></div><p>{state.profile.experience}</p><ProfileSource state={state} sourceId="profile.experience" /></article> : <div className="profile-dossier-empty"><ProfileAssetIcon name="project" size={27} /><span>还没有记录具体项目或实践经历。</span><button type="button" className="profile-dossier-small-action" onClick={() => onPrompt(FIELD_PROMPTS.experience)}>从一件小事开始 <ComponentIcon name="next-arrow" size={15} /></button></div>}</section>

    <section className="profile-dossier-module profile-dossier-module--wide" aria-labelledby="profile-dossier-skills-title"><ModuleHeader index="05" title="技能与实践证据" hint="阶段来自具体场景，不代表考试分数" asset="react" />{skills.length ? <div className="profile-dossier-skill-grid">{skills.map(skill => <SkillRecord key={skill.name} skill={skill} state={state} onPrompt={onPrompt} />)}</div> : <div className="profile-dossier-muted">技能会在穗奈从经历中找到明确依据、并经你确认后出现在这里。</div>}</section>

    <div className="profile-dossier-grid profile-dossier-grid--two">
      <section className="profile-dossier-module" aria-labelledby="profile-dossier-preferences-title"><ModuleHeader index="06" title="偏好与现实限制" hint="以用户明确表达为准" asset="preference" /><div className="profile-dossier-record-list"><ProfileRecord state={state} label="偏好与现实约束" value={state.profile.preferences} sourceId={state.profile.preferences ? "profile.preferences" : undefined} status={confirmed ? "confirmed" : "pending"} asset="preference" /><ProfileRecord state={state} label="每周可投入时间" value={state.profile.weekly_hours} sourceId={state.profile.weekly_hours ? "profile.weekly_hours" : undefined} status={confirmed ? "confirmed" : "pending"} asset="updated" /></div><div className="profile-dossier-module-footer"><button type="button" className="profile-dossier-small-action" onClick={() => onPrompt(FIELD_PROMPTS.preferences)}><ProfileAssetIcon name="location" size={15} />继续补充条件</button></div></section>
      <section className="profile-dossier-module" aria-labelledby="profile-dossier-follow-up-title"><ModuleHeader index="07" title="待继续了解" hint="穗奈后续会在对话中追问" asset="followUp" /><div className="profile-dossier-question-list">{missingFields.length ? missingFields.map((field, index) => <button type="button" key={field.key} onClick={() => onPrompt(FIELD_PROMPTS[field.key] ?? "请继续通过对话了解我的职业情况，并把事实和推测分开记录。")}><span className="profile-dossier-question-index">{String(index + 1).padStart(2, "0")}</span><span><strong>{field.label}</strong><small>来源：信息缺口 · 等待补充</small></span><StatusPill status="pending" /><ComponentIcon name="next-arrow" size={15} /></button>) : <div className="profile-dossier-muted">当前画像字段已经覆盖。接下来可以用岗位对照和行动结果继续修正。</div>}</div><div className="profile-dossier-follow-up-cta"><span>先从最早能说清楚的经历开始，和穗奈一起把方向补完整。</span><button type="button" className="profile-dossier-continue-button" onClick={() => onPrompt("请结合我们已经聊过的真实经历，继续追问一个最关键的信息，帮我补充职业画像；不要一次问太多，也不要替我下结论。")}>继续聊一聊 <ComponentIcon name="next-arrow" size={15} /></button></div></section>
    </div>

    {evidence.length > 0 && <section className="profile-dossier-module profile-dossier-module--wide profile-dossier-sources" aria-labelledby="profile-dossier-sources-title"><ModuleHeader index="08" title="可以回看的依据" hint="对话与行动结果" asset="file" /><div className="profile-dossier-evidence-list">{evidence.map(source => <details key={source.id} className="profile-dossier-evidence"><summary><span className="profile-dossier-evidence-heading"><ProfileAssetIcon name={sourceIcon(source.kind)} size={18} /><span><strong>{sourceLabel(state, source.id)}</strong><small>{sourceKindLabel(source.kind)}</small></span></span><span className="profile-dossier-evidence-preview">{sourcePreview(source.text)}</span><ComponentIcon name="next-arrow" size={14} /></summary><blockquote>{source.text}</blockquote></details>)}</div></section>}

    <footer className="profile-dossier-footnote"><span><ProfileAssetIcon name="confirmed" size={14} />穗奈的原则：事实有来源，判断可修正，不能把暂时判断写成已确认事实。</span><button type="button" className="profile-dossier-edit-link" onClick={onEdit}><ProfileAssetIcon name="updated" size={15} />修正已确认材料</button></footer>
  </div>;
}
