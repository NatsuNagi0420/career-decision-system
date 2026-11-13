/** 青穗集 · 多端链路回归：真实 HTTP、双端 SQLite 与 Runtime，只有外部模型和账号服务使用测试替身。 */
import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { realpath } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { Store } from "../src/store.js";
import { HubRepository } from "../src/cloud-hub/repository.js";
import { registerHub } from "../src/cloud-hub/http.js";
import { createHubApp } from "../src/cloud-hub/app.js";
import { installPcBridge } from "../src/cloud-hub/pc-bridge.js";
import { createApp } from "../src/http.js";
import { loadConfig } from "../src/config.js";
import { settingsInput, limitsInput, catalogueInput } from "../src/cloud-hub/protocol.js";
import { ScriptedModel, noSandbox, temporary, tool, reply, TEST_KEY } from "./helpers.js";
async function relayFixture(t: TestContext) {
  const tokens = new Map<string, number>(); let count = 0;
  const relay = createServer((req, res) => {
    res.setHeader("content-type", "application/json");
    if (req.url === "/v1/auth/login" || req.url === "/v1/auth/register") {
      let body = ""; req.on("data", b => body += b); req.on("end", () => { const data = JSON.parse(body); const id = data.username === "account_two" ? 2 : 1; const token = "fixture_official_" + (++count); tokens.set(token, id); res.end(JSON.stringify({ token, account: { id, username: "account_" + id } })); }); return;
    }
    const token = req.headers.authorization?.slice(7) || "", id = tokens.get(token);
    if (!id) { res.writeHead(401); res.end(JSON.stringify({ detail: "invalid" })); return; }
    if (req.url === "/v1/auth/logout") { tokens.delete(token); res.end(JSON.stringify({ ok: true })); return; }
    if (req.url === "/v1/auth/me") { res.end(JSON.stringify({ account: { id, username: "account_" + id } })); return; }
    res.writeHead(404); res.end("{}");
  });
  await new Promise<void>(resolve => relay.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise<void>(resolve => relay.close(() => resolve())));
  const address = relay.address() as { port: number };
  return { url: `http://127.0.0.1:${address.port}/v1`, tokens };
}
async function waitFor<T>(fn: () => Promise<T>, testValue: (value: T) => boolean, ms = 15000): Promise<T> {
  const until = Date.now() + ms; let result: T;
  do { result = await fn(); if (testValue(result)) return result; await new Promise(r => setTimeout(r, 80)); } while (Date.now() < until);
  assert.fail("等待链路超时：" + JSON.stringify(result!));
}
test("退出官方账号不会让匿名工作区读到资料，重新登录保留不可变身份映射", async t => {
  const relay = await relayFixture(t), config = loadConfig({ AGENT_DATA_DIR: await temporary("identity-logout"), OFFICIAL_GATEWAY_URL: relay.url, OFFICIAL_MODEL: "Suinai Flash" });
  const ctx = createApp({ config, unifiedIdentity: true, sandbox: noSandbox }); t.after(() => ctx.app.close());
  const guest = ctx.accounts!.bootstrap(); const saved = ctx.store.createConversation(guest.user.id, null, "账号一的资料");
  const login = await ctx.accounts!.login("account_one", "fixture", true, false, guest.user);
  assert.equal(login.user.id, guest.user.id);
  await ctx.accounts!.logout("Bearer " + login.token);
  assert.throws(() => ctx.auth.user("Bearer " + login.token));
  const anonymous = ctx.accounts!.bootstrap(); assert.notEqual(anonymous.user.id, login.user.id);
  assert.throws(() => ctx.store.conversation(anonymous.user.id, saved.id));
  const again = await ctx.accounts!.login("account_one", "fixture", true, false, anonymous.user);
  assert.equal(again.user.id, login.user.id); assert.equal(ctx.store.conversation(again.user.id, saved.id).title, "账号一的资料");
  const second = await ctx.accounts!.login("account_two", "fixture", true, false, again.user);
  assert.notEqual(second.user.id, again.user.id); assert.equal(await ctx.accounts!.officialKey(again.user), null);
  assert.throws(() => ctx.auth.user("Bearer " + again.token));
});
test("设备配对和文件按账号隔离，任务设置不可变且请求幂等，任意宿主路径不能注入", async t => {
  const store = new Store(join(await temporary("hub-isolation"), "agent.sqlite")); t.after(() => store.close());
  const { Auth } = await import("../src/auth.js"); const auth = new Auth(store), a = auth.register("one", "fixture-only", true).user, b = auth.register("two", "fixture-only", true).user;
  const repo = new HubRepository(store), workspace = randomUUID(), profile = randomUUID();
  const limits = limitsInput.parse({ workspace_ids: [workspace] }), catalogue = catalogueInput.parse({ workspaces: [{ id: workspace, name: "项目" }], profiles: [{ id: profile, name: "我的模型", mode: "custom", ready: true }] });
  const pair = repo.pair(a.id, "电脑", limits, catalogue);
  assert.throws(() => repo.confirm(b.id, pair.pairing_token)); assert.throws(() => repo.worker(a.id, pair.device.id, "wrong"));
  assert.throws(() => repo.worker(a.id, pair.device.id, pair.key));
  let device = repo.confirm(a.id, pair.pairing_token); assert.throws(() => repo.confirm(a.id, pair.pairing_token));
  assert.throws(() => repo.settings(a.id, device.id, settingsInput.parse({ workspace_id: randomUUID() }), device.revision));
  assert.throws(() => settingsInput.parse({ permission_mode: "full-access" }));
  device = repo.settings(a.id, device.id, settingsInput.parse({ workspace_id: workspace, model_source: "local", profile_id: profile, reasoning_effort: "low" }), device.revision);
  const session = repo.createSession(a.id, "pc", device.id); const requestId = randomUUID();
  const queued = repo.enqueue(a.id, session.id, "总结项目", requestId); assert.equal(queued.status, "waiting_pc");
  assert.equal(repo.enqueue(a.id, session.id, "总结项目", requestId).id, queued.id); assert.throws(() => repo.enqueue(a.id, session.id, "不同内容", requestId));
  repo.settings(a.id, device.id, { ...device.settings, reasoning_effort: "high" }, device.revision);
  assert.equal(repo.task(a.id, queued.id).settings.reasoning_effort, "low");
  const lease = repo.claim(a.id, device.id)!; assert.equal(repo.claim(a.id, device.id), null);
  assert.throws(() => repo.control(b.id, device.id, lease.id, lease.lease));
  const f = repo.putFile(a.id, session.id, "经历.txt", Buffer.from("真实资料"), "input");
  assert.throws(() => repo.file(b.id, f.id)); assert.throws(() => repo.putFile(a.id, session.id, "../secret", Buffer.from("x"), "input"));
  repo.publish(a.id, device.id, lease.id, { lease: lease.lease, local_run_id: null, status: "completed", error: null });
  const next = repo.enqueue(a.id, session.id, "继续", randomUUID()); assert.equal(next.settings.reasoning_effort, "high");
  repo.cancel(a.id, next.id); assert.equal(repo.task(a.id, next.id).status, "cancelled");
  repo.localLimits(a.id, device.id, limits, { ...catalogue, profiles: catalogue.profiles.map(p => ({ ...p, ready: false })) });
  assert.equal(repo.device(a.id, device.id).settings.model_source, "local", "本机 Key 失效不能静默切换到官方计费模型");
  assert.throws(() => repo.enqueue(a.id, session.id, "模型未就绪", randomUUID()));
  repo.revoke(a.id, device.id); assert.throws(() => repo.worker(a.id, device.id, pair.key));
});
test("小程序 HTTP 提交→PC 主动认领→实际工具写文件→云端进度及文件，重复请求只执行一次", async t => {
  const relay = await relayFixture(t);
  const hub = createApp({ config: loadConfig({ AGENT_DEPLOYMENT_MODE: "server", AGENT_DATA_DIR: await temporary("hub-http"), OFFICIAL_GATEWAY_URL: relay.url, OFFICIAL_MODEL: "Suinai Flash" }), unifiedIdentity: true, hubOnly: true, sandbox: noSandbox });
  const repo = registerHub(hub, { cloudEnabled: false });
  await hub.app.listen({ host: "127.0.0.1", port: 0 }); const address = hub.app.server.address() as { port: number };
  t.after(() => hub.app.close());
  const model = new ScriptedModel((request, index) => { if (index === 0) { assert.match(JSON.stringify(request.messages), /整理资料/); return reply("", [tool("write_file", { path: "outputs/总结.md", content: "真实生成的项目总结" })]); } return reply("已经整理好了。"); });
  const pc = createApp({ config: loadConfig({ AGENT_DATA_DIR: await temporary("pc-http"), OFFICIAL_GATEWAY_URL: relay.url, OFFICIAL_MODEL: "Suinai Flash", AGENT_CLOUD_URL: `http://127.0.0.1:${address.port}` }), unifiedIdentity: true, sandbox: noSandbox, modelFactory: () => model });
  const bridge = installPcBridge(pc, pc.profiles.config, false); t.after(() => pc.app.close());
  const login = await pc.accounts!.login("account_one", "fixture", true);
  const profile = await pc.profiles.save(login.user, { name: "自配模型", mode: "custom", base_url: "https://example.invalid/v1", model: "fixture-only", api_key: TEST_KEY });
  profile.capabilities = { chat: true, tools: true, stream: false, tested_at: new Date().toISOString(), note: "测试替身" }; pc.store.saveProfile(profile, null);
  const pair = await bridge.connect(login.user, "测试电脑");
  const cloudUser = await hub.accounts!.user("Bearer " + (await pc.accounts!.officialKey(login.user))); hub.store.setConsent(cloudUser.id, true);
  const headers = { authorization: "Bearer " + (await pc.accounts!.officialKey(login.user)), host: "127.0.0.1" };
  const confirm = await hub.app.inject({ method: "POST", url: "/api/v1/hub/devices/confirm", headers, payload: { pairing_token: JSON.parse(pair.pairing.payload).token } }); assert.equal(confirm.statusCode, 200, confirm.body);
  const device = repo.device(cloudUser.id, pair.device.id);
  const settingResponse = await hub.app.inject({ method: "POST", url: `/api/v1/hub/devices/${device.id}/settings`, headers, payload: { settings: settingsInput.parse({ model_source: "local", profile_id: profile.id }), revision: device.revision } });
  assert.equal(settingResponse.statusCode, 200, "微信请求使用 POST 更新设置：" + settingResponse.body);
  const session = repo.createSession(cloudUser.id, "pc", device.id);
  const requestId = randomUUID(), payload = { input: "整理资料", request_id: requestId };
  for (let i = 0; i < 2; i++) { const result = await hub.app.inject({ method: "POST", url: `/api/v1/hub/sessions/${session.id}/tasks`, headers, payload }); assert.equal(result.statusCode, 200, result.body); }
  bridge.start();
  const result = await waitFor(async () => repo.snapshot(cloudUser.id, session.id), s => s.tasks.at(-1)?.status === "completed");
  assert.equal(result.tasks.length, 1); assert.equal(model.requests.filter(r => r.routingCapability !== "profile_diagnose").length, 2);
  assert.equal(result.messages.at(-1)?.content, "已经整理好了。");
  assert.equal(result.files.length, 1); assert.equal(Buffer.from(repo.file(cloudUser.id, result.files[0].id).content).toString(), "真实生成的项目总结");
  assert.ok(!JSON.stringify(result).includes(TEST_KEY)); assert.ok(!JSON.stringify(result).includes("example.invalid"));
  const bad = await hub.app.inject({ method: "GET", url: `/api/v1/hub/sessions/${session.id}`, headers: { ...headers, authorization: "Bearer revoked_token" } }); assert.equal(bad.statusCode, 401);
  assert.equal(pc.store.conversations(login.user.id).length, 1);
  assert.equal(pc.store.messages(pc.store.conversations(login.user.id)[0].id).at(-1)?.content, "已经整理好了。");
  const career = pc.runtime.career.get(login.user.id);
  pc.runtime.career.change(login.user.id, { revision: career.revision, change: { type: "profile.save", profile: { goal: "验证画像同步", education: "本科", experience: "完成项目", skills: "TypeScript", preferences: "本机", weekly_hours: "5" } } });
  await waitFor(async () => repo.career(cloudUser.id), rows => rows.some(row => row.source === device.id && (row.data.profile as { goal: string }).goal === "验证画像同步"));
  assert.equal(repo.sessions(cloudUser.id).length, 1, "远程会话镜像不能产生第二份对话");
  // 连接后新建的本账号项目和会话自动出现，不依赖再次授权或重新绑定。
  const rootA = await realpath(await temporary("project-a")), rootB = await realpath(await temporary("project-b"));
  const a = pc.store.saveLocalWorkspace(login.user.id, { name: "项目甲", root_path: rootA, canonical_path: rootA });
  const b = pc.store.saveLocalWorkspace(login.user.id, { name: "项目乙", root_path: rootB, canonical_path: rootB });
  const existing = pc.store.createConversation(login.user.id, profile.id, "电脑上已有的项目讨论");
  existing.workspace_id = a.id; existing.workspace_access = "workspace-write"; pc.store.updateConversation(existing);
  const plain = pc.store.createConversation(login.user.id, profile.id, "电脑上的自由聊天");
  await waitFor(async () => repo.device(cloudUser.id, device.id), d => d.catalogue.workspaces.length === 2);
  const synced = (await waitFor(async () => repo.sessions(cloudUser.id), rows => rows.some(row => row.title === existing.title) && rows.some(row => row.title === plain.title))).find(row => row.title === existing.title)!;
  assert.equal(synced.workspace_id, a.id); assert.equal(synced.workspace_name, "项目甲"); assert.equal(synced.workspace_access, "workspace-write");
  const currentDevice = repo.device(cloudUser.id, device.id);
  repo.settings(cloudUser.id, device.id, settingsInput.parse({ workspace_id: b.id, workspace_access: "read-only", model_source: "official" }), currentDevice.revision);
  const continued = repo.enqueue(cloudUser.id, synced.id, "继续这段电脑会话", randomUUID());
  assert.equal(continued.settings.workspace_id, a.id); assert.equal(continued.settings.workspace_access, "workspace-write"); assert.equal(continued.settings.model_source, "local");
  await waitFor(async () => repo.task(cloudUser.id, continued.id), task => task.status === "completed");
  const after = pc.store.conversation(login.user.id, existing.id);
  assert.equal(after.workspace_id, a.id); assert.equal(after.workspace_access, "workspace-write"); assert.equal(after.profile_id, profile.id);
  assert.equal(pc.store.runs(existing.id).at(-1)?.permission_mode, "default", "手机不能继承临时的宿主机完全访问");
  const freeChat = repo.sessions(cloudUser.id).find(row => row.title === plain.title)!;
  assert.equal(freeChat.workspace_id, null, "无项目会话不能被设备默认项目覆盖");
  const ready = repo.device(cloudUser.id, device.id);
  repo.settings(cloudUser.id, device.id, { ...ready.settings, model_source: "local", profile_id: profile.id }, ready.revision);
  const createdResponse = await hub.app.inject({ method: "POST", url: "/api/v1/hub/sessions", headers, payload: { target: "pc", device_id: device.id, workspace_id: b.id, title: "手机新建的项目讨论" } });
  assert.equal(createdResponse.statusCode, 200, createdResponse.body);
  const created = createdResponse.json(); assert.equal(created.workspace_id, b.id);
  const mobileTask = repo.enqueue(cloudUser.id, created.id, "从手机新开项目会话", randomUUID());
  await waitFor(async () => repo.task(cloudUser.id, mobileTask.id), task => task.status === "completed");
  const localNew = pc.store.conversations(login.user.id).find(c => c.title === created.title)!;
  assert.equal(localNew.workspace_id, b.id); assert.equal(localNew.workspace_access, "read-only");
  assert.equal(repo.sessions(cloudUser.id).filter(c => c.title === created.title).length, 1, "后台镜像和远程绑定并行时也不能复制会话");
  const badProject = await hub.app.inject({ method: "POST", url: "/api/v1/hub/sessions", headers, payload: { target: "pc", device_id: device.id, workspace_id: randomUUID() } }); assert.equal(badProject.statusCode, 403);
  const badPath = await hub.app.inject({ method: "POST", url: "/api/v1/hub/sessions", headers, payload: { target: "pc", device_id: device.id, root_path: rootA } }); assert.equal(badPath.statusCode, 400);
});

