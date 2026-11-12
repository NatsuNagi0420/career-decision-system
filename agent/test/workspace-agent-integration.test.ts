/** 青穗集 · Agent 基座集成回归：项目工具只读实时目录，命令沙箱接收当前工作区权限。 */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { fixture, reply, ScriptedModel, tool } from "./helpers.js";
import type { Sandbox, SandboxExecutionOptions, SandboxHealth, SandboxResult } from "../src/types.js";
import { id } from "../src/store.js";

async function projectFixture(base: string) {
  const project = await mkdtemp(join(resolve(base, ".."), "agent-project-integration-"));
  await mkdir(join(project, "src"), { recursive: true });
  await writeFile(join(project, "README.md"), "本机项目工作区\n", "utf8");
  await writeFile(join(project, "AGENTS.md"), "项目规则：总结项目时先说明证据来源。\n", "utf8");
  await writeFile(join(project, "src", "AGENTS.md"), "src 规则：不要把未读取的源码当作事实。\n", "utf8");
  await writeFile(join(project, "src", "main.ts"), "export const answer = 42;\n", "utf8");
  return project;
}

async function bindProject(f: Awaited<ReturnType<typeof fixture>>, project: string, access: "read-only" | "workspace-write" = "read-only") {
  const registered = await f.app.inject({
    method: "POST",
    url: "/api/v1/agent/workspaces",
    headers: f.headers,
    payload: { root_path: project },
  });
  assert.equal(registered.statusCode, 200, registered.body);
  const workspace = registered.json();
  const bound = await f.app.inject({
    method: "PATCH",
    url: "/api/v1/agent/conversations/" + f.conversation.id + "/workspace",
    headers: f.headers,
    payload: { workspace_id: workspace.id, access },
  });
  assert.equal(bound.statusCode, 200, bound.body);
  return workspace;
}

class RecordingSandbox implements Sandbox {
  readonly calls: Array<{ command: string; workspace: string; options: SandboxExecutionOptions }> = [];

  async health(): Promise<SandboxHealth> {
    return {
      available: true,
      provider: "docker",
      image: "fixture-sandbox",
      isolation_tested: true,
      read_isolated: true,
      network_isolated: true,
      resource_limits: true,
      message: "测试沙箱。",
    };
  }

  commandContext(_workspace: string, options?: SandboxExecutionOptions) {
    return "fixture command; project=" + (options?.projectRoot ?? "none") + "; access=" + (options?.workspaceAccess ?? "none");
  }

  async execute(command: string, workspace: string, signal: AbortSignal, options: SandboxExecutionOptions = {}): Promise<SandboxResult> {
    signal.throwIfAborted();
    this.calls.push({ command, workspace, options: { ...options } });
    return { exit_code: 0, stdout: "command-ok", stderr: "", duration_ms: 1 };
  }
}

