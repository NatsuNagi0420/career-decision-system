/** 青穗集 · 背景点阵波动：按触点距离延迟位移并回弹，画布只在波动期间刷新。 */
export const DOT_WAVE_LIFETIME = 1500;
export interface DotWave { x: number; y: number; startedAt: number }
export interface DotPoint { x: number; y: number }

export function createDotGrid(width: number, height: number, spacing: number): DotPoint[] {
  const points: DotPoint[] = [];
  if (![width, height, spacing].every(value => Number.isFinite(value) && value > 0)) return points;
  const origin = spacing / 24;
  for (let y = origin; y < height; y += spacing)
    for (let x = origin; x < width; x += spacing) points.push({ x, y });
  return points;
}

export function sampleDot(point: DotPoint, waves: readonly DotWave[], now: number, spacing: number) {
  let dx = 0, dy = 0, energy = 0;
  const radius = spacing * 22;
  for (const wave of waves) {
    const x = point.x - wave.x, y = point.y - wave.y;
    const distance = Math.hypot(x, y);
    if (distance > radius) continue;
    const phase = (now - wave.startedAt - distance / radius * 900) / 460;
    if (phase <= 0 || phase >= 1) continue;
    const falloff = 0.35 + 0.65 * (1 - distance / radius);
    const bend = Math.sin(phase * Math.PI * 2) * (1 - phase);
    const travel = bend * spacing * 1.5 * falloff;
    if (distance > 0) {
      dx += x / distance * travel;
      dy += y / distance * travel;
    }
    energy += Math.sin(phase * Math.PI) * (1 - phase) * falloff;
  }
  // 快速连点的波动可以叠加，但不把点拉到相邻几列之外。
  const limit = spacing * 0.8;
  const ratio = Math.min(1, limit / (Math.hypot(dx, dy) || 1));
  return { x: point.x + dx * ratio, y: point.y + dy * ratio, energy: Math.min(1, energy) };
}

interface DotRendererOptions {
  context: Pick<CanvasRenderingContext2D, "clearRect" | "fillRect" | "fillStyle">;
  width: number;
  height: number;
  spacing: number;
  requestFrame: (callback: () => void) => number;
  cancelFrame: (id: number) => void;
  now?: () => number;
}

export function createDotFieldRenderer(options: DotRendererOptions) {
  const { context, width, height, spacing, requestFrame, cancelFrame } = options;
  const now = options.now ?? Date.now;
  const points = createDotGrid(width, height, spacing);
  const size = Math.max(0.8, spacing / 12);
  let waves: readonly DotWave[] = [], frame: number | undefined, lastPaint = -Infinity;

  function paint(time: number) {
    context.clearRect(0, 0, width, height);
    context.fillStyle = "rgba(114, 93, 140, 0.13)";
    const moving: ReturnType<typeof sampleDot>[] = [];
    for (const point of points) {
      const dot = waves.length ? sampleDot(point, waves, time, spacing) : { ...point, energy: 0 };
      if (dot.energy > 0.001) moving.push(dot);
      else context.fillRect(point.x - size / 2, point.y - size / 2, size, size);
    }
    for (const dot of moving) {
      const side = size + dot.energy * spacing * 0.14;
      context.fillStyle = `rgba(125, 99, 163, ${0.13 + dot.energy * 0.5})`;
      context.fillRect(dot.x - side / 2, dot.y - side / 2, side, side);
    }
  }
  function cancel() {
    if (frame !== undefined) cancelFrame(frame);
    frame = undefined;
  }
  function tick() {
    frame = undefined;
    const time = now();
    if (!waves.some(wave => time < wave.startedAt + DOT_WAVE_LIFETIME)) {
      waves = [];
      paint(time);
      return;
    }
    // 画布最多每秒绘制 30 次；不经 Vue 或微信 setData 逐帧更新。
    if (time - lastPaint >= 1000 / 30) { paint(time); lastPaint = time; }
    frame = requestFrame(tick);
  }
  return {
    update(next: readonly DotWave[]) {
      waves = next;
      paint(now());
      if (waves.length && frame === undefined) frame = requestFrame(tick);
      else if (!waves.length) cancel();
    },
    stop() { cancel(); waves = []; },
  };
}