test("扫码凭证高熵、同账号、单次使用和过期刷新，旧项目白名单不再限制可见目录", async t => {
  const store = new Store(join(await temporary("hub-qr"), "agent.sqlite")); t.after(() => store.close());
  const { Auth } = await import("../src/auth.js"); const auth = new Auth(store), owner = auth.register("qr_owner", "fixture-only", true).user, other = auth.register("qr_other", "fixture-only", true).user;
  const repo = new HubRepository(store), workspace = randomUUID();
  const catalogue = catalogueInput.parse({ workspaces: [{ id: workspace, name: "已登记项目" }], profiles: [] });
  const first = repo.pair(owner.id, "电脑", limitsInput.parse({ workspace_ids: [], allow_project_write: false }), catalogue);
  assert.match(first.pairing_token, /^[A-Za-z0-9_-]{43}$/); assert.notEqual(first.pairing_token, first.key);
  assert.throws(() => repo.confirm(other.id, first.pairing_token));
  store.db.prepare("UPDATE hub_devices SET expires=0 WHERE id=?").run(first.device.id);
  assert.throws(() => repo.confirm(owner.id, first.pairing_token)); assert.throws(() => repo.worker(owner.id, first.device.id, first.key, false));
  repo.worker(owner.id, first.device.id, first.key, false, true);
  const renewed = repo.renewPairing(owner.id, first.device.id);
  assert.notEqual(renewed.pairing_token, first.pairing_token); assert.throws(() => repo.confirm(owner.id, first.pairing_token));
  const active = repo.confirm(owner.id, renewed.pairing_token);
  assert.throws(() => repo.confirm(owner.id, renewed.pairing_token)); assert.throws(() => repo.renewPairing(owner.id, active.id));
  assert.equal(repo.worker(owner.id, active.id, first.key).status, "active");
  const session = repo.createSession(owner.id, "pc", active.id, "直接选择已有项目", null, workspace);
  assert.equal(session.workspace_id, workspace); assert.equal(session.workspace_name, "已登记项目");
  const granted = repo.settings(owner.id, active.id, settingsInput.parse({ workspace_access: "workspace-write" }), active.revision);
  assert.equal(granted.settings.workspace_access, "workspace-write", "项目内写入沿用工作区权限，不再重复勾选白名单");
  assert.throws(() => settingsInput.parse({ permission_mode: "full-access" }));
});

