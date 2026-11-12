/** 青穗集 · 持久整理、默认模型检索与跨设备记忆同步回归。 */
import test from "node:test";
import assert from "node:assert/strict";
import { fixture, ScriptedModel, reply, TEST_KEY } from "./helpers.js";
import { id } from "../src/store.js";
import { AppError } from "../src/errors.js";
import { MemoryConsolidator } from "../src/core/memory-consolidator.js";
import { MemorySync } from "../src/core/memory-sync.js";
import { memoryRetention } from "../src/core/memory-ranking.js";
type Fixture = Awaited<ReturnType<typeof fixture>>;
function seed(f: Fixture, text: string, kind: "goal" | "preference" | "experience" = "goal") {
  const message = f.store.message(f.conversation.id,null,"user",text);
  f.runtime.memory.observe(f.user.id,f.conversation.id,[{kind,text,evidence:[{source_id:"message." + message.id,quote:text}]}]);
  return f.runtime.memory.view(f.user.id).nodes.find(n => n.sources.some(s => s.source_id === message.id))!;
}
function analysis(request: Parameters<ScriptedModel["complete"]>[0]) {
  const data = JSON.parse(request.messages.at(-1)!.content), message = data.messages.filter((m: {role:string}) => m.role === "user").at(-1);
  return reply(JSON.stringify({summary:"用户分享了目标。",next_step:"继续聊聊具体目标。",suggestion:null,memories:[{kind:"goal",text:message.content,evidence:[{source_id:message.source_id,quote:message.content}]}]}));
}
const due = (f: Fixture) => f.store.db.prepare("UPDATE memory_jobs SET next_at=0").run();
function sync(local: MemorySync, f: Fixture, server: MemorySync, hub: Fixture) {
  const sent = local.pending(f.user.id,"fixture-hub"), result = server.exchange(hub.user.id,sent);
  local.accept(f.user.id,"fixture-hub",sent,result); return result;
}
test("自配模型的主回复结束后服务端入队，无浏览器也整理，重复入队只执行一次", async t => {
  const model = new ScriptedModel(r => r.routingCapability === "profile_diagnose" ? analysis(r) : reply("收到，我们慢慢聊。"));
  const f = await fixture(t,{model,memoryBackground:true});
  f.runtime.start(f.user,f.conversation.id,f.profile.id,"我想在上海从事数据分析。",id()); await f.runtime.waitIdle();
  assert.equal(f.runtime.memoryJobs.status(f.user.id).queued,1);
  const message = f.store.messages(f.conversation.id).find(m => m.role === "user")!;
  f.runtime.memoryJobs.enqueue(f.user.id,f.conversation.id,f.profile.id,message.id);
  due(f); await f.runtime.memoryJobs.tick(); await f.runtime.memoryJobs.tick();
  assert.equal(f.runtime.memory.view(f.user.id).nodes.length,1);
  assert.equal(model.requests.filter(r => r.routingCapability === "profile_diagnose").length,1);
  assert.equal(f.runtime.memoryJobs.status(f.user.id).running,0);
  const view = await f.app.inject({url:"/api/v1/agent/memory",headers:f.headers}); assert.equal(view.json().processing.queued,0);
});
test("整理失败有界重试、错误脱敏，过期租约可恢复，耗尽租约不会永久卡住", async t => {
  let failing = true;
  const model = new ScriptedModel(r => { if (failing) throw new AppError(502,TEST_KEY); return analysis(r); });
  const f = await fixture(t,{model}), message = f.store.message(f.conversation.id,null,"user","我希望成为前端工程师。");
  const worker = new MemoryConsolidator(f.store,f.runtime.guidance,()=>{},true); t.after(()=>worker.close());
  worker.enqueue(f.user.id,f.conversation.id,f.profile.id,message.id); due(f); await worker.tick();
  assert.equal(worker.status(f.user.id).queued,1); assert.ok(!JSON.stringify(worker.status(f.user.id)).includes(TEST_KEY));
  f.store.db.prepare("UPDATE memory_jobs SET state='running',lease='crashed',lease_until=0,attempts=6").run(); await worker.tick();
  assert.equal(worker.status(f.user.id).failed,1); assert.equal(worker.status(f.user.id).running,0);
  failing=false; worker.retry(f.user); await worker.tick(); assert.equal(f.runtime.memory.view(f.user.id).nodes.length,1);
  const next = f.store.message(f.conversation.id,null,"user","我现在更想做后端开发。"); worker.enqueue(f.user.id,f.conversation.id,f.profile.id,next.id);
  f.store.db.prepare("UPDATE memory_jobs SET state='running',lease='lost',lease_until=0,attempts=1 WHERE message_id=?").run(next.id);
  await worker.tick(); assert.equal(worker.status(f.user.id).running,0); assert.equal(f.runtime.memory.view(f.user.id).nodes.length,2);
});
test("回复落库后遗漏入队可恢复；撤回模型授权不再整理", async t => {
  const f = await fixture(t,{model:new ScriptedModel(r => r.routingCapability === "profile_diagnose" ? analysis(r) : reply("收到。"))});
  f.runtime.start(f.user,f.conversation.id,f.profile.id,"我希望以后做数据工程。",id()); await f.runtime.waitIdle();
  const worker = new MemoryConsolidator(f.store,f.runtime.guidance,()=>{},true); t.after(()=>worker.close()); worker.recover();
  assert.equal(worker.status(f.user.id).queued,1); f.store.setConsent(f.user.id,false); due(f); await worker.tick();
  assert.equal(f.runtime.memory.view(f.user.id).nodes.length,0); assert.equal(worker.status(f.user.id).queued,0);
});
test("同义问题由当前模型挑选真实记忆ID；删除和开关在最终上下文仍生效", async t => {
  const f = await fixture(t), node = seed(f,"我需要照顾家中老人，没办法离开家参加线下培训。","preference");
  let calls=0;
  const model = new ScriptedModel(r => { calls++; assert.equal(r.tools.length,0); assert.match(r.messages.at(-1)!.content,/家中老人/); return reply(JSON.stringify({ids:[node.id]})); });
  const query="还记得我为什么只能远程进修吗？";
  await f.runtime.memory.prepareRecall(f.user.id,f.conversation.id,"semantic",query,async()=>model,new AbortController().signal);
  assert.match(f.runtime.memory.recall(f.user.id,f.conversation.id,"semantic",query) ?? "",/家中老人/); assert.equal(calls,1);
  f.runtime.memory.recall(f.user.id,f.conversation.id,"semantic",query); assert.equal(calls,1);
  f.runtime.memory.change(f.user.id,node.id,{action:"delete",revision:node.revision});
  assert.equal(f.runtime.memory.recall(f.user.id,f.conversation.id,"semantic",query),null); f.runtime.memory.releaseRecall("semantic");
});
test("候选判断格式无效时回退本地检索，不执行模型返回的工具", async t => {
  const f=await fixture(t); seed(f,"我想做前端开发。");
  const model=new ScriptedModel(()=>reply('{"ids":["not-a-candidate"]}'));
  await f.runtime.memory.prepareRecall(f.user.id,f.conversation.id,"fallback","我之前想过前端开发，继续聊聊这个方向。",async()=>model,new AbortController().signal);
  assert.match(f.runtime.memory.recall(f.user.id,f.conversation.id,"fallback","我之前想过前端开发，继续聊聊这个方向。")??"",/前端开发/);
});
test("双设备同步保留引文，响应丢失后幂等重试，同步不会因召回次数反复写入", async t => {
  const a=await fixture(t), b=await fixture(t), hub=await fixture(t);
  seed(a,"我做过校园交易平台。","experience"); const x=new MemorySync(a.runtime.memory), y=new MemorySync(b.runtime.memory), server=new MemorySync(hub.runtime.memory);
  const sent=x.pending(a.user.id,"fixture-hub"), first=server.exchange(hub.user.id,sent), again=server.exchange(hub.user.id,sent);
  assert.equal(first.cursor,again.cursor); x.accept(a.user.id,"fixture-hub",sent,again); sync(y,b,server,hub);
  assert.equal(b.runtime.memory.view(b.user.id).nodes.length,1); assert.equal(b.runtime.memory.view(b.user.id).nodes[0].sources[0].kind,"synced");
  assert.equal(b.runtime.memory.view(b.user.id).nodes[0].sources[0].quote,"我做过校园交易平台。");
  a.runtime.memory.recall(a.user.id,a.conversation.id,"recalled","校园交易平台"); assert.equal(x.pending(a.user.id,"fixture-hub").changes.length,0);
  assert.equal(y.pending(b.user.id,"fixture-hub").changes.length,0);
});
test("离线设备不能恢复已删记忆；墓碑和同步状态不保存旧正文", async t => {
  const a=await fixture(t), b=await fixture(t), hub=await fixture(t), node=seed(a,"我想从事嵌入式开发。");
  const x=new MemorySync(a.runtime.memory), y=new MemorySync(b.runtime.memory), server=new MemorySync(hub.runtime.memory); sync(x,a,server,hub); sync(y,b,server,hub);
  const stale=y.pending(b.user.id,"fixture-hub"), bnode=b.runtime.memory.view(b.user.id).nodes[0];
  b.runtime.memory.change(b.user.id,bnode.id,{action:"correct",revision:bnode.revision,text:"我想从事嵌入式固件开发。"}); const offline=y.pending(b.user.id,"fixture-hub");
  a.runtime.memory.change(a.user.id,node.id,{action:"delete",revision:a.runtime.memory.view(a.user.id).nodes[0].revision}); sync(x,a,server,hub);
  const result=server.exchange(hub.user.id,offline); y.accept(b.user.id,"fixture-hub",offline,result);
  assert.equal(b.runtime.memory.view(b.user.id).nodes.length,0,JSON.stringify({local:b.runtime.memory.view(b.user.id).nodes,remote:hub.runtime.memory.view(hub.user.id).nodes,result},null,2)); assert.equal(hub.runtime.memory.view(hub.user.id).nodes.length,0);
  assert.ok(!JSON.stringify(hub.store.db.prepare("SELECT * FROM memory_sync_entries").all()).includes("嵌入式"));
  assert.equal(stale.changes.length,0);
});
test("不同设备并发改正保留两个版本，复用冲突确认后同步收敛", async t => {
  const a=await fixture(t), b=await fixture(t), hub=await fixture(t); seed(a,"我打算在北京工作。");
  const x=new MemorySync(a.runtime.memory), y=new MemorySync(b.runtime.memory), server=new MemorySync(hub.runtime.memory); sync(x,a,server,hub); sync(y,b,server,hub);
  const an=a.runtime.memory.view(a.user.id).nodes[0], bn=b.runtime.memory.view(b.user.id).nodes[0];
  a.runtime.memory.change(a.user.id,an.id,{action:"correct",revision:an.revision,text:"我打算在上海工作。"});
  b.runtime.memory.change(b.user.id,bn.id,{action:"correct",revision:bn.revision,text:"我打算在杭州工作。"});
  sync(x,a,server,hub); sync(y,b,server,hub); sync(x,a,server,hub); sync(y,b,server,hub);
  const view=b.runtime.memory.view(b.user.id); assert.equal(view.nodes.filter(n=>n.status==="active").length,2); assert.ok(view.nodes.every(n=>n.conflict_ids.length===1),JSON.stringify({local:view.nodes.map(n=>({text:n.text,conflicts:n.conflict_ids})),remote:hub.runtime.memory.view(hub.user.id).nodes.map(n=>({text:n.text,conflicts:n.conflict_ids})),pending:y.pending(b.user.id,"fixture-hub")},null,2));
  const chosen=view.nodes.find(n=>n.text.includes("杭州"))!; b.runtime.memory.change(b.user.id,chosen.id,{action:"confirm",revision:chosen.revision});
  sync(y,b,server,hub); sync(x,a,server,hub);
  assert.equal(a.runtime.memory.view(a.user.id).nodes.filter(n=>n.status==="active").length,1); assert.match(a.runtime.memory.view(a.user.id).nodes.find(n=>n.status==="active")!.text,/杭州/);
});
test("同步请求在途发生新编辑不会覆盖本机，暂停同步不接收或写入", async t => {
  const a=await fixture(t), hub=await fixture(t); seed(a,"我计划学习 React。"); const x=new MemorySync(a.runtime.memory), server=new MemorySync(hub.runtime.memory);
  const sent=x.pending(a.user.id,"fixture-hub"), result=server.exchange(hub.user.id,sent), node=a.runtime.memory.view(a.user.id).nodes[0];
  a.runtime.memory.change(a.user.id,node.id,{action:"correct",revision:node.revision,text:"我计划先学习 TypeScript。"}); x.accept(a.user.id,"fixture-hub",sent,result);
  assert.match(a.runtime.memory.view(a.user.id).nodes[0].text,/TypeScript/); assert.equal(x.pending(a.user.id,"fixture-hub").changes.filter(c=>c.value).length,1);
  hub.runtime.memory.configure(hub.user.id,{sync_enabled:false}); assert.equal(server.exchange(hub.user.id,x.pending(a.user.id,"fixture-hub")).paused,true);
});
test("时间模拟：重复原话延缓淡出，计划与情绪正常衰减，锚点保留而不自动物理删除",()=>{
  const base={kind:"goal" as const,anchor:false,confirmed:false,mentions:1,last_mentioned_at:"2026-01-01T00:00:00.000Z"}, at=Date.parse(base.last_mentioned_at)+180*86400000;
  assert.ok(memoryRetention({...base,mentions:6},at)>memoryRetention(base,at)); assert.ok(memoryRetention({...base,kind:"emotion"},at)<memoryRetention({...base,kind:"plan"},at)); assert.equal(memoryRetention({...base,anchor:true},at),.95);
});

