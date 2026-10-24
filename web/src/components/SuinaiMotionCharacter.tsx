/** 青穗集 · 穗奈动作画布：用统一时钟播放40场景，支持可打断过渡、静帧细查、隐藏暂停与减少动态。 */
import { useEffect, useRef, useState } from "react";
import { blinkClosure, drawSuinaiFrame, loadMotionAssets, type SuinaiView } from "../character/suinaiMotion";
import { armWrist, neutralPose, type ArmSide } from "../character/suinaiGesture";
import { ACTION_BY_ID, EXPRESSION_SPECS, sampleAction, type ExpressionId, type SuinaiActionId } from "../character/suinaiActions";
import { SuinaiActionPlayer } from "../character/suinaiPlayback";
import "../suinai-character.css";
interface Props {
  handFocus?: ArmSide | "auto"; action: SuinaiActionId; view: SuinaiView; playing: boolean; autoBlink: boolean;
  eyeOpen: number; blinkNonce: number; reducedMotion: boolean; actionNonce?: number | string;
  visible?: boolean; ariaLabel?: string;
  expression?: ExpressionId | null; seek?: { fraction: number; nonce: number };
  onProgress?: (fraction: number) => void; onComplete?: () => void;
}
export function SuinaiMotionCharacter(props: Props) {
  const canvas = useRef<HTMLCanvasElement>(null), current = useRef(props), invalidate = useRef<(() => void) | null>(null);
  const [retry, setRetry] = useState(0), [status, setStatus] = useState<"loading" | "ready" | "error">("loading"), [error, setError] = useState("");
  useEffect(() => { current.current = props; invalidate.current?.(); }, [props]);
  useEffect(() => {
    const controller = new AbortController(), target = canvas.current, context = target?.getContext("2d");
    if (!target || !context) { setError("当前浏览器无法显示角色画布。"); setStatus("error"); return; }
    const player = new SuinaiActionPlayer(current.current.action);
    let raf = 0, clock = 0, last: number | null = null, frames = 0, manualBlinkAt = -1;
    let seenBlink = current.current.blinkNonce, seenAction = current.current.actionNonce, seenSeek = -1;
    let disposed = false, reportedProgress = -1;
    setStatus("loading"); setError("");
    loadMotionAssets(controller.signal).then(assets => {
      if (disposed) return;
      setStatus("ready");
      const draw = (now: number) => {
        raf = 0;
        const settings = current.current, active = settings.playing && !settings.reducedMotion && settings.visible !== false && !document.hidden;
        const delta = active && last !== null ? Math.max(0, Math.min(.05, (now - last) / 1000)) : 0;
        last = active ? now : null; clock += delta;
        if (player.id !== settings.action || seenAction !== settings.actionNonce) {
          player.start(settings.action); seenAction = settings.actionNonce; reportedProgress = -1;
        } else if (active) player.advance(delta);
        if (settings.seek && settings.seek.nonce !== seenSeek) { seenSeek = settings.seek.nonce; player.seek(settings.seek.fraction); reportedProgress = -1; }
        let action = player.frame;
        if (settings.reducedMotion) action = { ...sampleAction(player.id, player.duration * .45), pose: neutralPose(), closure: 0, leftHand: "H01", rightHand: "H01" };
        if (settings.expression) {
          const spec = EXPRESSION_SPECS[settings.expression];
          action = { ...action, expression: settings.expression, expressionWeight: 1, closure: spec.closure ? 1 : 0, closedStyle: spec.closure ?? "closed", blush: settings.expression === "E06" ? .2 : 0 };
        }
        if (seenBlink !== settings.blinkNonce) { seenBlink = settings.blinkNonce; manualBlinkAt = clock; }
        const forced = !settings.reducedMotion && manualBlinkAt >= 0 ? blinkClosure(clock - manualBlinkAt) : 0;
        const natural = settings.autoBlink && !settings.reducedMotion ? blinkClosure((clock + 3.1) % 4.8) : 0;
        const openness = settings.autoBlink ? 1 - Math.max(forced, natural) : settings.eyeOpen;
        drawSuinaiFrame(context, assets, { view: settings.view, handFocus: settings.handFocus, eyeOpen: openness, action,
          breath: settings.reducedMotion ? 0 : Math.sin(clock * 1.35), sway: settings.reducedMotion ? 0 : Math.sin(clock * .7) * 1.2 });
        Object.assign(target.dataset, {
          frame: String(++frames), eyeOpen: Math.min(openness, 1 - action.closure).toFixed(3), action: player.id, gesture: ACTION_BY_ID[player.id].gesture,
          view: settings.view, handFocus: settings.handFocus ?? "auto", motion: active ? "on" : "off", renderer: "canvas-continuous-mesh", expression: action.expression,
          actionTime: player.seconds.toFixed(3), actionStatus: player.progress >= 1 ? ACTION_BY_ID[player.id].playback === "enter_then_hold" ? "holding" : "finished" : active ? "playing" : "paused",
          phase: action.phase, leftHand: action.leftHand, rightHand: action.rightHand,
          leftWrist: JSON.stringify(armWrist("l", action.pose.left)), rightWrist: JSON.stringify(armWrist("r", action.pose.right)),
        });
        if (Math.abs(player.progress - reportedProgress) >= .015 || reportedProgress < 0 || player.progress === 1 && reportedProgress !== 1) {
          reportedProgress = player.progress; settings.onProgress?.(player.progress);
        }
        if (player.takeCompletion()) settings.onComplete?.();
        if (active) raf = requestAnimationFrame(draw);
      };
      const request = () => { if (!disposed && !raf && !document.hidden) raf = requestAnimationFrame(draw); };
      const visibility = () => { last = null; if (document.hidden) { cancelAnimationFrame(raf); raf = 0; } else request(); };
      invalidate.current = request;
      document.addEventListener("visibilitychange", visibility);
      controller.signal.addEventListener("abort", () => document.removeEventListener("visibilitychange", visibility), { once: true });
      request();
    }).catch(cause => {
      if (disposed || controller.signal.aborted) return;
      setError(cause instanceof Error ? cause.message : "角色部件未能加载。"); setStatus("error");
    });
    return () => { disposed = true; controller.abort(); cancelAnimationFrame(raf); invalidate.current = null; };
  }, [retry]);
  return <div className="suinai-motion-character" data-status={status}>
    <canvas ref={canvas} width={1100} height={props.view === "full" ? 1570 : 1100} aria-label={props.ariaLabel ?? "穗奈原画分层动作预览"} role="img" />
    {status !== "ready" && <div className="suinai-motion-character__status" role={status === "error" ? "alert" : "status"}>
      <span aria-hidden="true">{status === "loading" ? "◌" : "!"}</span><strong>{status === "loading" ? "穗奈正在准备…" : "有一个部件没有到场"}</strong>
      <p>{status === "loading" ? "正在从本地读取原画部件。" : error}</p>
      {status === "error" && <button type="button" onClick={() => setRetry(value => value + 1)}>重新加载素材</button>}
    </div>}
  </div>;
}
