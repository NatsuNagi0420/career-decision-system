/** 青穗集 · 岗位库回归：清洗边界、检索约束、鉴权、确认保存及真实工具循环（模型为测试替身）。 */
import assert from "node:assert/strict";
import { JobCatalogue } from "../src/job-catalogue.js";
import { catalogueFixture } from "./catalogue-fixture.js";
import test, { after } from "node:test";
after(() => catalogueStore.close());
import { Store } from "../src/store.js";
import { guidedToolAllowed } from "../src/guidance.js";
import { fixture, reply, ScriptedModel, tool } from "./helpers.js";
import { id } from "../src/store.js";

const catalogueStore = new Store(":memory:");
const catalogue = new JobCatalogue(catalogueStore);
catalogue.repository.import(catalogueFixture(), { expectedVersion: null });

function sample() {
  const found = catalogue.searchJobSamples({ query: "测试", scope: "legacy", limit: 1 }).samples[0];
  assert.ok(found, "测试岗位应有历史样本，但不代表当前在招");
  return found;
}

test("数据库往返保留正文，保留原始文本和出处，不填造采集时间", () => {
  const data = catalogue.repository.read();
  assert.equal(data.schema_version, 2);
  assert.equal(data.jobs.length, data.source_stats.retained_jobs);
  assert.equal(data.source_stats.source_rows, data.jobs.length + data.source_stats.excluded_jobs);
  assert.equal(new Set(data.jobs.map((job: { id: string }) => job.id)).size, data.jobs.length);
  for (const job of data.jobs.filter(item => item.data_kind === "historical")) {
    assert.equal(job.source_platform, "zhaopin"); assert.equal(job.data_kind, "historical");
    assert.equal(job.captured_at, null); assert.equal(job.work_type, "unknown");
    assert.ok(job.description.length >= 80 && job.description.length <= 12000);
    assert.equal(typeof job.raw_description, "string"); assert.ok(job.content_hash);
  }
  const directions = catalogue.listCareerDirections({ limit: 25 });
  assert.equal(directions.directions.length, 25);
  assert.ok(directions.directions.every(item => item.review_status === "needs_review"));
  assert.match(directions.notice, /历史|未知/);
});

test("检索严格保留城市、关键词和阶段线索约束，零结果不表示市场不存在", () => {
  const first = sample();
  const matches = catalogue.searchJobSamples({ query: "测试", city: first.city, limit: 5 });
  assert.ok(matches.total > 0);
  assert.ok(matches.samples.every(job => { const full = catalogue.readJobSample({ id: job.id }).sample; return [full.city, ...full.locations, ...full.search_locations].some(city => city.includes(first.city)); }));
  assert.ok(matches.samples.length <= 5);
  const empty = catalogue.searchJobSamples({ query: "一个实际不存在的测试岗位关键词", city: "不存在的城市" });
  assert.equal(empty.total, 0); assert.equal(empty.samples.length, 0);
  assert.ok(empty.filter_notes.some(note => note.includes("不代表市场")));
  const interns = catalogue.searchJobSamples({ audience: "internship_mentioned", scope: "legacy", limit: 5 });
  assert.ok(interns.samples.every(job => job.audience_clues.includes("internship_mentioned") && job.work_type === "unknown"));
  assert.throws(() => catalogue.searchJobSamples({ direction_code: "made-up" }), /方向不存在/);
  assert.throws(() => catalogue.searchJobSamples({ limit: 100 }));
  assert.throws(() => catalogue.readJobSample({ id: "seed-1" }), /不存在或已被清洗/);
});

test("读取返回可引用的完整历史 JD，标题方向只是检索线索，不提供适合度", () => {
  const result = catalogue.searchJobSamples({ direction_code: "testing-quality", scope: "legacy", limit: 3 });
  assert.ok(result.total > 0);
  for (const found of result.samples) {
    const { sample: full } = catalogue.readJobSample({ id: found.id });
    assert.ok(full.description.startsWith(found.excerpt));
    assert.ok(full.title.includes("测试") || /QA|质量保证/i.test(full.title));
    assert.equal(full.captured_at, null);
    assert.equal("match_score" in full, false); assert.equal("raw_description" in full, false);
  }
  for (const kind of [undefined, "career", "learning", "resume"] as const)
    for (const name of ["list_career_directions", "search_job_samples", "read_job_sample"])
      assert.equal(guidedToolAllowed(kind, name), true);
});

test("岗位库接口要求登录且校验筛选，仅依赖当前主库，不依赖旧 Python 服务", async t => {
  const f = await fixture(t, { catalogue: true }), path = "/api/v1/agent/career/catalogue";
  assert.equal((await f.app.inject({ method: "GET", url: path + "/jobs" })).statusCode, 401);
  const result = await f.app.inject({ method: "GET", url: path + "/jobs?query=" + encodeURIComponent("测试") + "&scope=legacy&limit=2", headers: f.headers });
  assert.equal(result.statusCode, 200); assert.equal(result.json().samples.length, 2);
  const selected = result.json().samples[0];
  const detail = await f.app.inject({ method: "GET", url: path + "/jobs/" + selected.id, headers: f.headers });
  assert.equal(detail.statusCode, 200); assert.equal(detail.json().sample.captured_at, null);
  const directions = await f.app.inject({ method: "GET", url: path + "/directions?limit=25", headers: f.headers });
  assert.equal(directions.statusCode, 200); assert.equal(directions.json().directions.length, 25);
  assert.equal((await f.app.inject({ method: "GET", url: path + "/jobs?limit=999", headers: f.headers })).statusCode, 400);
  assert.equal((await f.app.inject({ method: "GET", url: path + "/jobs/no-such-job", headers: f.headers })).statusCode, 404);
});

