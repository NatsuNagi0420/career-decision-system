/** 本机真实烟测；只创建隔离测试账号/资料，不调用 LLM，不触碰实际用户数据库。 */
import assert from "node:assert/strict";
import { copyFile, mkdir, mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { Auth } from "../src/auth.js";
import { Store, id, now } from "../src/store.js";
import { Workspace } from "../src/files.js";
import { WindowsNativeSandbox } from "../src/native-sandbox.js";
import { coreTools } from "../src/core/tools.js";
import { isRecord } from "../src/errors.js";
import type { Run } from "../src/types.js";

assert.equal(process.platform, "win32", "此烟测验证 Windows 原生受限执行；Linux 请单独验证容器镜像。");
const parent = resolve("../logs/officecli");
await mkdir(parent, { recursive: true });
const data = await mkdtemp(join(parent, "verification-"));
const store = new Store(join(data, "agent.sqlite"));
try {
  const user = new Auth(store).register("office_verification", "Isolated-smoke-only-2026", true).user;
  const conversation = store.createConversation(user.id, null, "OfficeCLI 隔离验证");
  const workspace = new Workspace(store, data);
  const sessionRoot = await workspace.root(conversation.id);
  const run: Run = { id: id(), conversation_id: conversation.id, user_id: user.id, profile_id: "", request_id: id(), input: "验证中文 Office 文件", status: "running", steps: 0, input_tokens: 0, output_tokens: 0, error: null, created_at: now(), updated_at: now() };
  store.saveRun(run, true);
  const sandbox = new WindowsNativeSandbox(data);
  const health = await sandbox.health();
  assert.ok(health.available, health.message);
  const context = { run, workspace, sandbox, signal: AbortSignal.timeout(120_000),
    workspaceContext: { sessionRoot, commandRoot: sessionRoot, projectRoot: null, projectId: null, projectName: null, projectAccess: null },
  };
  async function call(args: Record<string, unknown>) {
    const result = await coreTools.execute({ id: id(), name: "office_document", arguments: JSON.stringify(args) }, context);
    assert.ok(isRecord(result.value));
    assert.equal(result.value.success, true, JSON.stringify(result.value));
    return result;
  }
  const samples = [
    { path: "outputs/比赛项目报告_示例.docx", actions: [
      { command: "add", parent: "/body", type: "paragraph", props: { text: "青穗集 · 比赛项目报告", style: "Heading1", font: "微软雅黑", size: 22, color: "183E39" } },
      { command: "add", parent: "/body", type: "paragraph", props: { text: "这是工具验证示例，内容不代表真实比赛成果。", font: "微软雅黑", size: 11 } },
      { command: "add", parent: "/body", type: "paragraph", props: { text: "一、项目目标", style: "Heading2" } },
      { command: "add", parent: "/body", type: "paragraph", props: { text: "将已核实的项目材料整理为报告、计划表与答辩演示文稿。", font: "微软雅黑", lineSpacing: "1.5x", spaceAfter: "8pt" } },
    ] },
    { path: "outputs/比赛准备计划_示例.xlsx", actions: [
      { command: "add", type: "sheet", props: { name: "准备计划" } },
      { command: "set", path: "/准备计划/A1", props: { value: "任务", "font.bold": true } },
      { command: "set", path: "/准备计划/B1", props: { value: "状态", "font.bold": true } },
      { command: "set", path: "/准备计划/A2", props: { value: "核对比赛材料" } },
      { command: "set", path: "/准备计划/B2", props: { value: "待开始" } },
    ] },
    { path: "outputs/比赛答辩_示例.pptx", actions: [
      { command: "add", type: "slide", props: { layout: "blank", background: "F3F7F2" } },
      { command: "add", parent: "/slide[1]", type: "shape", props: { text: "青穗集 · 比赛答辩", x: "2cm", y: "2cm", width: "25cm", height: "2cm", font: "微软雅黑", "font.size": 30, bold: true, color: "183E39", fill: "none", line: "none" } },
      { command: "add", parent: "/slide[1]", type: "shape", props: { text: "工具验证示例 · 不代表真实参赛成果", x: "2cm", y: "5cm", width: "25cm", height: "2cm", font: "微软雅黑", "font.size": 18, color: "527368", fill: "none", line: "none" } },
    ] },
  ];
  const latest = join(parent, "latest");
  await mkdir(latest, { recursive: true });
  const report: unknown[] = [];
  for (const sample of samples) {
    console.log("创建：" + sample.path);
    const created = await call({ operation: "create", ...sample });
    assert.ok(created.artifact);
    const read = await call({ operation: "read", path: sample.path });
    assert.match(String((read.value as Record<string, unknown>).stdout), /青穗集|核对比赛材料/);
    const validation = await call({ operation: "validate", path: sample.path });
    const preview = await call({ operation: "preview", path: sample.path });
    assert.ok(preview.artifact);
    const html = await readFile(await workspace.checked(conversation.id, preview.artifact.path), "utf8");
    assert.match(html, /<html|<!DOCTYPE/i);
    assert.match(html, /青穗集|核对比赛材料/);
    for (const artifact of [created.artifact, preview.artifact]) await copyFile(await workspace.checked(conversation.id, artifact.path), join(latest, artifact.name));
    report.push({ file: sample.path, bytes: created.artifact.bytes, validation: validation.value, preview: preview.artifact.name });
    console.log("通过：中文读写、结构检查、成果登记、HTML 预览");
  }
  assert.ok(!(await readdir(join(sessionRoot, "outputs"))).some(name => name.startsWith(".officecli-")), "批处理临时文件必须清理");
  await writeFile(join(latest, "verification.json"), JSON.stringify({ at: now(), sandbox: health.provider, files: report }, null, 2));
  console.log("样例与结果：" + latest);
} finally { store.close(); }
