/** 青穗集 · 穗奈动作试映室：分类预览40场景与12表情，支持近景、逐段检查和连播，区分网格预演与Cubism。 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { ACTION_BY_ID, ACTION_CATEGORIES, ACTION_SHOWCASE, EXPRESSION_SPECS, SUINAI_ACTIONS, actionLine, type ExpressionId, type SuinaiActionId } from "../character/suinaiActions";
import type { SuinaiView } from "../character/suinaiMotion";
import { useReducedMotion } from "../character/preferences";
import { SuinaiMotionCharacter } from "./SuinaiMotionCharacter";
import "../suinai-motion.css";
export function SuinaiMotionStudio() {
  useEffect(() => { const previous = document.title; document.title = "穗奈 · 动作试映室 | 青穗集"; return () => { document.title = previous; }; }, []);
  const [action, setAction] = useState<SuinaiActionId>("A01"), [category, setCategory] = useState("全部"), [query, setQuery] = useState("");
  const [handFocus, setHandFocus] = useState<"auto" | "l" | "r">("auto");
  const [view, setView] = useState<SuinaiView>("gesture"), [playing, setPlaying] = useState(true), [expression, setExpression] = useState<ExpressionId | null>(null);
  const [autoBlink, setAutoBlink] = useState(true), [eyeOpen, setEyeOpen] = useState(1), [blinkNonce, setBlinkNonce] = useState(0);
  const [actionNonce, setActionNonce] = useState(0), [progress, setProgress] = useState(0), [sequence, setSequence] = useState<readonly SuinaiActionId[] | null>(null);
  const [seek, setSeek] = useState({ fraction: 0, nonce: 0 }), [background, setBackground] = useState<"sage" | "paper" | "dark">("sage");
  const reducedMotion = useReducedMotion(), active = playing && !reducedMotion, spec = ACTION_BY_ID[action];
  const filtered = useMemo(() => SUINAI_ACTIONS.filter(value => (category === "全部" || value.category === category) && `${value.id}${value.label}${value.category}`.toLowerCase().includes(query.trim().toLowerCase())), [category, query]);
  const onProgress = useCallback((fraction: number) => setProgress(fraction), []);
  const onComplete = useCallback(() => {
    if (!sequence) return;
    const next = sequence[sequence.indexOf(action) + 1];
    setAction(next ?? "A02"); setActionNonce(value => value + 1); setProgress(0);
    if (!next) setSequence(null);
  }, [action, sequence]);
  function chooseAction(value: SuinaiActionId) { setSequence(null); setExpression(null); setAction(value); setActionNonce(count => count + 1); setProgress(0); setPlaying(true); }
  function replay(list?: readonly SuinaiActionId[]) { setSequence(list ?? null); if (list) setAction(list[0]); setExpression(null); setPlaying(true); setActionNonce(value => value + 1); setProgress(0); }
  function scrub(fraction: number) { setProgress(fraction); setSequence(null); setPlaying(false); setSeek(value => ({ fraction, nonce: value.nonce + 1 })); }
  return <main className="suinai-motion-studio">
    <header className="sm-nav"><a className="sm-brand" href="/">青穗集<span>QINGSUI</span></a><nav aria-label="预览导航"><a href="?preview=live2d">Cubism 官方模型对照 ↗</a><a href="/">返回成长桌面 ↗</a></nav></header>
    <section className="sm-intro"><div><p className="sm-eyebrow"><span />SUINAI / A LITTLE MORE ALIVE</p><h1>每一次回应，都有温度。</h1><p>认真听，陪你想，也为你向前的一小步开心。</p></div><div className="sm-version"><span>40</span><p>场景动作 · 12种表情<br /><small>v03 素材 / 连续网格预演</small></p></div></section>
    <div className="sm-layout">
      <section className="sm-stage" data-background={background} aria-label="穗奈动作舞台">
        <div className="sm-windowbar"><span className="sm-window-dots" aria-hidden="true"><i /><i /><i /></span><span>suinai.room / motion lab</span><span className="sm-live"><i data-active={active} />{active ? "陪伴中" : "静帧查看"}</span></div>
        <div className="sm-art"><div className="sm-art__label" aria-hidden="true">穗奈<span>SUINAI</span></div><span className="sm-orbit sm-orbit--one" aria-hidden="true" /><span className="sm-orbit sm-orbit--two" aria-hidden="true" />
          <SuinaiMotionCharacter handFocus={handFocus} action={action} view={view} playing={playing} autoBlink={autoBlink} eyeOpen={eyeOpen} blinkNonce={blinkNonce} reducedMotion={reducedMotion} actionNonce={actionNonce} expression={expression} seek={seek} onProgress={onProgress} onComplete={onComplete} />
          {view === "hands" && <div className="sm-hand-focus" role="group" aria-label="手部跟随">{([["auto", "跟随动作"], ["l", "角色左手"], ["r", "角色右手"]] as const).map(([key, label]) => <button key={key} type="button" aria-pressed={handFocus === key} onClick={() => setHandFocus(key)}>{label}</button>)}</div>}
          <div className="sm-view-switch" role="group" aria-label="角色视角">{([["gesture", "完整动作"], ["portrait", "上半身"], ["face", "表情近景"], ["hands", "手部近景"]] as const).map(([key, label]) => <button type="button" key={key} aria-pressed={view === key} onClick={() => setView(key)}>{label}</button>)}</div>
        </div>
        <div className="sm-dialogue" aria-live="polite"><div><span className="sm-dialogue__name">穗奈<span>本地场景台词 · 非真实业务结果</span></span><p>{actionLine(action)}</p></div><span className="sm-dialogue__mark" aria-hidden="true">✳</span></div>
        <div className="sm-stage-foot"><span>{spec.id} / {spec.label}</span><span>{expression ? EXPRESSION_SPECS[expression].label : "跟随动作表情"} · {spec.durationSec.toFixed(1)}s</span></div>
      </section>
      <aside className="sm-controls" aria-label="动作预览控制">
        <section className="sm-panel sm-library">
          <div className="sm-panel-heading"><span>01 / THE REACTION LIBRARY</span><h2>陪你走过每一个阶段</h2><p>38个场景动作 + 2个无道具替代，按求职流程分类。</p></div>
          <div className="sm-categories" role="group" aria-label="动作分类">{["全部", ...ACTION_CATEGORIES].map(value => <button type="button" key={value} aria-pressed={category === value} onClick={() => setCategory(value)}>{value}</button>)}</div>
          <label className="sm-search"><span>查找动作</span><input type="search" aria-label="查找动作" placeholder="试试：思考、简历、A01" value={query} onChange={event => setQuery(event.target.value)} /></label>
          <div className="sm-scenes sm-scenes--library" role="group" aria-label="穗奈场景动作">{filtered.map(value => <button type="button" key={value.id} data-action={value.id} aria-pressed={action === value.id} onClick={() => chooseAction(value.id)}><span className="sm-scenes__number">{value.id}</span><span>{value.label}{value.requestedGesture === "G13" && <small>替代</small>}</span><span className="sm-scenes__dot" aria-hidden="true" /></button>)}{!filtered.length && <p className="sm-empty">没有找到这个动作，换个关键词试试。</p>}</div>
          <div className="sm-current"><span>{spec.category} / {spec.id}</span><strong>{spec.label}</strong><p>{spec.beats.join(" → ")}</p>{spec.substitution && <p className="sm-warning">{spec.substitution}</p>}</div>
          <div className="sm-replay"><button type="button" disabled={reducedMotion} onClick={() => replay()}>↻ 重播这个动作</button><button type="button" disabled={reducedMotion} aria-pressed={sequence === ACTION_SHOWCASE} onClick={() => sequence ? setSequence(null) : replay(ACTION_SHOWCASE)}>{sequence ? "停止连播" : "精选连播 · 8个 →"}</button><button type="button" disabled={reducedMotion} onClick={() => replay(SUINAI_ACTIONS.map(value => value.id))}>全部连播 · 40个</button></div>
          <div className="sm-eye-heading"><label htmlFor="suinai-action-progress">动作进度</label><span>{(progress * spec.durationSec).toFixed(1)} / {spec.durationSec.toFixed(1)}s</span></div>
          <input id="suinai-action-progress" aria-label="动作进度" type="range" min="0" max="1" step="0.01" value={progress} disabled={reducedMotion} onChange={event => scrub(Number(event.target.value))} />
          <div className="sm-beats" role="group" aria-label="动作关键时刻">{([[0, "起点"], [.42, "动作高点"], [.8, "收回"], [1, spec.playback === "enter_then_hold" ? "保持" : "落点"]] as const).map(([fraction, label]) => <button key={fraction} type="button" disabled={reducedMotion} onClick={() => scrub(fraction)}>{label}</button>)}</div>
        </section>
        <section className="sm-panel">
          <div className="sm-panel-heading"><span>02 / LOOK A LITTLE CLOSER</span><h2>神态，也值得仔细看</h2></div>
          <div className="sm-playback"><button type="button" className="sm-primary" disabled={reducedMotion} onClick={() => setPlaying(value => !value)}>{reducedMotion ? "系统已减少动态效果" : playing ? "Ⅱ 暂停动作" : "▷ 继续播放"}</button><button type="button" className="sm-secondary" disabled={!active} onClick={() => { setAutoBlink(true); setBlinkNonce(value => value + 1); }}>眨一下眼</button></div>
          <label className="sm-expression"><span>表情定格</span><select aria-label="表情定格" value={expression ?? "auto"} onChange={event => { setExpression(event.target.value === "auto" ? null : event.target.value as ExpressionId); if (event.target.value !== "auto") { setPlaying(false); setSequence(null); setView("face"); } }}><option value="auto">跟随动作</option>{Object.entries(EXPRESSION_SPECS).map(([key, value]) => <option key={key} value={key}>{key} · {value.label}</option>)}</select></label>
          <div className="sm-eye-heading"><label htmlFor="suinai-eye-open">眼睛开合</label><button type="button" aria-pressed={autoBlink} onClick={() => setAutoBlink(value => !value)}>{autoBlink ? "自动眨眼 · 开" : "手动检查"}</button></div>
          <input id="suinai-eye-open" aria-label="眼睛开合" type="range" min="0" max="1" step="0.01" value={eyeOpen} onChange={event => { setEyeOpen(Number(event.target.value)); setAutoBlink(false); }} /><div className="sm-range-labels"><span>闭合</span><span>睁开</span></div>
          <p className="sm-control-note">文字回复不循环张嘴。笑眼和释然闭眼只在动作中的短暂时刻出现。</p>
        </section>
        <section className="sm-panel sm-panel--small"><div><span className="sm-eyebrow">03 / ATMOSPHERE</span><h2>换个背景看看</h2></div><div className="sm-backgrounds" role="group" aria-label="舞台背景">{([["sage", "浅绿"], ["paper", "米白"], ["dark", "深色"]] as const).map(([key, label]) => <button type="button" key={key} aria-pressed={background === key} onClick={() => setBackground(key)}><i data-swatch={key} />{label}</button>)}</div></section>
        <details className="sm-boundary-details"><summary>当前版本与制作边界</summary><p>这里是原画分层的连续网格预演，不是已经导出的 Cubism 模型。正式桌面已复用同一渲染器，并由任务状态驱动；这里仍是独立动作检查页。13种基础动作组合出40个场景；拿笔记录与执笔写简历暂用专注整理替代，恢复认可改用轻拳，不使用未通过的拇指素材。眼神共用中性瞳孔与遮罩；不把位移后的瞳孔当成新的眼形素材。</p><p>真正 Live2D 仍需要在 Cubism 中完成网格、变形器和参数绑定，导出穗奈自己的 .moc3 后再验收。</p></details>
      </aside>
    </div><footer className="sm-footer"><span>SUINAI, YOUR CAREER COMPANION.</span><span>动作因内容而来，陪伴不只是一张立绘。</span></footer>
  </main>;
}