test("Agent Loop 通过项目工具读取实时本机文件，未读取前不把源码送进模型", async t => {
  let project = "";
  const model = new ScriptedModel((request, index) => {
    const toolNames = request.tools.map(item => item.name);
    if (index === 0) {
      assert.ok(toolNames.includes("list_project_files"));
      assert.ok(toolNames.includes("read_project_file"));
      assert.ok(toolNames.includes("search_project_files"));
      assert.match(request.messages[0].content, /项目权限为 只读/);
      assert.match(request.messages[0].content, /项目规则：总结项目时先说明证据来源/);
      assert.match(request.messages[0].content, /src 规则：不要把未读取的源码当作事实/);
      return reply("", [tool("list_project_files", {})]);
    }
    if (index === 1) {
      const latest = request.messages.at(-1)!;
      assert.equal(latest.role, "tool");
      assert.match(latest.content, /src[\\/]main\.ts/);
      assert.doesNotMatch(latest.content, /answer = 42/);
      return reply("", [tool("read_project_file", { path: "src/main.ts" })]);
    }
    if (index === 2) {
      assert.match(request.messages.at(-1)!.content, /answer = 42/);
      return reply("已读取当前项目源码。", []);
    }
    if (index === 3) {
      assert.ok(toolNames.includes("read_project_file"));
      return reply("", [tool("read_project_file", { path: "src/main.ts" })]);
    }
    if (index === 4) {
      assert.match(request.messages.at(-1)!.content, /answer = 43/);
      return reply("已读取修改后的实时源码。", []);
    }
    if (index === 5) {
      assert.ok(!toolNames.includes("list_project_files"));
      assert.ok(!toolNames.includes("read_project_file"));
      assert.ok(!toolNames.includes("search_project_files"));
      return reply("当前对话未绑定项目。", []);
    }
    throw new Error("测试模型收到未预期的请求：" + index);
  });
  const f = await fixture(t, { model });
  project = await projectFixture(f.dir);
  t.after(() => rm(project, { recursive: true, force: true }));
  await bindProject(f, project);

  const first = f.runtime.start(f.user, f.conversation.id, f.profile.id, "读取项目结构并查看源码", id());
  await f.runtime.waitIdle();
  assert.equal(f.store.run(f.user.id, first.id).status, "completed");
  assert.equal(model.requests.length, 3);

  await writeFile(join(project, "src", "main.ts"), "export const answer = 43;\n", "utf8");
  const second = f.runtime.start(f.user, f.conversation.id, f.profile.id, "再读一遍刚才的源码", id());
  await f.runtime.waitIdle();
  assert.equal(f.store.run(f.user.id, second.id).status, "completed");
  assert.equal(model.requests.length, 5);

  const unbound = await f.app.inject({
    method: "PATCH",
    url: "/api/v1/agent/conversations/" + f.conversation.id + "/workspace",
    headers: f.headers,
    payload: { workspace_id: null, access: "read-only" },
  });
  assert.equal(unbound.statusCode, 200, unbound.body);
  const third = f.runtime.start(f.user, f.conversation.id, f.profile.id, "只回答当前对话", id());
  await f.runtime.waitIdle();
  assert.equal(f.store.run(f.user.id, third.id).status, "completed");
  assert.equal(model.requests.length, 6);
});

test("Agent Loop 将本机项目根和只读/可写权限传给命令沙箱", async t => {
  let project = "";
  const sandbox = new RecordingSandbox();
  const model = new ScriptedModel((request, index) => {
    const commandTool = request.tools.find(item => item.name === "run_command");
    assert.ok(commandTool);
    if (index === 0) {
      assert.match(commandTool.description, /access=read-only/);
      return reply("", [tool("run_command", { command: "Write-Output command-ok" })]);
    }
    if (index === 1) {
      assert.match(request.messages.at(-1)!.content, /command-ok/);
      return reply("只读项目命令已完成。", []);
    }
    if (index === 2) {
      assert.match(commandTool.description, /access=workspace-write/);
      return reply("", [tool("run_command", { command: "Write-Output command-ok" })]);
    }
    if (index === 3) {
      assert.match(request.messages.at(-1)!.content, /command-ok/);
      return reply("可写项目命令已完成。", []);
    }
    throw new Error("测试模型收到未预期的请求：" + index);
  });
  const f = await fixture(t, { model, sandbox });
  project = await projectFixture(f.dir);
  t.after(() => rm(project, { recursive: true, force: true }));
  await bindProject(f, project, "read-only");

  const readOnlyRun = f.runtime.start(f.user, f.conversation.id, f.profile.id, "在项目中执行只读检查", id());
  await f.runtime.waitIdle();
  assert.equal(f.store.run(f.user.id, readOnlyRun.id).status, "completed");
  assert.equal(sandbox.calls.length, 1);
  assert.equal(sandbox.calls[0].options.projectRoot, project);
  assert.equal(sandbox.calls[0].options.sessionRoot, join(f.dir, "workspaces", f.conversation.id));
  assert.equal(sandbox.calls[0].options.workspaceAccess, "read-only");

  const registration = f.store.localWorkspaces(f.user.id)[0];
  const writable = await f.app.inject({
    method: "PATCH",
    url: "/api/v1/agent/conversations/" + f.conversation.id + "/workspace",
    headers: f.headers,
    payload: { workspace_id: registration.id, access: "workspace-write" },
  });
  assert.equal(writable.statusCode, 200, writable.body);
  const writeRun = f.runtime.start(f.user, f.conversation.id, f.profile.id, "在项目中执行可写检查", id());
  await f.runtime.waitIdle();
  assert.equal(f.store.run(f.user.id, writeRun.id).status, "completed");
  assert.equal(sandbox.calls.length, 2);
  assert.equal(sandbox.calls[1].options.projectRoot, project);
  assert.equal(sandbox.calls[1].options.workspaceAccess, "workspace-write");
  assert.equal(await readFile(join(project, "src", "main.ts"), "utf8"), "export const answer = 42;\n");
});

