/** 青穗集 · 六组件数据回归：收藏按账号持久化，技能阶段只引用个人材料并经本人确认。 */
import test from "node:test";
import assert from "node:assert/strict";
import { fixture } from "./helpers.js";
import { CareerWorkspace, emptyCareerState } from "../src/career.js";
const profile = { ...emptyCareerState().profile, confirmed_at: undefined, experience: "我用 React 制作了课程项目的登录表单，并独立处理了输入校验。" };
const { confirmed_at: _confirmed, ...inputProfile } = profile;

test("岗位收藏持久化、隔离账号且不修改画像或职业方向", async t => {
  const f = await fixture(t, { catalogue: true });
  const change = (catalogue_id: string, saved: boolean) => f.app.inject({ method: "POST", url: "/api/v1/agent/career/changes", headers: f.headers, payload: {
    revision: f.runtime.career.get(f.user.id).revision, change: { type: "catalogue.save", catalogue_id, saved }
  } });
  assert.equal((await change("not-a-real-job", true)).statusCode, 404);
  assert.equal(f.runtime.career.get(f.user.id).revision, 0);
  const saved = await change("new-frontend", true);
  assert.equal(saved.statusCode, 200);
  assert.equal(saved.json().saved_jobs[0].catalogue_id, "new-frontend");
  assert.equal(saved.json().context_version, 0);
  assert.equal(saved.json().jobs.length, 0);
  assert.equal(saved.json().profile.confirmed_at, null);
  assert.equal((await change("new-frontend", true)).json().saved_jobs.length, 1);
  const reopened = new CareerWorkspace(f.store);
  assert.equal(reopened.view(f.user.id).saved_jobs.length, 1);
  const other = f.auth.register("bookmark_other", "Fixture-password-2026", false);
  assert.equal(reopened.view(other.user.id).saved_jobs.length, 0);
  reopened.change(other.user.id, { revision: 0, change: { type: "catalogue.save", catalogue_id: "new-frontend", saved: false } });
  assert.equal(reopened.view(f.user.id).saved_jobs.length, 1);
  assert.equal((await change("new-frontend", false)).json().saved_jobs.length, 0);
});

test("岗位收藏不占用已确认岗位材料的八份额度", async t => {
  const f = await fixture(t, { catalogue: true }), career = f.runtime.career;
  for (let i = 0; i < 8; i++) career.change(f.user.id, { revision: career.get(f.user.id).revision, change: { type: "job.add", job: { title: "合成岗位" + i, company: "测试", url: "", description: "仅用于验证材料数量边界" } } });
  const before = career.get(f.user.id);
  career.change(f.user.id, { revision: before.revision, change: { type: "catalogue.save", catalogue_id: "new-frontend", saved: true } });
  assert.equal(career.view(f.user.id).saved_jobs.length, 1);
  assert.equal(career.get(f.user.id).jobs.length, 8);
  assert.equal(career.get(f.user.id).context_version, before.context_version);
});

test("技能拒绝岗位要求与虚构引文，确认后才生效并拦截旧资料草稿", async t => {
  const f = await fixture(t), career = f.runtime.career;
  const change = (value: unknown) => career.change(f.user.id, { revision: career.get(f.user.id).revision, change: value });
  change({ type: "profile.save", profile: inputProfile });
  const job = change({ type: "job.add", job: { title: "前端测试岗位", company: "", url: "", description: "要求独立负责 React 项目。" } }).jobs[0]!;
  const propose = (source_id: string, quote: string) => career.propose(f.user.id, f.conversation.id, { context_version: career.get(f.user.id).context_version, title: "确认 React 实践", data: { kind: "skills", skills: [{ name: "React", stage: "project", evidence: [{ source_id, quote }] }] } });
  assert.throws(() => propose("job." + job.id, "要求独立负责 React 项目。"), /个人经历|岗位要求/);
  assert.throws(() => propose("profile.experience", "我有五年 React 工作经验"), /逐字引用/);
  const pending = propose("profile.experience", "我用 React 制作了课程项目的登录表单");
  assert.equal(career.get(f.user.id).skills?.length ?? 0, 0);
  const approved = change({ type: "proposal.decide", id: pending.proposal_id, approved: true });
  assert.equal(approved.skills?.[0]?.stage, "project");
  assert.ok(approved.skills?.[0]?.confirmed_at);
  assert.equal(career.context(f.user.id).skills[0]?.evidence[0]?.source_id, "profile.experience");
  const stale = propose("profile.experience", "我用 React 制作了课程项目的登录表单");
  change({ type: "profile.save", profile: { ...inputProfile, experience: "修正：我仅使用了课程给出的 React 表单模板。" } });
  assert.throws(() => change({ type: "proposal.decide", id: stale.proposal_id, approved: true }), /旧资料/);
  assert.equal(career.get(f.user.id).skills?.[0]?.evidence[0]?.quote, "我用 React 制作了课程项目的登录表单");
});
