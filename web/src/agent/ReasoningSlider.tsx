/** 青穗集 · 像素思考滑块：原生输入与弹性像素核共享四档坐标，深入档提供充能反馈。 */
import { useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { useUiMotion } from "./uiMotion";
import { EffortGlyph, PixelSpringThumb } from "./PixelSpringThumb";
import type { ReasoningEffort } from "./types";
import "./reasoning-slider.css";

const EFFORTS: ReasoningEffort[] = ["auto", "low", "medium", "high"];
const LABELS = ["自动", "轻量", "标准", "深入"];

export function ReasoningSlider({ effort, disabled, onChange }: {
  effort: ReasoningEffort; disabled: boolean; onChange: (value: ReasoningEffort) => void;
}) {
  const selected = EFFORTS.indexOf(effort);
  const [draft, setDraft] = useState<number | null>(null);
  const [pressed, setPressed] = useState(false);
  const dragging = useRef(false);
  const { playing } = useUiMotion();
  const position = disabled ? selected : draft ?? selected;
  const preview = Math.round(position);
  const commit = (value: number) => {
    dragging.current = false;
    setPressed(false);
    setDraft(null);
    onChange(EFFORTS[Math.max(0, Math.min(3, Math.round(value)))]!);
  };
  const cancel = () => { dragging.current = false; setPressed(false); setDraft(null); };
  const keyboard = (event: KeyboardEvent<HTMLInputElement>) => {
    const move = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1, PageUp: 1, PageDown: -1 }[event.key];
    if (move !== undefined || event.key === "Home" || event.key === "End") {
      event.preventDefault();
      commit(event.key === "Home" ? 0 : event.key === "End" ? 3 : selected + (move ?? 0));
    }
  };
  return <>
    <div className="agent-effort-atmosphere" aria-hidden="true">
      <span className="agent-effort-ignition" />
      <svg viewBox="0 0 286 150" preserveAspectRatio="none" fill="none">
        <rect className="agent-effort-edge agent-effort-edge--violet" x="1" y="1" width="284" height="148" rx="11" pathLength="100" />
        <rect className="agent-effort-edge agent-effort-edge--mint" x="1" y="1" width="284" height="148" rx="11" pathLength="100" />
        <path className="agent-effort-corners" d="M3 27V11H11V3H29M257 3H275V11H283V27M283 123V139H275V147H257M29 147H11V139H3V123" />
      </svg>
    </div>
    <div className="agent-effort-heading"><label htmlFor="agent-effort-range">思考强度</label><span className="agent-effort-current" key={preview}>{LABELS[preview]}</span></div>
    <div className="agent-effort-slider" data-dragging={pressed && !disabled} data-high={preview === 3} data-level={preview} data-motion={playing ? "playing" : "still"} style={{ "--effort-progress": `${position / 3 * 100}%` } as CSSProperties}>
      <div className="agent-effort-visual" aria-hidden="true">
        <div className="agent-effort-rail">
          <span className="agent-effort-track"><span className="agent-effort-fill" /></span>
          {EFFORTS.map((value, index) => <i key={value} style={{ left: `${index / 3 * 100}%` }} data-active={index <= preview} />)}
        </div>
        <div className="agent-effort-thumb-path"><span className="agent-effort-thumb"><EffortGlyph level={preview} /></span></div>
        <PixelSpringThumb value={position} pressed={pressed && !disabled} motion={playing} disabled={disabled} />
      </div>
      <input id="agent-effort-range" aria-label="思考强度" aria-valuetext={LABELS[preview]} aria-describedby="agent-effort-note" type="range" min={0} max={3} step={0.001} value={position} disabled={disabled}
        onPointerDown={event => { if (event.button !== 0) return; dragging.current = true; setPressed(true); event.currentTarget.setPointerCapture(event.pointerId); }}
        onChange={event => { const value = Number(event.target.value); if (dragging.current) setDraft(value); else commit(value); }}
        onPointerUp={event => { if (dragging.current) commit(Number(event.currentTarget.value)); }}
        onPointerCancel={cancel} onLostPointerCapture={() => { if (dragging.current) cancel(); }} onBlur={cancel} onKeyDown={keyboard} />
    </div>
    <div className="agent-effort-ticks">{EFFORTS.map((value, index) => <button type="button" key={value} aria-pressed={value === effort} data-selected={index === preview} disabled={disabled} onClick={() => commit(index)}>{LABELS[index]}</button>)}</div>
    <p id="agent-effort-note">{effort === "auto" ? "跟随模型默认设置" : "需模型及服务商支持，不支持时会提示"}</p>
  </>;
}
