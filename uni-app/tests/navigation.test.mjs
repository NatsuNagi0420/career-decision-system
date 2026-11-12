/** 青穗集 · 导航回归：高亮跟随当前页面，切页防重复，失败按实际路由恢复。 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
const source = await readFile(
    new URL("../src/custom-tab-bar/index.js", import.meta.url),
    "utf8",
);
function install(route) {
    let definition,
        activeRoute = route;
    const writes = [],
        requests = [];
    runInNewContext(source, {
        Component: (value) => {
            definition = value;
        },
        getCurrentPages: () => [{ route: activeRoute }],
        wx: { switchTab: (options) => requests.push(options) },
    });
    const instance = {
        data: structuredClone(definition.data),
        setData(value) {
            for (const [key, entry] of Object.entries(value)) {
                if (key.startsWith("ripples.")) this.data.ripples[key.slice(8)] = entry;
                else this.data[key] = entry;
            }
            writes.push(value);
        },
        ...definition.methods,
    };
    return {
        definition,
        instance,
        writes,
        requests,
        route: (value) => {
            activeRoute = value;
        },
    };
}
test("底部导航首次进入和再次显示时跟随真实路由，相同高亮不重复写入", () => {
    const state = install("pages/growth/index");
    state.definition.lifetimes.attached.call(state.instance);
    assert.equal(state.instance.data.current, 2);
    state.definition.pageLifetimes.show.call(state.instance);
    assert.equal(state.writes.length, 1);
    state.route("pages/mine/index");
    state.definition.pageLifetimes.show.call(state.instance);
    assert.equal(state.instance.data.current, 3);
});
test("切页途中不重复发起请求，完成后可以继续切换", () => {
    const state = install("pages/home/index");
    const tap = (index) =>
        state.instance.switchTo({ currentTarget: { dataset: { index } } });
    tap(1);
    tap(1);
    tap(2);
    assert.equal(state.requests.length, 1);
    assert.equal(state.instance.data.current, 0);
    state.route("pages/tasks/index");
    state.definition.pageLifetimes.show.call(state.instance);
    assert.equal(state.instance.data.current, 1);
    state.requests[0].complete();
    tap(2);
    assert.equal(state.requests.length, 2);
    assert.equal(state.requests[1].url, "/pages/growth/index");
});
test("系统拒绝切页时按当前路由恢复，不保留错误选中状态", () => {
    const state = install("pages/tasks/index");
    state.definition.lifetimes.attached.call(state.instance);
    state.instance.switchTo({ currentTarget: { dataset: { index: 3 } } });
    state.requests[0].fail();
    state.requests[0].complete();
    assert.equal(state.instance.data.current, 1);
    assert.equal(state.instance.switching, false);
});

test("高亮与真实路由暂时不同步时仍可进入目标页面", () => {
    const state = install("pages/home/index");
    state.instance.data.current = 2;
    state.instance.switchTo({ currentTarget: { dataset: { index: 2 } } });
    assert.equal(state.requests.length, 1);
    assert.equal(state.requests[0].url, "/pages/growth/index");
    assert.equal(state.instance.data.current, 2);
});
test("两个底栏实例共享切页锁，完成前不交错切页", () => {
    const state = install("pages/home/index");
    const other = {
        ...state.instance,
        data: structuredClone(state.instance.data),
        setData(value) { Object.assign(this.data, value); },
    };
    const tap = index => ({ currentTarget: { dataset: { index } } });
    state.instance.switchTo(tap(1));
    other.switchTo(tap(2));
    assert.equal(state.requests.length, 1);
    state.requests[0].complete();
    other.switchTo(tap(2));
    assert.equal(state.requests.length, 2);
});

test("跨底栏实例取实际离开的位置，缓存返回时重播滑移", () => {
    const state = install("pages/home/index");
    state.definition.lifetimes.attached.call(state.instance);
    const other = {
        ...state.instance,
        data: structuredClone(state.instance.data),
        setData(value) { Object.assign(this.data, value); },
    };
    state.route("pages/growth/index");
    state.definition.lifetimes.attached.call(other);
    assert.equal(other.data.current, 2);
    assert.equal(other.data.previous, 0);
    assert.equal(other.data.animate, true);
    state.route("pages/home/index");
    state.definition.pageLifetimes.show.call(state.instance);
    assert.equal(state.instance.data.current, 0);
    assert.equal(state.instance.data.previous, 2);
    assert.equal(state.instance.data.motion, true);
    state.route("pages/growth/index");
    state.definition.pageLifetimes.show.call(other);
    assert.equal(other.data.previous, 0);
    assert.equal(other.data.motion, false);
});

test("重复 show 或点击当前页不重播底栏、不重复导航", () => {
    const state = install("pages/tasks/index");
    state.definition.lifetimes.attached.call(state.instance);
    const writes = state.writes.length;
    state.definition.pageLifetimes.show.call(state.instance);
    state.instance.switchTo({ currentTarget: { dataset: { index: 1 } } });
    assert.equal(state.writes.length, writes);
    assert.equal(state.requests.length, 0);
});
test("原生底栏触摸先播放独立涟漪，随后导航无需等待动画结束", () => {
    const state = install("pages/home/index");
    const event = { currentTarget: { dataset: { index: 1 }, offsetLeft: 90, offsetTop: 720 },
        touches: [{ pageX: 115, pageY: 748 }] };
    state.instance.press(event);
    assert.match(state.instance.data.ripples[1], /--ripple-x:25px;--ripple-y:28px/);
    assert.equal(state.instance.data.ripples[0], undefined);
    state.instance.switchTo(event);
    assert.equal(state.requests.length, 1);
    assert.equal(state.requests[0].url, "/pages/tasks/index");
});
