/** 青穗集 · 成长页读取回归：异常响应可重试，旧数据不覆盖新来源，模板不承担易失败计算。 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import ts from "typescript";
const summarySource = await readFile(new URL("../src/services/growth-summary.ts", import.meta.url), "utf8");
const summaryJs = ts.transpileModule(summarySource, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const { growthSummary } = await import("data:text/javascript;base64," + Buffer.from(summaryJs).toString("base64"));
const pageSource = await readFile(new URL("../src/pages/growth/index.vue", import.meta.url), "utf8");
const script = pageSource.match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1];
const compiled = ts.transpileModule(script, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS } }).outputText;
function mount() {
    const exposed = {}, pending = [];
    let token = "account-a";
    runInNewContext(compiled + "\nexports.state = { load, changeSource, career, summary, error, loading };", {
        exports: exposed,
        require(name) {
            if (name === "vue") return {
                ref: value => ({ value }), shallowRef: value => ({ value }),
                computed: getter => ({ get value() { return getter(); } }),
            };
            if (name === "@dcloudio/uni-app") return { onShow() {}, onPullDownRefresh() {} };
            if (name.endsWith("/page-motion")) return { usePageMotion: () => ({ value: "qs-page-arrive" }) };
            if (name.endsWith("/button-ripple")) return { useButtonRipple: () => ({ buttonRippleStyle() {}, startButtonRipple() {} }) };
            if (name.endsWith("/surface-ripple")) return { useSurfaceRipple: () => ({ surfaceRipples: { value: [] }, startSurfaceRipple() {} }) };
            if (name.endsWith("/tab-page-frame")) return { useTabPageFrame: () => ({ value: true }) };
            if (name.endsWith("/api")) return { getToken: () => token, careerApi: { view: source => new Promise((resolve, reject) => pending.push({ source, resolve, reject })) } };
            if (name.endsWith("/career-context")) return { careerSource: () => "cloud", setCareerSource() {} };
            if (name.endsWith("/growth-summary")) return { growthSummary };
            if (name.endsWith("/workspace")) return { errorText: error => error.message };
            if (name.endsWith("/assets")) return { assetPaths: { prototype: {} } };
            return {};
        },
    });
    return { ...exposed.state, pending, setToken: value => { token = value; } };
}
function career(goal = "测试目标") {
    return { profile: { goal }, actions: [], jobs: [], proposals: [] };
}
const flush = () => new Promise(resolve => setImmediate(resolve));
test("异常返回被读取流程捕获，结束加载并提供错误信息", async () => {
    const state = mount();
    const load = state.load();
    state.pending[0].resolve({ profile: null });
    await load;
    assert.match(state.error.value, /成长资料暂时无法显示/);
    assert.equal(state.loading.value, false);
    assert.equal(state.career.value, null);
    assert.equal(state.summary.value, null);
});
test("刷新失败保留已经显示的正文，资料和摘要不会半更新", async () => {
    const state = mount();
    const initial = state.load();
    const original = career();
    state.pending[0].resolve(original);
    await initial;
    const summary = state.summary.value;
    const refresh = state.load();
    state.pending[1].resolve({ ...career("异常新目标"), actions: null });
    await refresh;
    assert.equal(state.career.value, original);
    assert.equal(state.summary.value, summary);
    assert.match(state.error.value, /成长资料暂时无法显示/);
});
test("快速切换资料来源时旧请求不写回新页面", async () => {
    const state = mount();
    const old = state.load();
    state.changeSource("pc-1");
    assert.equal(state.pending[1].source, "pc-1");
    state.pending[0].resolve(career("旧来源"));
    await old;
    assert.equal(state.career.value, null);
    state.pending[1].resolve(career("电脑来源"));
    await flush();
    assert.equal(state.career.value.profile.goal, "电脑来源");
    assert.equal(state.loading.value, false);
});
test("切换账号后丢弃旧账号请求", async () => {
    const state = mount();
    const old = state.load();
    state.setToken("account-b");
    state.pending[0].resolve(career("旧账号"));
    await old;
    assert.equal(state.career.value, null);
    assert.equal(state.error.value, "");
});
