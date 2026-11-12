/** 青穗集 · 简历框选编辑：将选区吸附到实际字段，在纸面附近输入要求，支持缩放、键盘和错误重试。 */
import { useEffect, useLayoutEffect, useRef, useState, type RefObject, type PointerEvent } from "react";
import { createPortal } from "react-dom";
import { resumeFields, type ResumeEditRequest } from "../../../agent/src/resume-fields";
import type { ResumeState } from "../../../agent/src/resume-contract";
import { AgentIcon } from "./AgentIcon";
import { fieldsInRegion, regionRect, type RegionRect } from "./resume-region";
import "./resume-region.css";
interface HitField { id: string; text: string; label: string; rects: RegionRect[] }
interface Props {
  frame: RefObject<HTMLIFrameElement | null>; panel: RefObject<HTMLElement | null>; scale: number; state: ResumeState;
  disabled: boolean; onClose: () => void; onEdit: (request: ResumeEditRequest, instruction: string) => Promise<void>;
}
export function ResumeRegionEditor({ frame, panel, scale, state, disabled, onClose, onEdit }: Props) {
  const overlay = useRef<HTMLDivElement>(null), prompt = useRef<HTMLFormElement>(null), input = useRef<HTMLTextAreaElement>(null);
  const drag = useRef<{ x: number; y: number; pointer: number } | null>(null);
  const [fields, setFields] = useState<HitField[]>([]), [rubber, setRubber] = useState<RegionRect | null>(null);
  const [selected, setSelected] = useState<string[]>([]), [instruction, setInstruction] = useState("");
  const [sending, setSending] = useState(false), [error, setError] = useState("");
  const [anchor, setAnchor] = useState({ left: 12, top: 70 });
  useLayoutEffect(() => {
    const doc = frame.current?.contentDocument, sheet = doc?.querySelector(".resume-sheet");
    if (!doc || !sheet || !state.body) return;
    const data = resumeFields(state.header, state.body);
    const measure = () => {
      setFields([...sheet.querySelectorAll<HTMLElement>("[data-resume-field]")].flatMap(element => {
        const field = data.find(field => field.id === element.dataset.resumeField);
        if (!field) return [];
        const range = doc.createRange(); range.selectNodeContents(element);
        const rects = [...range.getClientRects()].filter(rect => rect.width > 0 && rect.height > 0).map(rect => ({ x: rect.left * scale, y: rect.top * scale, width: rect.width * scale, height: rect.height * scale }));
        return [{ id: field.id, text: field.text, label: field.label, rects }];
      }));
    };
    measure(); const observer = new ResizeObserver(measure); observer.observe(sheet);
    return () => observer.disconnect();
  }, [frame, scale, state]);
  useEffect(() => { if (selected.length) input.current?.focus({ preventScroll: true }); }, [selected]);
  useEffect(() => {
    const doc = panel.current?.ownerDocument; if (!doc) return;
    const outside = (event: globalThis.PointerEvent) => { if (selected.length && !prompt.current?.contains(event.target as Node) && !overlay.current?.contains(event.target as Node)) { setSelected([]); setInstruction(""); setError(""); } };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); event.stopImmediatePropagation(); if (selected.length) { setSelected([]); overlay.current?.focus(); } else onClose(); } };
    doc.addEventListener("pointerdown", outside); doc.addEventListener("keydown", escape, true);
    return () => { doc.removeEventListener("pointerdown", outside); doc.removeEventListener("keydown", escape, true); };
  }, [selected, panel, onClose]);
  function choose(ids: string[], point: { x: number; y: number }) {
    if (!ids.length) { setSelected([]); return; }
    if (ids.length > 32) { setError("一次最多选择 32 处文字，请缩小选区。"); return; }
    const paper = overlay.current?.getBoundingClientRect(), root = panel.current?.getBoundingClientRect();
    if (paper && root) setAnchor({ left: Math.max(12, Math.min(root.width - 336, paper.left - root.left + point.x)), top: Math.max(56, Math.min(root.height - 230, paper.top - root.top + point.y + 12)) });
    setSelected(ids); setError(""); setInstruction("");
  }
  function point(event: PointerEvent) { const rect = overlay.current!.getBoundingClientRect(); return { x: Math.max(0, Math.min(rect.width, event.clientX - rect.left)), y: Math.max(0, Math.min(rect.height, event.clientY - rect.top)) }; }
  function start(event: PointerEvent<HTMLDivElement>) {
    if (disabled || sending || event.button !== 0) return;
    event.preventDefault(); const from = point(event); drag.current = { ...from, pointer: event.pointerId };
    event.currentTarget.setPointerCapture(event.pointerId); setSelected([]); setError(""); setRubber({ ...from, width: 0, height: 0 });
  }
  function move(event: PointerEvent<HTMLDivElement>) { if (drag.current?.pointer === event.pointerId) setRubber(regionRect(drag.current, point(event))); }
  function finish(event: PointerEvent<HTMLDivElement>) {
    if (drag.current?.pointer !== event.pointerId) return;
    const end = point(event), rect = regionRect(drag.current, end); drag.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId); setRubber(null); choose(fieldsInRegion(fields, rect), end);
  }
  async function submit() {
    if (sending || disabled || !instruction.trim() || !selected.length) return;
    setSending(true); setError("");
    try { await onEdit({ revision: state.revision, field_ids: selected }, instruction.trim()); onClose(); }
    catch (cause) { setError((cause as Error).message); }
    finally { setSending(false); }
  }
  const active = rubber ? fieldsInRegion(fields, rubber) : selected;
  return <><div ref={overlay} className="resume-region-layer" role="group" aria-label="框选简历文字" tabIndex={-1} onPointerDown={start} onPointerMove={move} onPointerUp={finish} onPointerCancel={() => { drag.current = null; setRubber(null); }}>
    {fields.map(field => field.rects.map((rect, index) => index === 0 ? <button key={field.id} type="button" className="resume-region-hit" style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }} aria-label={"选择" + field.label + "：" + field.text} onClick={event => { if (!event.detail) choose([field.id], { x: rect.x, y: rect.y + rect.height }); }} /> : null))}
    {fields.filter(field => active.includes(field.id)).flatMap(field => field.rects.map((rect, index) => <span key={field.id + index} className="resume-region-highlight" style={{ left: rect.x - 2, top: rect.y - 1, width: rect.width + 4, height: rect.height + 2 }} />))}
    {rubber && <span className="resume-region-rubber" style={{ left: rubber.x, top: rubber.y, width: rubber.width, height: rubber.height }} />}
  </div>{selected.length > 0 && panel.current && createPortal(<form ref={prompt} className="resume-region-prompt" aria-label="修改选中内容" style={anchor} onSubmit={event => { event.preventDefault(); void submit(); }} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void submit(); } }}>
    <div className="resume-region-quote"><blockquote>{fields.filter(field => selected.includes(field.id)).map(field => field.text).join("\n")}</blockquote><button type="button" className="agent-icon-button" aria-label="取消选区" title="取消 · Esc" onClick={() => { setSelected([]); overlay.current?.focus(); }}><AgentIcon name="close" size={14} /></button></div>
    <textarea ref={input} aria-label="局部修改要求" placeholder="想怎么修改这里？" rows={3} value={instruction} maxLength={2000} disabled={sending || disabled} onChange={event => setInstruction(event.target.value)} />
    <div className="resume-region-actions">{error && <span role="alert">{error}</span>}<button type="submit" className="resume-region-send" title="让穗奈修改 · Enter" aria-label="让穗奈修改选中内容" disabled={sending || disabled || !instruction.trim()}><AgentIcon name={sending ? "clock" : "send"} size={17} /></button></div>
  </form>, panel.current)}{error && !selected.length && <span className="resume-region-error" role="alert">{error}</span>}</>;
}
