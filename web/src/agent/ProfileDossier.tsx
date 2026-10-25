/** 青穗集 · 证据型职业画像：展示穗奈从对话中整理出的事实、依据与待确认内容。 */
import { ComponentIcon } from "./ComponentAssets";
import { CareerIcon } from "./CareerVisuals";
import { displaySkills, SKILL_STAGES } from "./CareerComponents";
import { PROFILE_FIELDS, sourceLabel, type CareerState } from "./career";
import type { SkillDisplay } from "./CareerComponents";

const FIELD_PROMPTS: Record<string, string> = {
  goal: "我还没想清楚当前最想解决的职业问题。请通过一两个问题帮我厘清，不要直接替我下结论。",
  education: "请先问我专业、学历和当前所处阶段，把事实记录下来，不要替我补全。",
  experience: "请从我做过的一件项目、工作或学习任务开始追问，帮我还原负责的部分和实际产出。",
  skills: "请根据我们聊过的经历，继续追问我实际用过哪些工具或方法，并区分接触、实践和独立完成。",
  preferences: "请问我希望在哪座城市、以什么工作方式发展，以及有哪些现实限制需要纳入考虑。",
  weekly_hours: "请问我每周实际能用于学习和实践的时间，再帮我安排能完成的下一步。",
};

function skillIcon(name: string) {
  return /react/i.test(name) ? "skill-react" as const : /docker|容器|kubernetes/i.test(name) ? "skill-container" as const : "skill-api" as const;
}

function sourceKindLabel(kind: string) {
  return kind === "user_result" ? "行动结果" : "已确认材料";
}

function sourcePreview(text: string) {
  const compact = text.replace(/\s+/g, " ").trim();
  return compact.length > 150 ? compact.slice(0, 150) + "…" : compact;
}

function SkillRecord({ skill, onPrompt }: { skill: SkillDisplay; onPrompt: (text: string) => void }) {
  const stage = skill.stage ? SKILL_STAGES[skill.stage] : "已记录 · 未分级";
  const evidence = skill.evidence[0];
  return <article className="profile-dossier-skill" data-stage={skill.stage ?? "ungraded"}>
    <header>
      <div className="profile-dossier-skill-title"><ComponentIcon name={skillIcon(skill.name)} size={24} /><div><h4>{skill.name}</h4><span>{stage}</span></div></div>
      <button className="profile-dossier-record-action" type="button" title={"修正「" + skill.name + "」记录"} aria-label={"修正「" + skill.name + "」记录"} onClick={() => onPrompt("我想修正档案里的「" + skill.name + "」记录，请先问我具体需要改哪一部分，再提出待确认更新。")}><ComponentIcon name="edit-record" size={17} /></button>
    </header>
    {evidence && <blockquote>{evidence.quote}<cite>{evidence.source_id.startsWith("action.") ? "行动结果" : "已确认材料"}</cite></blockquote>}
  </article>;
}

