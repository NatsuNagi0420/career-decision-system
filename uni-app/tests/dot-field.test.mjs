/** 青穗集 · 点阵波动回归：波前按距离传播、点位回弹、叠加限幅以及静止后停止绘制。 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const source = await readFile(new URL("../src/services/dot-field.ts", import.meta.url), "utf8");
const js = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ES2020 },
}).outputText;
const { createDotGrid, sampleDot, createDotFieldRenderer, DOT_WAVE_LIFETIME } =
  await import("data:text/javascript;base64," + Buffer.from(js).toString("base64"));
const spacing = 12, wave = { x: 100, y: 100, startedAt: 1000 };

test("波前从触点传播，近点先移动、远点随后移动，超出范围的点保持原位", () => {
  const near = { x: 124, y: 100 }, far = { x: 244, y: 100 }, outside = { x: 500, y: 100 };
  const moving = sampleDot(near, [wave], 1200, spacing);
  assert.ok(moving.x > near.x);
  assert.equal(moving.y, near.y);
  assert.deepEqual(sampleDot(far, [wave], 1200, spacing), { ...far, energy: 0 });
  assert.ok(sampleDot(far, [wave], 1600, spacing).x > far.x);
  assert.deepEqual(sampleDot(outside, [wave], 1600, spacing), { ...outside, energy: 0 });
});

test("每个点向外移动后轻微回弹，并在波动结束时准确回到原位置", () => {
  const point = { x: 124, y: 100 };
  assert.ok(sampleDot(point, [wave], 1400, spacing).x < point.x);
  assert.deepEqual(sampleDot(point, [wave], wave.startedAt + DOT_WAVE_LIFETIME, spacing), { ...point, energy: 0 });
  const center = sampleDot({ x: 100, y: 100 }, [wave], 1200, spacing);
  assert.ok(Number.isFinite(center.x) && Number.isFinite(center.y));
});

test("连续触摸位移叠加但不超过网格间距，所有原始点都保留在画布内", () => {
  const point = { x: 124, y: 100 };
  const moved = sampleDot(point, [wave, wave, wave], 1200, spacing);
  assert.ok(Math.hypot(moved.x - point.x, moved.y - point.y) <= spacing * 0.8 + 0.0001);
  const grid = createDotGrid(392, 852, 392 / 750 * 24);
  assert.ok(grid.length < 2300);
  assert.ok(grid.every(dot => dot.x >= 0 && dot.x < 392 && dot.y >= 0 && dot.y < 852));
});

test("静止时没有帧循环，波动结束恢复底纹并停止，离页可立即取消待绘制帧", () => {
  const frames = new Map(), draws = [];
  let time = 1000, sequence = 0, clears = 0;
  const renderer = createDotFieldRenderer({
    context: { fillStyle: "", clearRect() { clears++; draws.length = 0; }, fillRect(...args) { draws.push(args); } },
    width: 100, height: 100, spacing: 12,
    now: () => time,
    requestFrame(callback) { frames.set(++sequence, callback); return sequence; },
    cancelFrame(id) { frames.delete(id); },
  });
  renderer.update([]);
  const still = draws.map(args => [...args]);
  assert.equal(frames.size, 0);
  renderer.update([{ x: 30, y: 30, startedAt: time }]);
  assert.equal(frames.size, 1);
  function frameAt(next) {
    time = next;
    const [id, callback] = frames.entries().next().value;
    frames.delete(id); callback();
  }
  frameAt(1150);
  assert.notDeepEqual(draws, still);
  frameAt(1000 + DOT_WAVE_LIFETIME);
  assert.deepEqual(draws, still);
  assert.equal(frames.size, 0);
  const painted = clears;
  renderer.update([{ x: 30, y: 30, startedAt: time }]);
  renderer.stop();
  assert.equal(frames.size, 0);
  assert.equal(clears, painted + 1);
});
