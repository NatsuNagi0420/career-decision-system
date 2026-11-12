/** 青穗集 · 文档导入回归：真实解析、正文读取、原件保留、预览与账号权限边界。 */
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { fixture, reply, tool, ScriptedModel } from "./helpers.js";
import { textDocx, textPdf } from "./document-fixtures.js";
import { extractDocumentText } from "../src/document-text.js";
import { deploymentUi } from "../src/ui-contract.js";

test("PDF／DOCX 可以通过真实上传接口导入、分段读取，并保留原件", async t => {
  const f = await fixture(t);
  for (const [name, bytes, expected] of [["经历.PDF", textPdf(), "TypeScript career agent"], ["简历.docx", await textDocx(), "职业规划助手"]] as const) {
    const response = await f.app.inject({ method: "POST", url: `/api/v1/agent/conversations/${f.conversation.id}/files`, headers: f.headers, payload: { name, base64: bytes.toString("base64") } });
    assert.equal(response.statusCode, 200, response.body);
    const artifact = response.json();
    assert.deepEqual(await f.workspace.artifactBytes(artifact), bytes);
    const result = await f.workspace.read(f.conversation.id, artifact.path);
    assert.ok(result.text.includes(expected), result.text);
    const first = await f.workspace.read(f.conversation.id, artifact.path, 0, 8);
    assert.equal(first.text.length, 8); assert.equal(first.next_offset, 8); assert.equal(first.truncated, true);
    const preview = await f.app.inject({ url: `/api/v1/agent/artifacts/${artifact.id}/preview`, headers: f.headers });
    assert.equal(preview.statusCode, 200);
    assert.equal(preview.json().preview_kind, name.endsWith("docx") ? "text" : "pdf");
    const other = f.auth.register("other_document_user" + name.length, "Other-only-password", true);
    const forbidden = await f.app.inject({ url: `/api/v1/agent/artifacts/${artifact.id}/preview`, headers: { ...f.headers, authorization: "Bearer " + other.token } });
    assert.notEqual(forbidden.statusCode, 200);
  }
});

test("模型通过 read_file 真正获得 DOCX 正文而非二进制或文件名", async t => {
  const model = new ScriptedModel((request, index) => {
    if (index === 0) return reply("", [tool("read_file", { path: "inputs/项目简历.docx" })]);
    assert.match(request.messages.at(-1)!.content, /TypeScript.*职业规划助手/);
    return reply("已根据简历中的项目经历整理建议。");
  });
  const f = await fixture(t, { model });
  await f.workspace.import(f.conversation.id, "项目简历.docx", (await textDocx()).toString("base64"));
  f.runtime.start(f.user, f.conversation.id, f.profile.id, "请阅读我上传的简历", randomUUID());
  await f.runtime.waitIdle();
  assert.equal(f.store.runs(f.conversation.id)[0].status, "completed");
  assert.equal(model.requests.length, 2);
});

test("扫描件、空文档、伪装格式、超页数和解压超限被拒绝且不会留下附件", async t => {
  const f = await fixture(t);
  const oversized = await textDocx();
  const entry = oversized.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02])); oversized.writeUInt32LE(32 * 1024 * 1024, entry + 24);
  for (const [name, bytes, code] of [
    ["扫描简历.pdf", textPdf(""), "document_no_text"],
    ["空简历.docx", await textDocx(""), "document_no_text"],
    ["伪装.pdf", Buffer.alloc(30, 65), "document_format"],
    ["伪装.docx", Buffer.alloc(30, 65), "document_format"],
    ["超长.pdf", textPdf("Too many pages", 41), "document_limit"],
    ["压缩超限.docx", oversized, "document_limit"],
  ] as const) {
    await assert.rejects(f.workspace.import(f.conversation.id, name, bytes.toString("base64")), (error: unknown) => (error as { code: string }).code === code);
  }
  assert.deepEqual(await f.workspace.list(f.conversation.id), []);
  assert.equal(f.store.artifacts(f.conversation.id).length, 0);
  assert.deepEqual(await readdir(join(await f.workspace.root(f.conversation.id), "inputs")), []);
  await assert.rejects(extractDocumentText("huge.pdf", Buffer.alloc(4 * 1024 * 1024 + 1)), /4 MB/);
});

test("部署 UI 清单云端关闭本机入口；云端后端仍拒绝宿主机完全访问", async t => {
  const f = await fixture(t);
  const info = await f.app.inject({ url: "/api/v1/agent/info", headers: f.headers });
  assert.equal(info.json().ui.model_connections, true);
  assert.ok(info.json().file_workspace.supported_extensions.includes("pdf"));
  assert.ok(info.json().file_workspace.supported_extensions.includes("docx"));
  f.config.deploymentMode = "server";
  const cloud = await f.app.inject({ url: "/api/v1/agent/info", headers: f.headers });
  assert.deepEqual(cloud.json().ui, deploymentUi("server"));
  assert.equal(cloud.json().file_workspace.project_workspaces, false);
  assert.doesNotMatch(cloud.json().file_workspace.message, /保存在本机/);
  assert.throws(() => f.runtime.start(f.user, f.conversation.id, f.profile.id, "do not execute", randomUUID(), { permission_mode: "full-access", full_access_confirmed: true }), /云端不提供/);
});