test("结构化项目修改校验旧版本、返回 diff，并可在未被外部改动时撤销", async t => {
  let project = "";
  let editId = "";
  const original = "export const answer = 42;\n";
  const updated = "export const answer = 43;\n";
  const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
  const model = new ScriptedModel((request, index) => {
    if (index === 0) {
      assert.ok(request.tools.some(item => item.name === "apply_project_patch"));
      assert.ok(request.tools.some(item => item.name === "undo_project_edit"));
      return reply("", [tool("read_project_file", { path: "src/main.ts" })]);
    }
    if (index === 1) {
      const result = JSON.parse(request.messages.at(-1)!.content) as { result: { sha256: string; text: string } };
      assert.equal(result.result.text, original);
      assert.equal(result.result.sha256, sha256(original));
      return reply("", [tool("apply_project_patch", { reason: "修正示例值", files: [{ path: "src/main.ts", operation: "update", content: updated, expected_sha256: result.result.sha256 }] })]);
    }
    if (index === 2) {
      const result = JSON.parse(request.messages.at(-1)!.content) as { result: { edit_id: string; changes: Array<{ diff: string }> } };
      editId = result.result.edit_id;
      assert.equal(result.result.changes[0].diff, "-export const answer = 42;\n+export const answer = 43;");
      return reply("", [tool("read_project_file", { path: "src/main.ts" })]);
    }
    if (index === 3) {
      const result = JSON.parse(request.messages.at(-1)!.content) as { result: { text: string } };
      assert.equal(result.result.text, updated);
      return reply("", [tool("undo_project_edit", { edit_id: editId })]);
    }
    if (index === 4) {
      const result = JSON.parse(request.messages.at(-1)!.content) as { result: { undone: boolean; restored: string[] } };
      assert.equal(result.result.undone, true);
      assert.deepEqual(result.result.restored, ["src/main.ts"]);
      return reply("已修改并撤销项目文件。", []);
    }
    throw new Error("测试模型收到未预期的请求：" + index);
  });
  const f = await fixture(t, { model });
  project = await projectFixture(f.dir);
  t.after(() => rm(project, { recursive: true, force: true }));
  await bindProject(f, project, "workspace-write");
  const run = f.runtime.start(f.user, f.conversation.id, f.profile.id, "修正项目中的示例值并验证可以撤销", id());
  await f.runtime.waitIdle();
  assert.equal(f.store.run(f.user.id, run.id).status, "completed");
  assert.equal(await readFile(join(project, "src", "main.ts"), "utf8"), original);
  assert.ok(f.store.events(f.conversation.id).some(event => event.kind === "tool.finished" && event.data.name === "apply_project_patch"));
});

test("结构化项目修改在只读工作区和旧哈希失效时均被拒绝", async t => {
  let project = "";
  const model = new ScriptedModel((_request, index) => {
    if (index === 0) return reply("", [tool("apply_project_patch", { reason: "不应写入", files: [{ path: "src/main.ts", operation: "update", content: "changed", expected_sha256: "0".repeat(64) }] })]);
    return reply("已收到拒绝结果。", []);
  });
  const f = await fixture(t, { model });
  project = await projectFixture(f.dir);
  t.after(() => rm(project, { recursive: true, force: true }));
  await bindProject(f, project, "read-only");
  const run = f.runtime.start(f.user, f.conversation.id, f.profile.id, "尝试修改只读项目", id());
  await f.runtime.waitIdle();
  assert.equal(f.store.run(f.user.id, run.id).status, "completed");
  const failed = f.store.events(f.conversation.id).find(event => event.kind === "tool.finished" && event.data.name === "apply_project_patch");
  assert.equal(failed?.data.ok, false);
  assert.equal(await readFile(join(project, "src", "main.ts"), "utf8"), "export const answer = 42;\n");
});



