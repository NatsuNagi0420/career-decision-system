/** 青穗集 · 测试资料回归：验证资料完整、身份隔离、事务回滚与重复初始化不覆盖用户修改。 */
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prepareTestWorkspace } from "../scripts/fixtures/test-workspace.js";
import { CareerWorkspace } from "../src/career.js";
import { ResumeWorkspace, validateResumeBody } from "../src/resume.js";
import { AccountIdentity } from "../src/account-identity.js";
import { fixture } from "./helpers.js";

async function setup(t: Parameters<typeof fixture>[0]) {
  const f = await fixture(t);
  const config = { ...f.config, officialUrl: "https://accounts.example.invalid", officialModel: "fixture-only" };
  new AccountIdentity(f.store, f.auth, f.secrets, config);
  const user = f.auth.register("suinai_test_abcdef12", "Fixture-password-only", true).user;
  f.store.db.prepare("INSERT INTO account_identities(issuer,subject,user_id,username) VALUES(?,?,?,?)").run(config.officialUrl, "fixture-123", user.id, user.username);
  const profile = await f.profiles.save(user, { name: "测试模型", mode: "custom", base_url: "https://example.invalid/v1", model: "fixture-only", api_key: "fixture-only" });
  const input = { userId: user.id, profileId: profile.id, username: user.username, subject: "fixture-123", seedKey: randomUUID() };
  return { ...f, config, input, user };
}

test("专用测试号包含可继续的画像、学习与简历，并保留来源引用和其他账号", async t => {
  const f = await setup(t), existing = f.store.conversations(1);
  const result = prepareTestWorkspace(f.store, f.config, f.input);
  assert.equal(result.created, true);
  const career = new CareerWorkspace(f.store), state = career.view(f.user.id);
  assert.equal(state.jobs.length, 1);
  assert.equal(state.skills?.length, 4);
  assert.equal(state.comparisons[0].stale, false);
  const learning = career.learning.get(f.user.id);
  assert.deepEqual(learning.paths[0].nodes.map(node => node.status), ["done", "doing", "todo"]);
  const resume = new ResumeWorkspace(f.store), draft = resume.get(f.user.id);
  assert.ok(draft.confirmed_at && draft.facts_confirmed && draft.selection_confirmed);
  validateResumeBody(draft, draft.body!, true);
  assert.equal(resume.confirmed(f.user.id, draft.revision).header.name, "林穗（虚构测试）");
  assert.equal(f.store.conversations(f.user.id).length, 3);
  for (const conversation of result.summary.conversations) {
    assert.equal(f.store.messages(conversation.id).length, 2);
    assert.ok(f.store.conversation(f.user.id, conversation.id).guidance?.active_task_id);
    assert.throws(() => f.store.conversation(1, conversation.id), /不存在/);
  }
  assert.deepEqual(f.store.conversations(1), existing);
  assert.equal(career.get(1).revision, 0);
  assert.equal(f.model.requests.length, 0);
});

test("再次准备保留测试时的修改，错误归属与非空账号不能覆盖", async t => {
  const f = await setup(t), first = prepareTestWorkspace(f.store, f.config, f.input);
  const career = new CareerWorkspace(f.store), learning = career.learning;
  learning.change(f.user.id, { revision: learning.get(f.user.id).revision, change: { type: "node.update", path_id: first.summary.pathId, key: "react", status: "doing", notes: "我刚刚改过的学习笔记", result: "" } });
  const before = learning.get(f.user.id);
  const second = prepareTestWorkspace(f.store, f.config, f.input);
  assert.equal(second.created, false);
  assert.deepEqual(second.summary, first.summary);
  assert.deepEqual(learning.get(f.user.id), before);
  assert.throws(() => prepareTestWorkspace(f.store, f.config, { ...f.input, seedKey: randomUUID() }), /归属/);
  assert.throws(() => prepareTestWorkspace(f.store, f.config, { ...f.input, username: "NatsuNagi" }), /专用/);
  assert.throws(() => prepareTestWorkspace(f.store, { ...f.config, deploymentMode: "server" }, f.input), /本机/);
});

test("已有资料的账号拒绝初始化，种子失败完整回滚并允许修复后重试", async t => {
  const f = await setup(t);
  const existing = f.store.createConversation(f.user.id, f.input.profileId, "已经有内容");
  assert.throws(() => prepareTestWorkspace(f.store, f.config, f.input), /账号已有资料/);
  assert.equal(new CareerWorkspace(f.store).get(f.user.id).revision, 0);
  f.store.deleteConversation(f.user.id, existing.id);
  f.store.db.exec("CREATE TRIGGER reject_seed_resume BEFORE INSERT ON resume_history BEGIN SELECT RAISE(ABORT, 'seed-test-failure'); END;");
  assert.throws(() => prepareTestWorkspace(f.store, f.config, f.input), /seed-test-failure/);
  assert.equal(f.store.conversations(f.user.id).length, 0);
  assert.equal(new CareerWorkspace(f.store).get(f.user.id).revision, 0);
  assert.equal(new ResumeWorkspace(f.store).get(f.user.id).revision, 0);
  f.store.db.exec("DROP TRIGGER reject_seed_resume;");
  assert.equal(prepareTestWorkspace(f.store, f.config, f.input).created, true);
});
