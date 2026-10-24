/** 青穗集 · 启动过渡：应用在幕后并行加载，就绪即退出；跳过、减动效和资源失败均不依赖Lottie。 */
import { Component, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useReducedMotion } from "../character/preferences";
import { BOOT_ANIMATION_LIMIT_MS, BOOT_FADE_MS, readStartupPreferences, rememberStartup, wantsStartupMotion } from "../state/startup";
import { BootTitle } from "./BootTitle";
import "../startup.css";
interface ScreenProps { animated: boolean; playing?: boolean; frame?: number; exiting?: boolean; slow?: boolean; onSkip: () => void; onComplete?: () => void; onReady?: () => void; preview?: boolean }
export function BootScreen({ animated, playing = true, frame, exiting = false, slow = false, onSkip, onComplete, onReady, preview = false }: ScreenProps) {
  return <section className="startup-screen" aria-label={preview ? "青穗集启动动效演示" : "正在打开青穗集"} data-exiting={exiting} data-motion={animated && playing ? "on" : "off"}>
    <button type="button" className="startup-screen__skip" onClick={onSkip}>{preview ? "跳过演示" : "跳过动画"}<span aria-hidden="true"> ↗</span></button>
    <div className="startup-screen__center">
      <BootTitle animated={animated} playing={playing} frame={frame} onComplete={onComplete} onReady={onReady} />
      <div className="startup-screen__track" role="progressbar" aria-label={preview ? "启动动画演示，非实际加载进度" : "页面资源正在加载"}><div><i /><i /><i /></div></div>
      <p className="startup-screen__status" role="status">{preview ? "正在演示开机过渡…" : slow ? "页面打开得有点慢，可以刷新重试。" : "正在打开你的成长桌面…"}</p>
      {slow && <button type="button" className="startup-screen__retry" onClick={() => location.reload()}>刷新重试</button>}
    </div>
    <footer className="startup-screen__footer"><span>你的下一步，从这里开始。</span><span>青穗集 / CAREER DESKTOP</span></footer>
  </section>;
}
export function StartupReady({ children, onReady }: { children: ReactNode; onReady: () => void }) {
  useEffect(onReady, [onReady]);
  return <>{children}</>;
}
export class StartupBoundary extends Component<{ children: ReactNode; onReady: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed ? <StartupReady onReady={this.props.onReady}><main className="startup-error"><h1>页面暂时没有正常显示</h1><p>请刷新页面重试，或稍后再来。</p><button type="button" onClick={() => location.reload()}>刷新页面</button></main></StartupReady> : this.props.children;
  }
}
export function StartupGate({ children }: { children: (onReady: () => void) => ReactNode }) {
  const [preferences] = useState(readStartupPreferences), reduced = useReducedMotion();
  const [ready, setReady] = useState(false), [finished, setFinished] = useState(false), [skipped, setSkipped] = useState(false);
  const [expired, setExpired] = useState(false), [slow, setSlow] = useState(false);
  const content = useRef<HTMLDivElement>(null), restoreFocus = useRef(false);
  const animated = wantsStartupMotion(preferences.seen, preferences.motion, reduced) && !skipped && !expired;
  const onReady = useCallback(() => setReady(true), []);
  useEffect(() => {
    const cap = setTimeout(() => setExpired(true), BOOT_ANIMATION_LIMIT_MS);
    const slowTimer = setTimeout(() => setSlow(true), 6000);
    return () => { clearTimeout(cap); clearTimeout(slowTimer); };
  }, []);
  useEffect(() => {
    if (!ready || finished) return;
    rememberStartup();
    const timer = setTimeout(() => setFinished(true), !reduced && preferences.motion && !skipped ? BOOT_FADE_MS : 0);
    return () => clearTimeout(timer);
  }, [ready, finished, reduced, preferences.motion, skipped]);
  useEffect(() => {
    if (!finished || !restoreFocus.current) return;
    const primary = content.current?.querySelector<HTMLElement>("#username, #composer") ?? content.current?.querySelector<HTMLElement>("button, a");
    primary?.focus({ preventScroll: true });
  }, [finished]);
  const skip = () => {
    restoreFocus.current = true;
    setSkipped(true);
  };
  return <>
    <div ref={content} data-startup-content="" data-ready={ready} inert={!finished} aria-hidden={!finished || undefined}>
      <StartupBoundary onReady={onReady}>{children(onReady)}</StartupBoundary>
    </div>
    {!finished && <BootScreen animated={animated} exiting={ready} slow={slow} onSkip={skip} />}
  </>;
}
