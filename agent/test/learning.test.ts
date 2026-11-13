/** 青穗集 · 学习闭环回归：真实岗位依据、先修顺序、账号隔离、持久进度与视频搜索失败降级。 */
import test from "node:test";
import assert from "node:assert/strict";
import { CareerWorkspace, careerSources } from "../src/career.js";
import { guidedToolAllowed } from "../src/domain/career/policy.js";
import { parseBilibiliCaptions, parseBilibiliResults, readBilibiliSubtitles, searchBilibili } from "../src/learning-resources.js";
import type { LearningChange, LearningPathInput } from "../src/learning-contract.js";
import { id } from "../src/store.js";
import { fixture, reply, tool, ScriptedModel } from "./helpers.js";

function seed(f: Awaited<ReturnType<typeof fixture>>) {
  const career = f.runtime.career, learning = career.learning;
  career.change(f.user.id, { revision: 0, change: { type: "job.add", job: { title: "前端实习", company: "测试岗位", url: "", description: "掌握 TypeScript，能够进行组件开发。" } } });
  const job = career.get(f.user.id).jobs[0];
  const path: LearningPathInput = { job_id: job.id, title: "前端岗位学习路线", summary: "先理解类型，再练习组件。", nodes: [
    { key: "types", title: "类型基础", requirement: "掌握 TypeScript", objective: "理解联合类型", estimated_minutes: 45, prerequisites: [], search_query: "TypeScript 类型 入门", exercise: "实现一个联合类型函数", deliverable: "函数代码和运行结果" },
    { key: "components", title: "组件实践", requirement: "组件开发", objective: "完成一个可复用组件", estimated_minutes: 90, prerequisites: ["types"], search_query: "TypeScript 组件开发", exercise: "制作一个搜索组件", deliverable: "代码与测试说明" },
  ] };
  const propose = (data = path, pathId: string | null = null) => learning.propose(f.user.id, f.conversation.id, { revision: learning.get(f.user.id).revision, context_version: career.get(f.user.id).context_version, path_id: pathId, path: data });
  const change = (value: LearningChange) => learning.change(f.user.id, { revision: learning.get(f.user.id).revision, change: value });
  return { career, learning, path, propose, change };
}

test("学习接口要求登录并按账号隔离，草稿确认后才成为路线，跨工作区实例保留", async t => {
  const f = await fixture(t), s = seed(f);
  assert.equal((await f.app.inject({ url: "/api/v1/agent/career/learning" })).statusCode, 401);
  const proposal = s.propose();
  assert.equal(s.learning.get(f.user.id).paths.length, 0);
  const response = await f.app.inject({ method: "POST", url: "/api/v1/agent/career/learning/changes", headers: f.headers, payload: { revision: 1, change: { type: "proposal.decide", id: proposal.proposal_id, approved: true } } });
  assert.equal(response.statusCode, 200, response.body);
  assert.equal(response.json().paths.length, 1);
  const other = f.auth.register("learning_other", "Only-a-test-password", false);
  const isolated = await f.app.inject({ url: "/api/v1/agent/career/learning", headers: { ...f.headers, authorization: "Bearer " + other.token } });
  assert.equal(isolated.json().paths.length, 0);
  assert.equal(new CareerWorkspace(f.store).learning.get(f.user.id).paths[0].title, s.path.title);
  const stale = await f.app.inject({ method: "POST", url: "/api/v1/agent/career/learning/changes", headers: f.headers, payload: { revision: 0, change: { type: "path.select", id: response.json().paths[0].id } } });
  assert.equal(stale.statusCode, 409);
});

test("路线逐字引用岗位，拒绝伪造要求、前向依赖、循环、重复节点和其他账号岗位", async t => {
  const f = await fixture(t), s = seed(f);
  assert.throws(() => s.propose({ ...s.path, nodes: [{ ...s.path.nodes[0], requirement: "十年经验" }] }), /真实要求/);
  assert.throws(() => s.propose({ ...s.path, nodes: [{ ...s.path.nodes[0], prerequisites: ["components"] }, s.path.nodes[1]] }), /先修/);
  assert.throws(() => s.propose({ ...s.path, nodes: [s.path.nodes[0], s.path.nodes[0]] }), /重复/);
  assert.throws(() => s.propose({ ...s.path, job_id: id() }), /目标岗位/);
  assert.equal(s.learning.get(f.user.id).revision, 0);
});

test("画像或岗位变化后不能确认旧学习草稿，但可以放弃", async t => {
  const f = await fixture(t), s = seed(f), proposal = s.propose();
  s.career.change(f.user.id, { revision: s.career.get(f.user.id).revision, change: { type: "profile.save", profile: { goal: "前端开发", education: "", experience: "", skills: "", preferences: "", weekly_hours: "每周3小时" } } });
  assert.equal(s.learning.view(f.user.id).proposal?.stale, true);
  assert.throws(() => s.change({ type: "proposal.decide", id: proposal.proposal_id, approved: true }), /重新规划/);
  assert.equal(s.change({ type: "proposal.decide", id: proposal.proposal_id, approved: false }).proposal, null);
});

