/** 青穗集 · 识海规模与重启验证：仅合成数据，不连接真实模型、不改用户主库。 */
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { performance } from "node:perf_hooks";
import { createApp } from "../../agent/src/http.js";
import { loadConfig } from "../../agent/src/config.js";
import { MemorySync } from "../../agent/src/core/memory-sync.js";
import { memoryRetention } from "../../agent/src/core/memory-ranking.js";
import { MEMORY_KINDS } from "../../agent/src/memory-contract.js";
const root=resolve(import.meta.dirname,"../.."), logs=join(root,"logs/memory-system-20261030");
await mkdir(logs,{recursive:true}); const data=await mkdtemp(join(logs,"scale-data-")), cloudData=await mkdtemp(join(logs,"scale-cloud-"));
const config=loadConfig({AGENT_DATA_DIR:data,AGENT_MEMORY_BACKGROUND:"false"}), hash=(v:string)=>createHash("sha256").update(v).digest("hex");
let ctx=createApp({config}); const cloud=createApp({config:loadConfig({AGENT_DATA_DIR:cloudData,AGENT_MEMORY_BACKGROUND:"false"})});
const session=ctx.auth.register("scale_memory","Synthetic-only-2026",false), owner=cloud.auth.register("scale_cloud","Synthetic-only-2026",false).user;
const cid=ctx.store.createConversation(session.user.id,null,"规模验证（合成数据）").id, stamp=new Date().toISOString(), target="我在校园交易平台使用 React 和 TypeScript 完成前端与接口联调。";
try {
  const begin=performance.now();
  ctx.store.transaction(()=>{
    for(let i=0;i<10000;i++) {
      const text=i===9999?target:"规模测试记录 "+String(i).padStart(5,"0")+"，阅读和日常休息安排。", sourceId=randomUUID();
      ctx.runtime.memory.applyReplica(session.user.id,"n:"+hash("synthetic-memory-"+i),{kind:i===9999?"experience":MEMORY_KINDS[i%7],text,confidence:.75,importance:.6,confirmed:false,anchor:i%50===0,demoted:false,status:"active",created_at:stamp,updated_at:stamp,last_mentioned_at:stamp,mentions:1,conflicts:[],sources:[{key:hash("message:"+sourceId+":"+text),kind:"message",source_id:sourceId,conversation_id:null,conversation_title:"合成数据，非真实经历",quote:text,created_at:stamp}]});
    }
  });
  const seedMs=performance.now()-begin, durations:number[]=[];
  for(let i=0;i<12;i++) { const start=performance.now(); const context=ctx.runtime.memory.recall(session.user.id,cid,randomUUID(),"校园交易平台 React TypeScript 接口联调"); assert.match(context??"",/校园交易平台/); assert.ok((context?.length??0)<5000); durations.push(performance.now()-start); }
  const viewStart=performance.now(), view=ctx.runtime.memory.view(session.user.id), viewMs=performance.now()-viewStart; assert.equal(view.total,10000);
  const client=new MemorySync(ctx.runtime.memory), server=new MemorySync(cloud.runtime.memory), syncStart=performance.now(), sent=client.pending(session.user.id,"synthetic-hub");
  assert.equal(sent.changes.length,40); assert.ok(Buffer.byteLength(JSON.stringify(sent))<512*1024);
  const result=server.exchange(owner.id,sent); client.accept(session.user.id,"synthetic-hub",sent,result); const syncMs=performance.now()-syncStart;
  assert.equal(cloud.runtime.memory.view(owner.id).total,40);
  await ctx.app.close(); ctx=createApp({config}); const restored=ctx.auth.user("Bearer "+session.token); assert.equal(restored.id,session.user.id);
  assert.equal(ctx.runtime.memory.view(restored.id).total,10000); const pending=new MemorySync(ctx.runtime.memory).pending(restored.id,"synthetic-hub");
  assert.equal(pending.changes.length,40); assert.ok(pending.cursor>0);
  const base={kind:"goal" as const,anchor:false,confirmed:false,mentions:1,last_mentioned_at:stamp};
  const decay=[0,30,90,180,365].map(days=>({days,ordinary:memoryRetention(base,Date.parse(stamp)+days*86400000),repeated:memoryRetention({...base,mentions:6},Date.parse(stamp)+days*86400000),anchor:memoryRetention({...base,anchor:true},Date.parse(stamp)+days*86400000),emotion:memoryRetention({...base,kind:"emotion"},Date.parse(stamp)+days*86400000)}));
  const sorted=[...durations].sort((a,b)=>a-b), round=(n:number)=>Math.round(n*100)/100;
  const report={synthetic_data:true,environment:{platform:process.platform,node:process.version},records:10000,seed_ms:round(seedMs),local_recall_ms:{samples:durations.map(round),p50:round(sorted[6]),p95:round(sorted[11])},full_memory_view_ms:round(viewMs),first_sync_batch:{records:40,bytes:Buffer.byteLength(JSON.stringify(sent)),end_to_end_ms:round(syncMs)},restart_preserved:{records:10000,sync_cursor:pending.cursor},decay,limits:"本机合成数据验证，不代表云服务器延迟、真实模型语义准确率或万节点界面的帧率。"};
  await writeFile(join(logs,"scale-verification.json"),JSON.stringify(report,null,2)); console.log(JSON.stringify(report,null,2));
} finally { await ctx.app.close(); await cloud.app.close(); }
