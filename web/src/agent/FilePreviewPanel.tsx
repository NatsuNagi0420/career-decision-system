/** 青穗集 · 文件预览侧栏：鉴权加载真实版本，支持文档/表格/图片/PDF，切换时取消请求并回收临时地址。 */
import { useEffect, useRef, useState } from "react";
import { agentApi } from "./api";
import type { AgentFile, FilePreview } from "./types";
import { AgentIcon } from "./AgentIcon";
import { AsciiArt } from "./AsciiArt";
import { ComposerMenu } from "./ComposerMenu";
import { MessageContent } from "./MessageContent";
import { canOpenLocally, formatFileSize, latestFiles, parseCsv } from "./artifactLinks";
interface Props {
  file: AgentFile;
  files: AgentFile[];
  local: boolean;
  busy: boolean;
  onSelect: (file: AgentFile) => void;
  onClose: () => void;
  onDownload: (file: AgentFile) => void;
  onOpen: (file: AgentFile, action: "open" | "reveal") => void;
}
interface Loaded { id: string; preview?: FilePreview; url?: string; error?: string }
const LABEL: Record<FilePreview["preview_kind"], string> = { markdown: "文档", text: "文本", json: "JSON", csv: "表格", html: "HTML 源码", image: "图片", pdf: "PDF", unsupported: "文件" };
export function FilePreviewPanel({ file, files, local, busy, onSelect, onClose, onDownload, onOpen }: Props) {
  const panel = useRef<HTMLElement>(null);
  const [loaded, setLoaded] = useState<Loaded>({ id: file.id });
  const [retry, setRetry] = useState(0), [source, setSource] = useState(false);
  useEffect(() => {
    const controller = new AbortController(); let url: string | undefined;
    panel.current?.focus({ preventScroll: true });
    setLoaded({ id: file.id }); setSource(false);
    void (async () => {
      const preview = await agentApi.preview(file.id, controller.signal);
      if (controller.signal.aborted) return;
      if (preview.preview_kind === "image" || preview.preview_kind === "pdf") {
        const blob = await agentApi.previewBlob(file.id, controller.signal);
        if (controller.signal.aborted) return;
        url = URL.createObjectURL(blob);
      }
      setLoaded({ id: file.id, preview, url });
    })().catch(error => { if (!controller.signal.aborted) setLoaded({ id: file.id, error: error instanceof Error ? error.message : "预览未完成，请重试。" }); });
    return () => { controller.abort(); if (url) URL.revokeObjectURL(url); };
  }, [file.id, retry]);
  const data = loaded.id === file.id ? loaded : undefined;
  const versions = files.filter(item => item.path === file.path).sort((a, b) => b.version - a.version);
  const directory = latestFiles(files);
  const preview = data?.preview;
  const sourceable = preview && ["markdown", "json", "csv"].includes(preview.preview_kind);
  return <aside ref={panel} tabIndex={-1} className="agent-inspector workspace-detail-panel file-preview-panel" id="career-context" aria-label="文件预览侧栏" onKeyDown={event => { if (event.key === "Escape" && !document.querySelector(":popover-open")) { event.stopPropagation(); onClose(); } }}>
    <header className="file-preview-heading"><span><AgentIcon name="eye" size={16} />文件预览</span><button type="button" className="agent-icon-button" aria-label="关闭文件预览" title="关闭预览 · Esc" onClick={onClose}><AgentIcon name="close" size={17} /></button></header>
    <div className="file-preview-summary"><h2 title={file.name}><AgentIcon name="file" size={23} /><span>{file.name}</span></h2><p><span>{file.kind === "input" ? "导入资料" : "生成文件"}</span><span>{formatFileSize(file.bytes)}</span><span>{preview ? LABEL[preview.preview_kind] : "正在读取"}</span></p>
      <div className="file-preview-filebar"><ComposerMenu label="切换预览文件" title="本次对话的文件" trigger={<><AgentIcon name="folder" size={14} /><span>{directory.length} 个文件</span><AgentIcon name="down" size={12} /></>} disabled={false} panelClassName="file-picker-menu" role="menu">{close => directory.map(item => <button type="button" role="menuitemradio" aria-checked={item.id === file.id} key={item.id} onClick={() => { close(); onSelect(item); }}><AgentIcon name="file" size={15} /><span>{item.name}<small>{formatFileSize(item.bytes)} · v{item.version}</small></span>{item.id === file.id && <AgentIcon name="check" size={14} />}</button>)}</ComposerMenu>
      <ComposerMenu label="切换文件版本" title="已保存的文件版本" trigger={<><span>v{file.version}{versions[0]?.id === file.id ? " · 最新" : " · 历史版本"}</span><AgentIcon name="down" size={12} /></>} disabled={versions.length < 2} panelClassName="file-picker-menu" role="menu" align="end">{close => versions.map(item => <button type="button" role="menuitemradio" aria-checked={item.id === file.id} key={item.id} onClick={() => { close(); onSelect(item); }}><span>v{item.version}<small>{new Date(item.created_at).toLocaleString()}</small></span>{item.id === file.id && <AgentIcon name="check" size={14} />}</button>)}</ComposerMenu></div>
    </div>
    <div className="file-preview-toolbar"><div role="tablist" aria-label="文件显示方式"><button type="button" role="tab" aria-selected={!source} onClick={() => setSource(false)}>预览</button>{sourceable && <button type="button" role="tab" aria-selected={source} onClick={() => setSource(true)}>源文件</button>}</div><div className="file-preview-actions">{local && <><button type="button" disabled={busy || !canOpenLocally(file.name)} title={canOpenLocally(file.name) ? "用系统默认应用打开" : "此类型仅可预览或下载"} onClick={() => onOpen(file, "open")}><AgentIcon name="external" size={15} />打开</button><button type="button" aria-label="打开所在文件夹" title="打开所在文件夹" disabled={busy} onClick={() => onOpen(file, "reveal")}><AgentIcon name="folder" size={16} /></button></>}<button type="button" aria-label="下载文件" title="下载此版本" disabled={busy} onClick={() => onDownload(file)}><AgentIcon name="download" size={16} /><span>下载</span></button></div></div>
    <div className="file-preview-body" role="tabpanel" aria-label={file.name + "预览"} aria-busy={!preview && !data?.error}>
      {data?.error ? <div className="file-preview-state" role="alert"><AgentIcon name="file" size={32} /><strong>暂时无法预览</strong><p>{data.error}</p><button type="button" onClick={() => setRetry(value => value + 1)}>重新加载</button></div> : !preview ? <div className="file-preview-state" role="status"><div className="ascii-file-loading" aria-hidden="true"><AgentIcon name="file" size={30} /><AsciiArt variant="file" /></div><p>正在读取文件…</p></div> : <PreviewContent preview={preview} url={data?.url} source={source} files={files} onDownload={() => onDownload(file)} busy={busy} />}
    </div>
    <footer className="file-preview-footer"><span><i />已保存的真实文件 · v{file.version}</span><span>只读预览，不会修改原文件</span></footer>
  </aside>;
}
function PreviewContent({ preview, url, source, files, onDownload, busy }: { preview: FilePreview; url?: string; source: boolean; files: AgentFile[]; onDownload: () => void; busy: boolean }) {
  const { preview_kind: kind, content, artifact: file } = preview;
  let formatted = content;
  if (kind === "json" && !source) { try { formatted = JSON.stringify(JSON.parse(content), null, 2); } catch { /* 不合法或截断的 JSON 保留原文。 */ } }
  const rows = kind === "csv" && !source ? parseCsv(content) : [];
  return <>{preview.truncated && <p className="file-preview-warning">仅展示前 120,000 个字符；下载可获得完整内容。</p>}
    {kind === "unsupported" ? <div className="file-preview-state"><AgentIcon name="file" size={38} /><strong>暂不支持此格式的在线预览</strong><p>文件已保存，不会将二进制内容显示为乱码。可下载后用对应应用查看。</p><button type="button" disabled={busy} onClick={onDownload}>下载文件<AgentIcon name="download" size={15} /></button></div>
    : kind === "image" ? <div className="file-preview-image"><img src={url} alt={file.name} /></div>
    : kind === "pdf" ? <div className="file-preview-pdf"><iframe src={url} title={file.name + " PDF 预览"} referrerPolicy="no-referrer" /><p>若浏览器无法显示 PDF，可使用上方下载或打开选项。</p></div>
    : !content ? <div className="file-preview-state"><p>这是一个空文件。</p></div>
    : kind === "markdown" && !source ? <div className="file-preview-document"><MessageContent content={content} files={files} runId={file.run_id} /></div>
    : kind === "csv" && !source ? <div className="file-preview-table"><table><thead><tr><th aria-label="行号">#</th>{rows[0]?.map((cell, index) => <th key={index}>{cell}</th>)}</tr></thead><tbody>{rows.slice(1).map((row, index) => <tr key={index}><th>{index + 1}</th>{row.map((cell, column) => <td key={column}>{cell}</td>)}</tr>)}</tbody></table><p>表格最多预览 200 行、40 列；完整数据请下载查看。</p></div>
    : <>{kind === "html" && <p className="file-preview-warning">安全模式：仅展示 HTML 源码，不执行脚本或加载外部资源。</p>}<pre className="file-preview-code"><code>{formatted}</code></pre></>}
  </>;
}