test("记忆同步 HTTP 必须有同账号的有效设备凭据，关闭同步或撤销设备立即拒绝",async t=>{
  const relay=await relayFixture(t), hub=createApp({config:loadConfig({AGENT_DEPLOYMENT_MODE:"server",AGENT_DATA_DIR:await temporary("memory-http"),OFFICIAL_GATEWAY_URL:relay.url,OFFICIAL_MODEL:"Suinai Flash",AGENT_MEMORY_BACKGROUND:"false"}),unifiedIdentity:true,hubOnly:true,sandbox:noSandbox}); t.after(()=>hub.app.close());
  const repo=registerHub(hub,{cloudEnabled:false}), login=await hub.accounts!.login("account_one","fixture",true), second=await hub.accounts!.login("account_two","fixture",true);
  const pair=repo.pair(login.user.id,"记忆同步测试",limitsInput.parse({}),catalogueInput.parse({workspaces:[],profiles:[]})); repo.confirm(login.user.id,pair.pairing_token);
  const path="/api/v1/hub/worker/"+pair.device.id+"/memory", headers={authorization:"Bearer "+login.token,"x-device-key":pair.key}, payload={cursor:0,changes:[]};
  assert.equal((await hub.app.inject({method:"POST",url:path,headers,payload})).statusCode,200);
  assert.equal((await hub.app.inject({method:"POST",url:path,headers:{...headers,"x-device-key":"wrong"},payload})).statusCode,403);
  assert.equal((await hub.app.inject({method:"POST",url:path,headers:{...headers,authorization:"Bearer "+second.token},payload})).statusCode,404);
  const device=repo.device(login.user.id,pair.device.id); repo.settings(login.user.id,device.id,{...device.settings,sync_chats:false},device.revision);
  assert.equal((await hub.app.inject({method:"POST",url:path,headers,payload})).statusCode,403);
  repo.revoke(login.user.id,device.id); assert.equal((await hub.app.inject({method:"POST",url:path,headers,payload})).statusCode,403);
});

