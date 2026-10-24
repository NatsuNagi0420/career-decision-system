/** 青穗集 · 职业工作台回归：验证账号隔离、确认保存、来源校验和行动反馈；模型为明确标注的测试替身。 */
import test from "node:test";
import assert from "node:assert/strict";
import { fixture, ScriptedModel, reply, tool } from "./helpers.js";
import { emptyCareerState } from "../src/career.js";
import { id } from "../src/store.js";

const profile = { ...emptyCareerState().profile, confirmed_at: undefined, goal: "寻找前端实习", experience: "使用 TypeScript 完成校园活动网站。" };
const { confirmed_at: _confirmed, ...inputProfile } = profile;
const action = { title: "给表单补充校验", job_id: null, why: "验证实际操作能力", learn: "表单校验与错误提示", deliverable: "代码链接与测试说明" };

test("职业接口要求登录、按账号隔离，并拒绝旧版本覆盖和空档案", async t => {
  const f = await fixture(t);
  const url = "/api/v1/agent/career";
  assert.equal((await f.app.inject({ method: "GET", url })).statusCode, 401);
  const initial = await f.app.inject({ method: "GET", url, headers: f.headers });
  assert.equal(initial.json().revision, 0);
  const saved = await f.app.inject({ method: "POST", url: url + "/changes", headers: f.headers,
    payload: { revision: 0, change: { type: "profile.save", profile: inputProfile } } });
  assert.equal(saved.statusCode, 200);
  assert.equal(saved.json().profile.goal, inputProfile.goal);
  assert.equal(saved.json().sources.find((s: { id: string }) => s.id === "profile.experience").text, inputProfile.experience);
  const conflict = await f.app.inject({ method: "POST", url: url + "/changes", headers: f.headers,
    payload: { revision: 0, change: { type: "profile.save", profile: { ...inputProfile, goal: "不能覆盖" } } } });
  assert.equal(conflict.statusCode, 409);
  assert.equal(f.runtime.career.get(f.user.id).profile.goal, inputProfile.goal);
  const other = f.auth.register("career_other", "Fixture-password-2026", false);
  const isolated = await f.app.inject({ method: "GET", url, headers: { authorization: "Bearer " + other.token, host: "localhost" } });
  assert.equal(isolated.json().revision, 0);
  assert.equal(isolated.json().profile.experience, "");
  assert.throws(() => f.runtime.career.change(f.user.id, { revision: 1, change: { type: "profile.save", profile: { ...inputProfile, goal: "", experience: "" } } }), /至少填写/);
});

test("职业工具读取后只能提交草稿，用户确认才保存，跨对话继续读取", async t => {
  const model = new ScriptedModel((request, index) => {
    if (index === 0) return reply("", [tool("read_career_context", {})]);
    if (index === 1) {
      const context = JSON.parse(request.messages.at(-1)!.content).result;
      assert.equal(context.context_version, 0);
      return reply("", [tool("propose_career_update", { context_version: context.context_version, title: "待确认的档案", data: { kind: "profile", profile: inputProfile } })]);
    }
    return reply("整理建议已放入工作台，等待确认。");
  });
  const f = await fixture(t, { model });
  const run = f.runtime.start(f.user, f.conversation.id, f.profile.id, "请整理我的经历", id());
  await f.runtime.waitIdle();
  assert.equal(f.store.run(f.user.id, run.id).status, "completed");
  const pending = f.runtime.career.get(f.user.id);
  assert.equal(pending.profile.confirmed_at, null);
  assert.equal(pending.proposals.length, 1);
  const approved = f.runtime.career.change(f.user.id, { revision: pending.revision, change: { type: "proposal.decide", id: pending.proposals[0]!.id, approved: true } });
  assert.equal(approved.profile.goal, inputProfile.goal);
  assert.ok(approved.profile.confirmed_at);
  assert.equal(approved.proposals.length, 0);
  f.store.createConversation(f.user.id, f.profile.id);
  assert.equal(f.runtime.career.context(f.user.id).profile.experience, inputProfile.experience);
});

