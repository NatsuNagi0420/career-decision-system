/** 青穗集 · 职业工作台回归：验证账号隔离、确认保存、来源校验和行动反馈；模型为明确标注的测试替身。 */
import test from "node:test";
import assert from "node:assert/strict";
import { fixture, ScriptedModel, reply, tool } from "./helpers.js";
import { CAREER_GUIDANCE_INSTRUCTIONS } from "../src/career-guidance.js";
import { emptyCareerState } from "../src/career.js";
import { id } from "../src/store.js";
import { catalogueFixture } from "./catalogue-fixture.js";

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

test("职业对话允许先保存部分画像草稿，并明确需要本人确认", () => {
  assert.match(CAREER_GUIDANCE_INSTRUCTIONS, /不必等六项字段齐全/);
  assert.match(CAREER_GUIDANCE_INSTRUCTIONS, /待确认草稿/);
});

test("画像草稿是增量更新，不会用未知空字段覆盖已有事实", async t => {
  const f = await fixture(t), career = f.runtime.career;
  const change = (value: unknown) => career.change(f.user.id, { revision: career.get(f.user.id).revision, change: value });
  change({ type: "profile.save", profile: inputProfile });
  const state = career.get(f.user.id);
  const proposal = career.propose(f.user.id, f.conversation.id, {
    context_version: state.context_version,
    title: "补充画像事实",
    data: { kind: "profile", profile: { goal: "寻找后端实习", education: "", experience: "", skills: "", preferences: "", weekly_hours: "" } },
  });
  const pending = career.get(f.user.id).proposals[0]!;
  assert.equal(pending.data.kind, "profile");
  if (pending.data.kind === "profile") {
    assert.equal(pending.data.profile.experience, inputProfile.experience);
    assert.equal(pending.data.profile.goal, "寻找后端实习");
  }
  const approved = change({ type: "proposal.decide", id: proposal.proposal_id, approved: true });
  assert.equal(approved.profile.experience, inputProfile.experience);
  assert.equal(approved.profile.goal, "寻找后端实习");
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


test("画像与保留岗位卡片可以按任意顺序连续确认，HTTP 状态与服务端校验一致", async t => {
  for (const first of ["profile", "catalogue_job"] as const) {
    await t.test(first, async t => {
      const f = await fixture(t, { catalogue: true }), career = f.runtime.career;
      const profileDraft = career.propose(f.user.id, f.conversation.id, { context_version: 0, title: "记录专业与经历", data: { kind: "profile", profile: inputProfile } });
      const jobDraft = career.propose(f.user.id, f.conversation.id, { context_version: 0, title: "保留岗位", data: { kind: "catalogue_job", catalogue_id: "new-frontend" } });
      const firstId = first === "profile" ? profileDraft.proposal_id : jobDraft.proposal_id;
      const secondId = first === "profile" ? jobDraft.proposal_id : profileDraft.proposal_id;
      const approve = (proposalId: string) => f.app.inject({ method: "POST", url: "/api/v1/agent/career/changes", headers: f.headers,
        payload: { revision: career.get(f.user.id).revision, change: { type: "proposal.decide", id: proposalId, approved: true } } });
      const saved = await approve(firstId);
      assert.equal(saved.statusCode, 200);
      const pending = saved.json().proposals.find((proposal: { id: string }) => proposal.id === secondId);
      assert.ok(pending);
      assert.notEqual(pending.context_version, saved.json().context_version);
      assert.equal(pending.stale, false);
      const second = await approve(secondId);
      assert.equal(second.statusCode, 200);
      assert.equal(second.json().profile.experience, inputProfile.experience);
      assert.equal(second.json().jobs[0].catalogue.catalogue_id, "new-frontend");
      assert.equal(second.json().proposals.length, 0);
      assert.equal((await approve(secondId)).statusCode, 404);
    });
  }
});

test("不同岗位草稿互不覆盖且能连续确认，同一岗位只替换自己的草稿", async t => {
  const f = await fixture(t, { catalogue: true }), career = f.runtime.career;
  const propose = (catalogue_id: string) => career.propose(f.user.id, f.conversation.id, { context_version: 0, title: catalogue_id, data: { kind: "catalogue_job", catalogue_id } });
  const first = propose("new-frontend");
  const second = propose("new-data");
  const replacement = propose("new-frontend");
  assert.deepEqual(career.get(f.user.id).proposals.map(proposal => proposal.id), [second.proposal_id, replacement.proposal_id]);
  assert.ok(!career.get(f.user.id).proposals.some(proposal => proposal.id === first.proposal_id));
  for (const proposalId of [replacement.proposal_id, second.proposal_id]) {
    assert.equal(career.view(f.user.id).proposals.find(proposal => proposal.id === proposalId)!.stale, false);
    career.change(f.user.id, { revision: career.get(f.user.id).revision, change: { type: "proposal.decide", id: proposalId, approved: true } });
  }
  assert.equal(career.get(f.user.id).jobs.length, 2);
});

test("旧版岗位卡片可恢复确认，但没有依据快照的旧画像仍保留冲突保护", async t => {
  const f = await fixture(t, { catalogue: true }), career = f.runtime.career;
  career.propose(f.user.id, f.conversation.id, { context_version: 0, title: "旧岗位卡片", data: { kind: "catalogue_job", catalogue_id: "new-frontend" } });
  career.propose(f.user.id, f.conversation.id, { context_version: 0, title: "旧画像草稿", data: { kind: "profile", profile: inputProfile } });
  const legacy = career.get(f.user.id);
  legacy.proposals.forEach(proposal => { delete proposal.basis_fingerprint; });
  f.store.db.prepare("UPDATE career_workspaces SET data=? WHERE user_id=?").run(JSON.stringify(legacy), f.user.id);
  career.change(f.user.id, { revision: legacy.revision, change: { type: "profile.save", profile: { ...inputProfile, goal: "新的本人目标" } } });
  const proposals = career.view(f.user.id).proposals;
  const job = proposals.find(proposal => proposal.data.kind === "catalogue_job")!;
  const profile = proposals.find(proposal => proposal.data.kind === "profile")!;
  assert.equal(job.stale, false);
  assert.equal(profile.stale, true);
  career.change(f.user.id, { revision: career.get(f.user.id).revision, change: { type: "proposal.decide", id: job.id, approved: true } });
  assert.throws(() => career.change(f.user.id, { revision: career.get(f.user.id).revision, change: { type: "proposal.decide", id: profile.id, approved: true } }), /旧资料/);
  assert.equal(career.get(f.user.id).profile.goal, "新的本人目标");
});

test("岗位库原文变化、重复保存与容量限制仍阻止过期岗位草稿", async t => {
  const f = await fixture(t, { catalogue: true }), career = f.runtime.career;
  const draft = career.propose(f.user.id, f.conversation.id, { context_version: 0, title: "保留岗位", data: { kind: "catalogue_job", catalogue_id: "new-frontend" } });
  const updated = catalogueFixture();
  updated.version = "synthetic-test-v2";
  updated.jobs.find(job => job.id === "new-frontend")!.company = "修改后的合成公司";
  career.catalogue.repository.import(updated, { expectedVersion: "synthetic-test-v1" });
  assert.equal(career.view(f.user.id).proposals[0]!.stale, true);
  assert.match(career.view(f.user.id).proposals[0]!.stale_reason!, /原文已更新/);
  assert.throws(() => career.change(f.user.id, { revision: career.get(f.user.id).revision, change: { type: "proposal.decide", id: draft.proposal_id, approved: true } }), /原文已更新/);
  const next = career.propose(f.user.id, f.conversation.id, { context_version: 0, title: "重新读取岗位", data: { kind: "catalogue_job", catalogue_id: "new-frontend" } });
  for (let i = 0; i < 8; i++) career.change(f.user.id, { revision: career.get(f.user.id).revision, change: { type: "job.add", job: { title: "合成岗位" + i, company: "", url: "", description: "测试用岗位材料。" } } });
  assert.equal(career.view(f.user.id).proposals[0]!.stale, true);
  assert.throws(() => career.change(f.user.id, { revision: career.get(f.user.id).revision, change: { type: "proposal.decide", id: next.proposal_id, approved: true } }), /最多保留/);
});

test("确认独立行动不会使画像草稿失效，真实修改画像仍阻止旧行动建议", async t => {
  const f = await fixture(t), career = f.runtime.career;
  const profileDraft = career.propose(f.user.id, f.conversation.id, { context_version: 0, title: "画像", data: { kind: "profile", profile: inputProfile } });
  const actionDraft = career.propose(f.user.id, f.conversation.id, { context_version: 0, title: "行动", data: { kind: "actions", actions: [action] } });
  const change = (proposalId: string) => career.change(f.user.id, { revision: career.get(f.user.id).revision, change: { type: "proposal.decide", id: proposalId, approved: true } });
  change(actionDraft.proposal_id);
  assert.equal(career.view(f.user.id).proposals[0]!.stale, false);
  change(profileDraft.proposal_id);
  const next = career.propose(f.user.id, f.conversation.id, { context_version: career.get(f.user.id).context_version, title: "另一行动", data: { kind: "actions", actions: [action] } });
  career.change(f.user.id, { revision: career.get(f.user.id).revision, change: { type: "profile.save", profile: { ...inputProfile, weekly_hours: "每周2小时" } } });
  assert.equal(career.view(f.user.id).proposals[0]!.stale, true);
  assert.throws(() => change(next.proposal_id), /旧资料/);
});

test("修改待确认岗位对照会先追问，说明改动后生成完整替代草稿", async t => {
  let jobId = "";
  const model = new ScriptedModel(request => {
    const latestUser = request.messages.filter(message => message.role === "user").at(-1)?.content ?? "";
    const latest = request.messages.at(-1);
    if (latest?.role === "user") return reply("", [tool("read_career_context", {})]);
    assert.equal(latest?.role, "tool");
    const payload = JSON.parse(latest!.content);
    if (payload.result?.proposal_id) return reply("新的待确认草稿已经整理好，请检查后再确认。", []);
    const context = payload.result;
    assert.equal(context.pending_proposals.length, 1);
    assert.equal(context.pending_proposals[0].data.kind, "comparison");
    assert.equal(context.pending_proposals[0].data.summary, "当前对照，地点还没有核对。");
    assert.equal(context.pending_proposals[0].data.checks[0].requirement, "熟悉 TypeScript");
    assert.equal(context.pending_proposals[0].stale, true);
    if (!latestUser.includes("北京")) return reply("你想调整哪一部分：地点判断、技能依据，还是待了解项？", []);
    return reply("", [tool("propose_career_update", {
      context_version: context.context_version,
      title: context.pending_proposals[0].title,
      data: {
        kind: "comparison",
        job_id: jobId,
        summary: "地点偏好改为北京；岗位原文未说明地点，仍需单独核对。",
        checks: [{
          requirement: "熟悉 TypeScript",
          assessment: "partial",
          reason: "有课程项目材料，但熟练程度仍需通过实践结果继续核对。",
          evidence: [{ source_id: "profile.experience", quote: "使用 TypeScript 完成校园活动网站。" }],
        }],
      },
    })]);
  });
  const f = await fixture(t, { model });
  const career = f.runtime.career;
  career.change(f.user.id, { revision: 0, change: { type: "profile.save", profile: inputProfile } });
  jobId = career.change(f.user.id, { revision: career.get(f.user.id).revision, change: { type: "job.add", job: { title: "前端实习", company: "测试岗位", url: "", description: "熟悉 TypeScript；能够完成表单校验。" } } }).jobs[0]!.id;
  const old = career.propose(f.user.id, f.conversation.id, {
    context_version: career.get(f.user.id).context_version,
    title: "对照目标岗位",
    data: { kind: "comparison", job_id: jobId, summary: "当前对照，地点还没有核对。", checks: [{
      requirement: "熟悉 TypeScript", assessment: "partial", reason: "有项目自述，熟练程度还不能确定。",
      evidence: [{ source_id: "profile.experience", quote: "使用 TypeScript 完成校园活动网站。" }],
    }] },
  });
  career.change(f.user.id, { revision: career.get(f.user.id).revision, change: { type: "profile.save", profile: { ...inputProfile, preferences: "希望在北京实习" } } });

  const first = f.runtime.start(f.user, f.conversation.id, f.profile.id, "我想修改职业工作台里这份待确认建议，请先问我想改哪一部分。", id());
  await f.runtime.waitIdle();
  assert.equal(f.store.run(f.user.id, first.id).status, "completed");
  assert.equal(career.get(f.user.id).proposals[0]!.id, old.proposal_id);
  const proposedCallsBefore = model.requests.flatMap(request => request.messages.flatMap(message => message.role === "assistant" ? message.tool_calls ?? [] : [])).filter(call => call.name === "propose_career_update");
  assert.equal(proposedCallsBefore.length, 0);

  const second = f.runtime.start(f.user, f.conversation.id, f.profile.id, "地点改为北京，其他对照内容先保留。", id());
  await f.runtime.waitIdle();
  assert.equal(f.store.run(f.user.id, second.id).status, "completed");
  const next = career.get(f.user.id).proposals[0]!;
  assert.notEqual(next.id, old.proposal_id);
  assert.equal(next.context_version, career.get(f.user.id).context_version);
  assert.equal(next.data.kind, "comparison");
  if (next.data.kind === "comparison") assert.match(next.data.summary, /北京/);
  const proposedCalls = model.requests.flatMap(request => request.messages.flatMap(message => message.role === "assistant" ? message.tool_calls ?? [] : [])).filter(call => call.name === "propose_career_update");
  assert.equal(proposedCalls.length, 1);
});