test("官方登录自动同步聊天和记忆，不依赖扫码；云端改名与删除回传且不扩大执行权限", async t => {
  const relay = await relayFixture(t);
  const hub = createHubApp({ config: loadConfig({ AGENT_DEPLOYMENT_MODE: "server", AGENT_DATA_DIR: await temporary("account-sync-hub"), OFFICIAL_GATEWAY_URL: relay.url, OFFICIAL_MODEL: "Suinai Flash", AGENT_MEMORY_BACKGROUND: "false" }), sandbox: noSandbox }, true);
  await hub.app.listen({ host: "127.0.0.1", port: 0 }); t.after(() => hub.app.close());
  const hubUrl = `http://127.0.0.1:${(hub.app.server.address() as { port: number }).port}`;
  const pc = createApp({ config: loadConfig({ AGENT_DATA_DIR: await temporary("account-sync-pc"), AGENT_CLOUD_URL: hubUrl, OFFICIAL_GATEWAY_URL: relay.url, OFFICIAL_MODEL: "Suinai Flash", AGENT_MEMORY_BACKGROUND: "false" }), unifiedIdentity: true, sandbox: noSandbox }); t.after(() => pc.app.close());
  const login = await pc.accounts!.login("account_one", "fixture", true);
  const conversation = pc.store.createConversation(login.user.id, null, "本机真实经历");
  const message = pc.store.message(conversation.id, null, "user", "我做过校园交易平台，负责前端页面。");
  pc.runtime.memory.observe(login.user.id, conversation.id, [{ kind: "experience", text: message.content, evidence: [{ source_id: "message." + message.id, quote: message.content }] }]);
  const token = await pc.accounts!.officialKey(login.user), headers = { authorization: "Bearer " + token };
  const cloudUser = await hub.accounts!.user(headers.authorization);
  const bridge = installPcBridge(pc, pc.profiles.config);
  const sessions = await waitFor(async () => (await hub.app.inject({ url: "/api/v1/hub/sessions", headers })).json<{ id: string; local_id: string }[]>(), rows => rows.some(row => row.local_id === conversation.id));
  const synced = sessions.find(row => row.local_id === conversation.id)!;
  const device = (await hub.app.inject({ url: "/api/v1/hub/devices", headers })).json()[0];
  assert.equal(device.status, "pending", "自动同步不能自动开启远程执行");
  const remoteTask = await hub.app.inject({ method: "POST", url: `/api/v1/hub/sessions/${synced.id}/tasks`, headers, payload: { input: "未经扫码不能执行", request_id: randomUUID() } });
  assert.equal(remoteTask.statusCode, 403);
  const snapshot = (await hub.app.inject({ url: `/api/v1/hub/sessions/${synced.id}`, headers })).json();
  assert.equal(snapshot.messages[0].content, message.content);
  assert.equal(hub.runtime.memory.view(cloudUser.id).nodes.length, 1);
  const second = await hub.accounts!.login("account_two", "fixture", true);
  assert.equal((await hub.app.inject({ url: `/api/v1/hub/sessions/${synced.id}`, headers: { authorization: "Bearer " + second.token } })).statusCode, 404);
  assert.equal((await hub.app.inject({ url: "/api/v1/hub/sessions", headers: { authorization: "Bearer " + second.token } })).json().length, 0);
  // 配对二维码过期也不影响已有账号的资料同步。
  hub.store.db.prepare("UPDATE hub_devices SET expires=0 WHERE id=?").run(device.id);
  const renamed = await hub.app.inject({ method: "PATCH", url: `/api/v1/hub/sessions/${synced.id}`, headers, payload: { title: "云端改名", archived: true } }); assert.equal(renamed.statusCode, 200, renamed.body);
  await waitFor(async () => pc.store.conversation(login.user.id, conversation.id), c => c.title === "云端改名" && c.archived === true);
  await hub.app.inject({ method: "DELETE", url: `/api/v1/hub/sessions/${synced.id}`, headers });
  await waitFor(async () => pc.store.conversations(login.user.id), rows => rows.length === 0);
  await bridge.close();
});