test("章节进度遵守先修关系，完成需提交成果，跳过需说明，不自动升级技能", async t => {
  const f = await fixture(t), s = seed(f), proposal = s.propose();
  const path = s.change({ type: "proposal.decide", id: proposal.proposal_id, approved: true }).paths[0];
  const update = (key: string, status: "todo" | "doing" | "done" | "skipped", notes = "", result = "") => s.change({ type: "node.update", path_id: path.id, key, status, notes, result });
  assert.throws(() => update("components", "doing"), /先修/);
  assert.throws(() => update("types", "done"), /结果|练习/);
  assert.throws(() => update("types", "skipped"), /原因/);
  update("types", "doing", "学到第2节");
  assert.equal(careerSources(s.career.get(f.user.id)).some(source => source.id.startsWith("learning.")), false);
  update("types", "done", "学到第2节", "实际完成了联合类型函数，并检查两种输入。");
  update("components", "doing");
  assert.equal(s.learning.get(f.user.id).paths[0].nodes[0].notes, "学到第2节");
  assert.equal(s.career.get(f.user.id).skills?.length ?? 0, 0);
  const sources = careerSources(s.career.get(f.user.id));
  assert.equal(sources.find(source => source.id === "learning." + path.id + ".types")?.text, "实际完成了联合类型函数，并检查两种输入。");
  assert.equal(s.career.resumeSource(f.user.id, "learning." + path.id + ".types").kind, "user_result");
  f.runtime.guidance.change(f.user, f.conversation.id, { revision: 0, kind: "learning" });
  assert.match(f.runtime.guidance.view(f.user.id, f.conversation.id).progress!.stage, /组件实践/);
});

test("调整路线复用未变化的章节进度和笔记，任务变化保留成果但重新待学习", async t => {
  const f = await fixture(t), s = seed(f);
  const path = s.change({ type: "proposal.decide", id: s.propose().proposal_id, approved: true }).paths[0];
  s.change({ type: "node.update", path_id: path.id, key: "types", status: "done", notes: "保留笔记", result: "保留真实练习" });
  s.change({ type: "node.update", path_id: path.id, key: "components", status: "done", notes: "下游笔记", result: "已完成组件" });
  assert.throws(() => s.propose(), /已有学习路线/);
  const unchanged = s.change({ type: "proposal.decide", id: s.propose(s.path, path.id).proposal_id, approved: true }).paths[0];
  assert.equal(unchanged.nodes[0].status, "done");
  const newPath = { ...s.path, nodes: [{ ...s.path.nodes[0], exercise: "加做一组异常输入练习" }, s.path.nodes[1]] };
  const changed = s.change({ type: "proposal.decide", id: s.propose(newPath, path.id).proposal_id, approved: true }).paths[0];
  assert.equal(changed.nodes[0].status, "todo");
  assert.equal(changed.nodes[0].notes, "保留笔记");
  assert.equal(changed.nodes[0].result, "保留真实练习");
  assert.equal(changed.nodes[1].status, "todo");
  assert.equal(changed.nodes[1].result, "已完成组件");
});

test("视频结果清理HTML、只生成合法B站视频地址，搜索风控降级为站内入口", async () => {
  const data = { code: 0, data: { result: [{ bvid: "BV14Z4y1u7pi", title: '<em class="keyword">TypeScript</em> &amp; 入门', author: "示例作者", duration: "12:30", arcurl: "https://malicious.invalid" }, { bvid: "javascript:alert(1)", title: "危险地址" }] } };
  const results = parseBilibiliResults(data, "TypeScript 教程");
  assert.equal(results.length, 1); assert.equal(results[0].title, "TypeScript & 入门");
  assert.equal(results[0].url, "https://www.bilibili.com/video/BV14Z4y1u7pi/");
  const fetcher = (async () => new Response(JSON.stringify(data))) as typeof fetch;
  assert.equal((await searchBilibili("TypeScript", undefined, fetcher)).status, "available");
  const denied = (async () => new Response("blocked", { status: 412 })) as typeof fetch;
  const fallback = await searchBilibili("TypeScript 教程", undefined, denied);
  assert.equal(fallback.status, "unavailable"); assert.equal(fallback.resources.length, 0);
  assert.match(fallback.search_url, /^https:\/\/search\.bilibili\.com\/all\?keyword=/);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(searchBilibili("TypeScript", controller.signal, denied), /abort/i);
});

