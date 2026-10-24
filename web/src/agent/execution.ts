/** 青穗集 · 执行记录归一化：合并持久消息与实时事件，展示真实命令、文件及结果，不推断模型内部思维。 */
import type { AgentEvent, AgentRun, ChatMessage, ToolCall } from "./types";
export type ExecutionStatus = "pending" | "running" | "completed" | "failed" | "waiting" | "stopped" | "skipped" | "unknown";
export interface ExecutionRecord {
  key: string;
  runId: string;
  call: ToolCall;
  args: Record<string, unknown>;
  status: ExecutionStatus;
  requestedAt: string;
  startedAt?: string;
  finishedAt?: string;
  durationMs?: number;
  result?: unknown;
  error?: string;
  exitCode?: number;
}
export interface PlanStep { title: string; status: "pending" | "working" | "done" }
const LABELS: Record<string, string> = {
  list_files: "查看文件", read_file: "读取文件", write_file: "写入文件", publish_file: "保存文件版本",
  search_files: "搜索文件", plan_tasks: "更新计划", ask_user: "补充信息", request_export: "申请下载", run_command: "执行命令",
  read_resume_context: "读取简历材料", propose_resume_update: "整理简历草稿",
  list_career_directions: "查看职业方向", search_job_samples: "查找岗位样本", read_job_sample: "读取岗位原文",
  read_career_context: "读取职业工作台", propose_career_update: "整理待确认建议",
};
export const EXECUTION_STATUS: Record<ExecutionStatus, string> = {
  pending: "待执行", running: "执行中", completed: "已完成", failed: "失败", waiting: "等待确认",
  stopped: "已停止", skipped: "未执行", unknown: "待核实",
};
export function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
export function parseArguments(value: string): Record<string, unknown> {
  try { return object(JSON.parse(value)); } catch { return {}; }
}
function json(value: string): unknown { try { return JSON.parse(value); } catch { return value; } }
function toolCall(value: unknown): ToolCall | undefined {
  const call = object(value);
  return typeof call.id === "string" && typeof call.name === "string" && typeof call.arguments === "string" ? call as unknown as ToolCall : undefined;
}
/** 以 run_id + call_id 关联，避免历史轮次串线；事件滚动后仍从持久工具消息恢复结果。 */
export function executionRecords(messages: ChatMessage[], events: AgentEvent[], runs: AgentRun[]): ExecutionRecord[] {
  const calls = new Map<string, { runId: string; call: ToolCall; requestedAt: string; start?: AgentEvent; finish?: AgentEvent; reply?: ChatMessage }>();
  const key = (run: string, call: string) => run + ":" + call;
  for (const message of messages) {
    if (!message.run_id) continue;
    for (const call of message.tool_calls ?? []) {
      calls.set(key(message.run_id, call.id), { runId: message.run_id, call, requestedAt: message.created_at });
    }
  }
  for (const event of events) {
    if (!event.run_id || event.kind !== "tool.started") continue;
    const call = toolCall(event.data.call);
    if (!call) continue;
    const id = key(event.run_id, call.id);
    const current = calls.get(id) ?? { runId: event.run_id, call, requestedAt: event.created_at };
    calls.set(id, { ...current, call, start: event });
  }
  for (const message of messages) {
    if (!message.run_id || message.role !== "tool" || !message.tool_call_id) continue;
    const current = calls.get(key(message.run_id, message.tool_call_id));
    if (current) current.reply = message;
  }
  for (const event of events) {
    if (!event.run_id || event.kind !== "tool.finished" || typeof event.data.call_id !== "string") continue;
    const current = calls.get(key(event.run_id, event.data.call_id));
    if (current) current.finish = event;
  }
  const runMap = new Map(runs.map(run => [run.id, run]));
  return [...calls.entries()].map(([id, item]): ExecutionRecord => {
    const run = runMap.get(item.runId), args = parseArguments(item.call.arguments);
    const saved = item.reply ? json(item.reply.content) : undefined;
    const envelope = item.finish?.data ?? object(saved);
    let result: unknown = envelope.result;
    if (!("result" in envelope) && item.reply && (typeof saved === "string" || item.call.name === "request_export")) result = saved;
    const value = object(result);
    const error = envelope.error === undefined ? undefined : typeof envelope.error === "string" ? envelope.error : JSON.stringify(envelope.error);
    const exitCode = typeof value.exit_code === "number" ? value.exit_code : undefined;
    const ended = Boolean(item.finish || item.reply);
    const cleanup = Boolean(error && /用户已停止|服务重启|本轮已中断|尚未执行|后续工具/.test(error));
    let status: ExecutionStatus;
    // 清理消息可能同时用于已经开始和未开始的调用；历史开始事件缺失时不能声称“未执行”。
    if (cleanup) status = !item.start && error === "已向用户追问，后续工具尚未执行。" ? "skipped" : item.start ? "stopped" : "unknown";
    else if (value.approval_status === "rejected" || value.approval_status === "expired" || (item.call.name === "request_export" && envelope.ok === false && !error)) status = "stopped";
    else if (ended && (envelope.ok === false || error || (exitCode !== undefined && exitCode !== 0))) status = "failed";
    else if (ended && (envelope.ok === true || exitCode === 0)) status = "completed";
    else if (ended) status = "unknown";
    else if (run?.status === "awaiting_approval" && item.call.name === "request_export" && item.start) status = "waiting";
    else if (run && ["cancelled", "interrupted", "failed"].includes(run.status)) status = item.start ? "stopped" : "unknown";
    else if (run && ["queued", "running", "awaiting_approval"].includes(run.status)) status = item.start ? "running" : "pending";
    else status = "unknown";
    const finishedAt = item.finish?.created_at ?? item.reply?.created_at;
    const elapsed = item.start && finishedAt ? Date.parse(finishedAt) - Date.parse(item.start.created_at) : undefined;
    const durationMs = typeof value.duration_ms === "number" ? value.duration_ms : elapsed;
    return { key: id, runId: item.runId, call: item.call, args, status, requestedAt: item.requestedAt, startedAt: item.start?.created_at,
      finishedAt, durationMs: durationMs !== undefined && Number.isFinite(durationMs) ? Math.max(0, durationMs) : undefined, result, error, exitCode };
  }).sort((a, b) => a.requestedAt.localeCompare(b.requestedAt));
}
export function executionLabel(record: ExecutionRecord): string { return LABELS[record.call.name] ?? record.call.name; }
export function executionTarget(record: ExecutionRecord): string {
  const { args, call } = record;
  if (call.name === "run_command") return typeof args.command === "string" ? args.command : "命令参数不可用";
  if (["read_file", "write_file", "publish_file"].includes(call.name)) return typeof args.path === "string" ? args.path : "文件路径不可用";
  if (call.name === "search_files") return typeof args.query === "string" ? args.query : "搜索内容不可用";
  if (call.name === "ask_user") return typeof args.question === "string" ? args.question : "等待补充信息";
  if (call.name === "plan_tasks") return Array.isArray(args.steps) ? args.steps.length + " 个步骤" : "任务计划";
  if (call.name === "list_files") return "当前对话工作区";
  if (call.name === "request_export") return "当前文件版本";
  return call.name;
}
export function executionSummary(record: ExecutionRecord): string {
  if (record.exitCode !== undefined) return "退出码 " + record.exitCode;
  if (record.status === "failed") return record.error?.split("\n")[0] || "工具返回错误";
  if (record.status !== "completed") return EXECUTION_STATUS[record.status];
  const value = object(record.result);
  if (Array.isArray(record.result)) return record.result.length + (record.call.name === "search_files" ? " 个匹配" : " 个文件");
  if (typeof value.text === "string") return "已读取 " + value.text.length.toLocaleString() + " 字符";
  const artifact = object(value.artifact);
  if (typeof artifact.version === "number") return "已保存 · v" + artifact.version;
  return "已完成";
}
export function executionPlan(records: ExecutionRecord[], events: AgentEvent[]): PlanStep[] {
  const candidate = [...records].reverse().find(record => record.call.name === "plan_tasks" && record.status === "completed");
  const event = events.filter(item => item.kind === "plan.updated").at(-1);
  const value = event && (!candidate || event.created_at >= (candidate.finishedAt ?? candidate.requestedAt)) ? object(event.data.plan) : object(candidate?.result);
  return Array.isArray(value.steps) ? value.steps.flatMap(step => {
    const item = object(step);
    return typeof item.title === "string" && ["pending", "working", "done"].includes(String(item.status)) ? [{ title: item.title, status: item.status as PlanStep["status"] }] : [];
  }) : [];
}
export function formatDuration(ms: number): string {
  if (ms < 1000) return Math.round(ms) + " ms";
  const seconds = ms / 1000;
  if (seconds < 60) return (seconds < 10 ? seconds.toFixed(1) : Math.floor(seconds)) + " 秒";
  return Math.floor(seconds / 60) + " 分 " + Math.floor(seconds % 60) + " 秒";
}
export function runDuration(run: AgentRun, now = Date.now()): string {
  const end = ["queued", "running", "awaiting_approval"].includes(run.status) ? now : Date.parse(run.updated_at);
  const elapsed = end - Date.parse(run.created_at);
  return Number.isFinite(elapsed) ? formatDuration(Math.max(0, elapsed)) : "—";
}
export function pretty(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value, null, 2) ?? "";
}
