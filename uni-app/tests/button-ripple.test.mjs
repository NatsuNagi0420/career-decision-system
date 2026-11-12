/** 青穗集 · 点击反馈回归：核对触点、去重、列表身份与图标/箭头联动，不改变导航时机。 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const source = await readFile(new URL("../src/services/button-ripple.ts", import.meta.url), "utf8");
const script = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
}).outputText;
function mount(environment = {}) {
  const exported = {};
  runInNewContext(script, {
    exports: exported,
    ...environment,
    require(name) {
      if (name === "vue") return { shallowReactive: value => value, getCurrentInstance: () => ({ uid: 1 }) };
      throw new Error(name);
    },
  });
  return exported.useButtonRipple();
}
const nativeTouch = (x = 42, y = 860) => ({
  type: "touchstart",
  currentTarget: { offsetLeft: 20, offsetTop: 820 },
  touches: [{ pageX: x, pageY: y, clientX: x, clientY: y - 800 }],
});
test("原生长页面滚动后仍使用文档坐标，触点落在按钮内部", () => {
  const state = mount();
  state.startButtonRipple(nativeTouch(), 1);
  assert.equal(state.buttonRippleStyle(1)["--qs-ripple-x"], "22px");
  assert.equal(state.buttonRippleStyle(1)["--qs-ripple-y"], "40px");
});
test("H5 点击使用可视区坐标，避免把滚动距离叠加到涟漪原点", () => {
  const state = mount();
  state.startButtonRipple({ type: "click", detail: 1, clientX: 52, clientY: 75,
    currentTarget: { getBoundingClientRect: () => ({ left: 20, top: 50 }) } }, 1);
  assert.equal(state.buttonRippleStyle(1)["--qs-ripple-x"], "32px");
  assert.equal(state.buttonRippleStyle(1)["--qs-ripple-y"], "25px");
});
test("uni H5 包装事件的局部 offset 不影响原点，包含页面顶栏偏移", () => {
  const state = mount({
    document: { getElementById: () => ({ getBoundingClientRect: () => ({ left: 138, top: 72 }) }) },
    uni: { getWindowInfo: () => ({ windowTop: 44 }) },
  });
  state.startButtonRipple({ type: "click", detail: { x: 195, y: 44 },
    currentTarget: { id: "wrapped", offsetLeft: 116, offsetTop: 0 },
    touches: [{ clientX: 195, clientY: 44, pageX: 195, pageY: 44 }] }, 1);
  assert.equal(state.buttonRippleStyle(1)["--qs-ripple-x"], "57px");
  assert.equal(state.buttonRippleStyle(1)["--qs-ripple-y"], "16px");
});
test("同一次触摸随后触发 click 时不重播，下一次触摸可以重新播放", () => {
  const state = mount();
  state.startButtonRipple(nativeTouch(), 1);
  const first = state.buttonRippleStyle(1);
  state.startButtonRipple({ type: "tap" }, 1);
  assert.equal(state.buttonRippleStyle(1), first);
  state.startButtonRipple(nativeTouch(), 1);
  assert.notEqual(state.buttonRippleStyle(1)["--qs-ripple-wave"], first["--qs-ripple-wave"]);
});
test("点击一个列表按钮不会点亮其他行，交替点击后仍能重播原按钮", () => {
  const state = mount();
  state.startButtonRipple({ type: "click" }, 1, ["job-a"]);
  const first = state.buttonRippleStyle(1, ["job-a"]);
  assert.equal(Object.keys(state.buttonRippleStyle(1, ["job-b"])).length, 0);
  state.startButtonRipple({ type: "click" }, 1, ["job-b"]);
  state.startButtonRipple({ type: "click" }, 1, ["job-a"]);
  assert.notEqual(state.buttonRippleStyle(1, ["job-a"])["--qs-ripple-wave"], first["--qs-ripple-wave"]);
});
test("禁用按钮和空事件不创建动效状态，键盘触发从中心扩散", () => {
  const state = mount();
  state.startButtonRipple(nativeTouch(), 1, undefined, true);
  state.startButtonRipple(null, 1);
  assert.equal(Object.keys(state.buttonRippleStyle(1)).length, 0);
  state.startButtonRipple({ type: "click", detail: 0, clientX: 0, clientY: 0 }, 1);
  assert.equal(state.buttonRippleStyle(1)["--qs-ripple-x"], "50%");
});
test("涟漪、图标和箭头只在同一个按钮上同步重播，重复手势不打断动效", () => {
  const state = mount();
  state.startButtonRipple(nativeTouch(), 2, ["one"]);
  const first = state.buttonRippleStyle(2, ["one"]);
  assert.equal(first["--qs-icon-pop"], "qs-icon-pop-a");
  assert.equal(first["--qs-arrow-nudge"], "qs-arrow-nudge-a");
  state.startButtonRipple({ type: "tap" }, 2, ["one"]);
  assert.equal(state.buttonRippleStyle(2, ["one"]), first);
  state.startButtonRipple(nativeTouch(), 2, ["one"]);
  const second = state.buttonRippleStyle(2, ["one"]);
  assert.equal(second["--qs-ripple-wave"], "qs-button-wave-b");
  assert.equal(second["--qs-icon-pop"], "qs-icon-pop-b");
  assert.equal(second["--qs-arrow-nudge"], "qs-arrow-nudge-b");
  assert.equal(Object.keys(state.buttonRippleStyle(2, ["two"])).length, 0);
});
