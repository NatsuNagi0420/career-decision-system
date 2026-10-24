/** 青穗集 · Live2D 渲染入口：惰性加载本地 Core、可取消初始化、离屏/后台暂停与错误重试。 */
import { useEffect, useRef, useState } from "react";
import { assetUrl } from "../assets";
import { LIVE2D_MODEL, type CompanionMotion, type CompanionState, type Live2DController, type Live2DInfo, type Live2DRuntime } from "../character/live2d";
import { useReducedMotion } from "../character/preferences";
declare global { interface Window { CareerLive2D?: Live2DRuntime } }
const scriptPromises = new Map<string, Promise<void>>();
function loadLocalScript(src: string): Promise<void> {
  const current = scriptPromises.get(src);
  if (current) return current;
  const promise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    const timer = window.setTimeout(() => fail(), 15000);
    const fail = () => { clearTimeout(timer); script.remove(); scriptPromises.delete(src); reject(new Error(`本地运行时加载失败：${src}`)); };
    script.onerror = fail;
    script.onload = () => { clearTimeout(timer); resolve(); };
    document.head.append(script);
  });
  scriptPromises.set(src, promise);
  return promise;
}
interface Props {
  state: CompanionState;
  playing: boolean;
  tracking: boolean;
  mouth: number;
  zoom: number;
  motion?: { name: CompanionMotion; nonce: number };
  modelUrl?: string;
  onInfo?: (info: Live2DInfo | null) => void;
}
export function Live2DCharacter({ state, playing, tracking, mouth, zoom, motion, modelUrl = LIVE2D_MODEL.url, onInfo }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const controller = useRef<Live2DController | null>(null);
  const consumedMotion = useRef<number | undefined>(undefined);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [visible, setVisible] = useState(true);
  const [inView, setInView] = useState(true);
  const [generation, setGeneration] = useState(0);
  const reduced = useReducedMotion();
  const onInfoRef = useRef(onInfo); onInfoRef.current = onInfo;
  const paused = !playing || reduced || !visible || !inView;
  const pausedRef = useRef(paused); pausedRef.current = paused;
  useEffect(() => {
    const element = canvas.current!;
    const abort = new AbortController();
    let owned: Live2DController | undefined;
    setStatus("loading"); setError(""); onInfoRef.current?.(null);
    async function initialize() {
      try {
        await loadLocalScript(assetUrl("live2d/core/live2dcubismcore.min.js"));
        if (abort.signal.aborted) return;
        await loadLocalScript(assetUrl("live2d/runtime/companion.js"));
        const runtime = window.CareerLive2D;
        if (!runtime) throw new Error("Live2D 运行时没有正确初始化");
        if (abort.signal.aborted) return;
        const result = await runtime.createCompanion(element, { modelUrl, signal: abort.signal, onError: message => {
          if (abort.signal.aborted) return;
          owned?.destroy(); controller.current = null; onInfoRef.current?.(null); setError(message); setStatus("error");
        } });
        owned = result.controller;
        if (abort.signal.aborted) { owned.destroy(); return; }
        controller.current = owned; owned.setPaused(pausedRef.current);
        onInfoRef.current?.(result.info); setStatus("ready"); setGeneration(value => value + 1);
      } catch (reason) {
        if (abort.signal.aborted) return;
        setError(reason instanceof Error ? reason.message : "模型初始化失败"); setStatus("error");
      }
    }
    void initialize();
    const lost = (event: Event) => {
      event.preventDefault(); owned?.destroy(); controller.current = null;
      onInfoRef.current?.(null); setError("图形上下文已丢失，请重试加载角色"); setStatus("error");
    };
    element.addEventListener("webglcontextlost", lost);
    return () => { abort.abort(); owned?.destroy(); if (controller.current === owned) controller.current = null; element.removeEventListener("webglcontextlost", lost); };
  }, [modelUrl, retry]);
  useEffect(() => {
    const update = () => setVisible(!document.hidden);
    update(); document.addEventListener("visibilitychange", update);
    const observer = new IntersectionObserver(entries => setInView(entries[0]?.isIntersecting ?? true));
    if (canvas.current) observer.observe(canvas.current);
    return () => { document.removeEventListener("visibilitychange", update); observer.disconnect(); };
  }, []);
  useEffect(() => { controller.current?.setPaused(paused); }, [paused, generation]);
  useEffect(() => { controller.current?.setState(state); }, [state, generation]);
  useEffect(() => { controller.current?.setTracking(tracking && !reduced); }, [tracking, reduced, generation]);
  useEffect(() => { controller.current?.setMouth(mouth); }, [mouth, generation]);
  useEffect(() => { controller.current?.setZoom(zoom); }, [zoom, generation]);
  useEffect(() => {
    if (!motion || motion.nonce === consumedMotion.current) return;
    consumedMotion.current = motion.nonce;
    if (!paused) controller.current?.playMotion(motion.name);
  }, [motion, paused, generation]);
  return <div className="live2d-character" data-status={status} data-motion={paused ? "off" : "on"}>
    <canvas ref={canvas} aria-label="Live2D 官方临时角色预览" role="img" width="640" height="800" onPointerMove={event => {
      if (!tracking || paused) return;
      const rect = event.currentTarget.getBoundingClientRect();
      controller.current?.setPointer((event.clientX - rect.left) / rect.width * 2 - 1, 1 - (event.clientY - rect.top) / rect.height * 2);
    }} onPointerLeave={() => controller.current?.setPointer(0, 0)} />
    {status !== "ready" && <div className="live2d-character__message" role={status === "error" ? "alert" : "status"}>
      <span className="live2d-character__symbol" aria-hidden="true">{status === "error" ? "!" : "◌"}</span>
      <strong>{status === "loading" ? "正在唤醒临时角色…" : "角色暂时无法显示"}</strong>
      <p>{status === "loading" ? "从本地加载模型、贴图和动作，不调用大模型。" : error}</p>
      {status === "error" && <button type="button" onClick={() => setRetry(value => value + 1)}>重新加载角色</button>}
    </div>}
  </div>;
}



