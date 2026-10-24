/** 青穗集 · 数据库岗位回归：事务、来源与日期、确认保存、幂等和隔离，不依赖生产 JSON 副本。 */
import assert from "node:assert/strict";
import test from "node:test";
import { join } from "node:path";
import { JobCatalogue } from "../src/job-catalogue.js";
import { Store } from "../src/store.js";
import { catalogueFileSchema } from "../src/job-catalogue-schema.js";
import { catalogueAvailability, catalogueReferenceDay, catalogueReferenceNotice } from "../src/job-catalogue-contract.js";
import { fixture, temporary } from "./helpers.js";
import { catalogueFixture } from "./catalogue-fixture.js";
function memory(t: { after(fn: () => void): void }) {
  const store = new Store(":memory:"); t.after(() => store.close());
  const catalogue = new JobCatalogue(store); catalogue.repository.import(catalogueFixture(), { expectedVersion: null });
  return { store, catalogue };
}
test("事务写库后完整往返且重复导入不新增批次，独立连接与重启均可读取", async t => {
  const file = join(await temporary("catalogue-persistence"), "agent.sqlite"), data = catalogueFixture();
  const store = new Store(file), catalogue = new JobCatalogue(store);
  assert.equal(catalogue.repository.import(data, { expectedVersion: null }).imported, true);
  assert.equal(catalogue.repository.import(data, { expectedVersion: null }).imported, false);
  assert.deepEqual(catalogue.repository.read(), data); store.close();
  const reopened = new Store(file); t.after(() => reopened.close());
  assert.deepEqual(new JobCatalogue(reopened).repository.read(), data);
  assert.equal(Number(reopened.db.prepare("SELECT COUNT(*) AS n FROM catalogue_imports").get()!.n), 1);
});
test("无库内容或损坏时明确报错，不读演示或文件副本；不同 Store 不共享缓存", t => {
  const { catalogue } = memory(t), empty = new Store(":memory:"); t.after(() => empty.close());
  const other = new JobCatalogue(empty);
  assert.throws(() => other.searchJobSamples({}), /尚未导入/);
  assert.equal(catalogue.searchJobSamples({}).total, 5);
  empty.db.prepare("INSERT INTO catalogue_state VALUES(1,'broken','broken','{}')").run();
  assert.throws(() => other.listCareerDirections({}), /校验失败/);
});
test("新样本仅按显式分类，不能因为电子测试标题重回软件测试", t => {
  const { catalogue } = memory(t);
  assert.equal(catalogue.searchJobSamples({ query: "电子测试", scope: "collected", direction_code: "testing-quality" }).total, 0);
  assert.equal(catalogue.searchJobSamples({ query: "电子测试", scope: "collected", direction_code: "hardware-electronics" }).total, 1);
  assert.equal(catalogue.listCareerDirections({ limit: 25 }).directions.find(d => d.code === "hardware-electronics")!.collected_sample_count, 1);
});
test("默认排除关闭与过期，未知不等于开放，历史检索仍保留出处", t => {
  const { catalogue } = memory(t);
  assert.equal(catalogue.searchJobSamples({ scope: "collected" }).total, 3);
  assert.equal(catalogue.searchJobSamples({ scope: "collected", availability: "all_references" }).total, 5);
  for (const id of ["new-closed", "new-expired"]) {
    const job = catalogue.readJobSample({ id }).sample;
    assert.ok(["closed", "past_deadline"].includes(job.availability)); assert.match(job.reference_notice, /历史参考/);
  }
  assert.throws(() => catalogue.searchJobSamples({ availability: "open_now" }));
});
test("城市别名、关键词、阶段必须同时满足，不能自动放宽", t => {
  const { catalogue } = memory(t);
  assert.equal(catalogue.searchJobSamples({ query: "Data Analyst", city: "北京市", audience: "internship_mentioned" }).total, 1);
  assert.equal(catalogue.readJobSample({ id: "new-data" }).sample.city, "Beijing CN");
  assert.equal(catalogue.searchJobSamples({ query: "Data Analyst", city: "天津" }).total, 0);
  assert.equal(catalogue.searchJobSamples({ query: "前端", city: "天津" }).total, 1);
});
test("来源提示兼容旧快照，采集时开放不被解释为当前开放，日期按中国时区", t => {
  const { catalogue } = memory(t), origin = catalogue.catalogueSelection("new-frontend").catalogue;
  assert.match(catalogueReferenceNotice(origin, "2026-10-24"), /采集 2026-10-24/);
  assert.match(catalogueReferenceNotice(origin, "2026-10-24"), /冲突/);
  assert.match(catalogueReferenceNotice({ ...origin, recruitment_status: "open_explicit" }, "2026-10-24"), /采集时页面标注开放，当前状态需核实/);
  assert.equal(catalogueAvailability({ expires_at: "2026-10-24", recruitment_status: "unknown" }, "2026-10-24"), "unverified");
  assert.equal(catalogueAvailability({ expires_at: "2026-10-24", recruitment_status: "unknown" }, "2026-10-25"), "past_deadline");
  assert.equal(catalogueReferenceDay(new Date("2026-10-24T16:01:00Z")), "2026-10-25");
  const old = catalogue.catalogueSelection("legacy-test-1").catalogue; delete old.published_at; delete old.expires_at; delete old.recruitment_status;
  assert.match(catalogueReferenceNotice(old), /历史样本.*采集时间未知/);
});
test("HTTP 与职业保留工具共读当前 Store，用户确认后固定完整来源", async t => {
  const f = await fixture(t, { catalogue: true }), career = f.runtime.career;
  const result = await f.app.inject({ method: "GET", url: "/api/v1/agent/career/catalogue/jobs?scope=collected&direction_code=frontend&city=" + encodeURIComponent("天津"), headers: f.headers });
  assert.equal(result.statusCode, 200); assert.equal(result.json().samples[0].id, "new-frontend");
  const proposal = career.propose(f.user.id, f.conversation.id, { context_version: 0, title: "保留前端参考", data: { kind: "catalogue_job", catalogue_id: "new-frontend" } });
  assert.equal(career.get(f.user.id).jobs.length, 0);
  career.change(f.user.id, { revision: career.get(f.user.id).revision, change: { type: "proposal.decide", id: proposal.proposal_id, approved: true } });
  const saved = career.get(f.user.id).jobs[0]!;
  assert.equal(saved.description, career.catalogue.readJobSample({ id: "new-frontend" }).sample.description);
  assert.equal(saved.catalogue!.published_at, "2026-08-26"); assert.equal(saved.catalogue!.source_type, "university_job_board");
});
test("同版本异内容、并发覆盖和丢弃旧标识被拒；材料冲突时整批回滚", t => {
  const { store, catalogue } = memory(t), data = catalogueFixture();
  const changed = structuredClone(data); changed.notice = "changed";
  assert.throws(() => catalogue.repository.import(changed, { expectedVersion: data.version }), /不同内容/);
  changed.version = "synthetic-test-v2";
  assert.throws(() => catalogue.repository.import(changed, { expectedVersion: null }), /其他导入/);
  assert.throws(() => catalogue.repository.import(changed, { expectedVersion: data.version,
    materials: [{ key: "bad-original", batch_id: "test-batch", kind: "original_zip", content: Buffer.from("not-the-archive") }] }), /ZIP 哈希/);
  assert.deepEqual(catalogue.repository.read(), data);
  assert.equal(Number(store.db.prepare("SELECT COUNT(*) AS n FROM catalogue_imports").get()!.n), 1);
  changed.jobs.shift(); changed.source_stats.retained_jobs--; changed.source_stats.source_rows--;
  assert.throws(() => catalogue.repository.import(changed, { expectedVersion: data.version }), /丢弃已有岗位/);
});
test("导入格式拒绝丢失引文、伪造来源和不守恒计数", () => {
  const data = catalogueFixture(), changed = structuredClone(data);
  changed.jobs.find(job => job.data_kind === "collected")!.evidence[0]!.quote = "不在原文中的引文";
  assert.equal(catalogueFileSchema.safeParse(changed).success, false);
  const capture = structuredClone(data); capture.jobs.find(job => job.data_kind === "collected")!.captured_at = null;
  assert.equal(catalogueFileSchema.safeParse(capture).success, false);
  data.source_stats.retained_jobs++; assert.equal(catalogueFileSchema.safeParse(data).success, false);
});

test("另一连接导入后立即可见，无全局快照缓存；人工篡改正文会拒绝读取", async t => {
  const file = join(await temporary("catalogue-multi-connection"), "agent.sqlite"), first = new Store(file), second = new Store(file);
  t.after(() => { first.close(); second.close(); });
  const a = new JobCatalogue(first), b = new JobCatalogue(second), data = catalogueFixture();
  a.repository.import(data, { expectedVersion: null }); assert.equal(b.repository.read().version, data.version);
  data.version = "synthetic-test-v2"; data.notice = "new notice";
  a.repository.import(data, { expectedVersion: "synthetic-test-v1" });
  assert.equal(b.repository.read().version, "synthetic-test-v2"); assert.equal(b.repository.read().notice, "new notice");
  second.db.prepare("UPDATE catalogue_jobs SET data=json_set(data,'$.company','changed') WHERE id=?").run("new-frontend");
  assert.throws(() => a.searchJobSamples({}), /校验失败/);
});