test("B站综合搜索响应中只呈现视频分组，并过滤非B站封面", async () => {
  const data = { code: 0, data: { result: [
    { result_type: "tips", data: [{ title: "提示词", bvid: "BV14Z4y1u7pi" }] },
    { result_type: "video", data: [
      { bvid: "BV14Z4y1u7pi", title: "React <em>表单</em>入门", author: "测试作者", duration: "16:26", pic: "//i2.hdslb.com/bfs/archive/cover.jpg", play: 20394, description: "讲解 <b>表单校验</b>。" },
      { bvid: "BV15Z4y1u7pi", title: "外站封面不展示", author: "其他作者", duration: "8:00", pic: "https://evil.invalid/cover.jpg", play: "很多" },
    ] },
  ] } };
  const resources = parseBilibiliResults(data, "React 表单");
  assert.equal(resources.length, 2);
  assert.equal(resources[0].title, "React 表单入门");
  assert.equal(resources[0].cover, "https://i2.hdslb.com/bfs/archive/cover.jpg");
  assert.equal(resources[0].views, 20394);
  assert.equal(resources[0].description, "讲解 表单校验。");
  assert.equal(resources[1].cover, undefined);
  assert.equal(resources[1].views, undefined);
});

test("公开字幕会清理并按时间返回，B站登录限制会被区分为登录提示", async () => {
  const responses: Record<string, unknown> = {
    view: { code: 0, data: { aid: 123, cid: 456 } },
    nav: { code: -101, data: { wbi_img: { img_url: "https://i0.hdslb.com/bfs/wbi/abcdefghijklmnopqrstuvwxyz012345.png", sub_url: "https://i0.hdslb.com/bfs/wbi/ABCDEFGHIJKLMNOPQRSTUVWXYZ012345.png" } } },
    player: { code: 0, data: { need_login_subtitle: false, subtitle: { subtitles: [{ lan: "zh-CN", lan_doc: "简体中文", subtitle_url: "https://aisubtitle.hdslb.com/captions.json" }] } } },
    captions: { body: [{ from: 0, to: 2.4, content: "React <b>组件</b>" }, { from: -1, to: 0, content: "无效" }, { from: 3, to: 3, content: "空时间" }] },
  };
  const requestedUrls: string[] = [];
  const fetcher = (async (input: RequestInfo | URL) => {
    const url = String(input);
    requestedUrls.push(url);
    const data = url.includes("/x/web-interface/view") ? responses.view : url.includes("/x/web-interface/nav") ? responses.nav : url.includes("/x/player/wbi/v2") ? responses.player : responses.captions;
    return new Response(JSON.stringify(data));
  }) as typeof fetch;
  const result = await readBilibiliSubtitles("BV14Z4y1u7pi", undefined, fetcher);
  assert.equal(result.status, "available");
  assert.ok(requestedUrls.some(url => url.startsWith("https://api.bilibili.com/x/player/wbi/v2?") && /w_rid=[a-f0-9]{32}/.test(url)));
  assert.deepEqual(result.tracks[0].captions, [{ start: 0, end: 2.4, text: "React 组件" }]);
  const loginFetcher = (async (input: RequestInfo | URL) => {
    const url = String(input);
    const data = url.includes("/x/web-interface/view") ? responses.view : url.includes("/x/web-interface/nav") ? responses.nav : { code: 0, data: { need_login_subtitle: true, subtitle: { subtitles: [] } } };
    return new Response(JSON.stringify(data));
  }) as typeof fetch;
  const login = await readBilibiliSubtitles("BV14Z4y1u7pi", undefined, loginFetcher);
  assert.equal(login.status, "login_required");
  assert.match(login.message, /不会读取或保存/);
  let subtitleRequests = 0;
  const externalUrlFetcher = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/x/web-interface/view")) return new Response(JSON.stringify(responses.view));
    if (url.includes("/x/web-interface/nav")) return new Response(JSON.stringify(responses.nav));
    if (url.includes("/x/player/wbi/v2")) return new Response(JSON.stringify({
      code: 0, data: { need_login_subtitle: false, subtitle: { subtitles: [{ lan: "zh", subtitle_url: "https://127.0.0.1/private" }] } },
    }));
    subtitleRequests++; return new Response("unexpected");
  }) as typeof fetch;
  assert.equal((await readBilibiliSubtitles("BV14Z4y1u7pi", undefined, externalUrlFetcher)).status, "no_subtitles");
  assert.equal(subtitleRequests, 0);
  assert.deepEqual(parseBilibiliCaptions({ body: [{ from: 1, to: 2, content: "A &amp; B" }] }), [{ start: 1, end: 2, text: "A & B" }]);
});

