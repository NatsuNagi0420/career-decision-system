/** 青穗集 · 桌面应用窗口：通过合成变换完成打开、收起与尺寸切换，保留草稿，支持拖动与非模态操作。 */
import { useEffect, useId, useLayoutEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { AgentIcon } from "./AgentIcon";
import { CareerIcon } from "./CareerVisuals";
import { useUiMotion } from "./uiMotion";

export function DesktopWindow({ id = "career-workbench-window", open, onClose, onMinimize, children, title = "职业工作台", status = "档案 · 岗位 · 成长行动 · 文件" }: {
  id?: string; open: boolean; onClose: () => void; onMinimize: () => void; children: ReactNode | ((visible: boolean) => ReactNode); title?: string; status?: string;
}) {
  const titleId = useId();
  const windowRef = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const drag = useRef<{ pointerId: number; clientX: number; clientY: number; left: number; top: number } | null>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const [maximized, setMaximized] = useState(false);
  const [compact, setCompact] = useState(false);
  const [present, setPresent] = useState(open);
  const [phase, setPhase] = useState("idle");
  const animationRef = useRef<Animation | null>(null);
  const resizeFrom = useRef<{ bounds: DOMRect; opacity: string } | null>(null);
  const animationBounds = useRef<DOMRect | null>(null);
  const previousOpen = useRef(false);
  const exitKind = useRef<"minimize" | "close">("minimize");
  const { playing } = useUiMotion();
  const visible = open || present;

  function findMotionTarget() {
    const targets = Array.from(document.querySelectorAll<HTMLElement>("[aria-controls]"))
      .filter(element => element.getAttribute("aria-controls")?.split(/\s+/).includes(id) && element.getClientRects().length);
    return targets.find(element => element.classList.contains("career-taskbar-app")) ?? targets[0];
  }
  function restoreFocus() {
    if (!windowRef.current?.contains(document.activeElement)) return;
    const previous = previousFocus.current;
    const target = previous?.isConnected && !windowRef.current.contains(previous) && previous.getClientRects().length ? previous : findMotionTarget();
    target?.focus({ preventScroll: true });
  }
  function minimize() { exitKind.current = "minimize"; restoreFocus(); onMinimize(); }
  function close() { exitKind.current = "close"; restoreFocus(); onClose(); }
  function toggleMaximized() {
    const element = windowRef.current;
    if (!element || !open) return;
    const style = getComputedStyle(element);
    // 切换前记录实际可见尺寸；快速反向切换时从动画当前帧继续。
    resizeFrom.current = { bounds: element.getBoundingClientRect(), opacity: style.opacity };
    drag.current = null;
    setMaximized(value => !value);
  }

  useLayoutEffect(() => {
    const element = windowRef.current;
    if (!element) return;
    const visibilityChanged = previousOpen.current !== open;
    previousOpen.current = open;
    // 中断时读取当前帧，再取消旧动画；快速最小化、恢复也从眼前的位置继续。
    const previousAnimation = animationRef.current;
    const current = previousAnimation ? getComputedStyle(element) : null;
    const interruptedBounds = previousAnimation ? element.getBoundingClientRect() : null;
    const interruptedOpacity = current?.opacity;
    const resizing = resizeFrom.current;
    resizeFrom.current = null;
    previousAnimation?.cancel();
    animationRef.current = null;
    animationBounds.current = null;
    if (!open && !present) return;
    if (open) setPresent(true);
    drag.current = null;
    if (!playing || typeof element.animate !== "function" || (!visibilityChanged && !resizing)) {
      setPresent(open); setPhase("idle"); exitKind.current = "minimize";
      return;
    }
    const bounds = element.getBoundingClientRect();
    const baseTransform = getComputedStyle(element).transform;
    const transform = baseTransform === "none" ? "" : `${baseTransform} `;
    // 只在状态切换时排版一次；动画帧仅改变合成变换，不反复触发正文排版和画布尺寸更新。
    const frame = (rect: Pick<DOMRect, "left" | "top" | "width" | "height">, opacity: string | number = 1): Keyframe => ({
      opacity,
      transform: `${transform}translate(${rect.left - bounds.left}px, ${rect.top - bounds.top}px) scale(${rect.width / bounds.width}, ${rect.height / bounds.height})`,
    });
    const atRest = frame(bounds);
    let animation: Animation;
    if (!visibilityChanged && resizing) {
      if (compact || Math.abs(resizing.bounds.left - bounds.left) + Math.abs(resizing.bounds.top - bounds.top) + Math.abs(resizing.bounds.width - bounds.width) + Math.abs(resizing.bounds.height - bounds.height) < 1) {
        setPhase("idle");
        return;
      }
      animation = element.animate([frame(resizing.bounds, resizing.opacity), atRest], {
        duration: 320, easing: "cubic-bezier(.2, 0, 0, 1)", fill: "both",
      });
      animationBounds.current = bounds;
      setPhase("resizing");
    } else {
      const interrupted = interruptedBounds && bounds.width && bounds.height ? frame(interruptedBounds, interruptedOpacity) : null;
      const target = findMotionTarget()?.getBoundingClientRect();
      const entryScale = target ? Math.max(.06, Math.min(.18, target.height / bounds.height)) : .94;
      const atEntry = frame({
        left: target ? target.left + target.width / 2 - bounds.width * entryScale / 2 : bounds.left + bounds.width * (1 - entryScale) / 2,
        top: target ? target.top + target.height / 2 - bounds.height * entryScale / 2 : bounds.top + bounds.height * (1 - entryScale) / 2 + 24,
        width: bounds.width * entryScale, height: bounds.height * entryScale,
      }, 0);
      const closing = !open && exitKind.current === "close";
      const destination = closing ? frame({
        left: bounds.left + bounds.width * .015, top: bounds.top + bounds.height * .015 + 8,
        width: bounds.width * .97, height: bounds.height * .97,
      }, 0) : atEntry;
      animation = element.animate([interrupted ?? (open ? atEntry : atRest), open ? atRest : destination], {
        duration: open ? 360 : closing ? 170 : 280,
        easing: open ? "cubic-bezier(.2, 0, 0, 1)" : "cubic-bezier(.4, 0, 1, 1)",
        fill: "both",
      });
      setPhase(open ? "opening" : "closing");
    }
    animationRef.current = animation;
    exitKind.current = "minimize";
    animation.onfinish = () => {
      if (animationRef.current !== animation) return;
      animationBounds.current = null;
      // 退出帧保持到 React 真正隐藏窗口，避免结束时闪回完整大小。
      setPresent(open); setPhase("idle");
      if (open) { animationRef.current = null; animation.cancel(); }
    };
  }, [open, playing, id, maximized, compact]);
  useLayoutEffect(() => {
    if (!visible) { animationRef.current?.cancel(); animationRef.current = null; }
  }, [visible]);
  useEffect(() => () => { animationRef.current?.cancel(); animationRef.current = null; }, []);
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
    const bounds = animationBounds.current ?? windowRef.current?.getBoundingClientRect();
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
    animationRef.current?.finish();
    animationRef.current?.cancel();
    animationRef.current = null;
    animationBounds.current = null;
    setPhase("idle");
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
  return <div className="career-desktop-window" id={id} ref={windowRef} role="dialog" aria-modal="false" aria-labelledby={titleId} tabIndex={-1} hidden={!visible} inert={!open} aria-hidden={!open} data-window-state={phase}
    data-maximized={maximized} data-compact={compact} data-positioned={!compact && Boolean(position)} style={!maximized && !compact && position ? position : undefined}
    onKeyDown={event => {
      if (event.key !== "Escape" || event.defaultPrevented || document.querySelector('dialog[open], [popover]:popover-open')) return;
      event.preventDefault(); event.stopPropagation(); minimize();
    }}>
    <header className="career-desktop-window__titlebar" onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} onLostPointerCapture={() => { drag.current = null; }}
      onDoubleClick={event => { if (!(event.target as Element).closest("button")) toggleMaximized(); }}>
      <span className="career-desktop-window__identity"><CareerIcon name="folder" size={22} /><span id={titleId}>{title}</span><small>青穗集</small></span>
      <div className="career-desktop-window__controls">
        <button type="button" aria-label={id === "suinai-interview-window" ? "最小化面试窗口" : "最小化工作台"} title="最小化窗口" onClick={minimize}><span aria-hidden="true">─</span></button>
        <button type="button" aria-label={id === "suinai-interview-window" ? (maximized ? "还原面试窗口" : "最大化面试窗口") : (maximized ? "还原工作台窗口" : "最大化工作台")} title={maximized ? "还原窗口大小" : "最大化窗口"} onClick={toggleMaximized}><span aria-hidden="true">{maximized ? "❐" : "□"}</span></button>
        <button type="button" aria-label={id === "suinai-interview-window" ? "关闭面试窗口" : "关闭工作台"} title="关闭窗口" onClick={close}><AgentIcon name="close" size={15} /></button>
      </div>
    </header>
    <div className="career-desktop-window__body">{typeof children === "function" ? children(visible) : children}</div>
    <footer className="career-desktop-window__status"><span>{status}</span><span>{compact ? "Esc 最小化" : "拖动标题栏移动 · Esc 最小化"}</span></footer>
  </div>;
}
