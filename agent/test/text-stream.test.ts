/** 青穗集 · 流式输出回归：首段时机、限时合并、密钥脱敏、停止清理与真实运行状态。 */
import test from "node:test";
import assert from "node:assert/strict";
import { TextStream } from "../src/text-stream.js";
import { Secrets } from "../src/secrets.js";
import { id } from "../src/store.js";
import { fixture, ScriptedModel, reply } from "./helpers.js";

function gate() {
  let release!: () => void;
  const wait = new Promise<void>((resolve) => { release = resolve; });
  return { wait, release };
}

test("少于 48 字的首段立即发出，后续短分片在 40 毫秒内推送，结束不重复", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const sent: string[] = [];
  const stream = new TextStream(new Secrets(), (text) => sent.push(text), new AbortController().signal);
  stream.push("你");
  assert.deepEqual(sent, ["你"]);
  stream.push("好");
  stream.push("呀");
  t.mock.timers.tick(39);
  assert.deepEqual(sent, ["你"]);
  t.mock.timers.tick(1);
  assert.deepEqual(sent, ["你", "好呀"]);
  stream.push("。");
  stream.finish();
  stream.finish();
  stream.push("不得追加");
  t.mock.timers.tick(1000);
  assert.deepEqual(sent, ["你", "好呀", "。"]);
});

test("跨分片密钥仍被扣留和脱敏，不发送空事件", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const secrets = new Secrets();
  secrets.protect("fixture-secret-key");
  const sent: string[] = [];
  const stream = new TextStream(secrets, (text) => sent.push(text), new AbortController().signal);
  stream.push("已收到：");
  stream.push("fixture-sec");
  t.mock.timers.tick(40);
  assert.deepEqual(sent, ["已收到："]);
  stream.push("ret-key，继续");
  t.mock.timers.tick(40);
  stream.finish();
  assert.equal(sent.join(""), "已收到：[已隐藏密钥]，继续");
  assert.ok(sent.every(Boolean));
  assert.ok(!sent.some((text) => text.includes("fixture-sec")));
});

test("只有不完整密钥前缀时不提前泄漏，结束隐藏片段", () => {
  const secrets = new Secrets(); secrets.protect("fixture-secret-key");
  const sent: string[] = [];
  const stream = new TextStream(secrets, (text) => sent.push(text), new AbortController().signal);
  stream.push("fixture-sec");
  assert.deepEqual(sent, []);
  stream.finish();
  assert.deepEqual(sent, ["[已隐藏密钥片段]"]);
});

test("停止撤销待发送文本和定时器，之后不得出现迟到分片", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const controller = new AbortController(); const sent: string[] = [];
  const stream = new TextStream(new Secrets(), (text) => sent.push(text), controller.signal);
  stream.push("第一段"); stream.push("尚未推送");
  controller.abort();
  t.mock.timers.tick(1000); stream.push("不得追加"); stream.finish();
  assert.deepEqual(sent, ["第一段"]);
});

test("定时发送失败会交回运行核心处理，不造成未捕获的定时器异常", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let failed = false;
  const stream = new TextStream(new Secrets(), () => { if (failed) throw new Error("fixture-write-failed"); }, new AbortController().signal);
  stream.push("首段"); failed = true; stream.push("后续");
  assert.doesNotThrow(() => t.mock.timers.tick(40));
  assert.throws(() => stream.finish(), /fixture-write-failed/);
  t.mock.timers.tick(1000);
});

test("非流式模型不制造伪逐字事件，提前停止也不发正文", () => {
  const sent: string[] = []; const controller = new AbortController();
  const stream = new TextStream(new Secrets(), (text) => sent.push(text), controller.signal);
  stream.finish();
  controller.abort();
  const stopped = new TextStream(new Secrets(), (text) => sent.push(text), controller.signal);
  stopped.push("不发送"); stopped.finish();
  assert.deepEqual(sent, []);
});

test("运行核心在模型尚未完成时就公开短正文，最终消息替换草稿且内容一致", { timeout: 10000 }, async (t) => {
  const entered = gate(); const resume = gate();
  const model = new ScriptedModel(async (request) => {
    assert.equal(request.stream, true);
    request.onDelta?.("你好"); entered.release();
    await resume.wait;
    request.onDelta?.("，我在。");
    return reply("你好，我在。");
  });
  const ctx = await fixture(t, { model });
  ctx.profile.capabilities.stream = true; ctx.store.saveProfile(ctx.profile, null);
  const run = ctx.runtime.start(ctx.user, ctx.conversation.id, ctx.profile.id, "测试短回复", id());
  try {
    await entered.wait;
    assert.equal(ctx.store.run(ctx.user.id, run.id).status, "running");
    const before = ctx.runtime.snapshot(ctx.user, ctx.conversation.id);
    assert.deepEqual(Object.values(before.drafts), ["你好"]);
    assert.equal(before.messages.filter((message) => message.role === "assistant").length, 0);
    resume.release(); await ctx.runtime.waitIdle();
    const after = ctx.runtime.snapshot(ctx.user, ctx.conversation.id);
    assert.equal(ctx.store.run(ctx.user.id, run.id).status, "completed");
    assert.deepEqual(after.drafts, {});
    assert.equal(after.messages.find((message) => message.role === "assistant")?.content, "你好，我在。");
    const deltas = ctx.store.events(ctx.conversation.id).filter((event) => event.kind === "answer.delta");
    assert.equal(deltas.map((event) => event.data.text).join(""), "你好，我在。");
    assert.ok(deltas.length >= 2);
  } finally { resume.release(); await ctx.runtime.waitIdle(); }
});

test("运行停止后不补发缓存正文，不会让已经清空的草稿再次出现", { timeout: 10000 }, async (t) => {
  const entered = gate(); const resume = gate();
  const model = new ScriptedModel(async (request) => {
    request.onDelta?.("首段"); request.onDelta?.("尚未推送"); entered.release();
    await resume.wait;
    request.onDelta?.("迟到正文"); return reply("首段尚未推送迟到正文");
  });
  const ctx = await fixture(t, { model });
  ctx.profile.capabilities.stream = true; ctx.store.saveProfile(ctx.profile, null);
  const run = ctx.runtime.start(ctx.user, ctx.conversation.id, ctx.profile.id, "测试停止", id());
  try {
    await entered.wait;
    ctx.runtime.cancel(ctx.user, run.id);
    const cancelSeq = ctx.store.lastSeq(ctx.conversation.id);
    resume.release(); await ctx.runtime.waitIdle();
    assert.equal(ctx.store.run(ctx.user.id, run.id).status, "cancelled");
    assert.ok(!ctx.store.events(ctx.conversation.id, cancelSeq).some((event) => event.kind === "answer.delta"));
    assert.deepEqual(ctx.runtime.snapshot(ctx.user, ctx.conversation.id).drafts, {});
  } finally { resume.release(); await ctx.runtime.waitIdle(); }
});