export function ProfileDossier({ state, onEdit, onPrompt }: { state: CareerState; onEdit: () => void; onPrompt: (text: string) => void }) {
  const confirmedFields = PROFILE_FIELDS.filter(field => state.profile[field.key].trim());
  const missingFields = PROFILE_FIELDS.filter(field => !state.profile[field.key].trim());
  const skills = displaySkills(state);
  const evidence = state.sources.filter(source => source.kind !== "job_sample" && source.text.trim());
  const completedActions = state.actions.filter(action => action.status === "done").length;
  const confirmed = Boolean(state.profile.confirmed_at);

  return <div className="profile-dossier">
    <header className="profile-dossier-hero">
      <div className="profile-dossier-identity">
        <div className="profile-dossier-emblem" aria-hidden="true"><CareerIcon name={confirmed ? "growth" : "sprout"} size={34} /></div>
        <div><span className="profile-dossier-kicker">穗奈目前这样理解你</span><h3>{state.profile.goal || "你的职业画像正在形成"}</h3><p>{confirmed ? "以下内容来自你确认过的经历与行动结果。" : "从对话中逐步收集事实，确认后才会进入画像。"}</p></div>
      </div>
      <div className="profile-dossier-hero-actions"><span className="profile-dossier-status" data-confirmed={confirmed}>{confirmed ? "已确认版本" : "正在建立"}</span><button className="profile-dossier-icon-action" type="button" title="修正画像" aria-label="修正画像" onClick={onEdit}><ComponentIcon name="edit-record" size={19} /></button></div>
    </header>

    <div className="profile-dossier-stats" aria-label="画像记录概览">
      <div><strong>{confirmedFields.length}</strong><span>已确认信息</span></div>
      <div><strong>{skills.length}</strong><span>技能记录</span></div>
      <div><strong>{evidence.length}</strong><span>可回看依据</span></div>
      <div><strong>{completedActions}</strong><span>完成行动</span></div>
    </div>

    <section className="profile-dossier-section profile-dossier-facts" aria-labelledby="profile-dossier-facts-title">
      <header><div><span className="profile-dossier-section-index">01</span><h3 id="profile-dossier-facts-title">已经确认的事实</h3></div><span className="profile-dossier-section-count">{confirmedFields.length}/{PROFILE_FIELDS.length}</span></header>
      {confirmedFields.length ? <div className="profile-dossier-fact-grid">{confirmedFields.map(field => <article key={field.key}><span>{field.label}</span><p>{state.profile[field.key]}</p></article>)}</div> : <div className="profile-dossier-empty"><CareerIcon name="notes" size={29} /><p>还没有足够的已确认材料。</p><button className="workbench-secondary" type="button" onClick={() => onPrompt("请从我做过的一件事开始，通过一两个问题帮我建立职业画像；先记录事实，不要替我下结论。")}>从对话开始 <ComponentIcon name="next-arrow" size={16} /></button></div>}
    </section>

    <section className="profile-dossier-section" aria-labelledby="profile-dossier-skills-title">
      <header><div><span className="profile-dossier-section-index">02</span><h3 id="profile-dossier-skills-title">技能与实践证据</h3></div><span className="profile-dossier-section-count">{skills.length}</span></header>
      {skills.length ? <div className="profile-dossier-skill-grid">{skills.map(skill => <SkillRecord key={skill.name} skill={skill} onPrompt={onPrompt} />)}</div> : <div className="profile-dossier-muted">技能会在穗奈从经历中找到明确依据、并经你确认后出现在这里。</div>}
    </section>

    <section className="profile-dossier-section" aria-labelledby="profile-dossier-evidence-title">
      <header><div><span className="profile-dossier-section-index">03</span><h3 id="profile-dossier-evidence-title">可以回看的依据</h3></div><span className="profile-dossier-section-count">{evidence.length}</span></header>
      {evidence.length ? <div className="profile-dossier-evidence-list">{evidence.map(source => <details key={source.id} className="profile-dossier-evidence"><summary><span className="profile-dossier-evidence-heading"><ComponentIcon name={source.kind === "user_result" ? "task-list" : "source-document"} size={18} /><span><strong>{sourceLabel(state, source.id)}</strong><small>{sourceKindLabel(source.kind)}</small></span></span><span className="profile-dossier-evidence-preview">{sourcePreview(source.text)}</span></summary><blockquote>{source.text}</blockquote></details>)}</div> : <div className="profile-dossier-muted">确认过的档案内容和行动结果，会在这里留下可回看的原文。</div>}
    </section>

    <section className="profile-dossier-section profile-dossier-open" aria-labelledby="profile-dossier-open-title">
      <header><div><span className="profile-dossier-section-index">04</span><h3 id="profile-dossier-open-title">还需要继续了解</h3></div><span className="profile-dossier-section-count">{missingFields.length}</span></header>
      {missingFields.length ? <div className="profile-dossier-open-list">{missingFields.map(field => <button type="button" key={field.key} onClick={() => onPrompt(FIELD_PROMPTS[field.key] ?? "请继续通过对话了解我的职业情况，并把事实和推测分开记录。")}><span>{field.label}</span><ComponentIcon name="next-arrow" size={17} /></button>)}</div> : <div className="profile-dossier-muted">基础信息已经覆盖，接下来可以用岗位对照和实际行动继续修正画像。</div>}
    </section>
  </div>;
}