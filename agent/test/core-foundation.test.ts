/** 青穗集 · 通用底座契约回归：领域替换、工具权限、压缩恢复、计划记忆与取消事件。 */
import test from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { Runtime } from "../src/runtime.js";
import { AppError } from "../src/errors.js";
import { id } from "../src/store.js";
import { responseError } from "../src/provider.js";
import { packModelContext } from "../src/context.js";
import { AgentTaskMemory } from "../src/core/task-memory.js";
import { ToolRegistry } from "../src/core/tool-registry.js";
import { CapabilityRegistry } from "../src/core/capability-registry.js";
import { coreTools } from "../src/core/tools.js";
import type { AgentDomain } from "../src/core/contracts.js";
import type { Message, Sandbox } from "../src/types.js";
import { fixture, ScriptedModel, reply, tool } from "./helpers.js";

test("注册表拒绝重名、未知工具及错误参数，校验失败不执行", async () => {
  let executed = 0;
  const spec = { name: "echo", description: "echo", schema: z.object({ text: z.string() }).strict(), effect: "read" as const,
    execute: async () => { executed++; return { value: "ok" }; } };
  assert.throws(() => new ToolRegistry([spec, spec]), /重复/);
  const registry = new ToolRegistry([spec]);
  await assert.rejects(() => registry.execute(tool("echo", { text: 1 }), {}), /参数/);
  await assert.rejects(() => registry.execute(tool("missing", {}), {}), /未开放/);
  assert.equal(executed, 0);
  await registry.execute(tool("echo", { text: "hi" }), {}); assert.equal(executed, 1);
});

test("命令沙箱输出按分片写入 tool.output 事件，最终结果仍单独保存", async t => {
  const sandbox: Sandbox = {
    async health() {
      return { available: true, provider: "docker", image: "fixture", isolation_tested: true, message: "fixture" };
    },
    async execute(_command, _workspace, _signal, options = {}) {
      options.onOutput?.("stdout", "第一段");
      options.onOutput?.("stderr", "提醒");
      return { exit_code: 0, stdout: "第一段", stderr: "提醒", duration_ms: 12 };
    },
  };
  const model = new ScriptedModel((_, index) => index === 0 ? reply("", [tool("run_command", { command: "echo fixture" })]) : reply("命令完成"));
  const f = await fixture(t, { model, sandbox });
  const run = f.runtime.start(f.user, f.conversation.id, f.profile.id, "执行一个命令", id());
  await f.runtime.waitIdle();
  const output = f.store.events(f.conversation.id).filter(event => event.kind === "tool.output");
  assert.deepEqual(output.map(event => [event.data.stream, event.data.text]), [["stdout", "第一段"], ["stderr", "提醒"]]);
  const finished = f.store.events(f.conversation.id).find(event => event.kind === "tool.finished");
  assert.equal((finished?.data.result as { stdout: string }).stdout, "第一段");
  assert.equal(f.store.run(f.user.id, run.id).status, "completed");
});

test("能力注册表拒绝悬空工具、审批缺失和不存在的后续能力", () => {
  const base = {
    id: "demo_capability",
    domain: "demo",
    name: "演示能力",
    description: "用于测试的能力",
    requiredContext: ["conversation"],
    tools: ["echo"],
    artifactType: null,
    proposalTypes: [],
    riskTier: "R0" as const,
    requiresApproval: false,
    evidenceRequired: false,
    minDataCoverage: 0,
    thinking: "on" as const,
    maxTokens: 100,
    nextCapabilities: [],
  };
  const registry = new CapabilityRegistry([base], { availableTools: ["echo"] });
  assert.equal(registry.get("demo_capability")?.name, "演示能力");
  assert.throws(() => new CapabilityRegistry([{ ...base, id: "bad_tool", tools: ["missing"] }], { availableTools: ["echo"] }), /未注册工具/);
  assert.throws(() => new CapabilityRegistry([{ ...base, id: "risky", riskTier: "R2", requiresApproval: false }], { availableTools: ["echo"] }), /必须要求审批/);
  assert.throws(() => new CapabilityRegistry([{ ...base, id: "dangling", nextCapabilities: ["missing_next"] }], { availableTools: ["echo"] }), /不存在的后续能力/);
});

