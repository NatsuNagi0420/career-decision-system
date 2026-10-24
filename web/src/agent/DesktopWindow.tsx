/** 青穗集 · 桌面应用窗口：支持拖动、最小化、最大化和关闭；收起时保留表单，允许继续操作主对话。 */
import { useEffect, useId, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { AgentIcon } from "./AgentIcon";
import { CareerIcon } from "./CareerVisuals";

export function DesktopWindow({ open, onClose, onMinimize, children, title = "职业工作台", status = "档案 · 岗位 · 成长行动 · 文件" }: {
  open: boolean; onClose: () => void; onMinimize: () => void; children: ReactNode; title?: string; status?: string;
}) {
  const titleId = useId();
  const windowRef = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const drag = useRef<{ pointerId: number; clientX: number; clientY: number; left: number; top: number } | null>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const [maximized, setMaximized] = useState(false);
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 760px)");
    const update = () => {
      setCompact(media.matches);
      if (media.matches) {
        setPosition(null);
        drag.current = null;
      }
    };
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  function constrain(left: number, top: number) {
    const bounds = windowRef.current?.getBoundingClientRect();
    return { left: Math.max(8, Math.min(left, window.innerWidth - (bounds?.width ?? 0) - 8)), top: Math.max(8, Math.min(top, window.innerHeight - (bounds?.height ?? 0) - 48)) };
  }
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement;
    previousFocus.current = previous instanceof HTMLElement ? previous : null;
    windowRef.current?.focus({ preventScroll: true });
    // 窗口是非模态的：不锁定焦点，用户可以点回主对话继续聊天。
    return () => {
      if (windowRef.current?.contains(document.activeElement) && previousFocus.current?.isConnected) previousFocus.current.focus({ preventScroll: true });
    };
  }, [open]);
  useEffect(() => {
    if (!open || maximized) return;
    const resize = () => setPosition(current => current ? constrain(current.left, current.top) : null);
    window.addEventListener("resize", resize);
    resize();
    return () => window.removeEventListener("resize", resize);
  }, [open, maximized]);
  function startDrag(event: PointerEvent<HTMLElement>) {
    if (event.button !== 0 || maximized || compact || (event.target as Element).closest("button")) return;
    const bounds = windowRef.current?.getBoundingClientRect();
    if (!bounds) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY, left: bounds.left, top: bounds.top };
  }
  function moveDrag(event: PointerEvent<HTMLElement>) {
    const current = drag.current;
    if (current?.pointerId === event.pointerId) setPosition(constrain(current.left + event.clientX - current.clientX, current.top + event.clientY - current.clientY));
  }
  return <div className="career-desktop-window" id="career-workbench-window" ref={windowRef} role="dialog" aria-modal="false" aria-labelledby={titleId} tabIndex={-1} hidden={!open}
    data-maximized={maximized} data-compact={compact} data-positioned={!compact && Boolean(position)} style={!maximized && !compact && position ? position : undefined}
    onKeyDown={event => {
      if (event.key !== "Escape" || event.defaultPrevented || document.querySelector('dialog[open], [popover]:popover-open')) return;
      event.preventDefault(); event.stopPropagation(); onMinimize();
    }}>
    <header className="career-desktop-window__titlebar" onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} onLostPointerCapture={() => { drag.current = null; }}
      onDoubleClick={event => { if (!(event.target as Element).closest("button")) setMaximized(value => !value); }}>
      <span className="career-desktop-window__identity"><CareerIcon name="folder" size={22} /><span id={titleId}>{title}</span><small>青穗集</small></span>
      <div className="career-desktop-window__controls">
        <button type="button" aria-label="最小化工作台" title="最小化工作台" onClick={onMinimize}><span aria-hidden="true">─</span></button>
        <button type="button" aria-label={maximized ? "还原工作台窗口" : "最大化工作台"} title={maximized ? "还原窗口大小" : "最大化工作台"} onClick={() => setMaximized(value => !value)}><span aria-hidden="true">{maximized ? "❐" : "□"}</span></button>
        <button type="button" aria-label="关闭工作台" title="关闭工作台" onClick={onClose}><AgentIcon name="close" size={15} /></button>
      </div>
    </header>
    <div className="career-desktop-window__body">{children}</div>
    <footer className="career-desktop-window__status"><span>{status}</span><span>{compact ? "Esc 最小化" : "拖动标题栏移动 · Esc 最小化"}</span></footer>
  </div>;
}
