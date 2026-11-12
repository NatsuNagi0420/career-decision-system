/** 青穗集 · 背景触点回归：可视区坐标、波源时间、触摸去重及页面退出后的计时回收。 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const source = await readFile(new URL("../src/services/surface-ripple.ts", import.meta.url), "utf8");
const script = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
}).outputText;
const fieldSource = await readFile(new URL("../src/services/dot-field.ts", import.meta.url), "utf8");
const field = {};
runInNewContext(ts.transpileModule(fieldSource, {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
}).outputText, { exports: field });
function mount(windowTop = 0) {
  const exposed = {}, timers = new Map(), hides = [], unmounts = [];
  let timerId = 0;
  runInNewContext(script, {
    exports: exposed,
    uni: { getWindowInfo: () => ({ windowTop }) },
    setTimeout(callback) { const id = ++timerId; timers.set(id, () => { timers.delete(id); callback(); }); return id; },
    clearTimeout(id) { timers.delete(id); },
    require(name) {
      if (name === "./dot-field") return field;
      if (name === "vue") return { shallowRef: value => ({ value }), onUnmounted: callback => unmounts.push(callback) };
      if (name === "@dcloudio/uni-app") return { onHide: callback => hides.push(callback) };
      throw new Error(name);
    },
  });
  return { ...exposed.useSurfaceRipple(), timers, hides, unmounts };
}
const touch = (x = 53, y = 79) => ({ type: "touchstart", touches: [{ clientX: x, clientY: y, pageY: y + 1200 }] });
test("水波使用可视区坐标，长页面滚动不会把波纹放到屏幕外", () => {
  const state = mount();
  state.startSurfaceRipple(touch());
  assert.equal(state.surfaceRipples.value[0].x, 53);
  assert.equal(state.surfaceRipples.value[0].y, 79);
  assert.equal(typeof state.surfaceRipples.value[0].startedAt, "number");
});
test("H5 包装触点恢复顶栏偏移，后续 click 不重复生成水波", () => {
  const state = mount(44);
  state.startSurfaceRipple(touch());
  assert.equal(state.surfaceRipples.value[0].y, 123);
  state.startSurfaceRipple({ type: "click", clientX: 53, clientY: 79 });
  assert.equal(state.surfaceRipples.value.length, 1);
  assert.equal(state.timers.size, 1);
});
test("连续点击至多保留两道水波，淘汰的计时和过期水波被回收", () => {
  const state = mount();
  state.startSurfaceRipple(touch(1));
  state.startSurfaceRipple(touch(2));
  state.startSurfaceRipple(touch(3));
  assert.deepEqual(Array.from(state.surfaceRipples.value, item => item.x), [2, 3]);
  assert.equal(state.timers.size, 2);
  for (const callback of [...state.timers.values()]) callback();
  assert.equal(state.surfaceRipples.value.length, 0);
  assert.equal(state.timers.size, 0);
});
test("隐藏或卸载页清理全部计时，非法坐标和多指触摸不生成水波", () => {
  for (const lifecycle of ["hides", "unmounts"]) {
    const state = mount();
    state.startSurfaceRipple(null);
    state.startSurfaceRipple({ type: "touchstart", touches: [{ clientX: 1, clientY: 2 }, { clientX: 3, clientY: 4 }] });
    state.startSurfaceRipple({ type: "click", clientX: NaN });
    assert.equal(state.surfaceRipples.value.length, 0);
    state.startSurfaceRipple(touch());
    state[lifecycle][0]();
    assert.equal(state.surfaceRipples.value.length, 0);
    assert.equal(state.timers.size, 0);
    state.startSurfaceRipple({ type: "click", clientX: 4, clientY: 5 });
    assert.equal(state.surfaceRipples.value.length, 1);
  }
});