test("待办承诺跨运行保存，原子认领，成功运行后才完成并按账号隔离", async t => {
  const f = await fixture(t);
  const obligation = f.runtime.obligations.create({
    userId: f.user.id,
    conversationId: f.conversation.id,
    capabilityId: "conversation_support",
    intent: "继续核对这段经历",
    title: "核对经历",
  });
  assert.equal(obligation.status, "open");
  assert.equal(f.runtime.obligations.claim(f.user.id, obligation.id).status, "claimed");
  assert.equal(f.runtime.obligations.claim(f.user.id, obligation.id).status, "claimed");
  const other = f.auth.register("other_obligation", "Synthetic-password-2026", true);
  assert.throws(() => f.runtime.obligations.claim(other.user.id, obligation.id), /不存在/);
  const run = f.runtime.start(f.user, f.conversation.id, f.profile.id, "接着核对", id(), { obligation_id: obligation.id });
  await f.runtime.waitIdle();
  assert.equal(f.store.run(f.user.id, run.id).status, "completed");
  assert.equal(f.store.obligation(f.user.id, obligation.id).status, "fulfilled");
  assert.ok(f.store.events(f.conversation.id).some(event => event.kind === "obligation.updated" && (event.data.obligation as { status: string }).status === "fulfilled"));
  const abandoned = f.runtime.obligations.create({ userId: f.user.id, conversationId: f.conversation.id, capabilityId: "conversation_support", intent: "以后再看", title: "以后再看" });
  assert.equal(f.runtime.obligations.abandon(f.user.id, abandoned.id).status, "abandoned");
  const source = f.store.messages(f.conversation.id).find(message => message.role === "user")!;
  const stale = f.runtime.obligations.create({ userId: f.user.id, conversationId: f.conversation.id, sourceRunId: source.run_id, capabilityId: "conversation_support", intent: "旧分支下一步", title: "旧分支下一步" });
  f.runtime.start(f.user, f.conversation.id, f.profile.id, "编辑成新的问题", id(), { replaces_message_id: source.id });
  await f.runtime.waitIdle();
  assert.equal(f.store.obligation(f.user.id, stale.id).status, "abandoned");
});

test("职业能力只从注册表对外暴露，并写入模型开始事件", async t => {
  const f = await fixture(t);
  const info = await f.app.inject({ url: "/api/v1/agent/info", headers: f.headers });
  assert.equal(info.statusCode, 200);
  const capabilities = info.json().agent_capabilities as Array<{ id: string }>;
  assert.ok(capabilities.some(item => item.id === "resume_build"));
  const run = f.runtime.start(f.user, f.conversation.id, f.profile.id, "聊聊我的方向", id());
  await f.runtime.waitIdle();
  const started = f.store.events(f.conversation.id).find(event => event.kind === "model.started");
  assert.equal(started?.data.capability_id, "conversation_support");
  assert.equal(f.store.run(f.user.id, run.id).status, "completed");
});

test("注入纯通用领域可交付文件，核心不强制穗奈或职业规则", async t => {
  const model = new ScriptedModel((request, index) => {
    assert.ok(!/穗奈|简历|岗位/.test(request.messages[0].content));
    assert.ok(!request.tools.some(item => item.name === "read_career_context"));
    return index === 0 ? reply("", [tool("write_file", { path: "outputs/result.txt", content: "generic result" })]) : reply("完成");
  });
  const f = await fixture(t, { model });
  const domain: AgentDomain = { id: "general", instructions: () => ["通用文档助手。"], tools: () => coreTools.definitions(),
    validateTool: () => {}, executeTool: context => coreTools.execute(context.call, context), afterTool: () => {} };
  const runtime = new Runtime(f.store, f.workspace, f.profiles, f.sandbox, f.config, domain);
  const run = runtime.start(f.user, f.conversation.id, f.profile.id, "创建文本文件", id()); await runtime.waitIdle();
  assert.equal(f.store.run(f.user.id, run.id).status, "completed");
  assert.equal((await f.workspace.artifactBytes(f.store.artifacts(f.conversation.id)[0])).toString(), "generic result");
  await runtime.shutdown();
});

