/** 青穗集 · 简历实时纸面：侧栏逐字接入真实生成流与最终排版，配置与交付由编辑窗口承载。 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { renderResumeHtml } from "../../../agent/src/resume-render";
import { useResumeTemplate } from "../state/resumeTemplates";
import type { ResumeLiveDraft, ResumeState } from "../../../agent/src/resume-contract";
import type { ResumeEditRequest } from "../../../agent/src/resume-fields";
import { ResumeRegionEditor } from "./ResumeRegionEditor";
import { ResumeEvidenceMenu } from "./CareerEvidence";
import { AgentIcon } from "./AgentIcon";
import { resumePreviewDocument } from "./resume-preview";
import { ResumePaperWriter } from "./resume-paper-motion";
import { useUiMotion } from "./uiMotion";

interface Props {
  state: ResumeState | null;
  liveDraft?: ResumeLiveDraft | null;
  busy: boolean;
  saving: boolean;
  error?: string;
  onClose: () => void;
  onOpenStudio: () => void;
  editDisabled?: boolean;
  onEdit?: (request: ResumeEditRequest, instruction: string) => Promise<void>;
  onPrompt?: (text: string) => void;
  onCancelPending?: () => Promise<void>;
}
const PAPER_WIDTH = 210 * 96 / 25.4;
const PAPER_HEIGHT = 297 * 96 / 25.4;

export function ResumePreviewPanel({ state, liveDraft, busy, saving, error, onClose, onOpenStudio, editDisabled = false, onEdit, onPrompt, onCancelPending }: Props) {
  const panel = useRef<HTMLElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const writer = useRef<ResumePaperWriter | null>(null);
  const [inkActive, setInkActive] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const editLocked = !onEdit || !state?.body || Boolean(state.pending) || busy || saving || inkActive || editDisabled;
  const editLockReason = !onEdit ? "当前预览不支持局部修改" : editDisabled ? "当前对话不可编辑" : !state?.body ? "简历正文整理完成后可框选修改" : busy ? "简历整理完成后可框选修改" : saving ? "保存完成后可框选修改" : inkActive ? "纸面文字渲染完成后可框选修改" : state.pending ? "有一项简历整理尚未结束" : "";

  const { playing: animate } = useUiMotion();
  const [scale, setScale] = useState(0.72);
  const [height, setHeight] = useState(PAPER_HEIGHT);
  const [templateId] = useResumeTemplate();
  useEffect(() => { setSelecting(false); }, [state?.revision, templateId]);
  const document = useMemo(() => resumePreviewDocument(state, liveDraft), [state, liveDraft]);
  const html = useMemo(() => renderResumeHtml(document.header, document.body, false, templateId, { sourceText: document.sourceText, writing: Boolean(liveDraft) }), [document, templateId, liveDraft]);
  const initialHtml = useRef(html), latestHtml = useRef(html);
  latestHtml.current = html;
  const status = error ? "预览同步失败" : saving ? "保存中" : (liveDraft || inkActive) ? "正在撰写" : busy ? "正在整理" : state?.pending ? "等待继续" : !state ? "读取中" : state.confirmed_at ? "已确认" : state.body ? "已同步" : "草稿";

  useEffect(() => { panel.current?.focus({ preventScroll: true }); return () => { writer.current?.destroy(); writer.current = null; }; }, []);
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
    // 始终更新同一张纸；流结束后让已收到的文字解码收尾，不将整份成品重新播放。
    if (writer.current?.sheet !== sheet) {
      writer.current?.destroy();
      writer.current = new ResumePaperWriter(sheet, { activity: setInkActive, measure });
    }
    writer.current.update(next.querySelector(".resume-sheet")!, animate, liveDraft?.request_id);
    current.body.className = next.body.className;
    current.title = next.title;
    const style = current.querySelector("style");
    if (style) style.textContent = next.querySelector("style")!.textContent;
    measure();
    void current.fonts.ready.then(measure);
  }
  useLayoutEffect(updatePaper, [html, animate]);

  return <aside ref={panel} tabIndex={-1} className="agent-inspector workspace-detail-panel resume-live-preview-panel" id="career-context" aria-label="简历实时预览" aria-busy={busy || saving || inkActive} data-writing={Boolean(liveDraft || inkActive)} onKeyDown={event => { if (event.key === "Escape" && !selecting && !window.document.querySelector(":popover-open")) { event.stopPropagation(); onClose(); } }}>
    <header className="file-preview-heading resume-live-preview-heading">
      <span><AgentIcon name="file" size={16} />简历预览</span>
      <div><span className="resume-live-sync" data-active={busy || saving || inkActive} data-error={Boolean(error)} role="status" title={error || (!state?.body ? "草稿会随对话更新，尚未确认的内容不会作为交付文件" : "当前纸面与交付使用同一排版")}><i />{status}</span>
        <ResumeEvidenceMenu review={state?.evidence_review} onPrompt={onPrompt} />
        <button type="button" className="agent-icon-button" aria-label="框选修改简历" title={editLocked ? editLockReason : "框选修改 · 拖动选择文字，Esc 退出"} aria-pressed={selecting} disabled={editLocked && !selecting} onClick={() => setSelecting(value => !value)}><AgentIcon name="select" size={17} /></button>
        {state?.pending && !busy && !saving && !editDisabled && onCancelPending && <button type="button" className="agent-icon-button" aria-label="结束未完成的简历整理" title="结束未完成的简历整理" onClick={() => void onCancelPending()}><AgentIcon name="stop" size={16} /></button>}
        <button type="button" className="agent-icon-button" onClick={onOpenStudio} disabled={!state} aria-label="简历编辑与导出" title="编辑、模板与导出"><AgentIcon name="edit" size={16} /></button>
        <button type="button" className="agent-icon-button" aria-label="关闭简历预览" title="关闭预览 · Esc" onClick={onClose}><AgentIcon name="close" size={17} /></button>
      </div>
    </header>
    <div className="resume-live-preview-body">
      <div ref={viewport} className="resume-live-paper-viewport">
        <div className="resume-live-paper-bound" style={{ width: PAPER_WIDTH * scale, height: height * scale }}>
          <iframe ref={frame} title="简历实时 A4 预览" srcDoc={initialHtml.current} sandbox="allow-same-origin" style={{ width: PAPER_WIDTH, height, transform: "scale(" + scale + ")" }} onLoad={updatePaper} />
          {selecting && state?.body && onEdit && <ResumeRegionEditor frame={frame} panel={panel} scale={scale} state={state} disabled={busy || saving || editDisabled} onClose={() => setSelecting(false)} onEdit={onEdit} />}
        </div>
      </div>
    </div>
  </aside>;
}