test("账号记忆交换无需设备，遵守记忆开关，云端原生会话在本机同步列表可见", async t => {
  const relay = await relayFixture(t), hub = createHubApp({ config: loadConfig({ AGENT_DEPLOYMENT_MODE: "server", AGENT_DATA_DIR: await temporary("account-memory"), OFFICIAL_GATEWAY_URL: relay.url, OFFICIAL_MODEL: "Suinai Flash", AGENT_MEMORY_BACKGROUND: "false" }), sandbox: noSandbox }, true); t.after(() => hub.app.close());
  const login = await hub.accounts!.login("account_one", "fixture", true), headers = { authorization: "Bearer " + login.token }, payload = { cursor: 0, changes: [] };
  assert.equal((await hub.app.inject({ method: "POST", url: "/api/v1/hub/account/memory", payload })).statusCode, 401);
  assert.equal((await hub.app.inject({ method: "POST", url: "/api/v1/hub/account/memory", headers, payload })).statusCode, 200);
  hub.runtime.memory.configure(login.user.id, { sync_enabled: false });
  assert.equal((await hub.app.inject({ method: "POST", url: "/api/v1/hub/account/memory", headers, payload })).json().paused, true);
  const c = hub.store.createConversation(login.user.id, null, "云端原生会话"); hub.store.message(c.id, null, "user", "云端内容");
  const sessions = (await hub.app.inject({ url: "/api/v1/hub/sessions", headers })).json(); assert.equal(sessions[0].local_id, c.id);
  const snapshot = (await hub.app.inject({ url: `/api/v1/hub/sessions/${c.id}`, headers })).json(); assert.equal(snapshot.messages[0].content, "云端内容");
  const update = await hub.app.inject({ method: "PATCH", url: `/api/v1/hub/sessions/${c.id}`, headers, payload: { title: "同步改名" } }); assert.equal(update.statusCode, 200); assert.equal(hub.store.conversation(login.user.id,c.id).title, "同步改名");
  assert.equal((await hub.app.inject({ method: "DELETE", url: `/api/v1/hub/sessions/${c.id}`, headers })).statusCode, 200);
  assert.equal(hub.store.conversations(login.user.id).length, 0);
});


