/** 青穗集 · 执行体验回归：真实命令、失败退出码、历史恢复、取消与审批状态以及安全的终端侧栏。 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { executionLabel, executionPlan, executionRecords, executionSummary, executionTarget, formatDuration } from "./execution";
import { ExecutionPanel } from "./ExecutionPanel";
import { RunActivity } from "./RunActivity";
import type { AgentEvent, AgentRun, ChatMessage, ToolCall } from "./types";
const time = "2026-10-22T09:00:00.000Z", end = "2026-10-22T09:00:02.000Z";
const run: AgentRun = { id: "run", status: "completed", steps: 2, input_tokens: 100, output_tokens: 200, error: null, created_at: time, updated_at: end };
const call: ToolCall = { id: "cmd", name: "run_command", arguments: JSON.stringify({ command: "Get-Content inputs/经历.md" }) };
const message = (tool: ToolCall = call, runId = "run"): ChatMessage => ({ id: "assistant-" + runId + tool.id, run_id: runId, role: "assistant", content: "", created_at: time, tool_calls: [tool] });
const resultMessage = (result: unknown, extra: Partial<ChatMessage> = {}): ChatMessage => ({ id: "tool", run_id: "run", role: "tool", tool_call_id: "cmd", content: JSON.stringify(result), created_at: end, ...extra });
const event = (kind: string, data: AgentEvent["data"], seq = 1, runId = "run"): AgentEvent => ({ seq, run_id: runId, kind, data, created_at: seq === 1 ? time : end });
const noop = () => {};
describe("执行记录归一化", () => {
  it("展示原始命令、stdout/stderr、耗时和非零退出码，而不是将返回误判为成功", () => {
    const result = { exit_code: 1, stdout: "read started", stderr: "文件不存在", duration_ms: 234 };
    const [record] = executionRecords([message(), resultMessage({ ok: true, result })], [event("tool.started", { call }), event("tool.finished", { call_id: call.id, name: call.name, ok: false, result }, 2)], [run]);
    expect(record.status).toBe("failed"); expect(record.exitCode).toBe(1); expect(record.durationMs).toBe(234);
    expect(executionTarget(record)).toBe("Get-Content inputs/经历.md"); expect(executionSummary(record)).toBe("退出码 1");
  });
  it("历史事件被裁剪后从持久消息恢复操作，不丢失命令错误", () => {
    const [record] = executionRecords([message(), resultMessage({ ok: true, result: { exit_code: 2, stdout: "", stderr: "failed" } })], [], [run]);
    expect(record.status).toBe("failed"); expect(record.exitCode).toBe(2); expect(record.startedAt).toBeUndefined();
  });
  it("按轮次和调用 ID 双重匹配，不把同名 call_id 串到其他轮次", () => {
    const records = executionRecords([message(), message(call, "older"), resultMessage({ ok: true, result: { exit_code: 0 } }), resultMessage({ ok: false, error: "older failed" }, { run_id: "older", id: "tool-older" })], [], [run, { ...run, id: "older" }]);
    expect(records.find(item => item.runId === "run")?.status).toBe("completed");
    expect(records.find(item => item.runId === "older")?.error).toBe("older failed");
  });
  it("实时开始事件无需等待持久消息即可展示命令；模型提出但未开始的调用标记为待执行", () => {
    const [running] = executionRecords([], [event("tool.started", { call })], [{ ...run, status: "running" }]);
    expect(running.status).toBe("running");
    expect(executionRecords([message()], [], [{ ...run, status: "running" }])[0].status).toBe("pending");
  });
  it("取消和服务重启不被显示成成功，也不把未执行调用算成完成", () => {
    const records = executionRecords([message(), resultMessage({ ok: false, error: "本轮已中断，尚未执行的工具不会自动重试。" })], [], [{ ...run, status: "failed" }]);
    expect(records[0].status).toBe("unknown");
    const unexecuted = executionRecords([message(), resultMessage({ ok: false, error: "已向用户追问，后续工具尚未执行。" })], [], [{ ...run, status: "waiting_input" }]);
    expect(unexecuted[0].status).toBe("skipped");
    const stopped = executionRecords([message(), resultMessage({ ok: false, error: "用户已停止；没有重复执行。" })], [event("tool.started", { call })], [{ ...run, status: "cancelled" }]);
    expect(stopped[0].status).toBe("stopped");
    expect(executionRecords([message()], [], [{ ...run, status: "completed" }])[0].status).toBe("unknown");
  });
  it("等待确认、拒绝导出与历史批准记录分开显示", () => {
    const exportCall = { ...call, name: "request_export", arguments: JSON.stringify({ artifact_id: "file" }) };
    expect(executionRecords([message(exportCall)], [event("tool.started", { call: exportCall })], [{ ...run, status: "awaiting_approval" }])[0].status).toBe("waiting");
    expect(executionRecords([message(exportCall), resultMessage({ ok: false, export_ready: false, message: "用户拒绝导出，不得绕过。" })], [], [run])[0].status).toBe("stopped");
    expect(executionRecords([message(exportCall), resultMessage({ ok: true, export_ready: true })], [], [run])[0].status).toBe("completed");
  });
  it("结构化文件工具展示路径而非杜撰 shell 命令", () => {
    const fileCall = { ...call, name: "write_file", arguments: JSON.stringify({ path: "outputs/路线.md", content: "secret resume body" }) };
    const [record] = executionRecords([message(fileCall), resultMessage({ ok: true, result: { artifact: { version: 3 } } })], [], [run]);
    expect(executionLabel(record)).toBe("写入文件"); expect(executionTarget(record)).toBe("outputs/路线.md"); expect(executionSummary(record)).toBe("已保存 · v3");
  });
  it("损坏的参数不导致崩溃，保留原始记录；已脱敏日志不会被还原", () => {
    const broken = { ...call, arguments: "{invalid" };
    const [record] = executionRecords([message(broken), resultMessage({ ok: false, error: "参数不是合法 JSON [REDACTED]" })], [], [run]);
    expect(executionTarget(record)).toBe("命令参数不可用"); expect(record.call.arguments).toBe("{invalid"); expect(record.error).toContain("[REDACTED]");
    expect(executionRecords([], [event("tool.started", { call: { name: 42 } })], [run])).toEqual([]);
  });
  it("计划优先取最新有效实际结果，失败的计划不覆盖完成记录", () => {
    const planCall = { ...call, name: "plan_tasks", arguments: JSON.stringify({ steps: [{ title: "待处理", status: "pending" }] }) };
    const steps = [{ title: "生成路线", status: "done" }];
    const records = executionRecords([message(planCall), resultMessage({ ok: true, result: { steps } })], [], [run]);
    expect(executionPlan(records, [])).toEqual(steps);
    expect(executionPlan([], [event("plan.updated", { plan: { steps: [{ title: "新版", status: "working" }, { title: 42, status: "pending" }] } })])).toEqual([{ title: "新版", status: "working" }]);
  });
  it("耗时短到毫秒、长到分钟均可读", () => {
    expect(formatDuration(24)).toBe("24 ms"); expect(formatDuration(1200)).toBe("1.2 秒"); expect(formatDuration(61500)).toBe("1 分 1 秒");
  });
});
describe("执行 UI", () => {
  const result = { exit_code: 1, stdout: '<script>alert("x")</script>', stderr: "missing file", duration_ms: 23 };
  const records = executionRecords([message(), resultMessage({ ok: true, result })], [event("tool.started", { call })], [run]);
  it("对话直接显示命令和结果，技术参数移到侧栏，不再堆三块面板", () => {
    const html = renderToStaticMarkup(<RunActivity run={run} records={records} onOpen={noop} />);
    expect(html).toContain("Get-Content inputs/经历.md"); expect(html).toContain("退出码 1"); expect(html).toContain("1 次失败记录");
    expect(html).not.toContain("思考与执行"); expect(html).not.toContain("真实工具记录"); expect(html).not.toContain("tokens");
  });
  it("侧栏提供原命令、输出、错误、轮次和计划入口；输出只作为文字渲染", () => {
    const html = renderToStaticMarkup(<ExecutionPanel run={run} runs={[run]} messages={[{ ...message(), role: "user", content: "请生成路线" }]} records={records} events={[]} files={[]} onSelect={noop} onClose={noop} onPreview={noop} />);
    for (const text of ["执行记录侧栏", "实际命令", "标准输出 stdout", "标准错误 stderr", "退出码 1", "任务计划", "复制实际命令", "非模型内部思维"]) expect(html).toContain(text);
    expect(html).toContain("&lt;script&gt;"); expect(html).not.toContain("<script>");
  });
  it("纯对话轮次不生成虚构工具记录；运行中只提示等待真实调用", () => {
    expect(renderToStaticMarkup(<RunActivity run={run} records={[]} onOpen={noop} />)).toBe("");
    const html = renderToStaticMarkup(<ExecutionPanel run={{ ...run, status: "running" }} runs={[run]} messages={[]} records={[]} events={[]} files={[]} onSelect={noop} onClose={noop} onPreview={noop} />);
    expect(html).toContain("暂未调用工具"); expect(html).not.toContain("实际命令");
  });
  it("文件读写不会暴露为假命令，不在轻量行显示文件正文", () => {
    const fileCall = { ...call, name: "write_file", arguments: JSON.stringify({ path: "outputs/路线.md", content: "private body" }) };
    const records = executionRecords([message(fileCall), resultMessage({ ok: true, result: {} })], [], [run]);
    const html = renderToStaticMarkup(<RunActivity run={run} records={records} onOpen={noop} />);
    expect(html).toContain("outputs/路线.md"); expect(html).not.toContain("private body"); expect(html).not.toContain("Set-Content");
  });
});
