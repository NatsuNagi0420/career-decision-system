/** 青穗集 · 输入栏浮层：原生自动弹出层负责外部点击、Esc 与互斥，定位随视口调整。 */
import { useCallback, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

interface Props {
  label: string;
  title: string;
  trigger: ReactNode;
  children: (close: () => void) => ReactNode;
  disabled: boolean;
  className?: string;
  panelClassName?: string;
  align?: "start" | "end";
  role?: "group" | "menu";
  fullAccess?: boolean;
}
export function ComposerMenu({ label, title, trigger, children, disabled, className = "", panelClassName = "", align = "start", role = "group", fullAccess = false }: Props) {
  const id = useId();
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const close = () => { panel.current?.hidePopover(); button.current?.focus({ preventScroll: true }); };
  useLayoutEffect(() => { if (disabled) panel.current?.hidePopover(); }, [disabled]);
  const place = useCallback(() => {
    const popup = panel.current, anchor = button.current;
    if (!popup || !anchor) return;
    const viewport = window.visualViewport;
    const left = viewport?.offsetLeft ?? 0, top = viewport?.offsetTop ?? 0;
    const width = viewport?.width ?? window.innerWidth, height = viewport?.height ?? window.innerHeight;
    const rect = anchor.getBoundingClientRect();
    const above = Math.max(0, rect.top - top - 20), below = Math.max(0, top + height - rect.bottom - 20);
    const showAbove = above >= Math.min(popup.scrollHeight, 300) || above >= below;
    popup.style.maxHeight = (showAbove ? above : below) + "px";
    const popupWidth = popup.offsetWidth, popupHeight = popup.offsetHeight;
    popup.style.left = Math.max(left + 12, Math.min(align === "end" ? rect.right - popupWidth : rect.left, left + width - popupWidth - 12)) + "px";
    popup.style.top = (showAbove ? rect.top - popupHeight - 8 : rect.bottom + 8) + "px";
  }, [align]);
  useLayoutEffect(() => {
    if (!open) return;
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    window.visualViewport?.addEventListener("resize", place);
    window.visualViewport?.addEventListener("scroll", place);
    const observer = new ResizeObserver(place);
    if (button.current) observer.observe(button.current);
    if (panel.current) observer.observe(panel.current);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      window.visualViewport?.removeEventListener("resize", place);
      window.visualViewport?.removeEventListener("scroll", place);
    };
  }, [open, place]);
  const navigate = (event: KeyboardEvent) => {
    if (role !== "menu" || !["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    panel.current?.showPopover();
    place();
    const items = [...(panel.current?.querySelectorAll<HTMLButtonElement>("[role^=menuitem]:not(:disabled)") ?? [])];
    const active = items.findIndex(item => item === document.activeElement);
    const index = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : active < 0 ? event.key === "ArrowUp" ? items.length - 1 : 0 : (active + (event.key === "ArrowUp" ? -1 : 1) + items.length) % items.length;
    items[index]?.focus({ preventScroll: true });
  };
  return <div className={"agent-control-menu " + className}>
    <button ref={button} className="agent-menu-trigger" type="button" aria-label={label} title={title} aria-expanded={open} aria-controls={id} aria-haspopup={role === "menu" ? "menu" : undefined} disabled={disabled} data-full={fullAccess} popoverTarget={id} onKeyDown={navigate} onClick={event => {
      event.preventDefault();
      const popup = panel.current;
      if (!popup) return;
      if (popup.matches(":popover-open")) popup.hidePopover();
      else { popup.showPopover(); place(); }
    }}>{trigger}</button>
    <div ref={panel} id={id} className={"agent-menu-panel " + panelClassName} popover="auto" role={role} aria-label={title} onBeforeToggle={event => setOpen(event.newState === "open")} onKeyDown={navigate}>
      {children(close)}
    </div>
  </div>;
}
