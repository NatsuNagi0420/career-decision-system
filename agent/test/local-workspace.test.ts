/** 青穗集 · 本机项目工作区回归：登记、绑定、实时读取、权限状态和用户隔离。 */
import test from "node:test";
import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, parse, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fixture } from "./helpers.js";

async function projectFixture(base: string) {
  const project = await mkdtemp(join(resolve(base, ".."), "project-workspace-"));
  await mkdir(join(project, "src", "features", "auth"), { recursive: true });
  await mkdir(join(project, "docs", "design"), { recursive: true });
  await mkdir(join(project, "node_modules", "ignored"), { recursive: true });
  await writeFile(join(project, "README.md"), "青穗集本机项目\n", "utf8");
  await writeFile(join(project, "src", "main.ts"), "export const answer = 42;\n", "utf8");
  await writeFile(join(project, "src", "features", "auth", "service.ts"), "export const login = () => 'deep';\n", "utf8");
  await writeFile(join(project, "docs", "design", "project.md"), "深层项目设计说明\n", "utf8");
  await writeFile(join(project, "node_modules", "ignored", "index.js"), "should not be indexed\n", "utf8");
  await writeFile(join(project, ".env"), "SECRET=should-not-be-read\n", "utf8");
  return project;
}

test("本机工作区登记、绑定和实时读取不复制整个项目", async t => {
  let project = "";
  const f = await fixture(t, { localWorkspacePicker: async () => project });
  project = await projectFixture(f.dir);
  t.after(() => rm(project, { recursive: true, force: true }));
  const picked = await f.app.inject({ method: "POST", url: "/api/v1/agent/workspaces/pick", headers: f.headers, payload: {} });
  assert.equal(picked.statusCode, 200, picked.body);
  const registration = picked.json().workspace as { id: string; name: string };
  assert.equal(registration.name, project.split(/[\\/]/).at(-1));
  const bound = await f.app.inject({ method: "PATCH", url: "/api/v1/agent/conversations/" + f.conversation.id + "/workspace", headers: f.headers, payload: { workspace_id: registration.id, access: "read-only" } });
  assert.equal(bound.statusCode, 200, bound.body);
  const context = await f.workspace.projectContext(f.conversation.id);
  assert.equal(context.projectAccess, "read-only");
  assert.equal((await f.workspace.listProject(f.conversation.id)).some(file => file.path === "src/main.ts"), true);
  assert.equal((await f.workspace.listProject(f.conversation.id)).some(file => file.path === "src/features/auth/service.ts"), true);
  assert.equal((await f.workspace.listProject(f.conversation.id)).some(file => file.path === "docs/design/project.md"), true);
  assert.equal((await f.workspace.listProject(f.conversation.id)).some(file => file.path.includes("node_modules")), false);
  assert.equal((await f.workspace.listProject(f.conversation.id)).some(file => file.path === ".env"), false);
  assert.match((await f.workspace.readProject(f.conversation.id, "src/main.ts")).text, /answer = 42/);
  assert.match((await f.workspace.readProject(f.conversation.id, "src/features/auth/service.ts")).text, /deep/);
  const inspected = await f.workspace.inspectProject(f.conversation.id, "项目设计");
  assert.equal(inspected.scan.truncated, false);
  assert.ok(inspected.key_files.some(file => file.path === "src/features/auth/service.ts"));
  assert.ok(inspected.key_files.some(file => file.path === "docs/design/project.md"));
  const page = await f.workspace.listProjectPage(f.conversation.id, "src/features", 0, 1);
  assert.equal(page.files[0]?.path, "src/features/auth/service.ts");
  assert.equal(page.has_more, false);
  await writeFile(join(project, "src", "main.ts"), "export const answer = 43;\n", "utf8");
  assert.match((await f.workspace.readProject(f.conversation.id, "src/main.ts")).text, /answer = 43/);
  await assert.rejects(f.workspace.readProject(f.conversation.id, ".env"), /密钥|支持读取/);
  await assert.rejects(f.workspace.readProject(f.conversation.id, "../outside.ts"), /路径/);
  const other = f.auth.register("workspace_other", "Synthetic-password-2026", true).user;
  assert.throws(() => f.store.localWorkspace(other.id, registration.id), /不存在/);
});

test("解除绑定、删除登记和永久删除对话都不碰用户原项目", async t => {
  let project = "";
  const f = await fixture(t, { localWorkspacePicker: async () => project });
  project = await projectFixture(f.dir);
  t.after(() => rm(project, { recursive: true, force: true }));
  const picked = (await f.app.inject({ method: "POST", url: "/api/v1/agent/workspaces/pick", headers: f.headers, payload: {} })).json().workspace as { id: string };
  const bindUrl = "/api/v1/agent/conversations/" + f.conversation.id + "/workspace";
  assert.equal((await f.app.inject({ method: "PATCH", url: bindUrl, headers: f.headers, payload: { workspace_id: picked.id, access: "workspace-write" } })).statusCode, 200);
  const blocked = await f.app.inject({ method: "DELETE", url: "/api/v1/agent/workspaces/" + picked.id, headers: f.headers });
  assert.equal(blocked.statusCode, 409);
  assert.equal((await f.app.inject({ method: "PATCH", url: bindUrl, headers: f.headers, payload: { workspace_id: null, access: "read-only" } })).statusCode, 200);
  assert.equal((await f.app.inject({ method: "DELETE", url: "/api/v1/agent/workspaces/" + picked.id, headers: f.headers })).statusCode, 200);
  assert.equal(await readFile(join(project, "README.md"), "utf8"), "青穗集本机项目\n");
  // 重新登记后绑定，再永久删除对话，登记和原项目仍保留。
  const registered = f.store.saveLocalWorkspace(f.user.id, await f.workspace.inspectExternalRoot(project));
  f.conversation.workspace_id = registered.id;
  f.conversation.workspace_access = "read-only";
  f.store.updateConversation(f.conversation);
  await f.runtime.deleteConversation(f.user, f.conversation.id);
  await access(join(project, "src", "main.ts"));
  assert.equal(f.store.localWorkspace(f.user.id, registered.id).canonical_path.length > 0, true);
});


test("Windows 跨盘的状态目录和项目目录可以独立登记", async t => {
  if (process.platform !== "win32") {
    t.skip("Windows 路径回归只在 Windows 运行。");
    return;
  }
  let project = "";
  const f = await fixture(t, { localWorkspacePicker: async () => project });
  const stateRoot = parse(resolve(f.dir)).root.toLowerCase();
  const projectRoot = parse(resolve(tmpdir())).root.toLowerCase();
  if (stateRoot === projectRoot) {
    t.skip("测试环境没有可用的第二个盘符。");
    return;
  }
  project = await mkdtemp(join(tmpdir(), "project-workspace-cross-drive-"));
  await mkdir(join(project, "src"), { recursive: true });
  await writeFile(join(project, "src", "main.ts"), "export const crossDrive = true;\n", "utf8");
  t.after(() => rm(project, { recursive: true, force: true }));

  const inspected = await f.workspace.inspectExternalRoot(project);
  assert.equal(parse(inspected.canonical_path).root.toLowerCase(), projectRoot);
  assert.notEqual(parse(inspected.canonical_path).root.toLowerCase(), stateRoot);
  const picked = await f.app.inject({ method: "POST", url: "/api/v1/agent/workspaces/pick", headers: f.headers, payload: {} });
  assert.equal(picked.statusCode, 200, picked.body);
});