test("模型只能提议保留岗位，确认后固定原文和历史来源，拒绝重复与伪造", async t => {
  const f = await fixture(t, { catalogue: true }), career = f.runtime.career, found = sample();
  const input = { context_version: 0, title: "保留一份测试岗位作为参考", data: { kind: "catalogue_job", catalogue_id: found.id } };
  const draft = career.propose(f.user.id, f.conversation.id, input);
  assert.equal(career.get(f.user.id).jobs.length, 0);
  const preview = career.view(f.user.id).proposals[0]!;
  assert.equal(preview.catalogue_sample!.title, found.title);
  assert.equal(preview.catalogue_sample!.description, catalogue.readJobSample({ id: found.id }).sample.description);
  assert.throws(() => career.propose(f.user.id, f.conversation.id, { ...input, data: { ...input.data, description: "伪造岗位要求" } }));
  const response = await f.app.inject({ method: "POST", url: "/api/v1/agent/career/changes", headers: f.headers,
    payload: { revision: career.get(f.user.id).revision, change: { type: "proposal.decide", id: draft.proposal_id, approved: true } } });
  assert.equal(response.statusCode, 200);
  const stored = career.get(f.user.id).jobs[0]!;
  assert.equal(stored.catalogue!.catalogue_id, found.id);
  assert.equal(stored.catalogue!.captured_at, null);
  assert.equal(stored.description, preview.catalogue_sample!.description);
  assert.equal(career.context(f.user.id).jobs[0]!.catalogue!.data_kind, "historical");
  assert.throws(() => career.propose(f.user.id, f.conversation.id, { ...input, context_version: 1 }), /无需重复/);
  const other = f.auth.register("catalogue_other", "Synthetic-password-2026", false);
  assert.equal(career.get(other.user.id).jobs.length, 0);
  assert.throws(() => career.propose(other.user.id, f.conversation.id, input), /不存在/);
});

test("放弃岗位建议不写资料；确认使用旧资料的建议被拒绝", async t => {
  const f = await fixture(t, { catalogue: true }), career = f.runtime.career;
  const input = { context_version: 0, title: "历史样本", data: { kind: "catalogue_job", catalogue_id: sample().id } };
  const first = career.propose(f.user.id, f.conversation.id, input);
  career.change(f.user.id, { revision: career.get(f.user.id).revision, change: { type: "proposal.decide", id: first.proposal_id, approved: false } });
  assert.equal(career.get(f.user.id).jobs.length, 0); assert.equal(career.get(f.user.id).context_version, 0);
  const draft = career.propose(f.user.id, f.conversation.id, input);
  career.change(f.user.id, { revision: career.get(f.user.id).revision, change: { type: "job.add", job: { title: "用户自带JD", company: "", url: "", description: "熟悉测试流程。" } } });
  assert.throws(() => career.change(f.user.id, { revision: career.get(f.user.id).revision, change: { type: "proposal.decide", id: draft.proposal_id, approved: true } }), /旧资料/);
  assert.equal(career.get(f.user.id).jobs.length, 1);
});

test("Agent 在当前职业对话中真实调用检索、读原文、读档案和提议工具", async t => {
  const chosen = sample();
  const model = new ScriptedModel((_request, index) => {
    if (index === 0) return reply("", [tool("search_job_samples", { query: "测试", limit: 1 })]);
    if (index === 1) return reply("", [tool("read_job_sample", { id: chosen.id }), tool("read_career_context", {})]);
    if (index === 2) return reply("", [tool("propose_career_update", { context_version: 0, title: "保留历史测试岗位", data: { kind: "catalogue_job", catalogue_id: chosen.id } })]);
    return reply("找到一份历史测试岗位，不能证明仍在招聘。已提出保留建议，请你确认后再对照经历。");
  });
  const f = await fixture(t, { model, catalogue: true });
  f.runtime.start(f.user, f.conversation.id, f.profile.id, "请找一份测试岗位历史样本供我参考。", id());
  await f.runtime.waitIdle();
  const snap = f.runtime.snapshot(f.user, f.conversation.id);
  assert.equal(snap.runs.at(-1)!.status, "completed");
  assert.equal(f.runtime.career.get(f.user.id).proposals[0]!.data.kind, "catalogue_job");
  assert.equal(f.runtime.career.get(f.user.id).jobs.length, 0);
  const toolResults = f.store.messages(f.conversation.id).filter(message => message.role === "tool").map(message => JSON.parse(message.content));
  assert.equal(toolResults.length, 4); assert.ok(toolResults.every(result => result.ok));
  assert.ok(model.requests[0]!.tools.some(definition => definition.name === "search_job_samples"));
});