test("候选模型不响应时四秒回退；关闭召回不发起模型请求", async t => {
  const f=await fixture(t); seed(f,"我想做前端开发。", "goal");
  let aborted=false;
  const slow=new ScriptedModel(r=>new Promise((_resolve,reject)=> { r.signal.addEventListener("abort",()=> { aborted=true; reject(new Error("aborted")); },{once:true}); }));
  const start=Date.now(), query="我之前想过前端开发，继续聊聊这个方向。";
  await f.runtime.memory.prepareRecall(f.user.id,f.conversation.id,"slow",query,async()=>slow,new AbortController().signal);
  assert.ok(aborted); assert.ok(Date.now()-start<5500); assert.match(f.runtime.memory.recall(f.user.id,f.conversation.id,"slow",query)??"",/前端开发/);
  f.runtime.memory.configure(f.user.id,{recall_enabled:false});
  await f.runtime.memory.prepareRecall(f.user.id,f.conversation.id,"off",query,async()=> { assert.fail("不应构建模型"); },new AbortController().signal);
});
test("同步白名单遮蔽联系方式、已登记密钥和本机路径，不能读到另一账号", async t=>{
  const f=await fixture(t), other=f.auth.register("memory_other","fixture-only",true).user;
  seed(f,"我做过 TypeScript 项目，在 D:/Secret/project，联系 test@example.com。","experience");
  const c=f.store.createConversation(other.id,null), m=f.store.message(c.id,null,"user","我独有的秘密经历。"); f.runtime.memory.observe(other.id,c.id,[{kind:"experience",text:m.content,evidence:[{source_id:"message."+m.id,quote:m.content}]}]);
  const data=JSON.stringify(new MemorySync(f.runtime.memory).pending(f.user.id,"fixture")); assert.ok(!data.includes("D:/Secret")); assert.ok(!data.includes("test@example.com")); assert.ok(!data.includes("独有的秘密")); assert.ok(!data.includes(TEST_KEY));
});
test("嵌套记忆事务失败只回退内层，外层也可完整撤销",async t=>{
  const f=await fixture(t); f.store.db.exec("CREATE TABLE memory_tx_fixture(id INTEGER PRIMARY KEY)");
  f.store.transaction(()=>{ f.store.db.prepare("INSERT INTO memory_tx_fixture VALUES(1)").run(); assert.throws(()=>f.store.transaction(()=>{ f.store.db.prepare("INSERT INTO memory_tx_fixture VALUES(2)").run(); throw new Error("inner"); })); });
  assert.deepEqual(f.store.db.prepare("SELECT id FROM memory_tx_fixture").all().map(r=>Number(r.id)),[1]);
  assert.throws(()=>f.store.transaction(()=>{ f.store.transaction(()=>f.store.db.prepare("INSERT INTO memory_tx_fixture VALUES(3)").run()); throw new Error("outer"); }));
  assert.deepEqual(f.store.db.prepare("SELECT id FROM memory_tx_fixture").all().map(r=>Number(r.id)),[1]);
});

