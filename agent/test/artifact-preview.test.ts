/** 青穗集 · 文件交付回归：核验预览类型、鉴权、云端禁用系统打开、只读版本副本与路径隔离；不启动真实系统应用。 */
import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile, symlink, readdir } from "node:fs/promises";
import { join, resolve, basename } from "node:path";
import { describePreview } from "../src/artifact-preview.js";
import { canOpenArtifact, localFileAccess, materializeArtifact, type LocalFileAction } from "../src/local-artifacts.js";
import { createApp } from "../src/http.js";
import { loadConfig } from "../src/config.js";
import { noSandbox } from "./helpers.js";
async function setup(t: TestContext, mode = "local") {
  const logs = resolve("../logs/file-link-preview-20261022/unit-data"); await mkdir(logs, { recursive: true });
  const dir = await mkdtemp(join(logs, "preview-"));
  const calls: Array<{ path: string; action: LocalFileAction }> = [];
  const ctx = createApp({ config: loadConfig({ AGENT_DATA_DIR: dir, AGENT_DEPLOYMENT_MODE: mode }), sandbox: noSandbox, localFileLauncher: async (path, action) => { calls.push({ path, action }); } });
  const session = ctx.auth.register("preview_owner", "Fixture-only-password-2026", true);
  const conversation = ctx.store.createConversation(session.user.id, null);
  t.after(async () => { await ctx.app.close(); });
  const headers = { host: "localhost", authorization: "Bearer " + session.token };
  const publish = async (name: string, data: Buffer) => {
    const root = await ctx.workspace.root(conversation.id);
    await writeFile(join(root, "outputs", name), data);
    return ctx.workspace.publish(conversation.id, null, "outputs/" + name);
  };
  return { ...ctx, dir, session, conversation, headers, calls, publish };
}
test("预览按内容识别图片/PDF；文本按格式排版，拒绝伪装与乱码", () => {
  for (const [name, kind] of [["a.md", "markdown"], ["a.json", "json"], ["a.csv", "csv"], ["a.html", "html"], ["a.ts", "text"]]) assert.equal(describePreview(name!, Buffer.from("hello")).preview_kind, kind);
  assert.equal(describePreview("a.png", Buffer.from([137,80,78,71,13,10,26,10])).mime, "image/png");
  assert.equal(describePreview("a.jpg", Buffer.from([255,216,255,0])).mime, "image/jpeg");
  assert.equal(describePreview("a.pdf", Buffer.from("%PDF-1.4")).preview_kind, "pdf");
  for (const [name, bytes] of [["a.png", Buffer.from("<script>no</script>")], ["a.docx", Buffer.from("PK")], ["a.txt", Buffer.from([255,254])], ["a.txt", Buffer.from([0])]] as const) assert.equal(describePreview(name, bytes).preview_kind, "unsupported");
  const svg = describePreview("a.svg", Buffer.from('<svg onload="alert(1)"/>'));
  assert.equal(svg.preview_kind, "text");
  assert.equal(describePreview("long.md", Buffer.from("字".repeat(120001))).truncated, true);
});
test("文本与二进制预览都必须登录且属于本人", async t => {
  const f = await setup(t);
  const file = await f.workspace.write(f.conversation.id, null, "outputs/建议.md", "# 真实建议");
  const image = await f.publish("示意.png", Buffer.from([137,80,78,71,13,10,26,10]));
  const other = f.auth.register("preview_other", "Other-fixture-password", true);
  for (const [artifact, suffix] of [[file, "preview"], [image, "content"]] as const) {
    const url = "/api/v1/agent/artifacts/" + artifact.id + "/" + suffix;
    assert.equal((await f.app.inject({ url, headers: { host: "localhost" } })).statusCode, 401);
    assert.equal((await f.app.inject({ url, headers: { host: "localhost", authorization: "Bearer " + other.token } })).statusCode, 404);
    assert.equal((await f.app.inject({ url, headers: f.headers })).statusCode, 200);
  }
  const data = (await f.app.inject({ url: "/api/v1/agent/artifacts/" + file.id + "/preview", headers: f.headers })).json();
  assert.equal(data.preview_kind, "markdown"); assert.equal(data.content, "# 真实建议");
  const response = await f.app.inject({ url: "/api/v1/agent/artifacts/" + image.id + "/content", headers: f.headers });
  assert.match(String(response.headers["content-type"]), /image\/png/);
  assert.match(String(response.headers["content-security-policy"]), /sandbox/);
  assert.equal((await f.app.inject({ url: "/api/v1/agent/artifacts/" + file.id + "/content", headers: f.headers })).statusCode, 415);
});
test("文件篡改后不再预览或打开", async t => {
  const f = await setup(t);
  const file = await f.workspace.write(f.conversation.id, null, "outputs/不可篡改.md", "original");
  await writeFile(join(f.dir, "artifacts", file.id), "tampered");
  const preview = await f.app.inject({ url: "/api/v1/agent/artifacts/" + file.id + "/preview", headers: f.headers });
  assert.notEqual(preview.statusCode, 200);
  const opened = await f.app.inject({ method: "POST", url: "/api/v1/agent/artifacts/" + file.id + "/local-open", headers: f.headers, payload: { action: "open" } });
  assert.notEqual(opened.statusCode, 200); assert.equal(f.calls.length, 0);
});
test("只有 local + 本机 peer/Host/Origin 可以调用系统打开", () => {
  assert.equal(localFileAccess("local", "127.0.0.1", "localhost:8110", "http://127.0.0.1:5173"), true);
  assert.equal(localFileAccess("local", "::1", "[::1]:8110"), true);
  for (const [mode, peer, host, origin] of [["server", "127.0.0.1", "localhost", undefined], ["local", "192.0.2.1", "localhost", undefined], ["local", "127.0.0.1", "evil.example", undefined], ["local", "127.0.0.1", "localhost", "https://evil.example"], ["local", "127.0.0.1", "localhost", "null"]] as const) assert.equal(localFileAccess(mode, peer, host, origin), false);
});
test("本地系统打开以真实文件名创建版本副本，不接受任意路径", async t => {
  const f = await setup(t);
  const file = await f.workspace.write(f.conversation.id, null, "outputs/职业路线.md", "# 原始版本");
  const url = "/api/v1/agent/artifacts/" + file.id + "/local-open";
  for (const action of ["open", "reveal"]) assert.equal((await f.app.inject({ method: "POST", url, headers: f.headers, payload: { action } })).statusCode, 200);
  assert.deepEqual(f.calls.map(call => call.action), ["open", "reveal"]);
  assert.equal(basename(f.calls[0]!.path), "职业路线.md");
  assert.equal(await readFile(f.calls[0]!.path, "utf8"), "# 原始版本");
  assert.equal((await f.app.inject({ method: "POST", url, headers: f.headers, payload: { action: "open", path: "C:\\Windows" } })).statusCode, 400);
  const other = f.auth.register("open_other", "Other-fixture-password", true);
  assert.equal((await f.app.inject({ method: "POST", url, headers: { host: "localhost", authorization: "Bearer " + other.token }, payload: { action: "open" } })).statusCode, 404);
  await writeFile(f.calls[0]!.path, "用户自行修改");
  assert.equal((await f.app.inject({ method: "POST", url, headers: f.headers, payload: { action: "open" } })).statusCode, 409);
  assert.equal(await readFile(f.calls[0]!.path, "utf8"), "用户自行修改");
  assert.equal(f.calls.length, 2);
});
test("server 模式不展示/执行本机打开，原有鉴权下载仍可使用", async t => {
  const f = await setup(t, "server");
  const file = await f.workspace.write(f.conversation.id, null, "outputs/云端.md", "server artifact");
  assert.equal((await f.app.inject({ url: "/api/v1/agent/info", headers: f.headers })).json().local_file_actions, false);
  assert.equal((await f.app.inject({ method: "POST", url: "/api/v1/agent/artifacts/" + file.id + "/local-open", headers: f.headers, payload: { action: "open" } })).statusCode, 403);
  const approval = await f.runtime.requestExport(f.session.user, file.id);
  await f.runtime.decide(f.session.user, approval.id, true);
  const response = await f.app.inject({ url: "/api/v1/agent/artifacts/" + file.id + "/download?approval=" + approval.id, headers: f.headers });
  assert.equal(response.statusCode, 200); assert.equal(response.body, "server artifact"); assert.equal(f.calls.length, 0);
});
test("脚本/程序/网页不通过默认应用执行，但保留预览/下载路径", async t => {
  const f = await setup(t);
  for (const name of ["x.ps1", "x.cmd", "x.exe", "x.html", "x.lnk", "x.docm", "x.pdf.exe"]) assert.equal(canOpenArtifact(name), false);
  for (const name of ["x.pdf", "x.docx", "x.xlsx", "x.pptx", "x.png", "x.md"]) assert.equal(canOpenArtifact(name), true);
  const file = await f.workspace.write(f.conversation.id, null, "outputs/页面.html", "<h1>hello</h1>");
  assert.equal((await f.app.inject({ method: "POST", url: "/api/v1/agent/artifacts/" + file.id + "/local-open", headers: f.headers, payload: { action: "open" } })).statusCode, 415);
  assert.equal(f.calls.length, 0);
});
test("本地副本目录存在链接时先拒绝，不在链接目标创建子目录", async t => {
  const f = await setup(t);
  const file = await f.workspace.write(f.conversation.id, null, "outputs/建议.md", "private");
  const outside = join(f.dir, "outside"); await mkdir(outside);
  try { await symlink(outside, join(f.dir, "local-open"), process.platform === "win32" ? "junction" : "dir"); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "EPERM") { t.skip("系统不允许创建测试链接"); return; } throw error; }
  await assert.rejects(materializeArtifact(f.workspace, file), /重定向/);
  assert.deepEqual(await readdir(outside), []);
});
