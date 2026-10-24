/** 青穗集 · 简历内部阶段与固定示例：阶段留在后台，对话负责引导；示例不冒充模型分析。 */
import { emptyResumeState, type ResumeState, type ResumeStep, type ResumeChange, type ResumeFact, type ResumeSelection, type ResumeBody } from "../../../agent/src/resume-contract";
export const FACT_KIND_LABEL = { education: "教育背景", experience: "工作与实践", projects: "项目经历", skills: "专业技能" } as const;
export const CHOICE_LABEL = { primary: "重点展示", secondary: "精简展示", omit: "本次不展示" } as const;
export function canVisitResumeStep(state: ResumeState, step: ResumeStep) {
  if (step === "materials") return true;
  if (step === "facts") return Boolean(state.source_text);
  if (step === "selection") return state.facts_confirmed;
  if (step === "editor") return state.selection_confirmed;
  return Boolean(state.body);
}
const EXAMPLE_PARAGRAPHS = [
  "林知夏，软件工程本科，2027 届，求职前端开发实习。",
  "校园活动报名项目：我作为小组成员，使用 React、TypeScript 实现活动列表、条件筛选和报名表单校验，并用 Git 协作。没有负责后端和部署，尚未统计用户量或性能指标。",
  "课程管理后台：我独立完成课程作业的页面实现，使用 React 和 CSS 实现列表空态、错误提示以及适配手机的响应式布局。项目未上线，没有真实业务指标。",
  "已有技能：会 JavaScript、HTML、CSS，React 和 TypeScript 已在上述项目中使用。没有 Vue 项目经历，也没有自动化测试经验。",
  "校园摄影社团：参与活动海报设计和现场拍照，与前端开发的直接关联较弱。",
];
export function createResumeExample(): ResumeState {
  return { ...emptyResumeState(), source_name: "虚构示例 · 林知夏", source_text: EXAMPLE_PARAGRAPHS.join("\n\n"), target: { title: "前端开发实习生", company: "示例科技（虚构）", description: "面向 2027 届本科生。掌握 JavaScript、HTML、CSS。熟悉 React 或 Vue。了解 TypeScript，能使用 Git 协作。能对接 REST API。自动化测试经验优先。" }, header: { name: "林知夏（虚构示例）", headline: "前端开发实习生", contact: "linzhixia@example.com · 联系方式仅作示例" } };
}
function exampleFacts(): ResumeFact[] {
  return [
    { kind: "education", title: "软件工程本科", detail: EXAMPLE_PARAGRAPHS[0] },
    { kind: "projects", title: "校园活动报名项目", detail: "作为小组成员，使用 React、TypeScript 完成活动列表、条件筛选和报名表单校验，并使用 Git 协作；未负责后端与部署。" },
    { kind: "projects", title: "课程管理后台", detail: "独立完成课程作业的页面实现，使用 React 与 CSS 实现列表空态、错误提示及移动端响应式布局；项目未上线。" },
    { kind: "skills", title: "前端技术与使用边界", detail: "掌握 JavaScript、HTML、CSS；在上述项目中使用 React、TypeScript。暂无 Vue 项目与自动化测试经验。" },
    { kind: "experience", title: "校园摄影社团", detail: "参与活动海报设计与现场拍照。" },
  ].map((item, index) => ({ ...item, kind: item.kind as ResumeFact["kind"], id: "example-fact-" + index, quote: EXAMPLE_PARAGRAPHS[index], user_edited: false }));
}
function exampleSelection(state: ResumeState): ResumeSelection {
  const id = (index: number) => "example-fact-" + index;
  const requirements: ResumeSelection["requirements"] = [
    { quote: "面向 2027 届本科生", importance: "essential", status: "supported", fact_ids: [id(0)], note: "示例经历中明确提到学历与届别。" },
    { quote: "掌握 JavaScript、HTML、CSS", importance: "essential", status: "supported", fact_ids: [id(3)], note: "已有自述，仍可继续补充代码或作品链接。" },
    { quote: "熟悉 React 或 Vue", importance: "essential", status: "supported", fact_ids: [id(1), id(2)], note: "React 项目可以对应此项，不需要虚构 Vue 经验。" },
    { quote: "了解 TypeScript，能使用 Git 协作", importance: "essential", status: "supported", fact_ids: [id(1)], note: "报名项目里有明确实践。" },
    { quote: "能对接 REST API", importance: "essential", status: "unknown", fact_ids: [], note: "没有提供接口对接细节，不能把前端页面实现等同于已经完成接口对接。" },
    { quote: "自动化测试经验优先", importance: "preferred", status: "unknown", fact_ids: [], note: "本人明确尚无相关经验，这是加分项，不写成已有技能。" },
  ];
  return { requirements: requirements.map(row => { const fact_ids = row.fact_ids.filter(ref => state.facts.some(f => f.id === ref)); return { ...row, fact_ids, status: fact_ids.length ? row.status : "unknown" }; }), choices: state.facts.map(f => ({ fact_id: f.id, use: f.id === id(4) ? "omit" : f.id === id(2) ? "secondary" : "primary", reason: f.id === id(4) ? "与当前目标关联较弱；只从本次简历排除，原文仍然保留。" : f.id === id(2) ? "可补充响应式与异常状态经验，用较短篇幅展示。" : "与目标岗位的基础条件或核心要求直接相关。" })) };
}
function exampleBody(state: ResumeState): ResumeBody {
  const included = state.facts.filter(f => state.selection?.choices.some(c => c.fact_id === f.id && c.use !== "omit"));
  const kinds = ["education", "experience", "projects", "skills"] as const;
  const wording: Record<string, { title?: string; subtitle?: string; period?: string; bullets: string[] }> = {
    "example-fact-0": { title: "软件工程 · 本科", period: "2027 届", bullets: [] },
    "example-fact-1": { subtitle: "小组项目 · 前端成员", bullets: ["使用 React、TypeScript 实现活动列表与条件筛选，完成报名表单校验。", "通过 Git 与小组成员协作，负责前端页面和交互实现。"] },
    "example-fact-2": { subtitle: "课程作业 · 独立页面实现", bullets: ["使用 React 和 CSS 实现管理后台页面，包含列表空态、错误提示与移动端响应式布局。"] },
    "example-fact-3": { title: "前端开发与协作", bullets: ["JavaScript、HTML、CSS；React / TypeScript（项目实践）；Git（小组协作）。"] },
  };
  return { summary: { text: "", fact_ids: [] }, sections: kinds.filter(kind => included.some(f => f.kind === kind)).map(kind => ({ kind, entries: included.filter(f => f.kind === kind).map(f => ({ title: f.title, subtitle: "", period: "", fact_ids: [f.id], bullets: [f.detail], ...(!f.user_edited ? wording[f.id] : {}) })) })) };
}
/** 示例只演示交互；材料固定，步骤结果预设，绝不把示例分析当作真实模型调用。 */
export function changeResumeExample(previous: ResumeState, change: ResumeChange): ResumeState {
  const state = structuredClone(previous);
  if (change.type === "materials.save") { state.step = "facts"; }
  else if (change.type === "task.request") {
    state.pending = null;
    if (change.kind === "facts") { state.facts = exampleFacts(); state.facts_confirmed = false; state.questions = ["是否有仓库或可展示的作品？", "报名项目是否实际完成了接口对接？没有也可以如实保留。"] ; state.selection = null; state.selection_confirmed = false; state.body = null; state.step = "facts"; }
    else if (change.kind === "selection") { state.selection = exampleSelection(state); state.selection_confirmed = false; state.body = null; state.step = "selection"; }
    else { state.body = exampleBody(state); state.step = "editor"; }
    state.confirmed_at = null;
  } else if (change.type === "facts.confirm") { state.facts = change.facts; state.facts_confirmed = true; state.selection = null; state.selection_confirmed = false; state.body = null; state.confirmed_at = null; state.step = "selection"; }
  else if (change.type === "selection.confirm") { if (state.selection) state.selection.choices = change.choices; state.selection_confirmed = true; state.body = null; state.confirmed_at = null; state.step = "editor"; }
  else if (change.type === "document.save") { state.header = change.header; state.body = change.body; state.confirmed_at = null; state.step = "preview"; }
  else if (change.type === "document.confirm") { state.confirmed_at = new Date().toISOString(); }
  else { state.pending = null; }
  state.revision++; state.context_version++; state.updated_at = new Date().toISOString();
  return state;
}
