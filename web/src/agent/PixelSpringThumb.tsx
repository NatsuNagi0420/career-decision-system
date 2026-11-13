/** 青穗集 · 弹性像素核：有限色阶与点阵图标，深入档充能粒子；浮层隐藏或关闭动效时停止绘制。 */
import { useEffect, useRef } from "react";

// 同一组像素同时用于画布与无画布降级，四档从火花、分支演变为完整思维核。
const GLYPHS = [
  ["000010000", "000010000", "000111000", "001111100", "111101111", "001111100", "000111000", "000010000", "000010000"],
  ["100010001", "010010010", "001010100", "000111000", "111101111", "000111000", "001010100", "010010010", "100010001"],
  ["001010100", "000111000", "101000101", "010111010", "110101011", "010111010", "101000101", "000111000", "001010100"],
  ["100010001", "000111000", "001010100", "010010010", "111101111", "010010010", "001010100", "000111000", "100010001"],
];
const GLYPH_PATHS = GLYPHS.map(rows => rows.flatMap((row, y) => [...row].flatMap((bit, x) => bit === "1" ? [`M${x} ${y}h1v1h-1z`] : [])).join(""));

export function EffortGlyph({ level }: { level: number }) {
  return <svg viewBox="0 0 9 9" aria-hidden="true" shapeRendering="crispEdges"><path d={GLYPH_PATHS[level]} fill="currentColor" /></svg>;
}

function coreSprite(level: number) {
  const sprite = document.createElement("canvas");
  sprite.width = sprite.height = 24;
  const ctx = sprite.getContext("2d");
  if (!ctx) return sprite;
  const high = level === 3;
  const polygon = (points: number[][], color: string) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    points.forEach(([x, y], index) => index ? ctx.lineTo(x!, y!) : ctx.moveTo(x!, y!));
    ctx.closePath(); ctx.fill();
  };
  // 阶梯切角与离散明暗面，不使用果冻的透明折射或圆形高光。
  polygon([[5, 1], [19, 1], [19, 3], [22, 3], [22, 6], [23, 6], [23, 19], [21, 19], [21, 22], [18, 22], [18, 23], [5, 23], [5, 21], [2, 21], [2, 18], [1, 18], [1, 5], [3, 5], [3, 3], [5, 3]], high ? "#4d396e" : "#6b4c91");
  polygon([[5, 2], [18, 2], [18, 4], [21, 4], [21, 7], [22, 7], [22, 17], [20, 17], [20, 20], [17, 20], [17, 21], [6, 21], [6, 19], [3, 19], [3, 6], [5, 6]], high ? "#9671ce" : "#b795dc");
  polygon([[6, 3], [17, 3], [17, 5], [20, 5], [20, 8], [5, 8], [5, 6], [6, 6]], high ? "#c4eedc" : "#e8d6f7");
  ctx.fillStyle = high ? "#b69be3" : "#cdb0e9";
  ctx.fillRect(4, 8, 17, 8);
  ctx.fillStyle = high ? "#7453af" : "#a17bc4";
  ctx.fillRect(5, 17, 15, 2); ctx.fillRect(7, 19, 11, 1);
  // 保持纹理集中在边缘，给中心符号留出清晰的负空间。
  ctx.fillStyle = high ? "#805bb8" : "#ac85cf";
  for (let y = 8; y < 17; y += 2) for (const x of [4, 18, 20]) if ((x + y) % 4 === 0) ctx.fillRect(x, y, 1, 1);
  ctx.fillStyle = "#fff9ed";
  ctx.fillRect(7, 3, 7, 1); ctx.fillRect(4, 6, 1, 4);
  ctx.fillStyle = "#7955a5";
  ctx.fillRect(7, 8, 11, 10);
  ctx.fillStyle = high ? "#d9ffdf" : "#fcf4ff";
  GLYPHS[level]!.forEach((row, y) => [...row].forEach((bit, x) => { if (bit === "1") ctx.fillRect(8 + x, 8 + y, 1, 1); }));
  return sprite;
}