test("聊天连接没有工具权限时，模型返回写文件请求也不能执行", async t => {
  const f = await fixture(t, { model: new ScriptedModel((_, index) => index === 0
    ? reply("", [tool("write_file", { path: "outputs/forbidden.txt", content: "no" })]) : reply("工具未开放")) });
  f.profile.capabilities.tools = false; f.store.saveProfile(f.profile, null);
  f.runtime.start(f.user, f.conversation.id, f.profile.id, "试一试", id()); await f.runtime.waitIdle();
  assert.equal(f.store.artifacts(f.conversation.id).length, 0);
  assert.ok(f.store.messages(f.conversation.id).some(message => message.role === "tool" && message.content.includes("未开放")));
});

test("连续三次相同参数和结果后停止，未执行调用也会正确闭合", async t => {
  const f = await fixture(t, { model: new ScriptedModel(() => reply("", [tool("list_files", {})])) });
  const run = f.runtime.start(f.user, f.conversation.id, f.profile.id, "重复请求", id()); await f.runtime.waitIdle();
  assert.equal(f.store.run(f.user.id, run.id).error_code, "agent_stalled");
  assert.equal(f.store.events(f.conversation.id).filter(event => event.kind === "tool.started").length, 3);
  const messages = f.store.messages(f.conversation.id);
  for (const call of messages.flatMap(message => message.tool_calls ?? [])) assert.equal(messages.filter(message => message.tool_call_id === call.id).length, 1);
});

test("窗口拒绝压缩后恢复，不重做已经成功的文件工具", async t => {
  const model = new ScriptedModel((_, index) => {
    if (index === 0) return reply("", [tool("write_file", { path: "outputs/result.txt", content: "保留一次成果" })]);
    if (index === 1) throw new AppError(502, "超出窗口", "provider_context");
    return reply("继续完成");
  });
  const f = await fixture(t, { model });
  for (let index = 0; index < 12; index++) f.store.message(f.conversation.id, null, "user", "早期背景".repeat(400));
  const run = f.runtime.start(f.user, f.conversation.id, f.profile.id, "创建结果", id()); await f.runtime.waitIdle();
  assert.equal(f.store.run(f.user.id, run.id).status, "completed"); assert.equal(model.requests.length, 3);
  assert.ok(JSON.stringify(model.requests[2].messages).length < JSON.stringify(model.requests[1].messages).length);
  assert.equal(f.store.artifacts(f.conversation.id).length, 1);
  assert.equal(f.store.events(f.conversation.id).filter(event => event.kind === "tool.started").length, 1);
  assert.ok(f.store.events(f.conversation.id).some(event => event.kind === "context.compaction.end" && event.data.trigger === "context-overflow"));
});

test("连续窗口拒绝、已开始流式的失败和普通400不无限重试", async t => {
  for (const [code, partial, count] of [["provider_context", false, 2], ["provider_context", true, 1], ["provider_400", false, 1]] as const) {
    const f = await fixture(t, { model: new ScriptedModel(request => {
      if (partial) request.onDelta?.("已收到的正文"); throw new AppError(502, "fixture error", code);
    }) });
    const run = f.runtime.start(f.user, f.conversation.id, f.profile.id, "有界恢复", id()); await f.runtime.waitIdle();
    assert.equal(f.model.requests.length, count); assert.equal(f.store.run(f.user.id, run.id).status, "failed");
  }
});

test("窗口错误分类不泄露上游原文，不误判余额和鉴权", async () => {
  for (const [status, code, expected] of [[400, "context_length_exceeded", "provider_context"], [401, "context_length_exceeded", "provider_401"], [400, "insufficient_quota", "provider_quota"]] as const) {
    const error = await responseError(new Response(JSON.stringify({ error: { code, message: "private request details" } }), { status }));
    assert.equal(error.code, expected); assert.ok(!error.message.includes("private request"));
  }
});

test("多次大结果以完整调用单元压缩，保留本轮请求与最近结果", () => {
  const run = { id: "long-run" } as Parameters<typeof packModelContext>[0];
  const base = { conversation_id: "conversation", run_id: run.id, created_at: "" };
  const messages: Message[] = [{ ...base, id: "user", role: "user", content: "当前用户问题" }];
  for (let index = 0; index < 30; index++) {
    messages.push({ ...base, id: "a" + index, role: "assistant", content: "", tool_calls: [{ id: "c" + index, name: "read_file", arguments: "{}" }] });
    messages.push({ ...base, id: "t" + index, role: "tool", content: "工具结果".repeat(2000), tool_call_id: "c" + index });
  }
  const pack = packModelContext(run, messages, { maxTokens: 5000, recentTokens: 1000, maxToolChars: 1200 });
  assert.ok(pack.estimatedTokens <= 5000); assert.equal(pack.messages[0].content, "当前用户问题");
  assert.equal(pack.messages.at(-1)?.id, "t29"); assert.ok(pack.omittedMessageIds.length > 0);
  for (const message of pack.messages.filter(message => message.role === "tool")) assert.ok(pack.messages.some(item => item.tool_calls?.some(call => call.id === message.tool_call_id)));
  assert.equal(messages.length, 61);
});

