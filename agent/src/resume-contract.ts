/** 青穗集 · 简历工坊数据约定：前后端共享纯类型，原文、待确认事实、岗位取舍和交付稿相互分离。 */
export type ResumeStep = "materials" | "facts" | "selection" | "editor" | "preview";
export type ResumeTaskKind = "facts" | "selection" | "rewrite";
export type ResumeFactKind = "education" | "experience" | "projects" | "skills";
export interface ResumeTarget { title: string; company: string; description: string }
export interface ResumeFact { id: string; kind: ResumeFactKind; title: string; detail: string; quote: string; user_edited: boolean }
export interface ResumeRequirement { quote: string; importance: "essential" | "preferred"; status: "supported" | "partial" | "unknown"; fact_ids: string[]; note: string }
export interface ResumeChoice { fact_id: string; use: "primary" | "secondary" | "omit"; reason: string }
export interface ResumeSelection { requirements: ResumeRequirement[]; choices: ResumeChoice[] }
export interface ResumeEntry { title: string; subtitle: string; period: string; fact_ids: string[]; bullets: string[] }
export interface ResumeBody { summary: { text: string; fact_ids: string[] }; sections: { kind: ResumeFactKind; entries: ResumeEntry[] }[] }
export interface ResumeHeader { name: string; headline: string; contact: string }
export interface ResumeState {
  revision: number; context_version: number; updated_at: string | null; step: ResumeStep;
  source_text: string; source_name: string; target: ResumeTarget;
  facts: ResumeFact[]; facts_confirmed: boolean; questions: string[];
  selection: ResumeSelection | null; selection_confirmed: boolean;
  header: ResumeHeader; body: ResumeBody | null; confirmed_at: string | null;
  pending: { id: string; kind: ResumeTaskKind } | null;
}
export type ResumeChange =
  | { type: "materials.save"; source_text: string; source_name: string; target: ResumeTarget }
  | { type: "task.request"; kind: ResumeTaskKind }
  | { type: "task.cancel" }
  | { type: "facts.confirm"; facts: ResumeFact[] }
  | { type: "selection.confirm"; choices: ResumeChoice[] }
  | { type: "document.save"; header: ResumeHeader; body: ResumeBody }
  | { type: "document.confirm" };

export function emptyResumeState(): ResumeState {
  return { revision: 0, context_version: 0, updated_at: null, step: "materials", source_text: "", source_name: "", target: { title: "", company: "", description: "" }, facts: [], facts_confirmed: false, questions: [], selection: null, selection_confirmed: false, header: { name: "", headline: "", contact: "" }, body: null, confirmed_at: null, pending: null };
}