test("首次上云前先删除也保留墓碑，延迟到达的旧上传不能复活",async t=>{
  const a=await fixture(t),hub=await fixture(t),node=seed(a,"我曾计划参加数据分析培训。");
  const client=new MemorySync(a.runtime.memory),server=new MemorySync(hub.runtime.memory),stale=client.pending(a.user.id,"fixture-hub");
  a.runtime.memory.change(a.user.id,node.id,{action:"delete",revision:node.revision});
  sync(client,a,server,hub); server.exchange(hub.user.id,stale); assert.equal(hub.runtime.memory.view(hub.user.id).total,0);
});
test("撤销一条原话会从其他设备移除该引用，其余独立来源仍保留",async t=>{
  const a=await fixture(t),b=await fixture(t),hub=await fixture(t); seed(a,"我想学习 React 前端。"); const node=seed(a,"我想学习 React 前端。");
  const client=new MemorySync(a.runtime.memory),remote=new MemorySync(b.runtime.memory),server=new MemorySync(hub.runtime.memory); sync(client,a,server,hub); sync(remote,b,server,hub);
  assert.equal(node.sources.length,2); const removed=node.sources[0].source_id;
  a.runtime.memory.invalidateMessages(a.user.id,a.conversation.id,[removed]); sync(client,a,server,hub); sync(remote,b,server,hub);
  const kept=b.runtime.memory.view(b.user.id).nodes[0]; assert.equal(kept.sources.length,1); assert.ok(kept.sources.every(s=>s.source_id!==removed));
});
