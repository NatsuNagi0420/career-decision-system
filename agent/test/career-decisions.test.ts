/** 青穗集 · 职业判断闭环回归：引用必须来自用户原话，计划与实际经历分开，确认后才进入画像。 */
import test from "node:test";
import assert from "node:assert/strict";
import { DECISION_POLICY_VERSION, DECISION_TEMPLATE_VERSION, type DecisionTask, type DecisionResult } from "../src/career-decision-contract.js";
import { validateCareerDecision } from "../src/career-decision-validation.js";
import { fixture, reply } from "./helpers.js";

function resultFor(task: DecisionTask): DecisionResult {
  return {
    kind: task.kind, template_version: DECISION_TEMPLATE_VERSION, policy_version: DECISION_POLICY_VERSION,
    model: "fixture-jev", question_count: 0, duration_ms: 2,
    facts: task.kind === "turn_review" ? task.facts.map(fact => ({ id: fact.id, category: fact.field === "goal" ? "plan" as const : "actual" as const, support: "supported" as const, conflict: false })) : [],
    jobs: [], follow_up: null,
    claims: task.kind === "resume_guard" ? task.claims.map(claim => ({ id: claim.id, status: "supported" as const })) : [],
    trace: { questions: {}, answers: {} },
  };
}

test("职业判断结果必须完整对应当前材料，缺项不能默认通过", () => {
  const task: DecisionTask = { kind: "turn_review", facts: [{ id: "f1", field: "skills", text: "做过 React 项目", evidence: [{ source_id: "message.m1", quote: "我做过 React 项目" }] }], previous: {}, followups: [] };
  assert.doesNotThrow(() => validateCareerDecision(task, resultFor(task)));
  assert.throws(() => validateCareerDecision(task, { ...resultFor(task), facts: [] }), /职业判断缺少当前材料/);
});

test("对话线索保留原话，确认实际经历与计划进入不同画像字段", async t => {
  const f = await fixture(t);
  f.config.officialUrl = "http://official.fixture/v1";
  f.config.officialToken = "fixture-official-token";
  f.config.officialModel = "fixture-main";
  f.profile.mode = "official";
  f.store.saveProfile(f.profile, null);
  f.profiles.decisionFactory = async task => resultFor(task);
  const message = f.store.message(f.conversation.id, null, "user", "我做过 React 项目，之后想学习后端。", {});
  await f.runtime.decisions.observe(f.user, f.profile, f.conversation.id, message.id, {
    facts: [
      { field: "skills", text: "做过 React 项目", evidence: [{ source_id: "message." + message.id, quote: "我做过 React 项目" }] },
      { field: "goal", text: "之后想学习后端", evidence: [{ source_id: "message." + message.id, quote: "之后想学习后端" }] },
    ], followups: [],
  }, new AbortController().signal);
  const pending = f.runtime.decisions.view(f.user.id).facts;
  assert.equal(pending.length, 2);
  const skill = pending.find(item => item.field === "skills")!;
  const goal = pending.find(item => item.field === "goal")!;
  assert.equal(skill.confirmable, true);
  assert.equal(goal.category, "plan");
  assert.equal(goal.confirmable, true);
  f.runtime.decisions.resolve(f.user, skill.id, "confirm");
  f.runtime.decisions.resolve(f.user, goal.id, "confirm");
  const profile = f.runtime.career.get(f.user.id).profile;
  assert.match(profile.skills, /React/);
  assert.match(profile.goal, /后端/);
});

async function officialFixture(t: Parameters<typeof fixture>[0]) {
  const f = await fixture(t);
  f.config.officialUrl = "http://official.fixture/v1";
  f.config.officialToken = "fixture-official-token";
  f.config.officialModel = "fixture-main";
  f.profile.mode = "official";
  f.store.saveProfile(f.profile, null);
  f.profiles.decisionFactory = async task => resultFor(task);
  return f;
}

test("未经用户确认不更新画像，伪造原话与助手转述不能充当依据", async t => {
  const f = await officialFixture(t);
  const message = f.store.message(f.conversation.id, null, "user", "我用 React 写过登录表单。", {});
  const assistant = f.store.message(f.conversation.id, null, "assistant", "用户精通分布式架构。", {});
  await f.runtime.decisions.observe(f.user, f.profile, f.conversation.id, message.id, { facts: [
    { field: "experience", text: "写过登录表单", evidence: [{ source_id: "message." + message.id, quote: "我用 React 写过登录表单" }] },
    { field: "skills", text: "精通分布式架构", evidence: [{ source_id: "message." + message.id, quote: "精通分布式架构" }] },
    { field: "skills", text: "精通分布式架构", evidence: [{ source_id: "message." + assistant.id, quote: "用户精通分布式架构" }] },
  ], followups: [] }, new AbortController().signal);
  const pending = f.runtime.decisions.view(f.user.id).facts;
  assert.equal(pending.length, 1);
  assert.equal(f.runtime.career.get(f.user.id).profile.confirmed_at, null);
  assert.equal(f.runtime.career.get(f.user.id).profile.experience, "");
});

