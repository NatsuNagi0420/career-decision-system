/** 青穗集 · 简历纸面投影：已收集材料立即排版，生成中的段落覆盖对应经历，不写入正式草稿。 */
import type { AgentEvent, AgentRun } from "./types";
import type { ResumeBody, ResumeHeader, ResumeLiveDraft, ResumeState } from "../../../agent/src/resume-contract";

export function resumePreviewDocument(state: ResumeState | null, draft?: ResumeLiveDraft | null): { header: ResumeHeader; body: ResumeBody; sourceText: string } {
  if (!state) return { header: { name: "", headline: "", contact: "" }, body: { summary: { text: "", fact_ids: [] }, sections: [] }, sourceText: "" };
  const header = state.body ? state.header : { ...state.header, headline: state.header.headline || state.target.title };
  const facts = state.facts.filter(fact => !state.selection || state.selection.choices.some(choice => choice.fact_id === fact.id && choice.use !== "omit"));
  const base: ResumeBody = state.body ?? {
    summary: { text: "", fact_ids: [] },
    sections: (["education", "experience", "projects", "skills"] as const).flatMap(kind => {
      const entries = facts.filter(fact => fact.kind === kind).map(fact => ({ title: fact.title, subtitle: "", period: "", fact_ids: [fact.id], bullets: [fact.detail] }));
      return entries.length ? [{ kind, entries }] : [];
    }),
  };
  if (!draft || draft.context_version !== state.context_version || draft.request_id !== state.pending?.id || state.pending?.kind !== "rewrite")
    return { header, body: base, sourceText: state.body || state.facts.length ? "" : state.source_text };
  const replaced = new Set(draft.body.sections.flatMap(section => section.entries.flatMap(entry => entry.fact_ids)));
  const sections = base.sections.map(section => ({ ...section, entries: section.entries.filter(entry => !entry.fact_ids.some(id => replaced.has(id))) }));
  for (const incoming of draft.body.sections) {
    const section = sections.find(section => section.kind === incoming.kind);
    if (section) section.entries.unshift(...incoming.entries);
    else sections.push({ ...incoming, entries: [...incoming.entries] });
  }
  return { header, body: { summary: draft.body.summary.text ? draft.body.summary : base.summary, sections: sections.filter(section => section.entries.length) }, sourceText: "" };
}

/** 停止、失败、重试或后续模型步骤都不能复活旧的生成片段。 */
export function currentResumeDraft(events: AgentEvent[], run: AgentRun | undefined, state: ResumeState | null): ResumeLiveDraft | null {
  if (!state?.pending || state.pending.kind !== "rewrite" || run?.status !== "running") return null;
  for (let index = events.length - 1; index >= 0; index--) {
    const event = events[index];
    if (event.run_id !== run.id) continue;
    if (["model.started", "model.failed", "run.retry"].includes(event.kind)) return null;
    if (event.kind === "tool.finished" && event.data.name === "propose_resume_update" && event.data.ok === false) return null;
    if (event.kind === "resume.preview") {
      const draft = event.data.draft as ResumeLiveDraft | undefined;
      return draft?.request_id === state.pending.id && draft.context_version === state.context_version ? draft : null;
    }
  }
  return null;
}
