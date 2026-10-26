/** 青穗集 · 简历实时纸面：侧栏只展示最终排版，配置与交付由编辑窗口承载。 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { renderResumeHtml } from "../../../agent/src/resume-render";
import { useResumeTemplate } from "../state/resumeTemplates";
import type { ResumeLiveDraft, ResumeState } from "../../../agent/src/resume-contract";
import { AgentIcon } from "./AgentIcon";
import { resumePreviewDocument } from "./resume-preview";

interface Props {
  state: ResumeState | null;
  liveDraft?: ResumeLiveDraft | null;
  busy: boolean;
  saving: boolean;
  error?: string;
  onClose: () => void;
  onOpenStudio: () => void;
}
const PAPER_WIDTH = 210 * 96 / 25.4;
const PAPER_HEIGHT = 297 * 96 / 25.4;

export function ResumePreviewPanel({ state, liveDraft, busy, saving, error, onClose, onOpenStudio }: Props) {
  const panel = useRef<HTMLElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const [scale, setScale] = useState(0.72);
  const [height, setHeight] = useState(PAPER_HEIGHT);
  const [templateId] = useResumeTemplate();
  const document = useMemo(() => resumePreviewDocument(state, liveDraft), [state, liveDraft]);
  const html = useMemo(() => renderResumeHtml(document.header, document.body, false, templateId, { sourceText: document.sourceText }), [document, templateId]);
  const initialHtml = useRef(html), latestHtml = useRef(html);
  latestHtml.current = html;
  const status = error ? "预览同步失败" : saving ? "保存中" : busy ? "正在更新" : !state ? "读取中" : state.confirmed_at ? "已确认" : state.body ? "已同步" : "草稿";

  useEffect(() => { panel.current?.focus({ preventScroll: true }); }, []);
  useEffect(() => {
    if (!viewport.current) return;
    const update = (width: number) => { if (width > 0) setScale(Math.min(1, width / PAPER_WIDTH)); };
    update(viewport.current.getBoundingClientRect().width);
    const observer = new ResizeObserver(entries => update(entries[0]?.contentRect.width ?? 0));
    observer.observe(viewport.current);
    return () => observer.disconnect();
  }, []);

  function measure() {
    const sheet = frame.current?.contentDocument?.querySelector<HTMLElement>(".resume-sheet");
    if (sheet) setHeight(Math.max(PAPER_HEIGHT, Math.ceil(sheet.getBoundingClientRect().height), sheet.scrollHeight));
  }
  function updatePaper() {
    const current = frame.current?.contentDocument;
    const sheet = current?.querySelector(".resume-sheet");
    if (!current?.body || !sheet) return;
    const next = new DOMParser().parseFromString(latestHtml.current, "text/html");
    // 更新同一张纸，避免每个生成片段重载 iframe 导致白闪、滚动归零。
    const nextSheet = next.querySelector(".resume-sheet")!;
    if (sheet.innerHTML !== nextSheet.innerHTML) sheet.replaceChildren(...Array.from(nextSheet.childNodes).map(node => current.importNode(node, true)));
    current.body.className = next.body.className;
    current.title = next.title;
    const style = current.querySelector("style");
    if (style) style.textContent = next.querySelector("style")!.textContent;
    measure();
    void current.fonts.ready.then(measure);
  }
  useLayoutEffect(updatePaper, [html]);

  return <aside ref={panel} tabIndex={-1} className="agent-inspector workspace-detail-panel resume-live-preview-panel" id="career-context" aria-label="简历实时预览" aria-busy={busy || saving} onKeyDown={event => { if (event.key === "Escape" && !window.document.querySelector(":popover-open")) { event.stopPropagation(); onClose(); } }}>
    <header className="file-preview-heading resume-live-preview-heading">
      <span><AgentIcon name="file" size={16} />简历预览</span>
      <div><span className="resume-live-sync" data-active={busy || saving} data-error={Boolean(error)} role="status" title={error || (!state?.body ? "草稿会随对话更新，尚未确认的内容不会作为交付文件" : "当前纸面与交付使用同一排版")}><i />{status}</span>
        <button type="button" className="agent-icon-button" onClick={onOpenStudio} disabled={!state} aria-label="简历编辑与导出" title="编辑、模板与导出"><AgentIcon name="edit" size={16} /></button>
        <button type="button" className="agent-icon-button" aria-label="关闭简历预览" title="关闭预览 · Esc" onClick={onClose}><AgentIcon name="close" size={17} /></button>
      </div>
    </header>
    <div className="resume-live-preview-body">
      <div ref={viewport} className="resume-live-paper-viewport">
        <div className="resume-live-paper-bound" style={{ width: PAPER_WIDTH * scale, height: height * scale }}>
          <iframe ref={frame} title="简历实时 A4 预览" srcDoc={initialHtml.current} sandbox="allow-same-origin" style={{ width: PAPER_WIDTH, height, transform: "scale(" + scale + ")" }} onLoad={updatePaper} />
        </div>
      </div>
    </div>
  </aside>;
}
