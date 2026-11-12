/** 青穗集 · 工具执行记录投影：共享待执行判定与停滞检测，避免重复执行或无限循环。 */
import { createHash } from "node:crypto";
import type { Message, ToolCall } from "../types.js";
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]));
  return value;
}
function signature(call: ToolCall) {
  try { return call.name + ":" + JSON.stringify(canonical(JSON.parse(call.arguments))); }
  catch { return call.name + ":" + call.arguments; }
}
export function pendingTools(messages: Message[], runId: string): ToolCall[] {
  const current = messages.filter(message => message.run_id === runId);
  const done = new Set(current.filter(message => message.role === "tool").map(message => message.tool_call_id));
  const seen = new Set<string>();
  return current.flatMap(message => message.tool_calls ?? []).filter(call => {
    if (done.has(call.id) || seen.has(call.id)) return false;
    seen.add(call.id); return true;
  });
}
export function toolIsStalled(messages: Message[], runId: string, call: ToolCall): boolean {
  const current = messages.filter(message => message.run_id === runId);
  const calls = current.flatMap(message => message.tool_calls ?? []);
  const expected = signature(call);
  // 仅在连续三次相同请求得到相同结果时停止；已变化的上下文、输出或参数会重置计数。
  const replies = current.filter(message => message.role === "tool").slice(-3);
  if (replies.length < 3) return false;
  const outcomes = replies.map(message => ({
    call: calls.find(item => item.id === message.tool_call_id),
    hash: createHash("sha256").update(message.content).digest("hex"),
  }));
  return outcomes.every(item => item.call && signature(item.call) === expected && item.hash === outcomes[0].hash);
}
