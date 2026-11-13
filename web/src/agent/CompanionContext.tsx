/** 青穗集 · 陪伴资料托盘：档案直达工作台，小结与文件按需互斥展开，切换会话重置。 */
import { useId, useState, type ReactNode } from "react";
import { AutoHeight } from "../components/AutoHeight";
import { AgentIcon } from "./AgentIcon";
import { CareerIcon } from "./CareerVisuals";

export function CompanionContext({ onProfile, memory, files, fileCount }: {
  onProfile: () => void; memory: ReactNode; files: ReactNode; fileCount: number;
}) {
  const [panel, setPanel] = useState<"memory" | "files">("memory");
  const [open, setOpen] = useState(false);
  const id = useId();
  const toggle = (value: "memory" | "files") => {
    setPanel(value);
    setOpen(current => panel === value ? !current : true);
  };
  return <section className="companion-context" aria-label="对话资料">
    <div className="companion-context__tools" role="group" aria-label="查看对话资料">
      <button type="button" title="打开成长档案" aria-label="打开成长档案" onClick={onProfile}><CareerIcon name="seedling" size={21} /><span>档案</span></button>
      <button type="button" title="这段对话的小结" aria-label="这段对话的小结" aria-expanded={open && panel === "memory"} aria-controls={id + "-memory"} onClick={() => toggle("memory")}><AgentIcon name="clock" size={17} /><span>小结</span></button>
      <button type="button" title="本次对话文件" aria-label="本次对话文件" aria-expanded={open && panel === "files"} aria-controls={id + "-files"} onClick={() => toggle("files")}><AgentIcon name="file" size={17} /><span>文件</span>{fileCount > 0 && <small>{fileCount}</small>}</button>
    </div>
    <AutoHeight open={open} changeKey={panel} className="companion-context__body">
      <div id={id + "-memory"} hidden={panel !== "memory"}>{memory}</div>
      <div id={id + "-files"} hidden={panel !== "files"}>{files}</div>
    </AutoHeight>
  </section>;
}
