/** 青穗集 · 同源安全 A4 预览：共用服务端模板，显示全部内容，PDF 使用浏览器打印且明确分页边界。 */
import { useEffect, useMemo, useRef, useState } from "react";
import { byId, useResumeTemplate } from "../state/resumeTemplates";
import { renderResumeHtml } from "../../../agent/src/resume-render";
import type { ResumeState } from "../../../agent/src/resume-contract";
import type { ApplyResumeChange } from "./resume-workspace";
import { AgentIcon } from "./AgentIcon";
import { FileLink } from "./FileLinks";
import type { AgentFile } from "./types";
export function ResumePreview({ state, active, disabled, apply, onExport, onEdit }: {
  state: ResumeState; active: boolean; disabled: boolean; apply: ApplyResumeChange;
  onExport: (state: ResumeState) => Promise<AgentFile[]>; onEdit: () => void;
}) {
  const [templateId] = useResumeTemplate();
  const template = byId(templateId);
  const frame = useRef<HTMLIFrameElement>(null), viewport = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(.8), [height, setHeight] = useState(1123), [checked, setChecked] = useState(false), [working, setWorking] = useState(false), [error, setError] = useState("");
  const [output, setOutput] = useState<{ revision: number; templateId: string; files: AgentFile[] } | null>(null);
  const html = useMemo(() => state.body ? renderResumeHtml(state.header, state.body, false, templateId) : "", [state.header, state.body, templateId]);
  useEffect(() => {
    if (!viewport.current || !active) return;
    const update = (width: number) => { if (width > 0) setScale(Math.min(1, width / 794)); };
    update(viewport.current.getBoundingClientRect().width);
    const observer = new ResizeObserver(entries => update(entries[0]?.contentRect.width ?? 0));
    observer.observe(viewport.current); return () => observer.disconnect();
  }, [active, Boolean(state.body)]);
  useEffect(() => { setChecked(false); setError(""); }, [html]);
  function measure() {
    const sheet = frame.current?.contentDocument?.querySelector<HTMLElement>(".resume-sheet");
    if (sheet) setHeight(Math.max(1123, Math.ceil(sheet.getBoundingClientRect().height), sheet.scrollHeight));
  }
  async function deliver() {
    setWorking(true); setError("");
    try {
      const confirmed = state.confirmed_at ? state : await apply({ type: "document.confirm" });
      if (!confirmed) return;
      setOutput({ revision: confirmed.revision, templateId, files: await onExport(confirmed) });
    } catch (cause) { setError((cause as Error).message); }
    finally { setWorking(false); }
  }
  if (!state.body) return null;
  const pages = Math.max(1, Math.ceil((height - 106) / 1017));
  return <section className="resume-preview-step"><div className="resume-step-heading"><h2>最后，看一眼纸上的自己</h2></div>
    <div className="resume-preview-layout"><aside className="resume-delivery-panel"><h3>{template.name}</h3><p>A4 · 可选中文本 · 可编辑源文件</p><dl><div><dt>当前目标</dt><dd>{state.target.title}</dd></div><div><dt>内容</dt><dd>{state.body.sections.reduce((sum, section) => sum + section.entries.length, 0)} 条经历 / 技能</dd></div><div><dt>篇幅提示</dt><dd>约 {pages} 页，打印预览为准</dd></div></dl>
      {pages > 1 && <p className="resume-page-warning"><AgentIcon name="warning" size={16} />内容可能超过一页。可返回精简，也可以保留多页；没有隐藏任何段落。</p>}
      <button className="resume-secondary" type="button" disabled={disabled || working} onClick={onEdit}><AgentIcon name="file" size={16} />调整内容</button>
      {!state.confirmed_at && <label className="resume-confirm-line"><input type="checkbox" checked={checked} disabled={disabled || working} onChange={event => setChecked(event.target.checked)} /><span>我已核对姓名和经历，确认内容真实</span></label>}
      {state.confirmed_at && <p className="resume-confirmed"><AgentIcon name="check" size={15} />当前内容已由你确认</p>}
      <button className="resume-primary" type="button" disabled={disabled || working || (!state.confirmed_at && !checked) || !state.header.name.trim()} onClick={() => void deliver()}><AgentIcon name="download" size={16} />{working ? "正在保存交付文件…" : state.confirmed_at ? "生成 / 获取交付文件" : "确认内容并生成文件"}</button>
      <button className="resume-secondary" type="button" disabled={disabled || working || !state.confirmed_at} onClick={() => { try { frame.current?.contentWindow?.focus(); frame.current?.contentWindow?.print(); } catch { setError("浏览器未能打开打印窗口，请下载 HTML 后用浏览器打开，再按 Ctrl+P。"); } }}><AgentIcon name="external" size={15} />打印 / 另存为 PDF</button>
      <p className="resume-small-note">另存为 PDF 时选择 A4，关闭页眉页脚，并检查分页。</p>
      {output?.revision === state.revision && output.templateId === templateId && <div className="resume-delivery-links" aria-label="简历交付文件"><strong>文件已生成</strong>{output.files.map(file => <FileLink key={file.id} file={file} />)}<small>左键预览，右键下载或本地打开。JSON 保留正文结构，不包含未选经历。</small></div>}
      {error && <p className="resume-error" role="alert">{error}</p>}
    </aside><div className="resume-paper-area"><div className="resume-paper-caption"><span>A4 / 内容预览</span><span>{Math.round(scale * 100)}%</span></div><div ref={viewport} className="resume-paper-viewport"><div className="resume-paper-bound" style={{ width: 794 * scale, height: height * scale }}><iframe ref={frame} title="我的简历 A4 预览" srcDoc={active ? html : ""} sandbox="allow-same-origin allow-modals" style={{ width: 794, height, transform: `scale(${scale})` }} onLoad={() => { measure(); void frame.current?.contentDocument?.fonts.ready.then(measure); }} /></div></div></div></div>
  </section>;
}
