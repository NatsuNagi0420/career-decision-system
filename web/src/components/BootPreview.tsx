/** 青穗集 · 开机动效预览：明确演示完整时长，不假装是真实进度，也不修改首次进入记录或调用业务模型。 */
import { useCallback, useEffect, useState } from "react";
import { useReducedMotion } from "../character/preferences";
import { BOOT_DURATION_MS, BOOT_FADE_MS, readStartupPreferences } from "../state/startup";
import { BootScreen } from "./Startup";
import { Login } from "./Login";
export function BootPreview() {
  const reduced = useReducedMotion();
  const [preferences] = useState(readStartupPreferences);
  const [nonce, setNonce] = useState(0), [phase, setPhase] = useState<"intro" | "exit" | "login">("intro");
  const [still, setStill] = useState(() => new URLSearchParams(location.search).get("hold") === "1");
  const [playing, setPlaying] = useState(() => new URLSearchParams(location.search).get("hold") !== "1"), [loaded, setLoaded] = useState(false);
  const animated = preferences.motion && !reduced;
  const finish = useCallback(() => setPhase("exit"), []);
  const ready = useCallback(() => setLoaded(true), []);
  useEffect(() => {
    if (phase !== "intro" || !playing) return;
    const timer = setTimeout(finish, loaded || !animated ? BOOT_DURATION_MS + 100 : 3000);
    return () => clearTimeout(timer);
  }, [phase, playing, loaded, animated, finish]);
  useEffect(() => {
    if (phase !== "exit") return;
    const timer = setTimeout(() => setPhase("login"), reduced ? 0 : BOOT_FADE_MS);
    return () => clearTimeout(timer);
  }, [phase, reduced]);
  const replay = () => { setNonce(value => value + 1); setLoaded(false); setStill(false); setPlaying(true); setPhase("intro"); };
  const hold = () => { setNonce(value => value + 1); setLoaded(false); setStill(true); setPlaying(false); setPhase("intro"); };
  return <div className="boot-preview">
    <header className="boot-preview__toolbar"><div><strong>启动动效预览</strong><span>演示完整过渡；正式入口就绪即进入，不强制等待。</span></div><nav aria-label="启动预览控制">
      {phase === "intro" && !still && animated && <button type="button" aria-label={playing ? "暂停演示" : "继续演示"} onClick={() => setPlaying(value => !value)}>{playing ? "暂停" : "继续"}</button>}
      <button type="button" onClick={hold} aria-pressed={still && phase === "intro"}>定格查看</button><button type="button" onClick={replay} aria-label="重播启动动画">重播</button><a href="/" aria-label="返回正式页面">返回桌面 ↗</a>
    </nav></header>
    <div className="boot-preview__login" inert={phase !== "login"} aria-hidden={phase !== "login" || undefined}><Login onSuccess={() => location.assign("/")} /></div>
    {phase !== "login" && <BootScreen key={nonce} animated={animated} playing={playing} frame={still ? 77 : undefined} exiting={phase === "exit"} onSkip={finish} onComplete={finish} onReady={ready} preview />}
  </div>;
}
