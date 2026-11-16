/** 青穗集 · 学习与训练接口：复用现有云端契约，电脑资料不写入云端。 */
import { request } from "./api";

export interface LearningResource { id: string; bvid: string; title: string; author: string; duration: string; url: string }
export interface LearningNode {
  key: string; title: string; requirement: string; objective: string; estimated_minutes: number;
  prerequisites: string[]; search_query: string; exercise: string; deliverable: string;
  status: "todo" | "doing" | "done" | "skipped"; notes: string; result: string;
  resources: LearningResource[]; updated_at: string | null;
}
export interface LearningPath { id: string; job_id: string; title: string; summary: string; nodes: LearningNode[]; created_at: string; updated_at: string }
export interface LearningState {
  revision: number; active_path_id: string | null; paths: LearningPath[];
  proposal: { id: string; conversation_id: string; path_id: string | null; path: Omit<LearningPath, "id" | "created_at" | "updated_at">; stale?: boolean } | null;
  updated_at: string | null;
}
export type LearningChange =
  | { type: "proposal.decide"; id: string; approved: boolean }
  | { type: "path.select" | "path.delete"; id: string }
  | { type: "node.update"; path_id: string; key: string; status: LearningNode["status"]; notes: string; result: string }
  | { type: "resource.attach" | "resource.remove"; path_id: string; key: string; resource_id: string };
export type PreparationMode = "practice" | "exam" | "interview";
export const preparationLabels: Record<PreparationMode, string> = { practice: "岗位练习", exam: "模拟试卷", interview: "模拟面试" };
export interface PreparationQuestion {
  id: string; prompt: string; topic: string; requirement: string; origin: "curated" | "generated";
  source_title: string; source_url: string | null; rubric?: string[]; reference_answer?: string;
}
export interface PreparationAnswer {
  question_id: string; text: string; created_at: string; verdict?: "solid" | "partial" | "needs_practice";
  strengths?: string[]; gaps?: string[]; next_exercise?: string;
}
export interface PreparationSession {
  id: string; conversation_id: string; job_id: string; job_title: string; mode: PreparationMode;
  status: "active" | "paused" | "completed"; focus: string[]; total: number;
  questions: PreparationQuestion[]; answers: PreparationAnswer[]; created_at: string; updated_at: string; stale?: boolean;
}
export interface DecisionBoard {
  id: string; title: string; conversation_id: string; stale?: boolean;
  options: Array<{ job_id: string; attraction: string; preparation_cost: string; tradeoff: string; unknowns: string[]; evidence: Array<{ source_id: string; quote: string }> }>;
  next_question: string; primary_job_id: string | null; backup_job_ids: string[]; reason: string;
}
export interface PreparationState { revision: number; boards: DecisionBoard[]; sessions: PreparationSession[] }
export type PreparationChange =
  | { type: "decision.select"; id: string; primary_job_id: string | null; backup_job_ids: string[]; reason: string }
  | { type: "session.status"; id: string; status: PreparationSession["status"] };
const base = "/api/v1/agent/career";
export const developmentApi = {
  learning: () => request<LearningState>(base + "/learning"),
  preparation: () => request<PreparationState>(base + "/preparation"),
  changeLearning: (revision: number, change: LearningChange) => request<LearningState>(base + "/learning/changes", { method: "POST", data: { revision, change } }),
  changePreparation: (revision: number, change: PreparationChange) => request<PreparationState>(base + "/preparation/changes", { method: "POST", data: { revision, change } }),
  questions: (query = "") => request<{ questions: PreparationQuestion[] }>(base + "/preparation/questions?query=" + encodeURIComponent(query)),
  videos: (query: string) => request<{ status: "available" | "unavailable" | "empty"; resources: LearningResource[]; message: string; search_url: string }>(base + "/learning/videos?query=" + encodeURIComponent(query)),
};
