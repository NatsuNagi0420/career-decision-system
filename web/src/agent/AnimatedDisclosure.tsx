/** 青穗集 · 平滑折叠：保留子树和展开状态，用网格高度过渡避免小结更新时闪跳。 */
import { useId, useState, type ReactNode } from "react";
import { AgentIcon } from "./AgentIcon";
import "./workspace-interactions.css";
export function AnimatedDisclosure({ summary, children, className = "", defaultOpen = false }: { summary: ReactNode; children: ReactNode; className?: string; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return <div className={"animated-disclosure " + className} data-open={open}>
    <button className="animated-disclosure__trigger" type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen(value => !value)}><AgentIcon name="chevron" size={12} /><span>{summary}</span></button>
    <div className="animated-disclosure__body" id={id} aria-hidden={!open} inert={!open}><div><div className="animated-disclosure__content">{children}</div></div></div>
  </div>;
}
