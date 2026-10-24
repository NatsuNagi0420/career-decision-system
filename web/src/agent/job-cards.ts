/** 青穗集 · 岗位卡片投影：只读取持久化的成功工具结果，不从聊天文字猜测岗位或依赖最近事件。 */
import type { ChatMessage } from "./types";
import type { JobCatalogue } from "../../../agent/src/job-catalogue";
export type JobDetail = ReturnType<JobCatalogue["readJobSample"]>;
export interface JobCardData {
  id: string; title: string; company: string; city: string; excerpt: string;
  reference_notice: string; matched_terms: string[]; work_type: string;
}
function object(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function card(value: unknown): JobCardData | null {
  const data = object(value);
  if (typeof data.id !== "string" || !data.id || typeof data.title !== "string" || !data.title) return null;
  const text = (key: string) => typeof data[key] === "string" ? data[key] as string : "";
  return { id: text("id"), title: text("title"), company: text("company"), city: text("city"),
    excerpt: text("excerpt") || text("description").slice(0, 420), reference_notice: text("reference_notice") || "岗位参考 · 当前招聘状态待核实",
    work_type: text("work_type"), matched_terms: Array.isArray(data.matched_terms) ? data.matched_terms.filter((item): item is string => typeof item === "string").slice(0, 5) : [] };
}
export function jobsByRun(messages: ChatMessage[]): Map<string, JobCardData[]> {
  const names = new Map<string, string>();
  for (const message of messages) for (const call of message.tool_calls ?? []) names.set(message.run_id + ":" + call.id, call.name);
  const groups = new Map<string, Map<string, JobCardData>>();
  for (const message of messages) {
    if (message.role !== "tool" || !message.run_id || !message.tool_call_id) continue;
    const name = names.get(message.run_id + ":" + message.tool_call_id);
    if (name !== "search_job_samples" && name !== "read_job_sample") continue;
    try {
      const envelope = object(JSON.parse(message.content));
      if (envelope.ok !== true) continue;
      const result = object(envelope.result);
      const items = name === "read_job_sample" ? [result.sample] : Array.isArray(result.samples) ? result.samples : [];
      const group = groups.get(message.run_id) ?? new Map<string, JobCardData>();
      for (const item of items) { const parsed = card(item); if (parsed) group.set(parsed.id, { ...parsed, matched_terms: parsed.matched_terms.length ? parsed.matched_terms : group.get(parsed.id)?.matched_terms ?? [] }); }
      if (group.size) groups.set(message.run_id, group);
    } catch { /* 损坏或失败结果不产生卡片。 */ }
  }
  return new Map([...groups].map(([id, group]) => [id, [...group.values()].slice(0, 5)]));
}
export const WORK_TYPE_LABEL: Record<string, string> = { campus: "校招", internship: "实习", experienced: "社会招聘" };
export function jobPrompt(job: Pick<JobCardData, "id" | "title">, kind: "compare" | "direction" | "action") {
  const start = "请读取岗位库样本 " + job.id + "（" + job.title + "）的完整原文，";
  if (kind === "direction") return start + "和我讨论它对应的职业方向。结合我的想法提出一个范围明确的画像更新草稿，等我确认；不要将岗位要求当作我已经掌握的技能。";
  if (kind === "action") return start + "结合我的真实经历，提出一个最值得先做的小行动，写明预期产出，等我确认后再加入成长行动。";
  return start + "结合我已提供的真实经历逐项对照，区分有依据、待了解和明确门槛冲突。不要给匹配百分比，也不要把缺材料当作不会。需要保存时先提出待确认草稿。";
}
