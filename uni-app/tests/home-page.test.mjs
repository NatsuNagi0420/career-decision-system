/** 青穗集 · 首页行为回归：异常保留正文、来源与账号隔离、今日行动带上下文，会话入口不丢失。 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import ts from "typescript";
const compile = source => ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
}).outputText;
const summaryExports = {};
runInNewContext(compile(await readFile(new URL("../src/services/growth-summary.ts", import.meta.url), "utf8")), { exports: summaryExports });
const pageSource = await readFile(new URL("../src/pages/home/index.vue", import.meta.url), "utf8");
const compiled = compile(pageSource.match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1]);
const stamp = "2026-11-02T00:00:00.000Z";
function career(goal = "目标岗位") {
  return { profile: { goal, education: "本科", experience: "", skills: "", preferences: "", weekly_hours: "" }, jobs: [], actions: [], proposals: [] };
}
function mount() {
  const exposed = {}, pending = [], chats = [], opened = [], hooks = {};
  let token = "account-a", selectedSource = "cloud";
  const overview = { sessions: [], snapshots: {}, devices: [{ id: "pc-1", name: "我的电脑", status: "active" }], ready: true, busy: false };
  runInNewContext(compiled + "\nexports.state = { loadCareer, changeSource, career, summary, careerLoading, careerError, openNext, openGoal, continueConversation, closeHistory, toggleSearch, listMenu, historyMode, historyOpen, searchOpen, query, archived, source };", {
    exports: exposed, console, Date, setTimeout, clearTimeout,
    uni: { navigateTo: value => opened.push(value.url), switchTab: value => opened.push(value.url), setStorageSync() {}, showActionSheet: value => { hooks.menu = value; } },
    require(name) {
      if (name === "vue") return { ref: value => ({ value }), shallowRef: value => ({ value }), computed: getter => ({ get value() { return getter(); } }) };
      if (name === "@dcloudio/uni-app") return { onShow: fn => { hooks.show = fn; }, onHide() {}, onPullDownRefresh() {}, onShareAppMessage() {} };
      if (name.endsWith("/page-motion")) return { usePageMotion: () => ({ value: "qs-page-arrive" }) };
      if (name.endsWith("/button-ripple")) return { useButtonRipple: () => ({ buttonRippleStyle() {}, startButtonRipple() {} }) };
      if (name.endsWith("/surface-ripple")) return { useSurfaceRipple: () => ({ surfaceRipples: { value: [] }, startSurfaceRipple() {} }) };
      if (name.endsWith("/tab-page-frame")) return { useTabPageFrame: () => ({ value: true }) };
      if (name.endsWith("/api")) return { getToken: () => token, hasToken: () => Boolean(token), careerApi: { view: source => new Promise((resolve, reject) => pending.push({ source, resolve, reject })) } };
      if (name.endsWith("/overview")) return { overview, loadOverview: async () => {}, ensureOverviewAccount() {} };
      if (name.endsWith("/career-context")) return { careerSource: () => selectedSource, setCareerSource: value => { selectedSource = value; }, openCareerChat: (text, source) => chats.push({ text, source }) };
      if (name.endsWith("/growth-summary")) return summaryExports;
      if (name.endsWith("/workspace")) return { errorText: error => error.message, tasksFromSnapshot: () => [] };
      if (name.endsWith("/conversations")) return { openConversation: id => opened.push(id) };
      if (name.endsWith("/assets")) return { assetPaths: { prototype: {} } };
      return {};
    },
  });
  return { ...exposed.state, pending, chats, opened, hooks, overview, setToken: value => { token = value; } };
}
async function load(state, value) {
  const job = state.loadCareer();
  state.pending.at(-1).resolve(value);
  await job;
}
const flush = () => new Promise(resolve => setImmediate(resolve));
test("刷新失败保留原有职业资料和真实进度，错误可以重试", async () => {
  const state = mount(), value = career();
  await load(state, value);
  const summary = state.summary.value;
  await load(state, { ...career("错误目标"), actions: null });
  assert.equal(state.career.value, value);
  assert.equal(state.summary.value, summary);
  assert.match(state.careerError.value, /暂时无法显示/);
  assert.equal(state.careerLoading.value, false);
  await load(state, { ...career(), profile: { goal: null } });
  assert.equal(state.career.value, value);
  assert.match(state.careerError.value, /暂时无法显示/);
  await load(state, { ...career(), actions: [{ id: "broken", status: "doing", title: "不完整行动", deliverable: null }] });
  assert.equal(state.summary.value, summary);
  assert.match(state.careerError.value, /暂时无法显示/);
  await load(state, career("已恢复"));
  assert.equal(state.careerError.value, "");
  assert.equal(state.career.value.profile.goal, "已恢复");
});
test("切换来源时立即清空旧卡片，晚到的云端请求不能覆盖电脑资料", async () => {
  const state = mount(), old = state.loadCareer();
  state.changeSource({ detail: { value: "1" } });
  assert.equal(state.pending[1].source, "pc-1");
  assert.equal(state.career.value, null);
  state.pending[1].resolve(career("电脑目标"));
  await flush();
  state.pending[0].resolve(career("云端旧目标"));
  await old;
  assert.equal(state.career.value.profile.goal, "电脑目标");
});
test("切换账号后拒绝旧账号的职业资料", async () => {
  const state = mount(), old = state.loadCareer();
  state.setToken("account-b");
  state.pending[0].resolve(career("旧账号目标"));
  await old;
  assert.equal(state.career.value, null);
});
test("今日行动优先继续进行中项，并将真实目标、关联岗位、学习和进展传入原来源", async () => {
  const state = mount(), value = career("产品实习");
  value.jobs = [{ id: "j1", title: "产品实习生" }];
  value.actions = [
    { id: "todo", title: "稍后再做", status: "todo", result: "", job_id: null, updated_at: stamp },
    { id: "doing", title: "项目复盘", status: "doing", job_id: "j1", why: "展示真实职责", learn: "结构化表达", deliverable: "一页复盘", result: "已整理笔记", updated_at: stamp },
  ];
  await load(state, value);
  state.openNext();
  const draft = state.chats[0];
  for (const text of ["项目复盘", "产品实习", "产品实习生", "结构化表达", "一页复盘", "已整理笔记"]) assert.ok(draft.text.includes(text));
  assert.equal(draft.source, "cloud");
  assert.equal(state.summary.value.doneCount, 0);
});
test("新用户从真实经历开始，完成所有行动后回顾成果，不虚构分数或继续旧步骤", async () => {
  const state = mount(), value = career("");
  await load(state, value);
  state.openNext();
  assert.match(state.chats.at(-1).text, /真实经历/);
  value.actions = [{ id: "done", status: "done", title: "完成复盘", result: "复盘文档", updated_at: stamp }];
  await load(state, value);
  state.openNext();
  assert.match(state.chats.at(-1).text, /实际成果/);
  assert.equal(state.summary.value.completion, 100);
});
test("搜索与归档仍可进入会话列表，返回首页清除筛选，继续对话跳过归档会话", () => {
  const state = mount();
  state.overview.sessions = [{ id: "archived", archived: true, updated_at: "2026-11-03" }, { id: "active", archived: false, updated_at: stamp }];
  state.continueConversation();
  assert.deepEqual(state.opened, ["active"]);
  state.toggleSearch();
  assert.equal(state.historyMode.value, true);
  state.query.value = "关键词";
  state.closeHistory();
  assert.equal(state.historyMode.value, false);
  assert.equal(state.query.value, "");
  state.listMenu();
  state.hooks.menu.success({ tapIndex: 1 });
  assert.equal(state.archived.value, true);
  assert.equal(state.historyMode.value, true);
});
