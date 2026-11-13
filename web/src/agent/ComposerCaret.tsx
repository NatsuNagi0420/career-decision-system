/** 青穗集 · 共用文字光标：镜像测量单行与多行文本，平滑移动插入点，选区与输入法使用原生光标。 */
import { useLayoutEffect, useRef, type RefObject } from "react";
import { useUiMotion } from "./uiMotion";
import "./composer-caret.css";

const TEXT_STYLES = [
  "fontFamily", "fontSize", "fontWeight", "fontStyle", "fontStretch", "fontVariant",
  "fontFeatureSettings", "fontVariationSettings", "fontKerning", "letterSpacing", "wordSpacing",
  "lineHeight", "textAlign", "textIndent", "textTransform", "direction", "tabSize",
  "paddingTop", "paddingRight", "paddingBottom", "paddingLeft", "wordBreak", "overflowWrap",
] as const;

type CaretInput = HTMLInputElement | HTMLTextAreaElement;

export function ComposerCaret({ textarea, value }: { textarea: RefObject<CaretInput | null>; value: string }) {
  const layer = useRef<HTMLDivElement>(null), mirror = useRef<HTMLDivElement>(null), cursor = useRef<HTMLSpanElement>(null);
  const update = useRef<() => void>(() => {});
  const { playing } = useUiMotion();

  useLayoutEffect(() => {
    const input = textarea.current, host = layer.current, measuring = mirror.current, caret = cursor.current;
    if (!input || !host || !measuring || !caret || !playing) return;
    let frame = 0, composing = false;
    const content = document.createTextNode("");
    measuring.replaceChildren(content);
    const hide = () => {
      delete input.dataset.animatedCaret;
      host.dataset.visible = "false";
    };
    const measure = () => {
      frame = 0;
      if (document.activeElement !== input || !document.hasFocus() || document.hidden || input.disabled || input.readOnly || composing || input.selectionStart !== input.selectionEnd) {
        hide(); return;
      }
      const style = getComputedStyle(input);
      for (const property of TEXT_STYLES) measuring.style[property] = style[property];
      measuring.style.width = input.clientWidth + "px";
      measuring.style.whiteSpace = input instanceof HTMLInputElement ? "pre" : "pre-wrap";
      // 末尾的零宽字符让空内容、最后一个换行也能取得真实行框，不改动用户输入。
      content.data = input.value + "\u200b";
      const selectionEnd = input.selectionEnd ?? input.value.length;
      const range = document.createRange();
      range.setStart(content, selectionEnd);
      range.collapse(true);
      const bounds = range.getClientRects()[0];
      if (!bounds || !bounds.height) { hide(); return; }
      const mirrorBounds = measuring.getBoundingClientRect(), inputBounds = input.getBoundingClientRect();
      const scaleX = inputBounds.width / input.offsetWidth || 1, scaleY = inputBounds.height / input.offsetHeight || 1;
      const height = bounds.height / scaleY;
      const x = (bounds.left - mirrorBounds.left) / scaleX + input.offsetLeft + input.clientLeft - input.scrollLeft;
      const y = (bounds.top - mirrorBounds.top) / scaleY + input.offsetTop + input.clientTop - input.scrollTop;
      const left = input.offsetLeft + input.clientLeft, top = input.offsetTop + input.clientTop;
      if (x < left || x > left + input.clientWidth || y + height <= top || y >= top + input.clientHeight) { hide(); return; }
      // 聚焦/输入法结束时直接落到当前插入点；连续编辑、点击和方向键才平滑移动。
      caret.style.transition = host.dataset.visible === "true" ? "" : "none";
      caret.style.height = height + "px";
      caret.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      host.dataset.visible = "true";
      input.dataset.animatedCaret = "true";
      for (const animation of caret.firstElementChild?.getAnimations() ?? []) animation.currentTime = 0;
    };
    const schedule = () => {
      if (document.activeElement !== input) { hide(); return; }
      if (!frame) frame = requestAnimationFrame(measure);
    };
    const compositionStart = () => { composing = true; hide(); };
    const compositionEnd = () => { composing = false; schedule(); };
    const blur = () => { hide(); };
    const events = ["input", "keyup", "click", "select", "scroll", "focus"] as const;
    for (const event of events) input.addEventListener(event, schedule);
    input.addEventListener("blur", blur);
    input.addEventListener("compositionstart", compositionStart);
    input.addEventListener("compositionend", compositionEnd);
    document.addEventListener("selectionchange", schedule);
    document.addEventListener("visibilitychange", schedule);
    document.fonts.addEventListener("loadingdone", schedule);
    window.addEventListener("blur", blur);
    window.addEventListener("focus", schedule);
    const observer = new ResizeObserver(schedule);
    observer.observe(input);
    update.current = schedule;
    schedule();
    return () => {
      cancelAnimationFrame(frame); observer.disconnect(); hide(); update.current = () => {};
      for (const event of events) input.removeEventListener(event, schedule);
      input.removeEventListener("blur", blur);
      input.removeEventListener("compositionstart", compositionStart);
      input.removeEventListener("compositionend", compositionEnd);
      document.removeEventListener("selectionchange", schedule);
      document.removeEventListener("visibilitychange", schedule);
      document.fonts.removeEventListener("loadingdone", schedule);
      window.removeEventListener("blur", blur);
      window.removeEventListener("focus", schedule);
    };
  }, [textarea, playing]);
  useLayoutEffect(() => { update.current(); }, [value]);

  return <div ref={layer} className="composer-caret-layer" aria-hidden="true" data-visible="false">
    <div ref={mirror} className="composer-caret-mirror" />
    <span ref={cursor} className="composer-caret"><i /></span>
  </div>;
}
