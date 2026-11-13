/** 青穗集 · 平滑折叠：保留子树与展开状态，实测高度承接开合、异步小结与嵌套内容变化。 */
import { useId, useState, type ReactNode } from "react";
import { AgentIcon } from "./AgentIcon";
import { AutoHeight } from "../components/AutoHeight";
import "./workspace-interactions.css";
export function AnimatedDisclosure({ summary, children, className = "", defaultOpen = false }: { summary: ReactNode; children: ReactNode; className?: string; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return <div className={"animated-disclosure " + className} data-open={open}>
    <button className="animated-disclosure__trigger" type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen(value => !value)}><AgentIcon name="chevron" size={12} /><span>{summary}</span></button>
    <AutoHeight className="animated-disclosure__body" open={open}><div id={id} aria-hidden={!open} className="animated-disclosure__content">{children}</div></AutoHeight>
  </div>;
}