test("字幕接口仅允许读取本人搜索过的视频，且不保存字幕内容", async t => {
  const f = await fixture(t);
  t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/x/web-interface/search/all/v2")) return new Response(JSON.stringify({ code: 0, data: { result: [{ result_type: "video", data: [{ bvid: "BV14Z4y1u7pi", title: "TypeScript 入门" }] }] } }));
    if (url.includes("/x/web-interface/view")) return new Response(JSON.stringify({ code: 0, data: { aid: 1, cid: 2 } }));
    if (url.includes("/x/web-interface/nav")) return new Response(JSON.stringify({ code: -101, data: { wbi_img: { img_url: "https://i0.hdslb.com/bfs/wbi/abcdefghijklmnopqrstuvwxyz012345.png", sub_url: "https://i0.hdslb.com/bfs/wbi/ABCDEFGHIJKLMNOPQRSTUVWXYZ012345.png" } } }));
    return new Response(JSON.stringify({ code: 0, data: { need_login_subtitle: true, subtitle: { subtitles: [] } } }));
  });
  assert.equal((await f.app.inject({ url: "/api/v1/agent/career/learning/videos/BV14Z4y1u7pi/subtitles", headers: f.headers })).statusCode, 404);
  await f.app.inject({ url: "/api/v1/agent/career/learning/videos?query=TypeScript", headers: f.headers });
  assert.equal((await f.app.inject({ url: "/api/v1/agent/career/learning/videos/BV14Z4y1u7pi/subtitles" })).statusCode, 401);
  const other = f.auth.register("subtitle_other", "Only-a-test-password", false);
  const otherResponse = await f.app.inject({ url: "/api/v1/agent/career/learning/videos/BV14Z4y1u7pi/subtitles", headers: { ...f.headers, authorization: "Bearer " + other.token } });
  assert.equal(otherResponse.statusCode, 404);
  const response = await f.app.inject({ url: "/api/v1/agent/career/learning/videos/BV14Z4y1u7pi/subtitles", headers: f.headers });
  assert.equal(response.statusCode, 200, response.body);
  assert.equal(response.json().status, "login_required");
  assert.equal(f.store.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='learning_subtitles'").get(), undefined);
});

test("只有本人搜索到的真实资源能加入章节，缓存不重复请求B站，打开链接不改变进度", async t => {
  const f = await fixture(t), s = seed(f);
  const path = s.change({ type: "proposal.decide", id: s.propose().proposal_id, approved: true }).paths[0];
  let requests = 0;
  t.mock.method(globalThis, "fetch", async () => { requests++; return new Response(JSON.stringify({ code: 0, data: { result: [{ bvid: "BV14Z4y1u7pi", title: "TypeScript 入门", author: "测试作者", duration: "20:00" }] } })); });
  const resource = (await s.learning.search(f.user.id, { query: "TypeScript" })).resources[0];
  await s.learning.search(f.user.id, { query: "TypeScript" });
  assert.equal(requests, 1);
  assert.throws(() => s.change({ type: "resource.attach", path_id: path.id, key: "types", resource_id: "unverified" }), /搜索真实视频/);
  const attached = s.change({ type: "resource.attach", path_id: path.id, key: "types", resource_id: resource.id });
  assert.equal(attached.paths[0].nodes[0].resources.length, 1);
  assert.equal(attached.paths[0].nodes[0].status, "todo");
  assert.equal(s.career.get(f.user.id).skills?.length ?? 0, 0);
});

test("Agent在学习模式真实调用规划工具，并等待本人确认；简历模式不开放路线写入", async t => {
  const model = new ScriptedModel();
  const f = await fixture(t, { model });
  const s = seed(f); let stage = 0;
  model.respond = request => {
    if (!request.tools.some(item => item.name === "read_learning_context")) return reply("测试辅助请求");
    if (stage++ === 0) return reply("", [tool("read_learning_context", {}), tool("read_career_context", {})]);
    if (stage === 2) return reply("", [tool("propose_learning_path", { revision: 0, context_version: 1, path_id: null, path: s.path })]);
    return reply("路线会在你确认后开始。");
  };
  f.runtime.guidance.change(f.user, f.conversation.id, { revision: 0, kind: "learning" });
  const run = f.runtime.start(f.user, f.conversation.id, f.profile.id, "读取我的学习进度", id());
  await f.runtime.waitIdle();
  assert.equal(f.store.run(f.user.id, run.id).status, "completed");
  assert.ok(model.requests.some(request => request.tools.some(tool => tool.name === "search_learning_videos")));
  assert.equal(s.learning.get(f.user.id).proposal?.path.title, s.path.title);
  assert.equal(s.learning.get(f.user.id).paths.length, 0);
  assert.equal(guidedToolAllowed("resume", "propose_learning_path"), false);
  assert.equal(guidedToolAllowed("learning", "propose_learning_path"), true);
});
