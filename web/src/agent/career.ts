/** 青穗集 · 职业工作台契约：区分用户确认内容、模型草稿与材料来源，不计算职业适合度。 */
import type { CatalogueSelection, JobSampleOrigin } from "../../../agent/src/job-catalogue-contract";
import type { CareerSkill } from "../../../agent/src/career-skills";
export interface SavedCareerJob { catalogue_id: string; created_at: string; title: string; company: string; city: string; available: boolean }
export type CareerTab = "profile" | "jobs" | "actions" | "files";
export const CAREER_TABS = [
  { id: "profile", label: "职业档案", icon: "notes", description: "整理做过的事" },
  { id: "jobs", label: "方向与岗位", icon: "compass", description: "对照真实要求" },
  { id: "actions", label: "成长行动", icon: "plan", description: "把下一步做出来" },
  { id: "files", label: "简历与文件", icon: "folder", description: "留住每一份成果" },
] as const;
export interface CareerProfileInput {
  goal: string; education: string; experience: string; skills: string; preferences: string; weekly_hours: string;
}
export const EMPTY_CAREER_PROFILE: CareerProfileInput = { goal: "", education: "", experience: "", skills: "", preferences: "", weekly_hours: "" };
export const PROFILE_FIELDS = [
  { key: "goal", label: "这段时间想解决什么", placeholder: "例如：寻找第一份前端实习，或先比较两个方向", max: 400, rows: 2 },
  { key: "education", label: "学习与工作背景", placeholder: "专业、所处阶段，以及相关的工作或学习经历", max: 2000, rows: 2 },
  { key: "experience", label: "做过的项目与真实经历", placeholder: "你做了什么、负责哪一部分、留下了什么成果。暂时没有数字也没关系。", max: 6000, rows: 5 },
  { key: "skills", label: "已有技能与依据", placeholder: "会什么？在哪件事里用过？仍在学习的内容可以注明。", max: 2000, rows: 3 },
  { key: "preferences", label: "偏好与现实约束", placeholder: "城市、工作方式、时间、预算，或你希望避开的情况", max: 2000, rows: 2 },
  { key: "weekly_hours", label: "每周可用于学习和实践的时间", placeholder: "例如：工作日晚上，每周约 6 小时", max: 120, rows: 1 },
] as const;
export interface CareerJobInput { title: string; company: string; url: string; description: string }
export interface CareerJob extends CareerJobInput { id: string; created_at: string; catalogue?: JobSampleOrigin }
export interface CareerActionInput { title: string; job_id: string | null; why: string; learn: string; deliverable: string }
export interface CareerAction extends CareerActionInput { id: string; status: "todo" | "doing" | "done"; result: string; created_at: string; updated_at: string }
export interface CareerCheck {
  requirement: string; assessment: "supported" | "partial" | "unknown" | "conflict";
  reason: string; evidence: { source_id: string; quote: string }[];
}
export type CareerProposalData =
  | { kind: "skills"; skills: Omit<CareerSkill, "confirmed_at">[] }
  | { kind: "catalogue_job"; catalogue_id: string }
  | { kind: "profile"; profile: CareerProfileInput }
  | { kind: "actions"; actions: CareerActionInput[] }
  | { kind: "comparison"; job_id: string; summary: string; checks: CareerCheck[] };
export interface CareerProposal { id: string; title: string; context_version: number; data: CareerProposalData; created_at: string; conversation_id: string; catalogue_sample?: CatalogueSelection; stale?: boolean; stale_reason?: string }
export interface CareerComparison { kind: "comparison"; job_id: string; summary: string; checks: CareerCheck[]; fingerprint: string; confirmed_at: string; stale: boolean }
export interface CareerState {
  skills?: CareerSkill[]; saved_jobs?: SavedCareerJob[];
  revision: number; context_version: number; updated_at: string | null;
  profile: CareerProfileInput & { confirmed_at: string | null };
  jobs: CareerJob[]; actions: CareerAction[]; comparisons: CareerComparison[]; proposals: CareerProposal[];
  sources: { id: string; kind: string; text: string }[];
}
export type CareerChange =
  | { type: "catalogue.save"; catalogue_id: string; saved: boolean }
  | { type: "profile.save"; profile: CareerProfileInput }
  | { type: "job.add"; job: CareerJobInput }
  | { type: "job.delete"; id: string }
  | { type: "action.add"; action: CareerActionInput }
  | { type: "action.update"; id: string; status: CareerAction["status"]; result: string }
  | { type: "action.delete"; id: string }
  | { type: "proposal.decide"; id: string; approved: boolean };
export const ASSESSMENT_LABEL = { supported: "有材料支持", partial: "部分有依据", unknown: "材料不足", conflict: "存在冲突" };
export const ACTION_LABEL = { todo: "待开始", doing: "进行中", done: "已提交结果" };
export function sourceLabel(state: CareerState, sourceId: string) {
  if (sourceId.startsWith("profile.")) return "职业档案 · " + (PROFILE_FIELDS.find(f => f.key === sourceId.slice(8))?.label ?? "用户材料");
  if (sourceId.startsWith("action.")) return "行动结果 · " + (state.actions.find(a => a.id === sourceId.slice(7))?.title ?? "历史材料");
  return "已引用材料";
}
export function careerPrompt(tab: CareerTab, job?: CareerJob): string {
  const start = "请先读取我的职业工作台。";
  if (tab === "profile") return start + "我想梳理职业档案。请结合我接下来提供的经历，一次只问一两个关键问题，不编造事实。信息足够后，把整理的档案草稿放到工作台，等待我确认。";
  if (tab === "jobs") return start + (job ? "请对照岗位「" + job.title + "」" + (job.company ? "（" + job.company + "）" : "") + "的原始要求与已确认经历，" : "请帮我比较已保存岗位与已确认经历，") + "区分有依据、部分依据、材料不足和冲突，引用岗位原文和个人材料，整理成工作台上的待确认分析。没有资料就先追问，不生成适合度分数。";
  if (tab === "actions") return start + "请基于我的目标、岗位要求、已有经历和可用时间，安排少量可开始的学习与实践行动，说明学习内容、原因和完成材料。把行动建议放到工作台，等我确认。若已有新行动结果，请先说明哪些旧判断需要更新。";
  return start + "我想制作或优化简历。请先确认目标岗位和真实经历；使用当前对话导入的资料，不能编造成果。需要补充时先问我，完成后真实创建并发布可预览的文件。";
}

// 服务端按资料依赖判定冲突；兼容尚未返回审查结果的旧状态。
export function careerProposalStale(proposal: CareerProposal, state: CareerState): boolean {
  return proposal.stale ?? (proposal.context_version !== state.context_version);
}
