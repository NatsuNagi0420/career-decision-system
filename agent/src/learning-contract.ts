/** 青穗集 · 岗位学习契约：路线草稿、章节进度与真实外部资源；学习记录不等于能力认证。 */
import { z } from "zod";

const text = (max: number) => z.string().trim().min(1).max(max);
const key = text(60).regex(/^[a-z][a-z0-9_-]*$/);
export const learningNodeInput = z.object({
  key, title: text(120), requirement: text(1000), objective: text(1000),
  estimated_minutes: z.number().int().min(5).max(2400),
  prerequisites: z.array(key).max(12), search_query: text(120),
  exercise: text(1600), deliverable: text(1000),
}).strict();
export const learningPathInput = z.object({
  job_id: z.string().uuid(), title: text(160), summary: text(1200),
  nodes: z.array(learningNodeInput).min(1).max(12),
}).strict();
export const learningProposalInput = z.object({
  revision: z.number().int().nonnegative(), context_version: z.number().int().nonnegative(),
  path_id: z.string().uuid().nullable().default(null), path: learningPathInput,
}).strict();
export const learningSearchInput = z.object({ query: text(120) }).strict();
export const learningChangeInput = z.object({
  revision: z.number().int().nonnegative(),
  change: z.discriminatedUnion("type", [
    z.object({ type: z.literal("proposal.decide"), id: z.string().uuid(), approved: z.boolean() }).strict(),
    z.object({ type: z.literal("path.select"), id: z.string().uuid() }).strict(),
    z.object({ type: z.literal("path.delete"), id: z.string().uuid() }).strict(),
    z.object({ type: z.literal("node.update"), path_id: z.string().uuid(), key,
      status: z.enum(["todo", "doing", "done", "skipped"]), notes: z.string().trim().max(6000), result: z.string().trim().max(6000),
    }).strict(),
    z.object({ type: z.literal("resource.attach"), path_id: z.string().uuid(), key, resource_id: text(40) }).strict(),
    z.object({ type: z.literal("resource.remove"), path_id: z.string().uuid(), key, resource_id: text(40) }).strict(),
  ]),
}).strict();
export interface LearningResource {
  id: string; bvid: string; title: string; author: string; duration: string;
  cover?: string; views?: number; description?: string;
  url: string; query: string; fetched_at: string;
}
export interface LearningSearchResult {
  query: string; status: "available" | "unavailable" | "empty";
  resources: LearningResource[]; search_url: string; message: string;
}
export interface LearningCaption { start: number; end: number; text: string }
export interface LearningSubtitleTrack { language: string; label: string; captions: LearningCaption[] }
export interface LearningSubtitleResult {
  status: "available" | "login_required" | "no_subtitles" | "unavailable";
  tracks: LearningSubtitleTrack[]; message: string;
}
export type LearningNodeInput = z.infer<typeof learningNodeInput>;
export type LearningPathInput = z.infer<typeof learningPathInput>;
export interface LearningNode extends LearningNodeInput {
  status: "todo" | "doing" | "done" | "skipped"; notes: string; result: string;
  resources: LearningResource[]; updated_at: string | null;
}
export interface LearningPath extends Omit<LearningPathInput, "nodes"> {
  id: string; nodes: LearningNode[]; created_at: string; updated_at: string;
}
export interface LearningProposal {
  id: string; conversation_id: string; path_id: string | null; path: LearningPathInput;
  basis: string; created_at: string; stale?: boolean;
}
export interface LearningState {
  revision: number; active_path_id: string | null; paths: LearningPath[];
  proposal: LearningProposal | null; updated_at: string | null;
}
export type LearningChange = z.infer<typeof learningChangeInput>["change"];
