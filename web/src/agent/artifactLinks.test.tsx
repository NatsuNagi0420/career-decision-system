/** 青穗集 · 文件链接回归：只映射登记版本、安全 Markdown、历史版本及表格预览，不伪造真实模型成果。 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { latestFiles, resolveArtifactLink, unlinkedFiles, canOpenLocally, parseCsv } from "./artifactLinks";
import { MessageContent } from "./MessageContent";
import { FileActionProvider, FileDirectory, MessageFileLinks } from "./FileLinks";
import { FilePreviewPanel } from "./FilePreviewPanel";
import type { AgentFile } from "./types";
const first: AgentFile = { id: "12345678-1234-4234-8234-123456789001", conversation_id: "conversation", run_id: "run1", name: "职业建议.md", path: "outputs/职业建议.md", bytes: 123, sha256: "fixture", version: 1, kind: "output", created_at: "2026-10-22T01:00:00.000Z" };
const second: AgentFile = { ...first, id: "12345678-1234-4234-8234-123456789002", version: 2, run_id: "run2", created_at: "2026-10-22T02:00:00.000Z" };
const files = [first, second];
const noop = () => {};
describe("真实文件链接", () => {
  it("支持真实 artifact ID、相对路径和已登记 sandbox 引用", () => {
    expect(resolveArtifactLink("artifact:" + first.id, files)?.id).toBe(first.id);
    expect(resolveArtifactLink("/api/v1/agent/artifacts/" + second.id + "/download", files)?.id).toBe(second.id);
    expect(resolveArtifactLink("outputs/" + encodeURIComponent(first.name), files)?.id).toBe(second.id);
    expect(resolveArtifactLink("sandbox:/mnt/data/职业建议.md", files)?.id).toBe(second.id);
    expect(resolveArtifactLink(first.path, files, "run1")?.id).toBe(first.id);
    expect(latestFiles(files)).toEqual([second]);
  });
  it("拒绝伪造地址、跨站伪装和任意本机路径", () => {
    for (const href of ["artifact:12345678-1234-4234-8234-123456789099", "https://evil.example/outputs/职业建议.md", "file:///C:/private.txt", "C:\\private.txt", "outputs/%2e%2e/secret", "outputs\\职业建议.md", "outputs/不存在.md", "sandbox:/mnt/data/../../etc/passwd"]) expect(resolveArtifactLink(href, files), href).toBeUndefined();
  });
  it("正文已经交付的当前版本不再重复追加；旧版本不掩盖新版本", () => {
    expect(unlinkedFiles("[建议](artifact:" + second.id + ")", files)).toEqual([]);
    expect(unlinkedFiles("[建议](artifact:" + first.id + ")", files)).toEqual([second]);
    expect(unlinkedFiles("没有链接", files)).toEqual([second]);
  });
  it("文件链接默认指向预览入口，未知文件不生成可点击地址", () => {
    const html = renderToStaticMarkup(<MessageContent content={"[建议](artifact:" + first.id + ")\n\n[假文件](artifact:12345678-1234-4234-8234-123456789099)\n\n[危险](javascript:alert%281%29)"} files={files} />);
    expect(html).toContain('href="#file=' + first.id + '"');
    expect(html).toContain('data-file-id="' + first.id + '"');
    expect(html).toContain("文件尚不可用");
    expect(html).not.toContain('href="artifact:'); expect(html).not.toContain('href="javascript:');
  });
  it("本地提供打开选项，云端只提供下载；文件清单没有成果卡片", () => {
    const render = (local: boolean) => renderToStaticMarkup(<FileActionProvider local={local} busy={false} scope="fixture" preview={noop} download={noop} open={noop}><MessageFileLinks files={[second]} /><FileDirectory files={files} /></FileActionProvider>);
    expect(render(true)).toContain("用系统默认应用打开");
    expect(render(false)).not.toContain("用系统默认应用打开");
    expect(render(false)).toContain("下载这个文件版本");
    expect(render(false)).not.toContain("<article");
  });
});
describe("文件预览边界", () => {
  it("本地打开只允许普通文档格式", () => {
    expect(canOpenLocally("简历.docx")).toBe(true); expect(canOpenLocally("方向.md")).toBe(true);
    for (const name of ["run.ps1", "a.html", "a.docm", "a.pdf.exe", "reportmd"]) expect(canOpenLocally(name)).toBe(false);
  });
  it("CSV 正确处理引号、逗号、多行单元格，并限制预览规模", () => {
    expect(parseCsv('姓名,备注\r\n"张,三","a""b"\r\n"x\ny",42')).toEqual([["姓名", "备注"], ["张,三", 'a"b'], ["x\ny", "42"]]);
    expect(parseCsv("a\nb\nc", 2)).toHaveLength(2);
    expect(parseCsv(Array(50).fill("x").join(","))[0]).toHaveLength(40);
  });
  it("侧栏展示文件名、版本、只读提示；server 模式没有打开本机入口", () => {
    const html = renderToStaticMarkup(<FilePreviewPanel file={second} files={files} local={false} busy={false} onSelect={noop} onClose={noop} onDownload={noop} onOpen={noop} />);
    expect(html).toContain("文件预览侧栏"); expect(html).toContain("职业建议.md"); expect(html).toContain("只读预览，不会修改原文件");
    expect(html).toContain('aria-label="下载文件"'); expect(html).not.toContain("用系统默认应用打开"); expect(html).not.toContain("<dialog");
  });
});