test("云端网页使用官方账号创建会话，纯中转模式仍拒绝直接执行", async t => {
  const relay = await relayFixture(t);
  for (const enabled of [false, true]) {
    const ctx = createHubApp({ config: loadConfig({ AGENT_DEPLOYMENT_MODE: "server", AGENT_DATA_DIR: await temporary("hub-web"), OFFICIAL_GATEWAY_URL: relay.url, OFFICIAL_MODEL: "Suinai Flash", AGENT_MEMORY_BACKGROUND: "false" }), sandbox: noSandbox }, enabled);
    t.after(() => ctx.app.close());
    const login = await ctx.accounts!.login("account_one", "fixture", true);
    const headers = { authorization: "Bearer " + login.token };
    const result = await ctx.app.inject({ method: "POST", url: "/api/v1/agent/conversations", headers, payload: { title: "云端网页会话" } });
    assert.equal(result.statusCode, enabled ? 201 : 403);
    const config = await ctx.app.inject({ method: "GET", url: "/api/v1/hub/config" });
    assert.equal(config.json().cloud_enabled, enabled);
    assert.equal(config.json().memory_sync, 1);
    if (enabled) {
      const other = await ctx.accounts!.login("account_two", "fixture", true);
      const isolated = await ctx.app.inject({ method: "GET", url: "/api/v1/agent/conversations/" + result.json().id, headers: { authorization: "Bearer " + other.token } });
      assert.equal(isolated.statusCode, 404);
      const memory = await ctx.app.inject({ method: "GET", url: "/api/v1/agent/memory", headers });
      assert.equal(memory.statusCode, 200);
      const local = await ctx.app.inject({ method: "POST", url: "/api/v1/agent/workspaces/pick", headers, payload: {} });
      assert.equal(local.statusCode, 403);
    }
  }
});
