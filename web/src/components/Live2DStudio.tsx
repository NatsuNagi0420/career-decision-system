/** 青穗集 · Live2D 交互试映室：官方示例仅作占位，所有求职情景均为本地模拟，不调用业务 API。 */
import { useEffect, useRef, useState } from "react";
import { companionStateFor, LIVE2D_MODEL, LIVE2D_PRESETS, type CompanionMotion, type CompanionState, type Live2DInfo } from "../character/live2d";
import { useReducedMotion } from "../character/preferences";
import { Live2DCharacter } from "./Live2DCharacter";
import "../live2d.css";
const states = Object.entries(LIVE2D_PRESETS) as [CompanionState, (typeof LIVE2D_PRESETS)[CompanionState]][];
const motionNames: Record<CompanionMotion, string> = { nod: "轻轻点头", tilt: "侧头倾听", celebrate: "完成回应" };
interface Message { id: number; from: "user" | "assistant"; text: string }
export function Live2DStudio() {
  const [state, setState] = useState<CompanionState>("idle");
  const [playing, setPlaying] = useState(true);
  const [tracking, setTracking] = useState(true);
  const [mouth, setMouth] = useState(0);
  const [zoom, setZoom] = useState(1.7);
  const [backdrop, setBackdrop] = useState("paper");
  const [info, setInfo] = useState<Live2DInfo | null>(null);
  const [motion, setMotion] = useState<{ name: CompanionMotion; nonce: number }>();
  const [draft, setDraft] = useState("");
  const [running, setRunning] = useState(false);
  const [step, setStep] = useState("等待开始");
  const [messages, setMessages] = useState<Message[]>([{ id: 0, from: "assistant", text: "你好。这是交互演示，不是真实的求职分析。试着输入一句话，观察倾听、思考和回应之间的变化。" }]);
  const timer = useRef<number[]>([]);
  const serial = useRef(0);
  const reduced = useReducedMotion();
  const stop = () => { timer.current.forEach(clearTimeout); timer.current = []; setRunning(false); };
  useEffect(() => () => timer.current.forEach(clearTimeout), []);
  const manual = (next: CompanionState) => { stop(); setStep("手动状态测试"); setState(next); };
  const triggerMotion = (name: CompanionMotion) => setMotion({ name, nonce: ++serial.current });
  const simulate = (prompt: string) => {
    if (!prompt.trim()) return;
    stop(); setDraft(""); setRunning(true); setStep("1 / 模拟分析中"); setMouth(0);
    setMessages(current => [...current, { id: ++serial.current, from: "user" as const, text: prompt.trim() }].slice(-5));
    setState(companionStateFor({ running: true }));
    timer.current.push(window.setTimeout(() => {
      setState(companionStateFor({ awaitingConfirmation: true })); setStep("2 / 模拟解释建议");
      setMessages(current => [...current, { id: ++serial.current, from: "assistant" as const, text: "【本地演示回复】我会先整理你提供的经历，再和你核对；正式接入时，这里只展示 Agent 的真实结果，不会因为动画就保存资料。" }].slice(-5));
      if (playing && !reduced) triggerMotion("nod");
    }, 2300));
    timer.current.push(window.setTimeout(() => { setRunning(false); setStep("3 / 等待你的确认（演示）"); }, 4500));
  };
  return <main className="live2d-studio">
    <header className="live2d-studio__nav"><a className="live2d-studio__brand" href="/">青穗集 <span>CHARACTER LAB</span></a><nav><a href="?preview=suinai">旧像素稿对照</a><a href="/">返回成长桌面 ↗</a></nav></header>
    <section className="live2d-studio__intro"><div><p className="live2d-studio__eyebrow">LIVE2D / INTERACTION PROTOTYPE 01</p><h1>让回应，有一点温度。</h1><p>先把对话中的倾听、思考和反馈做好，再换上属于穗奈的原画。</p></div><span className="live2d-studio__badge">本地技术预览 · 非正式角色</span></section>
    <div className="live2d-studio__layout">
      <section className="live2d-stage" data-backdrop={backdrop} aria-label="角色预览舞台">
        <div className="live2d-stage__top"><span><i className={info ? "is-ready" : ""} />{info ? "LIVE2D READY" : "LOADING MODEL"}</span><span>Haru · 官方临时模型</span></div>
        <div className="live2d-stage__art"><span className="live2d-stage__watermark" aria-hidden="true">SUINAI<br />STUDIO.</span><Live2DCharacter state={state} playing={playing} tracking={tracking} mouth={mouth} zoom={zoom} motion={motion} onInfo={setInfo} /></div>
        <div className="live2d-stage__caption"><div><small>CURRENT RESPONSE</small><h2>{LIVE2D_PRESETS[state].label}</h2></div><button type="button" disabled={reduced} aria-pressed={!playing} onClick={() => setPlaying(value => !value)}>{reduced ? "系统已减少动态效果" : playing ? "暂停动画 Ⅱ" : "播放动画 ▷"}</button></div>
        <p className="live2d-stage__credit">{LIVE2D_MODEL.name} · © Live2D Inc. 此模型不代表穗奈的最终外观。</p>
      </section>
      <aside className="live2d-controls">
        <section className="live2d-panel"><div className="live2d-panel__heading"><span>01 / EXPRESSION</span><h2>先试试，她如何回应</h2></div><div className="live2d-state-grid" role="group" aria-label="Live2D 交互状态">{states.map(([id, preset], index) => <button key={id} type="button" aria-pressed={state === id} onClick={() => manual(id)}><small>0{index + 1}</small>{preset.label}<span aria-hidden="true">↗</span></button>)}</div><p className="live2d-panel__hint" aria-live="polite">{LIVE2D_PRESETS[state].hint}</p>
          <div className="live2d-action-row" role="group" aria-label="Live2D 短动作">{(Object.entries(motionNames) as [CompanionMotion,string][]).map(([id,name])=><button key={id} type="button" disabled={!info || !playing || reduced || !info.supportedMotions.includes(id)} onClick={()=>triggerMotion(id)}>{name}</button>)}</div><p className="live2d-panel__micro">这三段是新增的参数短动作，不是重新制作了人物绑定。</p>
        </section>
        <section className="live2d-panel live2d-panel--chat"><div className="live2d-panel__heading"><span>02 / CONVERSATION</span><h2>放进一次对话里看看</h2></div><div className="live2d-scenarios"><button type="button" onClick={()=>simulate("我想梳理一下自己的经历，找找适合的岗位。")}>画像访谈</button><button type="button" onClick={()=>simulate("帮我看看这份简历应该从哪里改起。")}>简历分析</button><button type="button" onClick={()=>{ manual("success"); setStep("模拟完成 · 没有生成或导出文件"); if(playing&&!reduced) triggerMotion("celebrate"); }}>模拟任务完成</button></div>
          <div className="live2d-chat" role="log" aria-label="本地演示对话">{messages.map(message=><div key={message.id} className={`live2d-chat__message live2d-chat__message--${message.from}`}><small>{message.from==="user"?"你":"交互演示"}</small><p>{message.text}</p></div>)}</div>
          <form className="live2d-chat__form" onSubmit={event=>{event.preventDefault();simulate(draft);}}><label htmlFor="live2d-draft" className="sr-only">输入本地演示消息</label><input id="live2d-draft" value={draft} placeholder="输入一句话，先观察她的倾听…" disabled={running} onChange={event=>{setDraft(event.target.value);setState(companionStateFor({composing:!!event.target.value.trim()}));setStep("输入预览 · 尚未发送");}} /><button type="submit" disabled={!draft.trim()||running}>试演 →</button></form>
          <div className="live2d-chat__status"><span>{step}</span>{running&&<button type="button" onClick={()=>{manual("idle");setStep("演示已停止");}}>停止演示</button>}</div>
        </section>
      </aside>
    </div>
    <section className="live2d-settings" aria-label="Live2D 预览设置"><div><h2>预览设置</h2><p>鼠标跟随仅在预览区域生效，不使用摄像头或麦克风。</p></div><label><input type="checkbox" checked={tracking} disabled={reduced} onChange={event=>setTracking(event.target.checked)}/>视线跟随</label><label>取景 <input aria-label="角色取景" type="range" min=".8" max="2.6" step=".05" value={zoom} onChange={event=>setZoom(Number(event.target.value))}/></label><label>口型测试 <input aria-label="手动口型测试" type="range" min="0" max="1" step=".05" value={mouth} onChange={event=>setMouth(Number(event.target.value))}/></label><button type="button" onClick={()=>setBackdrop(value=>value==="paper"?"night":"paper")}>{backdrop==="paper"?"深色舞台":"浅色舞台"}</button></section>
    <footer className="live2d-studio__footer"><div><strong>已验证的是交互，不是穗奈建模完成。</strong><p>{info?`${info.parameters} 个真实模型参数 · ${info.drawables} 个绘制部件 · ${info.supportedMotions.length} 段自定义短动作` : "等待模型载入"}。取景、口型均为手动测试；没有语音同步、没有真实求职分析。</p>{info&&info.missingParameters.length>0&&<p>当前模型未提供的参数：{info.missingParameters.join("、")}；不伪造对应动作。</p>}</div><a href="/api/assets/live2d/licenses/SDK-LICENSE.md" target="_blank" rel="noreferrer">素材与 SDK 授权说明 ↗</a></footer>
  </main>;
}


