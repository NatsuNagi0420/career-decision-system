import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { coreTools } from "../src/core/tools.js";
import { quoteOfficeArgument } from "../src/core/office-tools.js";
import { CareerAgentDomain } from "../src/domain/career/index.js";
import { guidedToolAllowed } from "../src/domain/career/policy.js";
import { id } from "../src/store.js";
import { fixture, noSandbox, reply, ScriptedModel, tool } from "./helpers.js";
import type { Run, Sandbox } from "../src/types.js";

test("结构化参数不进入 shell；批量中文数据、成果版本与输出流经过沙箱", async t => {
  let command = "", payload = "", root = "";
  const text = "中文 ' $(Write-Output injected); ` $HOME\n下一段";
  const sandbox: Sandbox = {
    async health() { return { available: true, provider: "docker", image: "fixture", isolation_tested: false, message: "仅测试替身" }; },
    async execute(value, workspace, _signal, options) {
      command = value; root = workspace;
      assert.equal(options?.projectRoot, null);
      const metadata = (await readdir(join(root, "outputs"))).find(name => name.startsWith(".officecli-"))!;
      payload = await readFile(join(root, "outputs", metadata), "utf8");
      assert.equal(JSON.parse(payload)[0].props.text, text);
      await writeFile(join(root, "outputs", "报告.docx"), "test-fixture-not-a-real-office-document");
      options?.onOutput?.("stdout", "文档已生成");
      return { exit_code: 0, stdout: "文档已生成", stderr: "", duration_ms: 5 };
    },
  };
  const model = new ScriptedModel((_, index) => index === 0 ? reply("", [tool("office_document", {
    operation: "create", path: "outputs/报告.docx", actions: [{ command: "add", parent: "/body", type: "paragraph", props: { text } }],
  })]) : reply("文件已生成"));
  const f = await fixture(t, { sandbox, model });
  const run = f.runtime.start(f.user, f.conversation.id, f.profile.id, "制作比赛报告", id());
  await f.runtime.waitIdle();
  assert.equal(f.store.run(f.user.id, run.id).status, "completed");
  assert.match(command, /OFFICECLI_NO_AUTO_RESIDENT=1/);
  assert.match(command, /'officecli' 'batch' '\/workspace\/outputs\/报告.docx'/);
  assert.ok(!command.includes(text));
  assert.ok(payload.includes("中文"));
  assert.equal(f.store.artifacts(f.conversation.id).length, 1);
  assert.ok(f.store.events(f.conversation.id).some(event => event.kind === "tool.output" && event.data.name === "office_document"));
  assert.deepEqual(await readdir(join(root, "outputs")), ["报告.docx"]);
});

test("拒绝路径越界、写入 inputs、额外命令和外部资源属性；失败时不登记旧成果", async t => {
  let calls = 0;
  const sandbox: Sandbox = {
    async health() { return { available: true, provider: "docker", image: "fixture", isolation_tested: false, message: "测试替身" }; },
    async execute() { calls++; return { exit_code: 1, stdout: "", stderr: "fixture failure", duration_ms: 1 }; },
  };
  const f = await fixture(t, { sandbox });
  const root = await f.workspace.root(f.conversation.id);
  const context = { run: { id: id(), conversation_id: f.conversation.id } as Run, workspace: f.workspace, sandbox,
    signal: new AbortController().signal, workspaceContext: await f.workspace.projectContext(f.conversation.id) };
  for (const path of ["outputs/../../outside.docx", "C:/private.docx", "inputs/source.docx"]) {
    await assert.rejects(coreTools.execute(tool("office_document", { operation: "create", path }), context));
  }
  for (const action of [{ command: "run", type: "shape" }, { command: "add", type: "shape", props: { src: "C:/private.png" } }]) {
    await assert.rejects(coreTools.execute(tool("office_document", { operation: "create", path: "outputs/a.pptx", actions: [action] }), context), /参数/);
  }
  assert.equal(calls, 0);
  await writeFile(join(root, "outputs", "old.docx"), "existing-file");
  const result = await coreTools.execute(tool("office_document", { operation: "create", path: "outputs/old.docx" }), context);
  assert.equal((result.value as { success: boolean }).success, false);
  assert.equal(f.store.artifacts(f.conversation.id).length, 0);
  assert.equal(await readFile(join(root, "outputs", "old.docx"), "utf8"), "existing-file");
});

test("沙箱不可用时停止，不直接 spawn 宿主工具；两种 shell 的引号保持数据语义", async t => {
  const f = await fixture(t);
  await assert.rejects(coreTools.execute(tool("office_document", { operation: "help" }), {
    run: { id: id(), conversation_id: f.conversation.id } as Run, workspace: f.workspace, sandbox: noSandbox,
    signal: new AbortController().signal, workspaceContext: await f.workspace.projectContext(f.conversation.id),
  }), /无命令沙箱/);
  assert.equal(quoteOfficeArgument("a'$(x)`b", true), "'a''$(x)`b'");
  assert.equal(quoteOfficeArgument("a'$(x)`b", false), "'a'\"'\"'$(x)`b'");
});

test("云端禁用命令时既隐藏又拒绝调用；简历关卡保留确认边界", async t => {
  const f = await fixture(t);
  const domain = new CareerAgentDomain({ store: f.store, career: f.runtime.career, resume: f.runtime.resume, guidance: f.runtime.guidance,
    config: { ...f.config, deploymentMode: "server", serverCommands: false } });
  const context = { run: { id: id(), user_id: f.user.id, conversation_id: f.conversation.id, input: "制作报告" } as Run,
    user: f.user, profile: f.profile, workspace: f.workspace, workspaceRoot: await f.workspace.root(f.conversation.id),
    workspaceContext: await f.workspace.projectContext(f.conversation.id), sandbox: noSandbox };
  assert.ok(!domain.tools(context).some(item => item.name === "office_document"));
  assert.throws(() => domain.validateTool({ ...context, call: tool("office_document", { operation: "help" }), signal: new AbortController().signal }), /云端命令/);
  assert.equal(guidedToolAllowed("resume", "office_document"), false);
  assert.equal(guidedToolAllowed("career", "office_document"), true);
  assert.equal(guidedToolAllowed("learning", "office_document"), true);
  assert.equal(guidedToolAllowed(undefined, "office_document"), true);
});
