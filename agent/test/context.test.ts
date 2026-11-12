/** 青穗集 · 通用上下文管理回归：预算、历史摘要和当前工具链优先级。 */
import test from "node:test";
import assert from "node:assert/strict";
import { calculateContextBudget, estimateModelRequestTokens, packModelContext, estimateTokens } from "../src/context.js";
import type { Message, Run } from "../src/types.js";

const run = { id: "current-run" } as Run;
let sequence = 0;
function message(
  role: Message["role"],
  content: string,
  runId: string | null = null,
  extra: Partial<Message> = {},
): Message {
  sequence++;
  return {
    id: "message-" + sequence,
    conversation_id: "conversation",
    run_id: runId,
    role,
    content,
    created_at: new Date().toISOString(),
    ...extra,
  };
}

test("通用上下文会压缩旧工具结果，保留最近对话和当前工具链", () => {
  const currentCall = {
    id: "call-current",
    name: "read_file",
    arguments: JSON.stringify({ path: "inputs/经历.md" }),
  };
  const messages = [
    message("user", "我早期说过希望寻找后端方向。"),
    message("assistant", "可以先比较后端和全栈方向。"),
    message("assistant", "", null, { tool_calls: [{ id: "call-old", name: "search_files", arguments: "{}" }] }),
    message("tool", "旧工具全文 " + "x".repeat(18000), null, { tool_call_id: "call-old" }),
    message("user", "最近我希望优先看能落地的岗位。"),
    message("assistant", "那就先核对岗位要求和已有经历。"),
    message("user", "当前请求", run.id),
    message("assistant", "", run.id, { tool_calls: [currentCall] }),
    message("tool", "当前工具结果 " + "y".repeat(18000), run.id, { tool_call_id: currentCall.id }),
  ];
  const packed = packModelContext(run, messages, {
    maxTokens: 5000,
    recentTokens: 10,
    maxToolChars: 1200,
    memorySummary: "用户正在比较职业方向。",
  });
  assert.equal(packed.compacted, true);
  assert.equal(packed.sourceMessageCount, messages.length);
  assert.ok(packed.estimatedTokens <= 5000);
  assert.ok(packed.omittedMessages >= 2);
  assert.ok(packed.messages.some((item) => item.id === "message-9"));
  assert.ok(packed.messages.some((item) => item.id === "message-8"));
  assert.ok(!packed.messages.some((item) => item.id === "message-4"));
  assert.match(packed.summary ?? "", /用户原话：我早期说过希望寻找后端方向/);
  assert.match(packed.summary ?? "", /工具结果已省略/);
});

test("估算器对中文和英文混合内容都返回正数", () => {
  assert.ok(estimateTokens("穗奈帮助我整理 TypeScript agent workflow") > 0);
  assert.ok(estimateTokens("") >= 1);
});


test("最近一轮旧工具调用会成对保留，不留下孤立 tool 消息", () => {
  const call = { id: "call-recent", name: "list_files", arguments: "{}" };
  const messages = [
    message("user", "请列出当前文件", "old-run"),
    message("assistant", "", "old-run", { tool_calls: [call] }),
    message("tool", "文件列表：inputs/经历.md", "old-run", { tool_call_id: call.id }),
    message("user", "继续处理", run.id),
  ];
  const packed = packModelContext(run, messages, {
    maxTokens: 5000,
    recentTokens: 3000,
    maxToolChars: 1200,
  });
  assert.ok(packed.messages.some((item) => item.id === "message-" + (sequence - 2)));
  assert.ok(packed.messages.some((item) => item.id === "message-" + (sequence - 1)));
});


test("请求预算会先扣除系统规则、工具定义和输出空间", () => {
  const tools = [{
    name: "read_career_context",
    description: "读取已确认的职业资料",
    parameters: { type: "object", additionalProperties: false },
  }];
  const budget = calculateContextBudget({
    contextWindowTokens: 32000,
    minimumReserveTokens: 2000,
    outputTokens: 2048,
    systemPrompt: "系统规则\n" + "穗奈保持事实边界。".repeat(1000),
    tools,
  });
  assert.ok(budget.systemTokens > 1000);
  assert.ok(budget.toolTokens > 0);
  assert.ok(budget.reserveTokens >= budget.systemTokens + budget.toolTokens + budget.outputTokens + budget.summaryReserveTokens + budget.protocolReserveTokens);
  assert.equal(budget.historyBudgetTokens + budget.reserveTokens, budget.contextWindowTokens);
});

test("请求估算包含系统、历史、工具与输出，而不是只计算聊天历史", () => {
  const messages = [message("user", "请继续整理我的方向", run.id)];
  const tools = [{ name: "list_career_directions", description: "列出方向", parameters: {} }];
  const estimate = estimateModelRequestTokens("系统规则", messages, tools, 512);
  assert.ok(estimate > estimateTokens("系统规则") + estimateTokens(messages[0].content) + 512);
});
