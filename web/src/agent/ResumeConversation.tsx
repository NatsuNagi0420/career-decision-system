/** 青穗集 · 主对话里的简历引导入口与有明确标记的固定演示，不增加一套真实聊天通道。 */
import { Fragment, useEffect, useRef, useState } from "react";
import { SUINAI_AVATAR_URL } from "../assets";
import { AgentIcon } from "./AgentIcon";
import { MessageContent } from "./MessageContent";
import { ResumePreview } from "./ResumePreview";
import { changeResumeExample } from "./resume-flow";
import { RESUME_DEMO_TURNS, completedResumeExample } from "./resume-conversation";
import type { ResumeState } from "../../../agent/src/resume-contract";
import "./resume-studio.css";
export function ResumeConversationBar({ state, busy, onPreview, onDemo, onHide }: {
  state: ResumeState | null; busy: boolean; onPreview: () => void; onDemo: () => void; onHide: () => void;
}) {
  return <aside className="resume-conversation-bar" aria-label="简历引导状态"><div><span className="resume-conversation-dot" /><span><strong>这段对话里的简历资料</strong><small>按需整理，不打断你正在聊的事</small></span></div><div><button type="button" onClick={onPreview}><AgentIcon name="file" size={15} />{state?.body ? "查看简历" : state?.source_text ? "我记下的内容" : "简历预览"}</button><button type="button" disabled={busy} onClick={onDemo}>看看她怎么聊</button><button type="button" className="resume-exit-coaching" aria-label="收起简历资料提示" title="只收起提示，不离开当前对话" disabled={busy} onClick={onHide}>×</button></div></aside>;
}
export function ResumeConversationDemo({ onClose }: { onClose: () => void }) {
  const [count, setCount] = useState(0), [preview, setPreview] = useState(false), [example, setExample] = useState(completedResumeExample);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { if (count) end.current?.scrollIntoView({ block: "nearest" }); }, [count]);
  return <div className="resume-demo-conversation"><div className="resume-demo-notice"><span><strong>交互演示 · 虚构人物</strong>预设回答，不调用模型、不保存到你的档案。真实模式才接受自由输入。</span><button className="resume-link" type="button" onClick={onClose}>返回我的对话 ×</button></div>
    <DemoMessage role="assistant" content="我们慢慢来，不用先填一张完整的表。你现在是在准备实习，还是已经工作、想换个机会？" />
    {RESUME_DEMO_TURNS.slice(0, count).map((turn, index) => <Fragment key={index}><DemoMessage role="user" content={turn.user} /><DemoMessage role="assistant" content={turn.reply} /></Fragment>)}
    {count < RESUME_DEMO_TURNS.length ? <div className="resume-demo-next"><small>代入虚构示例 · 点击发送这段预设回答</small><button type="button" onClick={() => setCount(value => value + 1)}><span>{RESUME_DEMO_TURNS[count].user}</span><AgentIcon name="send" size={17} /></button></div> : <div className="resume-demo-finish"><button className="resume-primary" type="button" onClick={() => setPreview(value => !value)}><AgentIcon name="file" size={16} />{preview ? "收起示例简历" : "看看聊出来的示例简历"}</button><button className="resume-link" type="button" onClick={onClose}>懂了，回到我的经历</button></div>}
    {preview && <div className="resume-demo-paper"><p className="resume-small-note">排版用的是固定完整虚构示例，不是根据这几次点击进行的模型分析。</p><ResumePreview state={example} demo active disabled={false} apply={async change => { const next = changeResumeExample(example, change); setExample(next); return next; }} onExport={async () => []} onEdit={() => setPreview(false)} /></div>}<div ref={end} />
  </div>;
}
function DemoMessage({ role, content }: { role: "user" | "assistant"; content: string }) {
  return <article className={"agent-message agent-message--" + role}>{role === "assistant" && <img className="agent-message-avatar" src={SUINAI_AVATAR_URL} alt="穗奈" width={36} height={36} />}<header>{role === "user" ? "示例中的你" : "穗奈"}<small>预设演示</small></header><MessageContent content={content} files={[]} runId={null} /></article>;
}