test("计划按账号隔离，从持久事件恢复；编辑分支使旧计划失效", async t => {
  const f = await fixture(t, { model: new ScriptedModel((_, index) => index === 0
    ? reply("", [tool("plan_tasks", { steps: [{ title: "读取经历", status: "done" }, { title: "整理文档", status: "pending" }] })]) : reply("下次继续")) });
  f.runtime.start(f.user, f.conversation.id, f.profile.id, "记录计划", id()); await f.runtime.waitIdle();
  const restored = new AgentTaskMemory(f.store);
  assert.equal(restored.latest(f.user.id, f.conversation.id)?.steps[1].title, "整理文档"); assert.equal(restored.continuations(f.user.id).length, 1);
  const other = f.auth.register("other_plan", "Synthetic-password-2026", true);
  assert.throws(() => restored.latest(other.user.id, f.conversation.id), /不存在/); assert.equal(restored.continuations(other.user.id).length, 0);
  assert.equal((await f.app.inject({ url: "/api/v1/agent/continuations", headers: f.headers })).json().length, 1);
  const first = f.store.messages(f.conversation.id).find(message => message.role === "user")!;
  f.runtime.start(f.user, f.conversation.id, f.profile.id, "新话题", id(), { replaces_message_id: first.id }); await f.runtime.waitIdle();
  assert.equal(restored.latest(f.user.id, f.conversation.id), null);
});

test("取消审批的实时事件提供完整对象，界面可以清理等待状态", async t => {
  const f = await fixture(t);
  const file = await f.workspace.write(f.conversation.id, null, "outputs/result.txt", "result");
  f.model.respond = () => reply("", [tool("request_export", { artifact_id: file.id })]);
  const run = f.runtime.start(f.user, f.conversation.id, f.profile.id, "导出", id()); await f.runtime.waitIdle(); f.runtime.cancel(f.user, run.id);
  const event = f.store.events(f.conversation.id).filter(event => event.kind === "approval.updated").at(-1)!;
  assert.equal((event.data.approval as { status: string }).status, "rejected");
});


test("本对话小结只读取有效来源；跨会话必须走证据检索，不能直接借用最近的小结", async t => {
  const f = await fixture(t);
  const userMessage = f.store.message(f.conversation.id, null, "user", "我正在考虑后端方向");
  const state = f.runtime.guidance.state(f.user.id, f.conversation.id);
  state.memory = { summary: "用户正在探索后端方向，能力尚未核对", next_step: "了解一个真实项目", through_message_id: userMessage.id, updated_at: new Date().toISOString(), source: "model" };
  f.conversation.guidance = state; f.store.updateConversation(f.conversation);
  const next = f.store.createConversation(f.user.id, f.profile.id);
  assert.equal(f.runtime.guidance.memoryContext(f.user.id, next.id), null);
  assert.match(f.runtime.guidance.memoryContext(f.user.id, f.conversation.id)!, /后端方向/);
  const other = f.auth.register("other_memory", "Synthetic-password-2026", true);
  const otherConversation = f.store.createConversation(other.user.id, null);
  assert.equal(f.runtime.guidance.memoryContext(other.user.id, otherConversation.id), null);
  f.conversation.archived = true; f.store.updateConversation(f.conversation);
  assert.equal(f.runtime.guidance.memoryContext(f.user.id, next.id), null);
  f.conversation.archived = false; f.store.updateConversation(f.conversation);
  f.store.supersedeFrom(f.user.id, f.conversation.id, userMessage.id, id());
  assert.equal(f.runtime.guidance.memoryContext(f.user.id, f.conversation.id), null);
  assert.equal(f.runtime.guidance.memoryContext(f.user.id, next.id), null);
});
