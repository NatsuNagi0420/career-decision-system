/** 青穗集 · 文字面试通话窗口：角色出镜、逐题提问、独立答题草稿与可恢复的面试进度。 */
import { useEffect, useRef, useState } from "react";
import type { PublicPreparationSession } from "../../../agent/src/preparation-contract";
import type { SuinaiActionId } from "../character/suinaiActions";
import { SuinaiMotionCharacter } from "../components/SuinaiMotionCharacter";
import { AutoHeight } from "../components/AutoHeight";
import { AnimatedTextarea } from "./AnimatedTextarea";
import { AnimatedDisclosure } from "./AnimatedDisclosure";
import { AgentIcon } from "./AgentIcon";
import { DesktopWindow } from "./DesktopWindow";
import { StreamingContent } from "./StreamingContent";
import { useUiMotion } from "./uiMotion";
import "./interview.css";

export interface InterviewWindowProps {
  open: boolean; session?: PublicPreparationSession; launchPrompt?: string | null;
  busy: boolean; disabled?: boolean; motion: boolean; action: SuinaiActionId;
  error?: string; recovery?: { message: string; retry: () => void };
  onSubmit: (text: string) => Promise<boolean>; onFinish: () => Promise<void>;
  onRestart: () => void;
  onPause: () => Promise<void>; onResume: () => Promise<void>;
  onClose: () => void; onMinimize: () => void;
}
export function InterviewWindow(props: InterviewWindowProps) {
  const { session, busy, disabled, launchPrompt } = props;
  const [draft, setDraft] = useState(""), [error, setError] = useState(""), [sending, setSending] = useState(false), [contextOpen, setContextOpen] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null), submitted = useRef(false);
  const { playing, reduced } = useUiMotion();
  const done = session?.status === "completed", paused = session?.status === "paused";
  const current = session?.questions[session.answers.length];
  const answer = session?.answers.at(-1);
  const title = session?.job_title ?? launchPrompt?.match(/针对「(.+?)」/)?.[1] ?? "和穗奈模拟面试";
  const status = done ? "面试已结束" : paused ? "面试已暂停" : busy || sending ? session ? "穗奈正在分析回答…" : "穗奈正在准备面试…" : current ? "等你回答" : "准备就绪";
  useEffect(() => { if (props.open && current && !busy && !paused && !done) input.current?.focus({ preventScroll: true }); }, [props.open, current?.id, busy, paused, done]);
  async function submit(value: string) {
    if (submitted.current || busy || disabled || paused || done || !value.trim()) return;
    submitted.current = true; setSending(true); setError("");
    try { if (await props.onSubmit(value)) setDraft(""); }
    catch (cause) { setError((cause as Error).message); }
    finally { submitted.current = false; setSending(false); }
  }
  async function change(action: () => Promise<void>) {
    if (submitted.current) return;
    submitted.current = true; setSending(true); setError("");
    try { await action(); } catch (cause) { setError((cause as Error).message); }
    finally { submitted.current = false; setSending(false); }
  }
  return <DesktopWindow id="suinai-interview-window" open={props.open} title="和穗奈模拟面试" status="文字作答" onClose={props.onClose} onMinimize={props.onMinimize}>
    <section className="interview-call" aria-label="模拟面试通话" aria-busy={busy || sending} data-motion={playing}>
      <div className="interview-call__stage" data-state={done ? "ended" : paused ? "paused" : busy ? "thinking" : "question"}>
        <div className="interview-call__ambient" aria-hidden="true"><i/><i/><i/></div>
        <header className="interview-call__identity"><div><span className="interview-call__live"/><strong>穗奈</strong><span>模拟考官</span></div><span className="interview-call__progress">{session ? `${done ? session.answers.length : Math.min(session.answers.length + 1, session.total)} / ${session.total}` : "面试准备"}</span></header>
        <div className="interview-call__portrait">
          <SuinaiMotionCharacter action={done ? "A28" : paused ? "A02" : draft ? "A03" : props.action} actionNonce={answer?.run_id} view="portrait" playing={props.open && props.motion && playing && !paused} visible={props.open} autoBlink eyeOpen={1} blinkNonce={0} reducedMotion={reduced} ariaLabel={busy ? "穗奈正在思考面试追问" : "穗奈正在和你模拟面试"}/>
        </div>
        <div className="interview-call__caption"><div className="interview-call__signal" aria-hidden="true">{[0,1,2,3,4].map(i => <i key={i}/>)}</div><span role="status">{status}</span></div>
        {paused && <div className="interview-call__paused"><AgentIcon name="pause" size={26}/><span>缓一缓，准备好再继续</span></div>}
      </div>
      <div className="interview-call__desk">
        <header className="interview-call__job"><h2>{title}</h2>{session && <button type="button" aria-label="查看面试背景与考察点" title="面试背景与考察点" aria-expanded={contextOpen} onClick={() => setContextOpen(value => !value)}><AgentIcon name="file" size={17}/></button>}</header>
        <AutoHeight open={contextOpen && Boolean(session)}><div className="interview-call__context"><p>{session?.background}</p><div>{session?.focus.map(item => <span key={item}>{item}</span>)}</div></div></AutoHeight>
        <div className="interview-call__questions" key={current?.id ?? (done ? "review" : "lobby")}>
          {done ? <div className="interview-call__review"><span className="interview-call__eyebrow">本轮表现</span><h3>{session.answers.length ? "这一轮，先到这里。" : "这次还没有回答。"}</h3>{session.answers.map((item, i) => <AnimatedDisclosure key={item.question_id} summary={`第 ${i + 1} 题 · ${session.questions[i]?.topic}`}><p>{session.questions[i]?.prompt}</p><blockquote>{item.text}</blockquote><ul>{item.strengths?.map((text, n) => <li key={"s"+n}>{text}</li>)}{item.gaps?.map((text, n) => <li key={"g"+n}>可补充：{text}</li>)}</ul><p>{item.next_exercise}</p></AnimatedDisclosure>)}</div>
          : current ? <>
            {answer?.verdict && <AnimatedDisclosure summary="上一题的反馈"><ul>{answer.strengths?.map((text, i) => <li key={"s"+i}>{text}</li>)}{answer.gaps?.map((text, i) => <li key={"g"+i}>可补充：{text}</li>)}</ul></AnimatedDisclosure>}
            <div className="interview-call__question-heading"><span className="interview-call__eyebrow">第 {session.answers.length + 1} 题</span><span>{current.topic}</span></div>
            <StreamingContent key={current.id} content={current.prompt} streaming={false} animateEntrance files={[]}/>
          </> : <div className="interview-call__lobby"><span className="interview-call__eyebrow">文字模拟面试</span><h3>准备好，和穗奈聊一场。</h3><p>穗奈会围绕目标岗位设定场景，一次问一题。你在下方打字回答。</p>{!busy && !sending && !props.recovery && <button type="button" className="interview-call__start" disabled={disabled || !launchPrompt} onClick={() => void submit(launchPrompt ?? "")}><AgentIcon name="play" size={17}/>开始面试</button>}</div>}
        </div>
        <AutoHeight open={Boolean(error || props.error || props.recovery)}><div className="interview-call__error" role="alert">{error || props.error || props.recovery?.message}{props.recovery && <button type="button" disabled={busy || sending} onClick={props.recovery.retry}>重新连接</button>}</div></AutoHeight>
        <div className="interview-call__bottom">
          {paused ? <button type="button" className="interview-call__resume" disabled={disabled || sending} onClick={() => void change(props.onResume)}><AgentIcon name="play" size={17}/>继续面试</button> : !done && session ? <form className="interview-call__answer" onSubmit={event => { event.preventDefault(); void submit(draft); }}>
            <AnimatedTextarea ref={input} aria-label="面试回答" value={draft} onChange={event => setDraft(event.target.value)} rows={3} maxLength={16000} disabled={busy || sending || disabled} placeholder={busy ? "穗奈正在听懂你的回答…" : "说说你的思路，不确定也没关系…"} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void submit(draft); } }}/>
            <footer><span>Enter 发送 · Shift + Enter 换行</span><button type="submit" disabled={!draft.trim() || busy || sending || disabled} aria-label="发送面试回答" title="发送回答"><AgentIcon name="send" size={18}/></button></footer>
          </form> : null}
          <nav className="interview-call__controls" aria-label="面试控制">{session && !done && <button type="button" disabled={sending || disabled} aria-label={paused ? "恢复面试" : "暂停面试"} title={paused ? "恢复面试" : "暂停面试"} onClick={() => void change(paused ? props.onResume : props.onPause)}><AgentIcon name={paused ? "play" : "pause"} size={18}/></button>}<span className="interview-call__mode"><AgentIcon name="edit" size={14}/>文字作答</span>{done ? <><button type="button" className="interview-call__start" onClick={props.onRestart}><AgentIcon name="play" size={17}/>再来一轮</button><button type="button" className="interview-call__leave" onClick={props.onClose}>离开面试</button></> : session || busy ? <button type="button" className="interview-call__hangup" disabled={sending || disabled} onClick={() => void change(props.onFinish)} title="结束面试并保存记录"><AgentIcon name="phone" size={19}/><span>结束面试</span></button> : <button type="button" className="interview-call__leave" onClick={props.onClose}>暂不开始</button>}</nav>
        </div>
      </div>
    </section>
  </DesktopWindow>;
}
