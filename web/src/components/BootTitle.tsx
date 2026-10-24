/** 青穗集 · 启动字标：按需载入真实Lottie，失败、超时或减少动态时回到同源静态矢量。 */
import { useEffect, useRef, useState } from "react";
import type { AnimationItem } from "lottie-web";
import { BOOT_SCENE } from "../state/startup";
interface Props { animated: boolean; playing?: boolean; frame?: number; onComplete?: () => void; onReady?: () => void }
export function BootTitle({ animated, playing = true, frame, onComplete, onReady }: Props) {
  const target = useRef<HTMLDivElement>(null), player = useRef<AnimationItem | null>(null);
  const latest = useRef({ playing, frame, onComplete, onReady });
  const [status, setStatus] = useState<"loading" | "ready" | "fallback">("loading");
  useEffect(() => { latest.current = { playing, frame, onComplete, onReady }; if (frame !== undefined) player.current?.goToAndStop(frame, true); else if (playing && !document.hidden) player.current?.play(); else player.current?.pause(); }, [playing, frame, onComplete, onReady]);
  useEffect(() => {
    if (!animated || !target.current) return;
    const controller = new AbortController(); let disposed = false, timeout: ReturnType<typeof setTimeout>;
    setStatus("loading");
    const fallback = () => { if (disposed) return; clearTimeout(timeout); controller.abort(); player.current?.destroy(); player.current = null; setStatus("fallback"); };
    timeout = setTimeout(fallback, 1600);
    void Promise.all([
      import("lottie-web/build/player/lottie_light"),
      fetch(BOOT_SCENE + "/lottie.json", { signal: controller.signal }).then(async response => {
        if (!response.ok) throw new Error("启动字标未能加载");
        return response.json();
      }),
    ]).then(([module, animationData]) => {
      if (disposed || controller.signal.aborted || !target.current) return;
      const animation = module.default.loadAnimation({ container: target.current, renderer: "svg", loop: false, autoplay: false,
        animationData, rendererSettings: { preserveAspectRatio: "xMidYMid meet", progressiveLoad: false } });
      player.current = animation;
      let loaded = false;
      const prepared = () => {
        if (disposed || loaded) return;
        loaded = true;
        clearTimeout(timeout); setStatus("ready"); latest.current.onReady?.();
        if (latest.current.frame !== undefined) animation.goToAndStop(latest.current.frame, true);
        else if (latest.current.playing && !document.hidden) animation.play();
      };
      animation.addEventListener("DOMLoaded", prepared);
      animation.addEventListener("complete", () => { if (latest.current.frame === undefined) latest.current.onComplete?.(); });
      if (animation.isLoaded) prepared();
      animation.addEventListener("data_failed", fallback);
      animation.addEventListener("error", fallback);
    }).catch(() => { if (!disposed && !controller.signal.aborted) fallback(); });
    const visibility = () => { if (document.hidden) player.current?.pause(); else if (latest.current.playing) player.current?.play(); };
    document.addEventListener("visibilitychange", visibility);
    return () => { disposed = true; clearTimeout(timeout); controller.abort(); document.removeEventListener("visibilitychange", visibility); player.current?.destroy(); player.current = null; };
  }, [animated]);
  const displayed = animated ? status : "static";
  return <div className="boot-title" role="img" aria-label="青穗集 CAREER DESKTOP" data-renderer={displayed === "ready" ? "lottie-svg" : "static-svg"} data-status={displayed}>
    <img className="boot-title__poster" src={BOOT_SCENE + "/poster.svg"} alt="" aria-hidden="true" width="640" height="340" />
    {animated && <div className="boot-title__animation" ref={target} aria-hidden="true" />}
  </div>;
}
