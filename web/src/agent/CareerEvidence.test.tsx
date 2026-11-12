/** 青穗集 · 职业证据回归：原话、确认边界、会话隔离和追问回答保持一致。 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CareerEvidencePanel, DecisionActivity, DecisionFollowUp, JobEvidenceDetails, ResumeEvidenceMenu } from "./CareerEvidence";
import { conversationEvidence, followUpReply } from "./career-evidence";
import { EMPTY_CAREER_PROFILE, type CareerState } from "./career";
import type { CareerDecisionView, CareerFactCandidate, JobAssessment } from "../../../agent/src/career-decision-contract";

const noop = () => {};
const stamp = "2026-10-28T09:00:00.000Z";
const fact = (input: Partial<CareerFactCandidate> = {}): CareerFactCandidate => ({
  id: "fact", field: "experience", text: "用 React 做过登录页", evidence: [{ source_id: "message.user", quote: "我用 React 做过登录页" }],
  conversation_id: "chat", created_at: stamp, status: "pending", category: "actual", support: "supported", conflict: false, confirmable: true, stale: false, ...input,
});
const view = (): CareerDecisionView => ({
  facts: [fact(), fact({ id: "other", conversation_id: "other-chat", text: "另一段对话的内容" })], jobs: [],
  follow_up: { id: "question", question: "登录页中你具体负责了哪部分？", purpose: "了解真实职责，避免写成整个项目都由你负责。", conversation_id: "chat", updated_at: stamp },
  activity: { phase: "judging", conversation_id: "chat", updated_at: stamp, message: "正在校准经历与计划" },
});
const state = (insights = view()): CareerState => ({ revision: 0, context_version: 0, updated_at: null, profile: { ...EMPTY_CAREER_PROFILE, confirmed_at: null }, jobs: [], actions: [], comparisons: [], proposals: [], sources: [], insights });

describe("对话中的职业证据", () => {
  it("后台整理状态可放进回复标题，线索区不再生成突兀的独立标签", () => {
    const activity = view().activity!;
    const inline = renderToStaticMarkup(<DecisionActivity activity={activity} inline/>);
    expect(inline).toContain('class="career-decision-activity career-decision-activity--inline"');
    expect(inline.startsWith("<span")).toBe(true);
    const panel = renderToStaticMarkup(<CareerEvidencePanel state={state({...view(),facts:[]})} compact conversation showActivity={false} onPrompt={noop}/>);
    expect(panel).toBe("");
  });
  it("只展示当前会话的线索，旧追问在新发言后失效", () => {
    expect(conversationEvidence(view(), "chat")?.facts.map(item => item.id)).toEqual(["fact"]);
    const other = conversationEvidence(view(), "other-chat");
    expect(other?.follow_up).toBeNull(); expect(other?.activity).toBeNull();
    const continued = conversationEvidence(view(), "chat", "2026-10-28T09:01:00.000Z");
    expect(continued?.follow_up).toBeNull(); expect(continued?.activity).toBeNull();
    expect(conversationEvidence(view(), null)).toBeUndefined();
  });
  it("候选能查看原话、确认和忽略，未经核对的内容不能直接记入档案", () => {
    const html = renderToStaticMarkup(<CareerEvidencePanel state={state({ ...view(), facts: [fact()] })} onResolve={async () => true} onPrompt={noop} compact conversation/>);
    expect(html).toContain("我用 React 做过登录页"); expect(html).toContain("记入档案："); expect(html).toContain("暂不记录"); expect(html).toContain("补充或更正");
    const unchecked = renderToStaticMarkup(<CareerEvidencePanel state={state({ ...view(), facts: [fact({ confirmable: false, support: "unchecked", category: "unknown" })] })} onResolve={async () => true} onPrompt={noop} compact/>);
    expect(unchecked).toContain("尚未核对"); expect(unchecked).not.toContain("记入档案：");
  });
  it("计划说明归入目标，材料冲突必须先核对", () => {
    const html = renderToStaticMarkup(<CareerEvidencePanel state={state({ ...view(), facts: [fact({ category: "plan", field: "goal" }), fact({ id: "conflict", conflict: true, confirmable: false })] })} onResolve={async () => true} onPrompt={noop} compact/>);
    expect(html).toContain("这是一项计划，会记入目标"); expect(html).toContain("与已有档案存在不同说法");
  });
  it("追问解释用途并引导用户回答，不把问题重新问给助手", () => {
    const question = view().follow_up!;
    expect(followUpReply(question.question)).toBe("关于你问的「登录页中你具体负责了哪部分？」，我的情况是：");
    const html = renderToStaticMarkup(<DecisionFollowUp followUp={question} onPrompt={noop}/>);
    expect(html).toContain(question.purpose); expect(html).toContain(question.question);
  });
  it("完成后收起进度，服务失败保留真实状态", () => {
    expect(renderToStaticMarkup(<DecisionActivity activity={{ ...view().activity!, phase: "ready" }}/>)).toBe("");
    const html = renderToStaticMarkup(<DecisionActivity activity={{ ...view().activity!, phase: "unavailable", message: "本轮对照尚未完成" }}/>);
    expect(html).toContain("本轮对照尚未完成"); expect(html).toContain('data-active="false"');
  });
  it("岗位依据区分未知与冲突，旧材料允许重新对照且不展示匹配百分比", () => {
    const job: JobAssessment = { id: "job", checks: [{ requirement: "熟悉 Redis", importance: "essential", assessment: "unknown", evidence: [], reason: "没有足够材料；不代表你不会。" }], preference: "unknown", support_count: 0, unknown_count: 1, label: "explore", rank: 1, updated_at: stamp, stale: true };
    const html = renderToStaticMarkup(<JobEvidenceDetails assessment={job} job={{ id: "job", title: "后端开发" }} onPrompt={noop}/>);
    expect(html).toContain("重新对照"); expect(html).toContain("待了解"); expect(html).toContain("不代表你不会"); expect(html).not.toContain("%");
  });
  it("简历局部核对与全文核对分开，内容变化后不显示仍然通过", () => {
    const html = renderToStaticMarkup(<ResumeEvidenceMenu review={{ status: "checked", updated_at: stamp, scope: "changes", checked_count: 1, total_count: 1, issues: [], stale: true }}/>);
    expect(html).toContain("依据需重新核对"); expect(html).toContain("不代表经历经过外部核实"); expect(html).not.toContain("正文已对照原始经历");
  });
});
