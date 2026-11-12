import fs from 'fs';
const token = fs.readFileSync('D:/Project/career-decision-system/tmp/cloud-token.txt','utf8').trim();
const jobs = JSON.parse(fs.readFileSync('D:/Project/career-decision-system/tmp/selected-jobs.json','utf8'));
const base = 'https://agent.suinai.me/api/v1/agent/career';
async function change(rev, payload){
  const r = await fetch(base + '/changes', {method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({revision:rev,change:payload})});
  const text = await r.text(); if(!r.ok) throw new Error(r.status+' '+text);
  return JSON.parse(text);
}
let state = await (await fetch(base,{headers:{Authorization:'Bearer '+token}})).json();
const profile={goal:'想找数据分析或后端开发的方向，优先杭州和上海，准备 2027 届秋招。',education:'信息管理与信息系统专业，2027 届本科在读。',experience:'校园二手交易平台后端：负责商品发布、搜索和订单接口，用 Spring Boot + MySQL，和 2 位同学一起完成；数据运营实习：每周整理业务数据、写 SQL 周报，发现过一次渠道转化统计口径错误。数学建模校赛：用 Python 对用户流失数据做清洗和逻辑回归，负责特征处理，最后拿了校二等奖。',skills:'Java、Spring Boot、MySQL、SQL、Python（课程项目）、Excel',preferences:'优先杭州、上海；希望有明确带教；不接受长期夜班；每周可投入 3 天实习。',weekly_hours:'每周 3 天，可实习 4 个月以上'};
state = await change(state.revision,{type:'profile.save',profile});
for(const j of jobs){ state = await change(state.revision,{type:'job.add',job:{title:j.title,company:j.company,url:j.source_url||'',description:j.description}}); }
const catJob = state.jobs.find(j=>j.title==='数据分析工程师');
for(const a of [
 {title:'把二手平台项目写成 3 条可核对的后端成果',job_id:catJob.id,why:'岗位对照里反复出现接口、数据库和工程基础，但档案只有一句概述。',learn:'用 STAR 结构写清背景、动作和结果。',deliverable:'3 条经历 bullet，每条带一个可核对的结果。'},
 {title:'补齐 SQL 周报的指标口径说明',job_id:catJob.id,why:'数据运营实习需要能说明你如何处理数据口径。',learn:'指标定义、口径对齐和异常复核。',deliverable:'1 页指标口径说明。'}
]) { state = await change(state.revision,{type:'action.add',action:a}); }
fs.writeFileSync('D:/Project/career-decision-system/tmp/cloud-career.json',JSON.stringify(state,null,2));
console.log('rev',state.revision,'jobs',state.jobs.length,'actions',state.actions.length,'ctx',state.context_version);
