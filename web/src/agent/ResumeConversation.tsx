/** 青穗集 · 主对话里的简历引导入口：只展示真实资料状态，不提供虚构演示通道。 */
import { AgentIcon } from "./AgentIcon";
import type { ResumeState } from "../../../agent/src/resume-contract";
import "./resume-studio.css";

export function ResumeConversationBar({ state, busy, onPreview, onHide }: {
  state: ResumeState | null;
  busy: boolean;
  onPreview: () => void;
  onHide: () => void;
}) {
  return <aside className="resume-conversation-bar" aria-label="简历引导状态">
    <div><span className="resume-conversation-dot" /><span><strong>这段对话里的简历资料</strong><small>穗奈会从真实对话和已确认经历中整理</small></span></div>
    <div><button type="button" onClick={onPreview}><AgentIcon name="file" size={15} />{state?.body ? "查看简历" : state?.source_text ? "我记下的内容" : "简历预览"}</button><button type="button" className="resume-exit-coaching" aria-label="收起简历资料提示" title="只收起提示，不离开当前对话" disabled={busy} onClick={onHide}>×</button></div>
  </aside>;
}
