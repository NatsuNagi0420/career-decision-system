/** 青穗集 · 正式穗奈小窗：复用分层动作，处理一次性反馈、暂停、小屏展开与辅助功能。 */
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { CompanionCue } from "../character/suinaiCompanion";
import { ACTION_BY_ID } from "../character/suinaiActions";
import { useReducedMotion } from "../character/preferences";
import { SuinaiMotionCharacter } from "./SuinaiMotionCharacter";
import { PixelIcon } from "./PixelIcon";

const MOTION_KEY = "career.suinai.motion";
const NARROW_QUERY = "(max-width: 1040px)";
function subscribeViewport(callback: () => void) {
  const query = window.matchMedia(NARROW_QUERY);
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}
const readViewport = () => window.matchMedia(NARROW_QUERY).matches;
function readAnimation() {
  try { return localStorage.getItem(MOTION_KEY) !== "0"; } catch { return true; }
}
interface Props { cue: CompanionCue; motion: boolean; visible: boolean; onMessages: () => void; onReconnect?: () => void }
export function SuinaiCompanion({ cue, motion, visible, onMessages, onReconnect }: Props) {
  const narrow = useSyncExternalStore(subscribeViewport, readViewport, () => false);
  const reducedMotion = useReducedMotion();
  const [expanded, setExpanded] = useState(false), [hasOpened, setHasOpened] = useState(false);
  const [animated, setAnimated] = useState(readAnimation), [settledKey, setSettledKey] = useState<string | null>(null);
  const launcher = useRef<HTMLButtonElement>(null), closeButton = useRef<HTMLButtonElement>(null);
  const open = !narrow || expanded;
  const shown = open && (visible || narrow);
  const action = settledKey === cue.key ? "A02" : cue.action;
  useEffect(() => { if (shown) setHasOpened(true); }, [shown]);
  useEffect(() => {
    if (!narrow || !expanded) return;
    closeButton.current?.focus();
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setExpanded(false); launcher.current?.focus(); }
    };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [narrow, expanded]);
  const close = () => { setExpanded(false); launcher.current?.focus(); };
  const toggleMotion = () => {
    const next = !animated; setAnimated(next);
    try { localStorage.setItem(MOTION_KEY, next ? "1" : "0"); } catch { /* Display preference must never block a conversation. */ }
  };
  const motionLocked = reducedMotion || !motion;
  const motionLabel = reducedMotion ? "系统已减少动态" : !motion ? "全站动画已暂停" : animated ? "暂停穗奈动画" : "播放穗奈动画";
  return <>
    <button ref={launcher} className="companion-launcher no-print" type="button" aria-expanded={expanded}
      aria-controls="suinai-companion" aria-label={`${expanded ? "收起" : "打开"}穗奈陪伴窗口：${cue.label}`} onClick={() => setExpanded(value => !value)}>
      <PixelIcon kind="wheat" size={17} /><span>穗奈的小窗</span><i data-phase={cue.phase} aria-hidden="true" />
    </button>
    <aside id="suinai-companion" className="companion no-print" hidden={!shown} aria-label="穗奈的陪伴窗口"
      data-phase={cue.phase} data-cue={cue.key} data-requested-action={cue.action}>
      <div className="desktop-titlebar"><span><PixelIcon kind="wheat" size={15} />穗奈的小窗</span>
        {narrow ? <button ref={closeButton} type="button" className="companion__close" aria-label="收起穗奈陪伴窗口" onClick={close}>×</button> : <span className="desktop-window-mark" aria-hidden="true">✦</span>}
      </div>
      <div className="companion__scene"><span className="companion__label">SUINAI / 穗奈</span><div className="companion__grid" aria-hidden="true" />
        {(shown || hasOpened) && <SuinaiMotionCharacter action={action} actionNonce={`${cue.key}:${settledKey === cue.key ? "settled" : "active"}`}
          view="gesture" playing={animated && motion} autoBlink eyeOpen={1} blinkNonce={0} reducedMotion={reducedMotion}
          visible={shown} ariaLabel={`穗奈：${cue.label}`} onComplete={() => {
            if (ACTION_BY_ID[action].playback === "one_shot_then_idle") setSettledKey(cue.key);
          }} />}
        <span className="companion__flower" aria-hidden="true">✳</span>
      </div>
      <div className="companion__tools"><span className="companion__mode">随任务回应</span>
        <button type="button" className="companion__pause" aria-label={motionLabel} aria-pressed={!animated || motionLocked}
          disabled={motionLocked} onClick={toggleMotion}><span aria-hidden="true">{animated && !motionLocked ? "Ⅱ" : "▷"}</span>{motionLocked ? motionLabel : animated ? "暂停动作" : "继续动作"}</button>
        <a className="research-only" href="?preview=suinai-motion">动作试映室 ↗</a>
      </div>
      <div className="companion__speech"><div role="status" aria-live="polite" aria-atomic="true">
        <span className="companion__status"><i data-phase={cue.phase} />{cue.label}</span><p>{cue.line}</p>
      </div>{cue.reconnect && onReconnect && <button type="button" className="companion__reconnect" onClick={onReconnect}>重新连接进度<span aria-hidden="true">↻</span></button>}
      <button type="button" onClick={() => { onMessages(); if (narrow) close(); }}>和穗奈说说<span aria-hidden="true">↗</span></button></div>
    </aside>
  </>;
}
