/** 青穗集 · 页面动效回归：主入口每次返回可入场、重复 show 去重，详情不重播且无导航等待。 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const source = await readFile(new URL("../src/services/page-motion.ts", import.meta.url), "utf8");
const script = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
}).outputText;

function mount() {
  const exposed = {}, shows = [], hides = [];
  let route = "pages/home/index";
  runInNewContext(script, {
    exports: exposed,
    getCurrentPages: () => [{ route }],
    require(name) {
      if (name === "vue") return { ref: value => ({ value }) };
      if (name === "@dcloudio/uni-app") return {
        onShow: callback => shows.push(callback), onHide: callback => hides.push(callback),
      };
      throw new Error(name);
    },
  });
  return { create: exposed.usePageMotion, shows, hides, route: value => { route = value; } };
}

test("主页缓存返回交替入场，重复 show 不重新触发或使用定时器", () => {
  const { create, shows, hides } = mount(), state = create();
  assert.equal(state.value, "");
  shows[0]();
  assert.equal(state.value, "qs-tab-arrive-a");
  shows[0]();
  assert.equal(state.value, "qs-tab-arrive-a");
  hides[0]();
  assert.equal(state.value, "");
  shows[0]();
  assert.equal(state.value, "qs-tab-arrive-b");
  shows[0]();
  assert.equal(state.value, "qs-tab-arrive-b");
  hides[0]();
  shows[0]();
  assert.equal(state.value, "qs-tab-arrive-a");
});

test("多个缓存页面各自维护动效，显示其中一个不会重置另一个", () => {
  const { create, shows, route } = mount(), first = create(), second = create();
  shows[0]();
  assert.equal(first.value, "qs-tab-arrive-a");
  assert.equal(second.value, "");
  route("pages/tasks/index");
  shows[1]();
  shows[1]();
  assert.equal(second.value, "qs-tab-arrive-a");
  assert.equal(first.value, "qs-tab-arrive-a");
});
test("H5 重建主入口仍能入场，详情首次淡入且缓存返回不重复", () => {
  const state = mount();
  state.create();
  state.shows[0]();
  const rebuilt = state.create();
  state.shows[1]();
  assert.equal(rebuilt.value, "qs-tab-arrive-a");
  state.route("pages/profile/index");
  const detail = state.create();
  state.shows[2]();
  assert.equal(detail.value, "qs-page-arrive");
  state.hides[2]();
  state.shows[2]();
  assert.equal(detail.value, "");
});