test("岗位分析拒绝虚构要求和引文，行动反馈使旧分析失效，更新后保留历史", async t => {
  const f = await fixture(t), career = f.runtime.career;
  const change = (value: unknown) => career.change(f.user.id, { revision: career.get(f.user.id).revision, change: value });
  change({ type: "profile.save", profile: inputProfile });
  const state = change({ type: "job.add", job: { title: "前端实习", company: "测试岗位样本", url: "", description: "熟悉 TypeScript；能够完成表单校验。" } });
  const job = state.jobs[0]!;
  const draft = () => ({ context_version: career.get(f.user.id).context_version, title: "岗位对照", data: { kind: "comparison" as const, job_id: job.id, summary: "TypeScript 有材料，表单校验还需实践。", checks: [
    { requirement: "熟悉 TypeScript", assessment: "partial" as const, reason: "有项目自述，熟练程度还不能确定。", evidence: [{ source_id: "profile.experience", quote: "使用 TypeScript 完成校园活动网站。" }] },
    { requirement: "能够完成表单校验", assessment: "unknown" as const, reason: "目前没有相关结果材料。", evidence: [] },
  ] } });
  const forged = draft(); forged.data.checks[0]!.evidence[0]!.quote = "不存在的经历";
  assert.throws(() => career.propose(f.user.id, f.conversation.id, forged), /引文或来源不存在/);
  const fakeRequirement = draft(); fakeRequirement.data.checks[0]!.requirement = "熟悉 Rust";
  assert.throws(() => career.propose(f.user.id, f.conversation.id, fakeRequirement), /逐字引用岗位原文/);
  const ownJob = draft(); ownJob.data.checks[0]!.evidence = [{ source_id: "job." + job.id, quote: "熟悉 TypeScript" }];
  assert.throws(() => career.propose(f.user.id, f.conversation.id, ownJob), /引文或来源不存在/);
  const proposed = career.propose(f.user.id, f.conversation.id, draft());
  change({ type: "proposal.decide", id: proposed.proposal_id, approved: true });
  assert.equal(career.view(f.user.id).comparisons[0]!.stale, false);
  const added = change({ type: "action.add", action: { ...action, job_id: job.id } });
  const actionId = added.actions[0]!.id;
  assert.throws(() => change({ type: "action.update", id: actionId, status: "done", result: "" }), /补充完成结果/);
  change({ type: "action.update", id: actionId, status: "done", result: "已为报名表添加必填校验，并测试空值提示。" });
  assert.equal(career.view(f.user.id).comparisons[0]!.stale, true);
  assert.ok(career.context(f.user.id).sources.some(s => s.id === "action." + actionId));
  const updated = draft();
  updated.data.summary = "增加了表单实践的自述结果，仍需核实代码。";
  updated.data.checks[1] = { requirement: "能够完成表单校验", assessment: "partial", reason: "新增了实际完成结果的自述。", evidence: [{ source_id: "action." + actionId, quote: "已为报名表添加必填校验" }] };
  const next = career.propose(f.user.id, f.conversation.id, updated);
  change({ type: "proposal.decide", id: next.proposal_id, approved: true });
  const history = career.view(f.user.id).comparisons;
  assert.equal(history.length, 2); assert.equal(history[0]!.stale, true); assert.equal(history[1]!.stale, false);
});

test("资料变化后拒绝确认旧草稿，拒绝建议不改变上下文，岗位删除清理关联", async t => {
  const f = await fixture(t), career = f.runtime.career;
  const change = (value: unknown) => career.change(f.user.id, { revision: career.get(f.user.id).revision, change: value });
  const draft = career.propose(f.user.id, f.conversation.id, { context_version: 0, title: "学习行动建议", data: { kind: "actions", actions: [action] } });
  change({ type: "profile.save", profile: inputProfile });
  assert.throws(() => change({ type: "proposal.decide", id: draft.proposal_id, approved: true }), /旧资料/);
  assert.equal(career.get(f.user.id).actions.length, 0);
  const rejected = change({ type: "proposal.decide", id: draft.proposal_id, approved: false });
  assert.equal(rejected.context_version, 1);
  const job = change({ type: "job.add", job: { title: "样本", company: "", url: "", description: "会写 TypeScript" } }).jobs[0]!;
  change({ type: "action.add", action: { ...action, job_id: job.id } });
  const removed = change({ type: "job.delete", id: job.id });
  assert.equal(removed.jobs.length, 0); assert.equal(removed.actions[0]!.job_id, null);
  const other = f.auth.register("different_career", "Fixture-password-2026", false);
  assert.throws(() => career.propose(other.user.id, f.conversation.id, { context_version: 0, title: "不能跨账号", data: { kind: "actions", actions: [action] } }), /不存在/);
});
