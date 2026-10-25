/** 青穗集 · 六组件回归：持久化岗位投影、真实资料边界与后端统一素材地址。 */
import { existsSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { COMPONENT_ICONS, ComponentIcon } from "./ComponentAssets";
import { GrowthSummary, JobRecommendationCard, ProfileUpdateStrip, SkillDetailPopover } from "./CareerComponents";
import { ProfileDossier } from "./ProfileDossier";
import { EMPTY_CAREER_PROFILE, type CareerState } from "./career";
import { jobsByRun } from "./job-cards";
import type { ChatMessage } from "./types";
const noop = () => {};
const state = (): CareerState => ({ revision: 0, context_version: 0, updated_at: null, profile: { ...EMPTY_CAREER_PROFILE, confirmed_at: null }, jobs: [], actions: [], comparisons: [], proposals: [], sources: [] });
const message = (partial: Partial<ChatMessage>): ChatMessage => ({ id: "message", run_id: "run", role: "tool", content: "", created_at: "2026-10-24T10:00:00Z", ...partial });
const sample = { id: "sample-1", title: "合成前端岗位", company: "测试公司", city: "测试城市", excerpt: "熟悉 React", matched_terms: ["React"], work_type: "internship", reference_notice: "离线参考，当前状态待核实" };
const history = (): ChatMessage[] => [
  message({ role: "assistant", tool_calls: [{ id: "search", name: "search_job_samples", arguments: "{}" }, { id: "read", name: "read_job_sample", arguments: "{}" }] }),
  message({ tool_call_id: "search", content: JSON.stringify({ ok: true, result: { samples: [sample, sample] } }) }),
  message({ tool_call_id: "read", content: JSON.stringify({ ok: true, result: { sample: { ...sample, matched_terms: undefined, excerpt: undefined, description: "完整的岗位原文" } } }) }),
];
describe("工具结果的岗位卡片", () => {
  it("无需事件日志即可从保存的消息恢复卡片，并合并检索和完整读取", () => {
    const jobs = jobsByRun(JSON.parse(JSON.stringify(history()))).get("run")!;
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.excerpt).toBe("完整的岗位原文");
    expect(jobs[0]?.matched_terms).toEqual(["React"]);
    expect(jobsByRun([]).size).toBe(0);
  });
  it("聊天文本、失败调用和其他工具不能生成岗位卡片", () => {
    const data = JSON.stringify({ ok: true, result: { samples: [sample] } });
    const messages = [message({ role: "assistant", content: data }), message({ tool_call_id: "unknown", content: data }),
      message({ role: "assistant", tool_calls: [{ id: "directions", name: "list_career_directions", arguments: "{}" }, { id: "search", name: "search_job_samples", arguments: "{}" }] }),
      message({ tool_call_id: "directions", content: data }), message({ tool_call_id: "search", content: JSON.stringify({ ok: false, result: { samples: [sample] } }) })];
    expect(jobsByRun(messages).size).toBe(0);
    expect(jobsByRun(history().slice(0,1).concat(message({ tool_call_id: "search", content: "broken-json" }))).size).toBe(0);
  });
  it("收藏状态可读，不虚构匹配分数", () => {
    const html = renderToStaticMarkup(<JobRecommendationCard job={sample} saved saving={false} disabled={false} onOpen={noop} onSave={noop} onPrompt={noop}/>);
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain("取消收藏");
    expect(html).toContain("和我对照");
    expect(html).toContain("当前状态待核实");
    expect(html).not.toMatch(/匹配度|适合度|90%/);
  });
});
describe("成长记录与确认", () => {
  it("旧的自由文字保留未分级状态，不套用示例技能等级", () => {
    const input = state(); input.profile.skills = "接触过 React，尚未独立制作项目"; input.profile.confirmed_at = "2026-10-24";
    const html = renderToStaticMarkup(<GrowthSummary state={input} loading={false} error="" onOpen={noop} onPrompt={noop}/>);
    expect(html).toContain("已记录 · 未分级");
    expect(html).not.toContain("Lv.");
    expect(html).not.toContain("精通");
  });
  it("来源改变时提醒重新核对，本人确认不展示成能力认证", () => {
    const input = state();
    const skill = { name: "React", stage: "project" as const, evidence: [{source_id:"profile.experience",quote:"用 React 完成了登录表单"}],confirmed_at:"2026-10-24" };
    const html = renderToStaticMarkup(<SkillDetailPopover skill={skill} state={input} onClose={noop} onPrompt={noop}/>);
    expect(html).toContain("用 React 完成了登录表单");
    expect(html).toContain("依据需要重新核对");
    expect(html).toContain("不是能力认证");
  });
  it("资料版本改变后禁止确认旧草稿，并允许查看行动的具体产出", () => {
    const input = state(); input.context_version = 2;
    const proposal = { id:"proposal",title:"下一步练习",context_version:1,conversation_id:"chat",created_at:"2026-10-24",data:{kind:"actions" as const, actions:[{title:"补充校验",job_id:null,why:"核对真实实践",learn:"错误反馈",deliverable:"表单代码和操作截图"}]}};
    const html = renderToStaticMarkup(<ProfileUpdateStrip proposal={proposal} state={input} saving={false} disabled={false} onChange={async()=>true} onPrompt={noop}/>);
    expect(html).toContain("表单代码和操作截图");
    expect(html).toContain("资料已更新");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>[\s\S]*?确认更新/);
  });
});
it("所有新图标都来自后端统一资源路径并有实际文件", () => {
  const html = renderToStaticMarkup(<>{COMPONENT_ICONS.map(name=><ComponentIcon key={name} name={name}/>)}</>);
  const sources = [...html.matchAll(/src="([^"]+)"/g)].map(match=>match[1]!);
  expect(sources).toHaveLength(19);
  for (const source of sources) {
    expect(source).toMatch(/^\/api\/assets\/brand\/career-components\//);
    expect(existsSync(new URL("../../../assets/web/"+source.slice("/api/assets/".length),import.meta.url)),source).toBe(true);
  }
});

describe("证据型职业画像", () => {
  it("把已确认事实、技能依据和待了解内容放在同一份画像里", () => {
    const input = state();
    input.profile = { ...input.profile, goal: "寻找前端实习", experience: "用 React 完成过一个课程项目", confirmed_at: "2026-10-24" };
    input.skills = [{ name: "React", stage: "project", evidence: [{ source_id: "profile.experience", quote: "用 React 完成过一个课程项目" }], confirmed_at: "2026-10-24" }];
    input.sources = [
      { id: "profile.goal", kind: "user_confirmed", text: "寻找前端实习" },
      { id: "profile.experience", kind: "user_confirmed", text: "用 React 完成过一个课程项目" },
      { id: "job.sample", kind: "job_sample", text: "熟悉 React" },
    ];
    const html = renderToStaticMarkup(<ProfileDossier state={input} onEdit={noop} onPrompt={noop} />);
    expect(html).toContain("寻找前端实习");
    expect(html).toContain("Lv.2 · 项目实践");
    expect(html).toContain("用 React 完成过一个课程项目");
    expect(html).toContain("还需要继续了解");
    expect(html).not.toContain("熟悉 React");
    expect(html).not.toMatch(/匹配度|可信度|精通/);
  });

  it("空画像引导回到对话，不伪造内容", () => {
    const html = renderToStaticMarkup(<ProfileDossier state={state()} onEdit={noop} onPrompt={noop} />);
    expect(html).toContain("你的职业画像正在形成");
    expect(html).toContain("从对话开始");
    expect(html).toContain("技能会在穗奈从经历中找到明确依据");
    expect(html).not.toContain("未填写");
  });
});