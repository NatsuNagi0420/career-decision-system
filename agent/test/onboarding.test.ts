/** 青穗集 · 入门引导回归：新旧账号、持久进度、不同账号与乱序请求，不调用真实模型。 */
import test from "node:test";
import assert from "node:assert/strict";
import { fixture } from "./helpers.js";
import { AccountIdentity } from "../src/account-identity.js";
import { ONBOARDING_LAST_STEP } from "../src/onboarding-contract.js";
const url = "/api/v1/agent/onboarding";
test("新账号首次进入教学，完成进度写入账号，重新登录不重置", async t => {
  const f = await fixture(t);
  const read = () => f.app.inject({ url, headers: f.headers });
  const change = (status: string, step: number) => f.app.inject({ url, method: "PATCH", headers: f.headers, payload: { status, step } });
  assert.equal((await read()).json().status, "pending");
  assert.equal((await change("pending", 1)).json().step, 1);
  assert.equal((await change("pending", 0)).json().step, 1);
  assert.equal((await change("pending", ONBOARDING_LAST_STEP)).json().step, ONBOARDING_LAST_STEP);
  const completed = (await change("completed", ONBOARDING_LAST_STEP)).json();
  assert.equal(completed.status, "completed");
  assert.equal(completed.step, ONBOARDING_LAST_STEP);
  assert.equal((await change("pending", 1)).json().status, "completed");
  const session = f.auth.login(f.user.username, "Test-only-password-2026");
  const again = await f.app.inject({ url, headers: { ...f.headers, authorization: "Bearer " + session.token } });
  assert.equal(again.json().status, "completed");
  assert.equal(f.model.requests.length, 0);
});
test("升级前已有账号不强制弹出，手动重看仍可记录进度", async t => {
  const f = await fixture(t);
  const result = f.store.db.prepare("INSERT INTO users(username,password_hash,consent) VALUES(?,?,0)").run("existing_before_tour", "!fixture");
  const existing = f.auth.session(Number(result.lastInsertRowid));
  const headers = { ...f.headers, authorization: "Bearer " + existing.token };
  assert.equal((await f.app.inject({ url, headers })).json().status, "legacy");
  const skipped = await f.app.inject({ url, headers, method: "PATCH", payload: { status: "skipped", step: 1 } });
  assert.equal(skipped.json().status, "skipped");
  assert.equal(f.store.onboarding(existing.user.id).status, "skipped");
  assert.equal(f.store.onboarding(f.user.id).status, "pending");
});
test("设备工作区初始化教学，重复 bootstrap 不覆盖已经跳过的状态", async t => {
  const f = await fixture(t);
  const identity = new AccountIdentity(f.store, f.auth, f.secrets, f.config);
  const session = identity.bootstrap();
  assert.equal(f.store.onboarding(session.user.id).status, "pending");
  f.store.updateOnboarding(session.user.id, { status: "skipped", step: 0 });
  assert.equal(identity.bootstrap().user.id, session.user.id);
  assert.equal(f.store.onboarding(session.user.id).status, "skipped");
});
test("教学接口需要登录且校验输入，不修改会话、模型配置或授权", async t => {
  const f = await fixture(t);
  assert.equal((await f.app.inject({ url, headers: { host: "localhost" } })).statusCode, 401);
  for (const payload of [{ status: "pending", step: ONBOARDING_LAST_STEP + 1 }, { status: "legacy", step: 0 }, { status: "completed", step: 2, user_id: 99 }]) {
    const result = await f.app.inject({ url, method: "PATCH", headers: f.headers, payload });
    assert.equal(result.statusCode, 400, result.body);
  }
  const before = JSON.stringify({ conversations: f.store.conversations(f.user.id), profiles: f.store.profiles(f.user.id), user: f.store.getUser(f.user.id) });
  const response = await f.app.inject({ url, method: "PATCH", headers: f.headers, payload: { status: "skipped", step: 0 } });
  assert.equal(response.statusCode, 200);
  assert.equal(JSON.stringify({ conversations: f.store.conversations(f.user.id), profiles: f.store.profiles(f.user.id), user: f.store.getUser(f.user.id) }), before);
  assert.equal(f.model.requests.length, 0);
});