test("判断服务失败保留原话但不能默认确认，自配模式不调用官方判断", async t => {
  const f = await officialFixture(t);
  let calls = 0;
  f.profiles.decisionFactory = async () => { calls++; throw new Error("fixture unavailable"); };
  const message = f.store.message(f.conversation.id, null, "user", "我写过登录表单。", {});
  const input = { facts: [{ field: "experience", text: "写过登录表单", evidence: [{ source_id: "message." + message.id, quote: "我写过登录表单" }] }], followups: [] };
  await f.runtime.decisions.observe(f.user, f.profile, f.conversation.id, message.id, input, new AbortController().signal);
  const pending = f.runtime.decisions.view(f.user.id).facts[0]!;
  assert.equal(pending.support, "unchecked"); assert.equal(pending.confirmable, false);
  assert.throws(() => f.runtime.decisions.resolve(f.user, pending.id, "confirm"), /仍需补充依据/);
  f.profile.mode = "custom";
  await f.runtime.decisions.observe(f.user, f.profile, f.conversation.id, message.id, input, new AbortController().signal);
  assert.equal(calls, 1);
});

test("画像追问和进度只属于当前会话，用户继续发言后旧追问失效", async t => {
  const f = await officialFixture(t);
  f.profiles.decisionFactory = async task => ({ ...resultFor(task), follow_up: task.kind === "turn_review" ? task.followups[0] ?? null : null });
  const message = f.store.message(f.conversation.id, null, "user", "我写过登录表单。", {});
  await f.runtime.decisions.observe(f.user, f.profile, f.conversation.id, message.id, { facts: [], followups: [{ id: "q", question: "你具体负责哪一部分？", purpose: "了解实际职责。" }] }, new AbortController().signal);
  const current = f.runtime.decisions.view(f.user.id, f.conversation.id);
  assert.equal(current.follow_up?.id, "q");
  const other = f.store.createConversation(f.user.id, f.profile.id, "另一段对话");
  const separate = f.runtime.decisions.view(f.user.id, other.id);
  assert.equal(separate.follow_up, null); assert.equal(separate.activity, null);
  f.store.message(f.conversation.id, null, "user", "我负责了表单校验。", {});
  f.store.db.prepare("UPDATE career_decision_runs SET created_at='2026-01-01T00:00:00.000Z' WHERE user_id=?").run(f.user.id);
  assert.equal(f.runtime.decisions.view(f.user.id, f.conversation.id).follow_up, null);
});

test("主模型把计划写成 plan 字段时规范为目标，单条坏结构不丢掉其他有效原话", async t => {
  const f = await officialFixture(t);
  const message = f.store.message(f.conversation.id, null, "user", "我写过 React 页面，下个月想学 Redis。", {});
  await f.runtime.decisions.observe(f.user, f.profile, f.conversation.id, message.id, { facts: [
    { field: "experience", text: "写过 React 页面", evidence: [{ source_id: message.id, quote: "我写过 React 页面" }] },
    { field: "plan", text: "下个月想学 Redis", evidence: [{ source_id: "message." + message.id, quote: "下个月想学 Redis" }] },
    { field: "unknown_field", text: "格式有误的一条" },
  ], followups: [] }, new AbortController().signal);
  const pending = f.runtime.decisions.view(f.user.id).facts;
  assert.equal(pending.length, 2);
  assert.equal(pending.find(item => item.field === "goal")?.category, "plan");
  assert.equal(pending.find(item => item.field === "experience")?.evidence[0]?.source_id, "message." + message.id);
});

test("自动整理复用结果，用户明确重新整理时才再次调用模型", async t => {
  const f = await fixture(t);
  f.model.respond = () => reply(JSON.stringify({ summary: "用户做过登录页面。", next_step: "可补充负责的功能。", suggestion: null }));
  const message = f.store.message(f.conversation.id, null, "user", "我做过登录页面。", {});
  await f.runtime.guidance.analyze(f.user, f.conversation.id, f.profile.id, message.id);
  await f.runtime.guidance.analyze(f.user, f.conversation.id, f.profile.id, message.id);
  assert.equal(f.model.requests.length, 1);
  await f.runtime.guidance.analyze(f.user, f.conversation.id, f.profile.id, message.id, true);
  assert.equal(f.model.requests.length, 2);
});
