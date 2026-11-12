/** 青穗集 · 职业判断共享契约：带出处的候选、岗位依据与简历检查；概率不作为能力认证。 */
import { z } from "zod";
export const DECISION_TEMPLATE_VERSION = "career-evidence-v1";
export const DECISION_POLICY_VERSION = "candidate-only-v1";
export const PROFILE_KEYS = ["goal", "education", "experience", "skills", "preferences", "weekly_hours"] as const;
const text = (max: number) => z.string().trim().min(1).max(max);
export const decisionEvidenceSchema = z.object({ source_id: text(120), quote: text(2200) }).strict();
export const candidateFactSchema = z.object({ field: z.enum(PROFILE_KEYS), text: text(1200), evidence: z.array(decisionEvidenceSchema).min(1).max(3) }).strict();
export const followUpCandidateSchema = z.object({ id: text(80), question: text(180), purpose: text(240) }).strict();
const personal = z.array(z.object({ id: text(120), text: text(2200), kind: z.enum(["self_report", "confirmed", "result", "plan"]) }).strict()).max(20);
export const decisionTaskSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("turn_review"), facts: z.array(candidateFactSchema.extend({ id: text(80) })).max(8),
    previous: z.record(z.string(), z.string().max(6000)), followups: z.array(followUpCandidateSchema).max(3) }).strict(),
  z.object({ kind: z.literal("job_match"), personal, preferences: z.string().max(2000),
    jobs: z.array(z.object({ id: text(80), title: text(120), conditions: z.record(z.string(), z.string().max(400)).optional(), requirements: z.array(z.object({ id: text(80), text: text(1000), importance: z.enum(["essential", "preferred"]) }).strict()).min(1).max(5) }).strict()).min(1).max(3) }).strict(),
  z.object({ kind: z.literal("resume_guard"), claims: z.array(z.object({ id: text(120), text: text(2200), evidence: z.array(decisionEvidenceSchema).max(16) }).strict()).min(1).max(20) }).strict(),
]);
export type DecisionTask = z.infer<typeof decisionTaskSchema>;
export type CandidateFactInput = z.infer<typeof candidateFactSchema>;
export type FollowUpCandidate = z.infer<typeof followUpCandidateSchema>;
export const factAssessmentSchema = z.object({ id: z.string(), category: z.enum(["actual", "plan", "preference", "constraint", "unknown"]),
  support: z.enum(["supported", "partial", "unsupported"]), conflict: z.boolean() });
export const jobAssessmentSchema = z.object({ id: z.string(), checks: z.array(z.object({ requirement: z.string(), importance: z.enum(["essential", "preferred"]),
  assessment: z.enum(["supported", "partial", "unknown", "conflict"]), evidence: z.array(decisionEvidenceSchema),
  reason: z.string() })), preference: z.enum(["aligned", "conflict", "unknown"]),
  support_count: z.number().int().nonnegative(), unknown_count: z.number().int().nonnegative(),
  label: z.enum(["supported", "developing", "explore", "conflict"]), rank: z.number().int().nonnegative() });
export const decisionResultSchema = z.object({ kind: z.enum(["turn_review", "job_match", "resume_guard"]), template_version: z.string(), policy_version: z.string(),
  model: z.string(), question_count: z.number().int().nonnegative(), duration_ms: z.number().nonnegative(),
  facts: z.array(factAssessmentSchema), jobs: z.array(jobAssessmentSchema), follow_up: followUpCandidateSchema.nullable(),
  claims: z.array(z.object({ id: z.string(), status: z.enum(["supported", "exceeds", "unknown", "conflict"]) })),
  usage: z.object({ input_tokens: z.number().int().nonnegative(), output_tokens: z.number().int().nonnegative() }).optional(),
  trace: z.object({ questions: z.record(z.string(), z.unknown()), answers: z.record(z.string(), z.unknown()) }),
}).strict();
export type DecisionResult = z.infer<typeof decisionResultSchema>;
export type JobAssessment = z.infer<typeof jobAssessmentSchema> & { updated_at: string; stale: boolean };
export interface CareerFactCandidate extends CandidateFactInput {
  id: string; conversation_id: string; created_at: string; category: z.infer<typeof factAssessmentSchema>["category"];
  support: "supported" | "partial" | "unsupported" | "unchecked"; conflict: boolean;
  status: "pending" | "confirmed" | "dismissed"; confirmable: boolean; stale: boolean;
}
export interface ResumeEvidenceReview { status: "checked" | "needs_review" | "partial" | "unavailable"; updated_at: string;
  scope: "document" | "changes"; checked_count: number; total_count: number;
  issues: { field_id: string; text: string; reason: string }[]; stale: boolean }
export interface CareerDecisionView {
  facts: CareerFactCandidate[]; jobs: JobAssessment[];
  follow_up: (FollowUpCandidate & { conversation_id: string; updated_at: string }) | null;
  activity: { phase: "reading" | "judging" | "matching" | "ready" | "unavailable"; conversation_id: string; updated_at: string; message: string } | null;
}
