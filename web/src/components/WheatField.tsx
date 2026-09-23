/**
 * 风吹麦浪 — the brand's own field, moving behind the page.
 *
 * Three filled sines, each an SVG stretched to 200% of the viewport and slid left by
 * half its width. Only `transform` animates, so the compositor does the work and the
 * main thread does none: no canvas, no rAF, no dependency, and it costs nothing while
 * someone reads. `state/loop.ts` proves where she is; this only says the page is alive.
 *
 * The loop is seamless because every layer carries an integer number of periods per
 * viewport — see wheatfield.test.ts, which is the only thing keeping that true.
 */
import type { CSSProperties } from "react";

const WIDTH = 1440;
const HEIGHT = 200;

export interface Layer {
  /** Periods across the whole 200%-wide element. Must be even: half of it, one
   *  viewport, has to land on a whole period or the loop jumps once per cycle. */
  cycles: number;
  amp: number;
  phase: number;
  baseline: number;
  seconds: number;
}

export const LAYERS: Layer[] = [
  { cycles: 2, amp: 15, phase: 0, baseline: 118, seconds: 34 },
  { cycles: 4, amp: 10, phase: 1.7, baseline: 146, seconds: 23 },
  { cycles: 6, amp: 6, phase: 3.1, baseline: 170, seconds: 15 },
];

/** A sine with a second harmonic on top, so it reads as wind rather than a waveform. */
function swell(x: number, layer: Layer): number {
  const t = (x / WIDTH) * layer.cycles * Math.PI * 2 + layer.phase;
  return Math.sin(t) * layer.amp + Math.sin(t * 2 + 0.6) * layer.amp * 0.35;
}

/** The closed band under one period-rich sine, down to the bottom of the box. */
export function wavePath(layer: Layer): string {
  const segments = layer.cycles * 24;
  const points: string[] = [];
  for (let index = 0; index <= segments; index += 1) {
    const x = (index / segments) * WIDTH;
    points.push(`${x.toFixed(1)} ${(layer.baseline + swell(x, layer)).toFixed(1)}`);
  }
  return `M${points[0]} L${points.slice(1).join(" L")} L${WIDTH} ${HEIGHT} L0 ${HEIGHT} Z`;
}

export function WheatField() {
  return (
    <div className="field" aria-hidden="true">
      {LAYERS.map((layer, index) => (
        <svg
          className={`field__wave field__wave--${index}`}
          style={{ animationDuration: `${layer.seconds}s` } as CSSProperties}
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          preserveAspectRatio="none"
          key={layer.seconds}
        >
          <path d={wavePath(layer)} />
        </svg>
      ))}
    </div>
  );
}
