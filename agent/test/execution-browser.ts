/** 青穗集 · 执行侧栏浏览器验收支架：独立账号与临时库，仅写入明确测试记录，不调用模型或执行宿主命令。 */
import { mkdtemp, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { createApp } from "../src/http.js";
import { loadConfig } from "../src/config.js";
import { id } from "../src/store.js";
import type { Run, ToolCall } from "../src/types.js";
import { noSandbox } from "./helpers.js";
const ascii = process.argv.includes("--ascii");
const logs = resolve(ascii ? "../logs/ascii-microinteractions-20261023" : "../logs/execution-records-20261022");
await mkdir(logs, { recursive: true });
const dataDir = await mkdtemp(join(logs, "browser-data-"));
const ctx = createApp({ config: loadConfig({ AGENT_PORT: "8112", AGENT_DATA_DIR: dataDir }), staticDir: resolve("../web/dist"), sandbox: noSandbox });
const username = "execution_fixture", password = "Fixture-execution-only-2026";
const { user } = ctx.auth.register(username, password, true);
const conversation = ctx.store.createConversation(user.id, null);
conversation.title = "执行记录 · 独立界面测试（无真实模型）"; ctx.store.updateConversation(conversation);
const run1: Run = { id: id(), conversation_id: conversation.id, user_id: user.id, profile_id: id(), request_id: id(), input: "帮我整理一份四周 Agent 开发学习路线，并保存成文件。（测试示例）", status: "completed", steps: 4, input_tokens: 0, output_tokens: 0, error: null, permission_mode: "default", reasoning_effort: "auto", created_at: "2026-10-22T15:30:00.000Z", updated_at: "2026-10-22T15:30:24.000Z" };
const run2: Run = { ...run1, id: id(), request_id: id(), input: "再把每周学习重点补充到文件里。（测试示例）", created_at: "2026-10-22T15:31:00.000Z", updated_at: "2026-10-22T15:31:19.000Z" };
const stamp = (run: Run, seconds: number) => new Date(Date.parse(run.created_at) + seconds * 1000).toISOString();
function msg(run: Run, role: "user" | "assistant", content: string) { ctx.store.message(conversation.id, run.id, role, content); }
function operation(run: Run, seconds: number, name: string, args: Record<string, unknown>, result: unknown, ok = true) {
  const call: ToolCall = { id: "call_" + id(), name, arguments: JSON.stringify(args) };
  ctx.store.message(conversation.id, run.id, "assistant", "", { tool_calls: [call] });
  ctx.store.appendEvent(conversation.id, run.id, "tool.started", { call, fixture: true, real_execution: false });
  ctx.store.message(conversation.id, run.id, "tool", JSON.stringify({ ok: true, result }), { tool_call_id: call.id });
  const start = ctx.store.db.prepare("UPDATE events SET created_at=? WHERE conversation_id=? AND kind='tool.started' AND json_extract(data,'$.call.id')=?");
  start.run(stamp(run, seconds), conversation.id, call.id);
  const end = ctx.store.appendEvent(conversation.id, run.id, "tool.finished", { call_id: call.id, name, ok, result, fixture: true, real_execution: false });
  ctx.store.db.prepare("UPDATE events SET created_at=? WHERE seq=?").run(stamp(run, seconds + 1), end.seq);
  return call;
}
ctx.store.saveRun(run1, true); run1.updated_at = stamp(run1, 24);
ctx.store.db.prepare("UPDATE runs SET data=? WHERE id=?").run(JSON.stringify(run1), run1.id);
msg(run1, "user", run1.input);
operation(run1, 1, "plan_tasks", { steps: [{ title: "制定四周学习路线", status: "working" }, { title: "保存 Markdown 文件", status: "pending" }] }, { steps: [{ title: "制定四周学习路线", status: "working" }, { title: "保存 Markdown 文件", status: "pending" }] });
operation(run1, 3, "list_files", {}, []);
const first = await ctx.workspace.write(conversation.id, run1.id, "outputs/四周学习路线.md", "# 四周 Agent 开发学习路线\n\n> 独立界面测试素材，不是真实模型或命令产出。\n\n- 第一周：TypeScript 与模型调用。\n- 第二周：工具调用与状态管理。\n- 第三周：计划、文件与审批。\n- 第四周：项目打磨与演示。\n");
operation(run1, 8, "write_file", { path: first.path, content: "（独立界面测试内容）" }, { created: true, artifact: first, link: "artifact:" + first.id });
operation(run1, 12, "plan_tasks", { steps: [{ title: "制定四周学习路线", status: "done" }, { title: "保存 Markdown 文件", status: "done" }] }, { steps: [{ title: "制定四周学习路线", status: "done" }, { title: "保存 Markdown 文件", status: "done" }] });
msg(run1, "assistant", "第一版路线已经整理好。先从一个能运行的小 Agent 开始，再补充工具、状态和安全边界。\n\n[四周学习路线.md](artifact:" + first.id + ")\n\n这是独立的界面测试示例，没有调用真实模型。 ");
ctx.store.saveRun(run2, true); run2.updated_at = stamp(run2, 19);
ctx.store.db.prepare("UPDATE runs SET data=? WHERE id=?").run(JSON.stringify(run2), run2.id);
msg(run2, "user", run2.input);
operation(run2, 1, "read_file", { path: first.path }, { text: "# 四周 Agent 开发学习路线\n\n（测试示例）", path: first.path });
operation(run2, 3, "run_command", { command: "Get-Content -LiteralPath outputs/不存在的路线.md" }, { exit_code: 1, stdout: "", stderr: "Get-Content: 找不到路径 outputs/不存在的路线.md，因为该路径不存在。\n[独立界面测试记录；未实际执行命令]", duration_ms: 128 }, false);
const command = operation(run2, 5, "run_command", { command: "Get-Content -LiteralPath outputs/四周学习路线.md | Select-Object -First 12" }, { exit_code: 0, stdout: "# 四周 Agent 开发学习路线\n\n第 1 周 · TypeScript 与模型 API\n第 2 周 · 工具调用与任务循环\n第 3 周 · 计划、文件、审批与恢复\n第 4 周 · 打磨项目与演示\n\n[独立界面测试记录；未实际执行命令]", stderr: "", duration_ms: 246 });
const updated = await ctx.workspace.write(conversation.id, run2.id, first.path, "# 四周 Agent 开发学习路线\n\n> 这是独立界面测试示例，不是真实模型或命令产出。\n\n| 阶段 | 学习重点 | 本周交付 |\n| --- | --- | --- |\n| 第 1 周 | TypeScript、模型 API、流式输出 | 可运行的对话 |\n| 第 2 周 | 工具协议、调用循环、参数校验 | 真实工具调用 |\n| 第 3 周 | 计划、文件、审批、错误恢复 | 可检查的执行记录 |\n| 第 4 周 | 页面打磨、测试与演示 | 可演示的小产品 |\n\n不必一次做成通用智能体，先把一件事真正做完。\n");
operation(run2, 10, "write_file", { path: updated.path, content: "（独立界面测试内容）" }, { created: true, artifact: updated, link: "artifact:" + updated.id });
operation(run2, 14, "plan_tasks", { steps: [{ title: "核对已有路线与每周重点", status: "done" }, { title: "补充周计划并保存新版本", status: "done" }] }, { steps: [{ title: "核对已有路线与每周重点", status: "done" }, { title: "补充周计划并保存新版本", status: "done" }] });
msg(run2, "assistant", "已经补充好了，路线保留了上一版，并保存为 **v2**。\n\n每周都对应一个小交付：能对话 → 会用工具 → 可检查、可恢复 → 可演示。\n\n[四周学习路线.md](artifact:" + updated.id + ")\n\n你可以点击上方的具体命令查看标准输出与退出码，任务计划在右侧查看。\n\n*本对话仅用于界面验收，无真实模型调用或命令执行。*");
if (ascii) {
  // 独立数据中的占位状态仅用于验证动画，不投递真实任务；名称与消息明确告知测试身份。
  for (const phase of ["waiting", "working"] as const) {
    const sample = ctx.store.createConversation(user.id, null, "ASCII · " + (phase === "waiting" ? "等待模型" : "工具执行") + "（界面测试）");
    const pending: Run = { ...run1, id: id(), request_id: id(), conversation_id: sample.id, input: "这是一条 ASCII 动效界面测试，不调用真实模型、不执行真实命令。", status: "running", created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    ctx.store.saveRun(pending, true);
    ctx.store.message(sample.id, pending.id, "user", pending.input);
    if (phase === "working") {
      const sampleCall = { id: id(), name: "read_file", arguments: JSON.stringify({ path: "inputs/测试经历.txt" }) };
      ctx.store.message(sample.id, pending.id, "assistant", "", { tool_calls: [sampleCall] });
      ctx.store.appendEvent(sample.id, pending.id, "tool.started", { call: sampleCall, fixture: true, real_execution: false });
    }
  }
  // 仅测试支架延迟真实预览响应，便于检查加载反馈及切换取消；生产接口无延迟。
  ctx.app.addHook("preHandler", async request => { if (request.url.endsWith("/preview")) await delay(2000); });
}
await ctx.app.listen({ host: "127.0.0.1", port: 8112 });
console.log(JSON.stringify({ fixture: true, real_llm: false, real_command: false, url: "http://127.0.0.1:8112", username, password, conversation: conversation.id, command: command.id }));
let closing = false;
const close = async () => { if (closing) return; closing = true; await ctx.app.close(); };
process.once("SIGINT", () => void close()); process.once("SIGTERM", () => void close());
