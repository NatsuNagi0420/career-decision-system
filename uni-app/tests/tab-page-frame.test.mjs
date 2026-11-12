/** 青穗集 · 首帧回归：等待原生视图提交，缓存页面再次显示不重新遮住内容。 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import ts from "typescript";
const source = await readFile(new URL("../src/services/tab-page-frame.ts", import.meta.url), "utf8");
const script = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
}).outputText;
function mount() {
    const mounted = [], ready = [], ticks = [], exposed = {};
    runInNewContext(script, {
        exports: exposed,
        require(name) {
            return name === "vue" ? {
                ref: value => ({ value }),
                getCurrentInstance: () => ({ proxy: { $nextTick: callback => ticks.push(callback) } }),
                onMounted: callback => mounted.push(callback),
            } : { onReady: callback => ready.push(callback) };
        },
    });
    return { state: exposed.useTabPageFrame(), mounted, ready, ticks };
}
test("首次挂载在原生视图提交前保留占位，提交后直接显示正文", () => {
    const { state, mounted, ticks } = mount();
    assert.equal(state.value, false);
    mounted[0]();
    assert.equal(state.value, false);
    ticks[0]();
    assert.equal(state.value, true);
});
test("原生 ready 兜底并可重复调用，不把缓存页再次变回占位", () => {
    const { state, mounted, ready, ticks } = mount();
    ready[0]();
    assert.equal(state.value, true);
    mounted[0]();
    ready[0]();
    ticks[0]();
    assert.equal(state.value, true);
});
