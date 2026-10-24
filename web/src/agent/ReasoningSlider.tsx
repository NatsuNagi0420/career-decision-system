/** 青穗集 · 思考强度吸附滑条：连续拖动、松手落档；最高档日文字符流仅作装饰，不代表执行状态。 */
import { useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { useUiMotion } from "./uiMotion";
import { EffortWordStream } from "./EffortWordStream";
import type { ReasoningEffort } from "./types";

const EFFORTS: ReasoningEffort[] = ["auto", "low", "medium", "high"];
const LABELS = ["自动", "轻量", "标准", "深入"];

export function ReasoningSlider({ effort, disabled, onChange }: {
  effort: ReasoningEffort; disabled: boolean; onChange: (value: ReasoningEffort) => void;
}) {
  const selected = EFFORTS.indexOf(effort);
  const [draft, setDraft] = useState<number | null>(null);
  const dragging = useRef(false);
  const { playing } = useUiMotion();
  const position = disabled ? selected : draft ?? selected;
  const preview = Math.round(position);
  const commit = (value: number) => {
    dragging.current = false;
    setDraft(null);
    onChange(EFFORTS[Math.max(0, Math.min(3, Math.round(value)))]!);
  };
  const cancel = () => { dragging.current = false; setDraft(null); };
  const keyboard = (event: KeyboardEvent<HTMLInputElement>) => {
    const move = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1, PageUp: 1, PageDown: -1 }[event.key];
    if (move !== undefined || event.key === "Home" || event.key === "End") {
      event.preventDefault();
      commit(event.key === "Home" ? 0 : event.key === "End" ? 3 : selected + (move ?? 0));
    }
  };
  return <>
    <div className="agent-effort-heading"><label htmlFor="agent-effort-range">思考强度</label><span className="agent-effort-meter" aria-hidden="true">{EFFORTS.map((value, index) => <i key={value} data-active={index <= preview} />)}</span></div>
    <div className="agent-effort-slider" data-dragging={draft !== null && !disabled} data-high={preview === 3} data-level={preview} data-motion={playing ? "playing" : "still"} style={{ "--effort-progress": `${position / 3 * 100}%` } as CSSProperties}>
      <div className="agent-effort-rail" aria-hidden="true">
        <span className="agent-effort-track">
          <span className="agent-effort-fill" />
          <span className="agent-effort-energy" data-ascii="effort-high">
            <EffortWordStream active={preview === 3 && playing && !disabled} />
            <span className="agent-effort-scan" /><span className="agent-effort-scan agent-effort-scan--echo" />
          </span>
        </span>
        {EFFORTS.map((value, index) => <i key={value} style={{ left: `${index / 3 * 100}%` }} data-active={index <= preview} />)}
        <span className="agent-effort-thumb" />
      </div>
      <input id="agent-effort-range" aria-label="思考强度" aria-valuetext={LABELS[preview]} aria-describedby="agent-effort-note" type="range" min={0} max={3} step={0.001} value={position} disabled={disabled}
        onPointerDown={event => { if (event.button !== 0) return; dragging.current = true; event.currentTarget.setPointerCapture(event.pointerId); }}
        onChange={event => { const value = Number(event.target.value); if (dragging.current) setDraft(value); else commit(value); }}
        onPointerUp={event => { if (dragging.current) commit(Number(event.currentTarget.value)); }}
        onPointerCancel={cancel} onBlur={cancel} onKeyDown={keyboard} />
    </div>
    <div className="agent-effort-ticks">{EFFORTS.map((value, index) => <button type="button" key={value} aria-pressed={value === effort} data-selected={index === preview} disabled={disabled} onClick={() => commit(index)}>{LABELS[index]}</button>)}</div>
    <p id="agent-effort-note">{effort === "auto" ? "跟随模型默认设置" : "需模型及服务商支持，不支持时会提示"}</p>
  </>;
}
