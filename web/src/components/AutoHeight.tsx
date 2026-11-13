/** 青穗集 · 内容尺寸过渡：测量自然高度，承接折叠、异步内容和表单增减，保留子树与输入状态。 */
import { useLayoutEffect, useRef, type ReactNode } from "react";
import "./layout-motion.css";

export function AutoHeight({ children, className = "", contentClassName = "", changeKey, motion = true, open = true }: {
  children: ReactNode; className?: string; contentClassName?: string; changeKey?: string; motion?: boolean; open?: boolean;
}) {
  const outer = useRef<HTMLDivElement>(null), inner = useRef<HTMLDivElement>(null);
  const expanded = useRef(open);
  expanded.current = open;
  const previousKey = useRef(changeKey), entrance = useRef<Animation | null>(null);
  useLayoutEffect(() => {
    const host = outer.current, content = inner.current;
    if (!host || !content) return;
    const measure = () => {
      const height = (expanded.current ? content.offsetHeight : 0) + "px";
      if (host.style.height !== height) host.style.height = height;
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(content);
    return () => observer.disconnect();
  }, []);
  // 同步提交先测量，异步加载、字体换行由 ResizeObserver 接续；中途反向切换由浏览器从当前高度接续。
  useLayoutEffect(() => {
    const host = outer.current, content = inner.current;
    if (!host || !content) return;
    host.style.height = (open ? content.offsetHeight : 0) + "px";
    if (previousKey.current !== changeKey) {
      previousKey.current = changeKey;
      entrance.current?.cancel();
      if (motion && !window.matchMedia("(prefers-reduced-motion: reduce)").matches && !host.closest('[data-ui-motion="off"]') && content.animate) {
        entrance.current = content.animate([{ opacity: .25, transform: "translateY(7px)" }, { opacity: 1, transform: "translateY(0)" }], { duration: 260, easing: "cubic-bezier(.22,1,.36,1)" });
      }
    }
    if (!motion) entrance.current?.cancel();
  });
  useLayoutEffect(() => () => entrance.current?.cancel(), []);
  return <div ref={outer} className={"auto-height " + className} data-motion={motion ? "on" : "off"} data-open={open} aria-hidden={!open || undefined} inert={!open}><div ref={inner} className={"auto-height__content " + contentClassName}>{children}</div></div>;
}
