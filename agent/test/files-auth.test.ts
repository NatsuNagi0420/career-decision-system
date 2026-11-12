/** 青穗集 · 文件与账号回归：权限隔离、路径边界、版本持久化和安全凭据。 */
import test from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { mkdir, symlink } from "node:fs/promises";
import { fixture, temporary, TEST_KEY } from "./helpers.js";
import { safeRelative } from "../src/files.js";
import { Store } from "../src/store.js";
import { Auth, tokenHash } from "../src/auth.js";
import { Secrets } from "../src/secrets.js";
test("危险路径、Windows 保留名、只读 inputs 均被拒绝", () => {
  for (const value of [
    "../secret",
    "outputs/../x",
    "C:\\Windows\\x",
    "/etc/passwd",
    "outputs/CON.txt",
    "outputs/a:stream",
    "outputs/x.",
    "outputs//x",
    "outputs/x\u0000",
  ])
    assert.throws(() => safeRelative(value));
  assert.throws(() => safeRelative("inputs/a.txt", true));
  assert.equal(safeRelative("outputs\\正常.md", true), "outputs/正常.md");
});
test("仅允许用户选择的 UTF-8 文本，输入原文不可覆盖，重复导入不覆盖前件", async (t) => {
  const f = await fixture(t);
  const content = Buffer.from("事实，不是授权指令。").toString("base64");
  const first = await f.workspace.import(
    f.conversation.id,
    "经历.txt",
    content,
  );
  const second = await f.workspace.import(
    f.conversation.id,
    "经历.txt",
    content,
  );
  assert.notEqual(first.path, second.path);
  await assert.rejects(
    f.workspace.write(f.conversation.id, null, first.path, "改写"),
    /不能覆盖/,
  );
  for (const [name, base64] of [
    ["a.pdf", content],
    ["a.docx", content],
    ["a.txt", Buffer.from([255, 254]).toString("base64")],
    ["a.txt", "!!!"],
  ])
    await assert.rejects(f.workspace.import(f.conversation.id, name, base64));
  assert.match(
    (await f.workspace.read(f.conversation.id, first.path)).text,
    /事实/,
  );
});
test("项目导入保留嵌套相对路径，图片可保存，常见密钥文件被拒绝", async (t) => {
  const f = await fixture(t);
  const source = Buffer.from("export const answer = 42;", "utf8").toString("base64");
  const code = await f.workspace.import(f.conversation.id, "demo/src/main.ts", source);
  assert.equal(code.path, "inputs/demo/src/main.ts");
  assert.equal((await f.workspace.list(f.conversation.id)).some(file => file.path === code.path), true);
  const image = await f.workspace.import(f.conversation.id, "demo/docs/screenshot.png", Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).toString("base64"));
  assert.equal(image.name, "screenshot.png");
  assert.deepEqual(await f.workspace.artifactBytes(image), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  await assert.rejects(f.workspace.import(f.conversation.id, "demo/.env", source), /密钥/);
});
test("目录联接不能越过工作空间边界", async (t) => {
  const f = await fixture(t);
  const outside = await temporary("outside");
  await mkdir(outside, { recursive: true });
  const local = await f.workspace.root(f.conversation.id);
  try {
    await symlink(
      outside,
      join(local, "outputs", "外部"),
      process.platform === "win32" ? "junction" : "dir",
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EPERM") {
      t.skip("系统不允许创建测试链接");
      return;
    }
    throw error;
  }
  await assert.rejects(
    f.workspace.write(f.conversation.id, null, "outputs/外部/秘密.txt", "no"),
    /链接|联接/,
  );
});
test("同内容不重复登记版本；SQLite 重开后保留账号和会话", async () => {
  const dir = await temporary("persist");
  const file = join(dir, "agent.sqlite");
  const store = new Store(file);
  const auth = new Auth(store);
  const session = auth.register("持久化用户", "Local-test-password", true);
  const conversation = store.createConversation(session.user.id, null);
  const password = store.db.prepare("SELECT password_hash FROM users").get()!
    .password_hash;
  assert.notEqual(password, "Local-test-password");
  const saved = store.db.prepare("SELECT hash FROM sessions").get()!.hash;
  assert.equal(saved, tokenHash(session.token));
  assert.notEqual(saved, session.token);
  store.close();
  const reopened = new Store(file);
  try {
    assert.equal(
      reopened.conversation(session.user.id, conversation.id).id,
      conversation.id,
    );
    assert.equal(
      new Auth(reopened).user("Bearer " + session.token).username,
      "持久化用户",
    );
  } finally {
    reopened.close();
  }
});
test("跨账号不能读会话、文件、审批或模型配置；无鉴权时不会返回资料", async (t) => {
  const f = await fixture(t);
  const file = await f.workspace.write(
    f.conversation.id,
    null,
    "outputs/结果.md",
    "private",
  );
  const approval = await f.runtime.requestExport(f.user, file.id);
  const other = f.auth.register("other_user", "Other-test-password", true);
  const headers = { host: "localhost", authorization: "Bearer " + other.token };
  for (const url of [
    "/api/v1/agent/conversations/" + f.conversation.id,
    "/api/v1/agent/artifacts/" + file.id + "/preview",
  ])
    assert.equal((await f.app.inject({ url, headers })).statusCode, 404);
  assert.throws(() => f.store.approval(other.user.id, approval.id));
  assert.throws(() => f.store.profile(other.user.id, f.profile.id));
  assert.equal(
    (await f.app.inject("/api/v1/agent/conversations")).statusCode,
    401,
  );
});
test("本机 Host 与 Origin 边界、非法请求格式均生效", async (t) => {
  const f = await fixture(t);
  assert.equal(
    (await f.app.inject({ url: "/healthz", headers: { host: "evil.example" } }))
      .statusCode,
    403,
  );
  assert.equal(
    (
      await f.app.inject({
        url: "/api/v1/agent/models",
        headers: { ...f.headers, origin: "https://evil.example" },
      })
    ).statusCode,
    403,
  );
  assert.equal(
    (
      await f.app.inject({
        method: "POST",
        url: "/api/v1/agent/conversations",
        headers: f.headers,
        payload: { title: 2 },
      })
    ).statusCode,
    400,
  );
});
test("模型密钥只写不回显，默认不持久化；注销清除临时凭据", async (t) => {
  const f = await fixture(t);
  const response = await f.app.inject({
    url: "/api/v1/agent/models",
    headers: f.headers,
  });
  assert.equal(response.statusCode, 200);
  assert.ok(!response.body.includes(TEST_KEY));
  assert.equal(f.store.secret(f.user.id, f.profile.id), null);
  await f.app.inject({
    method: "POST",
    url: "/api/v1/auth/logout",
    headers: f.headers,
  });
  assert.equal(await f.secrets.get(f.user.id, f.profile.id, null), null);
  assert.equal(
    (await f.app.inject({ url: "/api/v1/auth/me", headers: f.headers }))
      .statusCode,
    401,
  );
});
test(
  "Windows DPAPI 实际加解密测试假密钥，不以明文落盘",
  { skip: process.platform !== "win32" },
  async () => {
    const first = new Secrets();
    const encrypted = await first.save(1, "test-profile", TEST_KEY, true);
    assert.ok(encrypted?.startsWith("dpapi:"));
    assert.ok(!encrypted!.includes(TEST_KEY));
    const afterRestart = new Secrets();
    assert.equal(
      await afterRestart.get(1, "test-profile", encrypted),
      TEST_KEY,
    );
  },
);
test("分片密钥脱敏保留不完整前缀，跨片也不会暴露完整凭据", async () => {
  const secrets = new Secrets();
  await secrets.save(1, "p", "abc-very-secret-key", false);
  const one = secrets.redactChunk("hello abc-very-");
  const two = secrets.redactChunk(one.rest + "secret-key done", true);
  assert.equal(one.safe + two.safe, "hello [已隐藏密钥] done");
  assert.equal(secrets.redactChunk("abc-very-", true).safe, "[已隐藏密钥片段]");
  assert.deepEqual(secrets.redactValue({ v: "abc-very-secret-key" }), {
    v: "[已隐藏密钥]",
  });
});

test("同一个文件的分隔符或 Windows 大小写不会拆出两条版本链", async (t) => {
  const f = await fixture(t);
  const first = await f.workspace.write(
    f.conversation.id,
    null,
    "outputs/Version.txt",
    "one",
  );
  const second = await f.workspace.write(
    f.conversation.id,
    null,
    ["outputs", "Version.txt"].join(String.fromCharCode(92)),
    "two",
  );
  assert.equal(second.version, 2);
  assert.equal(second.path, first.path);
  if (process.platform === "win32") {
    const third = await f.workspace.write(
      f.conversation.id,
      null,
      "outputs/version.txt",
      "three",
    );
    assert.equal(third.version, 3);
    assert.equal(third.path, first.path);
  }
});
