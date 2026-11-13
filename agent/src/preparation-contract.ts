/** 青穗集 · 岗位决策、练习、试卷与文字面试共享契约，练习表现独立于正式画像。 */
import { z } from "zod";

const text = (max: number) => z.string().trim().min(1).max(max);
const uuid = z.string().uuid();
export const preparationMode = z.enum(["practice", "exam", "interview"]);
export type PreparationMode = z.infer<typeof preparationMode>;
export const PREPARATION_LABELS: Record<PreparationMode, string> = { practice: "岗位练习", exam: "模拟试卷", interview: "模拟面试" };
const citation = z.object({ source_id: text(120), quote: text(1000) }).strict();
export const decisionBoardInput = z.object({
  revision: z.number().int().nonnegative(), context_version: z.number().int().nonnegative(), title: text(120),
  options: z.array(z.object({ job_id: uuid, attraction: text(800), preparation_cost: text(800),
    tradeoff: text(800), unknowns: z.array(text(300)).min(1).max(4), evidence: z.array(citation).min(1).max(5) }).strict()).min(2).max(3),
  next_question: text(400),
}).strict();
export type DecisionBoard = Omit<z.infer<typeof decisionBoardInput>, "revision" | "context_version"> & {
  id: string; conversation_id: string; source_run_id: string; basis: string; created_at: string; stale?: boolean;
  primary_job_id: string | null; backup_job_ids: string[]; reason: string;
};
export const generatedQuestionInput = z.object({ prompt: text(2400), topic: text(120),
  requirement: text(1000), rubric: z.array(text(600)).min(1).max(5), reference_answer: text(3000) }).strict();
export interface Question extends z.infer<typeof generatedQuestionInput> {
  id: string; origin: "curated" | "generated"; source_title: string; source_url: string | null;
}
export interface PublicQuestion extends Omit<Question, "rubric" | "reference_answer"> {
  rubric?: string[]; reference_answer?: string;
}
export const startPreparationInput = z.object({
  revision: z.number().int().nonnegative(), job_id: uuid, mode: preparationMode,
  background: text(1200), focus: z.array(text(120)).min(1).max(6),
  total: z.number().int().min(1).max(8),
  bank_ids: z.array(text(100)).max(8), questions: z.array(generatedQuestionInput).max(8),
}).strict();
export const reviewPreparationInput = z.object({
  session_id: uuid, question_id: uuid, answer_quote: text(16000),
  verdict: z.enum(["solid", "partial", "needs_practice"]),
  strengths: z.array(text(400)).max(4), gaps: z.array(text(400)).max(4),
  next_exercise: text(600), followup: generatedQuestionInput.nullable(),
}).strict();
export interface PreparationAnswer {
  question_id: string; run_id: string; message_id: string; text: string; created_at: string;
  verdict: "solid" | "partial" | "needs_practice"; strengths: string[]; gaps: string[]; next_exercise: string;
}
export interface PreparationSession {
  id: string; conversation_id: string; job_id: string; job_title: string; mode: PreparationMode;
  job_description: string;
  status: "active" | "paused" | "completed"; background: string; focus: string[]; total: number;
  questions: Question[]; answers: PreparationAnswer[]; created_at: string; updated_at: string;
  start_run_id: string; context_version: number; stale?: boolean;
}
export interface PublicPreparationSession extends Omit<PreparationSession, "questions" | "answers"> {
  questions: PublicQuestion[];
  answers: (Omit<PreparationAnswer, "verdict" | "strengths" | "gaps" | "next_exercise"> & Partial<Pick<PreparationAnswer, "verdict" | "strengths" | "gaps" | "next_exercise">>)[];
}
export interface PreparationState { revision: number; boards: DecisionBoard[]; sessions: PublicPreparationSession[] }
export const preparationChangeInput = z.object({ revision: z.number().int().nonnegative(), change: z.discriminatedUnion("type", [
  z.object({ type: z.literal("decision.select"), id: uuid, primary_job_id: uuid.nullable(), backup_job_ids: z.array(uuid).max(2), reason: z.string().trim().max(1000) }).strict(),
  z.object({ type: z.literal("session.status"), id: uuid, status: z.enum(["active", "paused", "completed"]) }).strict(),
]) }).strict();
export type PreparationChange = z.infer<typeof preparationChangeInput>["change"];
