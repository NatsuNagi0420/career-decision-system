/** 青穗集 · 像素确认弹窗：使用用户原图，真实可访问按钮、默认取消、Esc 退出与焦点恢复。 */
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { assetUrl } from "../assets";
import "../pixel-confirm.css";

export interface ConfirmOptions {
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
}
export function PixelConfirmDialog({ title, description, confirmLabel = "确定", cancelLabel = "取消", onResolve }: ConfirmOptions & { onResolve: (accepted: boolean) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const id = useId();
  const [artFailed, setArtFailed] = useState(false);
  useEffect(() => {
    const element = dialog.current;
    const previous = document.activeElement;
    if (!element) return;
    if (!element.open) element.showModal();
    cancel.current?.focus({ preventScroll: true });
    return () => {
      element.close();
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);
  return <dialog ref={dialog} className="pixel-confirm" role="alertdialog" aria-modal="true" aria-labelledby={id + "-title"} aria-describedby={id + "-description"}
    onCancel={event => { event.preventDefault(); onResolve(false); }}
    onClick={event => { const rect = event.currentTarget.getBoundingClientRect(); if (event.target === event.currentTarget && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) onResolve(false); }}>
    <div className="pixel-confirm__surface" data-art-failed={artFailed}>
      <img className="pixel-confirm__art" src={assetUrl("dialogs/warning-window.webp")} alt="" aria-hidden="true" draggable={false} onError={() => setArtFailed(true)} />
      <header className="pixel-confirm__header"><span>请确认这一步</span><h2 id={id + "-title"}>{title}</h2></header>
      <div className="pixel-confirm__body" id={id + "-description"} tabIndex={0}>{description}</div>
      <footer className="pixel-confirm__actions">
        <button ref={cancel} className="pixel-confirm__button pixel-confirm__button--cancel" type="button" onClick={() => onResolve(false)}>{cancelLabel}</button>
        <button className="pixel-confirm__button pixel-confirm__button--confirm" type="button" onClick={() => onResolve(true)}>{confirmLabel}</button>
      </footer>
    </div>
  </dialog>;
}
export function usePixelConfirm() {
  const [request, setRequest] = useState<ConfirmOptions | null>(null);
  const resolvePending = useRef<((accepted: boolean) => void) | null>(null);
  const finish = useCallback((accepted: boolean) => {
    const resolve = resolvePending.current;
    resolvePending.current = null;
    setRequest(null);
    resolve?.(accepted);
  }, []);
  const cancel = useCallback(() => finish(false), [finish]);
  const confirm = useCallback((options: ConfirmOptions) => new Promise<boolean>(resolve => {
    resolvePending.current?.(false);
    resolvePending.current = resolve;
    setRequest(options);
  }), []);
  useEffect(() => () => { resolvePending.current?.(false); resolvePending.current = null; }, []);
  return { confirm, cancel, dialog: request ? createPortal(<PixelConfirmDialog {...request} onResolve={finish} />, document.body) : null };
}