export function PixelSpringThumb({ value, pressed, motion, disabled }: {
  value: number; pressed: boolean; motion: boolean; disabled: boolean;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const latest = useRef({ value, pressed, motion, disabled });
  const wake = useRef<() => void>(() => {});

  useEffect(() => {
    const element = canvas.current;
    const ctx = element?.getContext("2d");
    if (!element || !ctx) return;
    const sprites = GLYPHS.map((_, level) => coreSprite(level));
    const panel = element.closest<HTMLElement>("[popover]");
    let frame = 0, last = 0, width = 0, height = 0, ratio = 1, thumbSize = 36, bleed = 12;
    let position = latest.current.value / 3, velocity = 0, compression = 0, compressionSpeed = 0;
    let energy = 0, burst = 1, wasHigh = false;
    const visible = () => !document.hidden && (!panel || panel.matches(":popover-open"));
    const stop = () => { cancelAnimationFrame(frame); frame = 0; last = 0; };
    const square = (x: number, y: number, size: number, color: string, alpha = 1) => {
      ctx.globalAlpha = alpha; ctx.fillStyle = color;
      ctx.fillRect(Math.round(x), Math.round(y), size, size); ctx.globalAlpha = 1;
    };
    const corners = (x: number, y: number, radius: number, alpha: number) => {
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
        ctx.globalAlpha = alpha;
        ctx.fillStyle = "#a18ac8";
        ctx.fillRect(Math.round(x + sx * radius - (sx > 0 ? 4 : 0)), Math.round(y + sy * radius), 6, 2);
        ctx.fillStyle = "#b8dccc";
        ctx.fillRect(Math.round(x + sx * radius), Math.round(y + sy * radius - (sy > 0 ? 4 : 0)), 2, 6);
        ctx.globalAlpha = 1;
      }
    };
    const draw = (now: number) => {
      frame = 0;
      if (!visible() || !width || !height) return;
      const props = latest.current;
      const dt = Math.min((now - (last || now - 16)) / 1000, .032);
      last = now;
      const target = props.value / 3;
      const level = Math.round(props.value);
      const high = level === 3 && !props.disabled;
      const pressTarget = props.pressed && !props.disabled ? 1 : 0;
      if (high && !wasHigh) { burst = 0; energy = 0; }
      wasHigh = high;
      if (props.motion) {
        velocity += ((target - position) * (props.pressed ? 800 : 320) - velocity * (props.pressed ? 38 : 21)) * dt;
        position += velocity * dt;
        compressionSpeed += ((pressTarget - compression) * 300 - compressionSpeed * 17) * dt;
        compression += compressionSpeed * dt;
        energy += dt; burst = Math.min(1, burst + dt / .9);
      } else { position = target; velocity = 0; compression = 0; compressionSpeed = 0; burst = 1; energy = 0; }
      // 与原生 range 共用 CSS 尺寸，缩放滑块或轨道时端点仍然严格对齐。
      const railStart = bleed + thumbSize / 2, railEnd = width - railStart;
      const railWidth = railEnd - railStart, coreRadius = thumbSize / 2;
      const center = railStart + position * railWidth, mid = height * .5;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.clearRect(0, 0, width, height);
      ctx.imageSmoothingEnabled = false;
      if (high) {
        // 双层像素电路与有尾迹的能量包，持续汇入核心；无模糊滤镜。
        for (let x = railStart + 4; x < railEnd - 4; x += 8) {
          const wave = (Math.sin((x - railStart) * .07 - energy * 5) + 1) / 2;
          square(x, mid - 7, 2, "#c2d2f7", .2 + wave * .45);
          square(x + 2, mid + 5, 2, "#bef5c9", .65 - wave * .4);
        }
        for (let i = 0; i < 4; i++) {
          const phase = (energy * .46 + i / 4) % 1;
          const x = railStart + phase * railWidth;
          const lane = i % 2 ? 2 : -4;
          const color = i % 2 ? "#d8ffbf" : "#e5d5ff";
          square(x, mid + lane, 4, color, .95);
          for (let tail = 1; tail <= 3; tail++) {
            const tailX = x - tail * 5;
            if (tailX > railStart) square(tailX, mid + lane + 1, 2, color, .6 - tail * .13);
          }
        }
        // 能量跨过整条轨道后上浮，形成可见的离散电火花。
        for (let i = 0; i < 7; i++) {
          const phase = (energy * .55 + i * .143) % 1;
          const x = railStart + (i + .5) / 7 * railWidth;
          const side = i % 2 ? 1 : -1;
          square(x + Math.round(phase * 4), mid + side * (12 + phase * 13), phase < .5 ? 3 : 2, i % 2 ? "#8bbfa6" : "#aa86d4", Math.sin(phase * Math.PI) * .75);
        }
        corners(center, mid, coreRadius + 5 + Math.round(Math.sin(energy * 3.2)), .8);
        for (let i = 0; i < 3; i++) {
          const angle = energy * 2.1 + i * Math.PI * 2 / 3;
          square(Math.min(width - 4, Math.max(0, center + Math.cos(angle) * (coreRadius + 9))), mid + Math.sin(angle) * (coreRadius + 9), i ? 3 : 4, i ? "#ac8dcb" : "#8cc8ae", .9);
        }
        if (burst < 1) {
          // 切入深入档时，脉冲从核心向整条轨道放电，而非只闪动滑块。
          const sweepX = railEnd - burst * railWidth;
          square(sweepX, mid - 10, 3, "#ddffd5", (1 - burst) * .9);
          for (let i = 0; i < 12; i++) {
            const angle = i * Math.PI / 6;
            const distance = coreRadius + burst * 16;
            square(Math.min(width - 3, Math.max(0, center + Math.cos(angle) * distance)), mid + Math.sin(angle) * distance, 3, i % 2 ? "#90c7ad" : "#a581ce", 1 - burst);
          }
        }
      }
      // 硬边像素投影与弹性变形分开，避免材质又变成光滑果冻。
      ctx.globalAlpha = .16; ctx.fillStyle = "#8c6ba8";
      ctx.fillRect(Math.round(center - coreRadius * .72), Math.round(mid + coreRadius - 1 - compression * 2), Math.round(thumbSize * .72), 3);
      ctx.globalAlpha = 1;
      const stretch = Math.min(Math.abs(velocity) * .3, 1);
      const pulse = high ? Math.sin(energy * 2.8) * .025 : 0;
      ctx.save();
      ctx.translate(Math.round(center), Math.round(mid));
      ctx.rotate(Math.max(-.14, Math.min(.14, velocity * -.05)));
      ctx.scale(1 + stretch * .18 + compression * .1 + pulse, 1 - stretch * .11 - compression * .14 + pulse);
      ctx.drawImage(sprites[level]!, -coreRadius, -coreRadius, thumbSize, thumbSize);
      ctx.restore();
      element.dataset.ready = "true";
      const springActive = Math.abs(target - position) > .0001 || Math.abs(velocity) > .001 || Math.abs(pressTarget - compression) > .001 || Math.abs(compressionSpeed) > .001;
      if (props.motion && (high || springActive)) frame = requestAnimationFrame(draw);
      else last = 0;
    };
    const start = () => { if (!frame && visible()) frame = requestAnimationFrame(draw); };
    const resize = () => {
      width = element.clientWidth; height = element.clientHeight;
      const style = getComputedStyle(element);
      thumbSize = parseFloat(style.getPropertyValue("--effort-thumb-size")) || 36;
      bleed = parseFloat(style.getPropertyValue("--effort-canvas-bleed")) || 12;
      ratio = Math.min(window.devicePixelRatio || 1, 2);
      element.width = Math.max(1, Math.round(width * ratio)); element.height = Math.max(1, Math.round(height * ratio));
      start();
    };
    const visibility = () => { if (visible()) { resize(); start(); } else { stop(); wasHigh = false; } };
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    panel?.addEventListener("toggle", visibility);
    document.addEventListener("visibilitychange", visibility);
    wake.current = start;
    resize();
    return () => {
      stop(); observer.disconnect(); wake.current = () => {};
      panel?.removeEventListener("toggle", visibility);
      document.removeEventListener("visibilitychange", visibility);
      delete element.dataset.ready;
    };
  }, []);

  useEffect(() => {
    latest.current = { value, pressed, motion, disabled };
    wake.current();
  }, [value, pressed, motion, disabled]);

  return <canvas className="agent-effort-pixel" ref={canvas} aria-hidden="true" />;
}
