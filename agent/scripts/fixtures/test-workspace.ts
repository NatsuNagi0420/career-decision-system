/** 青穗集 · 独立开发测试资料：只初始化专用测试号，沿用正式状态机，重复运行保留已有修改。 */
import { CareerWorkspace, careerChangeInput } from "../../src/career.js";
import type { z } from "zod";
import { ConversationGuidance } from "../../src/guidance.js";
import { ResumeWorkspace } from "../../src/resume.js";
import { Profiles } from "../../src/profiles.js";
import { Secrets } from "../../src/secrets.js";
import { invariant } from "../../src/errors.js";
import { Store, now } from "../../src/store.js";
import type { Config } from "../../src/config.js";
import type { LearningChange } from "../../src/learning-contract.js";
import type { ResumeBody, ResumeChange } from "../../src/resume-contract.js";

export const testUsername = /^suinai_test_[a-f0-9]{8}$/;
type Identity = { user_id: number; issuer: string; subject: string; username: string };
export interface TestWorkspaceInput { userId: number; profileId: string; username: string; subject: string; seedKey: string }
export interface TestWorkspaceSummary { conversations: { id: string; title: string }[]; jobId: string; pathId: string; fictional: true }

export function prepareTestWorkspace(store: Store, config: Config, input: TestWorkspaceInput) {
  invariant(config.deploymentMode === "local", 403, "测试资料只能在本机开发服务初始化。");
  invariant(testUsername.test(input.username) && input.seedKey.length >= 32, 400, "只能初始化脚本专用测试账号。");
  const identity = store.db.prepare("SELECT user_id,issuer,subject,username FROM account_identities WHERE user_id=?").get(input.userId) as Identity | undefined;
  invariant(identity && identity.username === input.username && identity.subject === input.subject && identity.issuer === config.officialUrl.replace(/\/+$/, ""), 403, "测试账号身份与当前服务不匹配。");
  store.profile(input.userId, input.profileId);
  store.db.exec("CREATE TABLE IF NOT EXISTS development_workspaces(user_id INTEGER PRIMARY KEY REFERENCES users(id),seed_key TEXT NOT NULL,summary TEXT NOT NULL,created_at TEXT NOT NULL);");
  const career = new CareerWorkspace(store), resume = new ResumeWorkspace(store);
  const guidance = new ConversationGuidance(store, resume, new Profiles(store, new Secrets(), config), () => {});
  return store.transaction(() => {
    const previous = store.db.prepare("SELECT seed_key,summary FROM development_workspaces WHERE user_id=?").get(input.userId);
    if (previous) {
      invariant(previous.seed_key === input.seedKey, 403, "已有测试资料的归属不匹配，未修改任何内容。");
      return { created: false, summary: JSON.parse(String(previous.summary)) as TestWorkspaceSummary };
    }
    invariant(!store.conversations(input.userId).length && !career.get(input.userId).revision && !resume.get(input.userId).revision && !career.learning.get(input.userId).revision, 409, "账号已有资料，拒绝覆盖；请使用脚本新建的空白测试号。");
    const user = store.getUser(input.userId);
    const conversations = [
      { kind: "career" as const, title: "测试 · 画像与岗位方向" },
      { kind: "learning" as const, title: "测试 · 继续学习路线" },
      { kind: "resume" as const, title: "测试 · 修改与导出简历" },
    ].map(item => ({ ...item, conversation: store.createConversation(user.id, input.profileId, item.title) }));
    const careerId = conversations[0].conversation.id, resumeId = conversations[2].conversation.id;
    const education = "就读于示例大学软件工程专业，本科学历，应届毕业生。";
    const project = "在校园活动管理项目中负责 React 页面、表单校验和接口对接。";
    const secondProject = "在个人记账项目中实现数据筛选与本地保存。";
    const skills = "使用过 JavaScript、TypeScript、React、HTML、CSS、Git，能阅读基础 SQL。";
    const profile = { goal: "寻找杭州或远程的前端开发实习机会。", education, experience: project + secondProject, skills, preferences: "希望有导师指导，重视代码质量与正常作息。", weekly_hours: "每周可投入六小时学习。" };
    const changeCareer = (change: z.infer<typeof careerChangeInput>["change"]) => career.change(user.id, { revision: career.get(user.id).revision, change });
    changeCareer({ type: "profile.save", profile });
    const jd = "熟悉 JavaScript 和 TypeScript；能够使用 React 开发组件；了解接口请求与错误处理；能够使用 Git 协作；具备测试与调试意识。";
    changeCareer({ type: "job.add", job: { title: "前端开发实习（虚构测试）", company: "示例科技（虚构）", url: "", description: jd } });
    const job = career.get(user.id).jobs[0];
    const skillProposal = career.propose(user.id, careerId, { context_version: career.get(user.id).context_version, title: "测试资料 · 已有技能", data: { kind: "skills", skills: [
      { name: "React", stage: "project", evidence: [{ source_id: "profile.experience", quote: project }] },
      { name: "JavaScript", stage: "contact", evidence: [{ source_id: "profile.skills", quote: skills }] },
      { name: "TypeScript", stage: "contact", evidence: [{ source_id: "profile.skills", quote: skills }] },
      { name: "Git", stage: "contact", evidence: [{ source_id: "profile.skills", quote: skills }] },
    ] } });
    changeCareer({ type: "proposal.decide", id: skillProposal.proposal_id, approved: true });
    changeCareer({ type: "action.add", action: { title: "为校园活动表单补充错误提示", job_id: job.id, why: "补足目标岗位的错误处理要求。", learn: "异步请求、异常状态与可访问的表单提示", deliverable: "表单代码、错误状态截图和调试记录" } });
    changeCareer({ type: "action.update", id: career.get(user.id).actions[0].id, status: "doing", result: "" });
    changeCareer({ type: "action.add", action: { title: "整理项目的 Git 协作说明", job_id: job.id, why: "让项目经历具备可回看的实现依据。", learn: "分支、提交与代码审查", deliverable: "README 中的协作流程说明" } });

    const learning = career.learning;
    const changeLearning = (change: LearningChange) => learning.change(user.id, { revision: learning.get(user.id).revision, change });
    const learningProposal = learning.propose(user.id, conversations[1].conversation.id, { revision: 0, context_version: career.get(user.id).context_version, path_id: null, path: {
      job_id: job.id, title: "前端实习学习路线（虚构测试）", summary: "从类型基础出发，练习组件，再补充错误处理。预置进度仅供测试。", nodes: [
        { key: "typescript", title: "TypeScript 类型基础", requirement: "熟悉 JavaScript 和 TypeScript", objective: "能为函数参数与返回值定义类型。", estimated_minutes: 60, prerequisites: [], search_query: "TypeScript 类型基础 入门 教程", exercise: "为记账金额的筛选函数补充类型。", deliverable: "函数代码与输入输出说明" },
        { key: "react", title: "React 表单与组件", requirement: "能够使用 React 开发组件", objective: "实现一个具有校验与反馈的表单组件。", estimated_minutes: 120, prerequisites: ["typescript"], search_query: "React 表单 校验 组件 教程", exercise: "为校园活动报名页增加校验与错误提示。", deliverable: "组件代码与交互截图" },
        { key: "requests", title: "请求、异常与调试", requirement: "了解接口请求与错误处理", objective: "区分加载、成功、失败并记录调试过程。", estimated_minutes: 90, prerequisites: ["react"], search_query: "前端 fetch 错误处理 调试 教程", exercise: "为报名请求增加失败提示和重试。", deliverable: "成功与失败场景的演示和调试记录" },
      ],
    } });
    changeLearning({ type: "proposal.decide", id: learningProposal.proposal_id, approved: true });
    const path = learning.get(user.id).paths[0];
    changeLearning({ type: "node.update", path_id: path.id, key: "typescript", status: "done", notes: "虚构测试进度：已完成基础章节。", result: "[虚构测试成果] 已为筛选函数补充类型，并检查了正常输入和空输入。" });
    changeLearning({ type: "node.update", path_id: path.id, key: "react", status: "doing", notes: "虚构测试进度：正在练习表单校验。", result: "" });
    const comparison = career.propose(user.id, careerId, { context_version: career.get(user.id).context_version, title: "测试资料 · 岗位对照", data: { kind: "comparison", job_id: job.id, summary: "已有 React 项目基础；错误处理与测试仍需补充可回看的练习。", checks: [
      { requirement: "能够使用 React 开发组件", assessment: "partial", reason: "有页面实现经历，尚需展示组件拆分与复用。", evidence: [{ source_id: "profile.experience", quote: project }] },
      { requirement: "具备测试与调试意识", assessment: "unknown", reason: "目前没有测试实践原文，不能推断已掌握。", evidence: [] },
    ] } });
    changeCareer({ type: "proposal.decide", id: comparison.proposal_id, approved: true });

    const changeResume = (change: ResumeChange) => resume.change(user.id, { revision: resume.get(user.id).revision, change });
    changeResume({ type: "materials.save", source_name: "开发测试资料（人物、经历与岗位均为虚构）", source_text: ["以下全部为虚构测试资料，不能作为真实求职材料。", education, project, secondProject, skills].join("\n"), target: { title: job.title, company: job.company, description: jd } });
    const proposeResume = (data: unknown) => resume.propose(user.id, resumeId, { request_id: resume.get(user.id).pending!.id, data });
    changeResume({ type: "task.request", kind: "facts" });
    proposeResume({ kind: "facts", facts: [
      { kind: "education", title: "示例大学 · 软件工程", detail: education, quote: education },
      { kind: "projects", title: "校园活动管理项目", detail: project, quote: project },
      { kind: "projects", title: "个人记账项目", detail: secondProject, quote: secondProject },
      { kind: "skills", title: "前端技术基础", detail: skills, quote: skills },
    ], questions: [] });
    changeResume({ type: "facts.confirm", facts: resume.get(user.id).facts });
    const [edu, activity, ledger, skill] = resume.get(user.id).facts;
    changeResume({ type: "task.request", kind: "selection" });
    proposeResume({ kind: "selection", selection: { requirements: [
      { quote: "能够使用 React 开发组件", importance: "essential", status: "partial", fact_ids: [activity.id], note: "重点展示已有页面与表单实现，不虚构组件库经验。" },
      { quote: "熟悉 JavaScript 和 TypeScript", importance: "essential", status: "partial", fact_ids: [skill.id], note: "保留已使用技术的事实，熟练度仍需实践证明。" },
      { quote: "具备测试与调试意识", importance: "preferred", status: "unknown", fact_ids: [], note: "资料中没有测试经历，暂不补写。" },
    ], choices: [edu, activity, ledger, skill].map(fact => ({ fact_id: fact.id, use: fact.id === ledger.id ? "secondary" : "primary", reason: fact.id === ledger.id ? "作为补充项目，简洁展示。" : "与求职背景和目标方向相关。" })) } });
    changeResume({ type: "selection.confirm", choices: resume.get(user.id).selection!.choices });
    const body: ResumeBody = { summary: { text: "软件工程应届生，使用 React 完成校园活动页面、表单校验和接口对接，希望从前端实习开始积累工程实践。", fact_ids: [edu.id, activity.id] }, sections: [
      { kind: "education", entries: [{ title: "示例大学", subtitle: "软件工程 · 本科 · 应届", period: "", fact_ids: [edu.id], bullets: [] }] },
      { kind: "projects", entries: [
        { title: "校园活动管理项目", subtitle: "前端页面开发", period: "", fact_ids: [activity.id], bullets: ["使用 React 实现校园活动页面。", "负责表单校验与接口对接。"] },
        { title: "个人记账项目", subtitle: "个人练习", period: "", fact_ids: [ledger.id], bullets: ["实现记账数据筛选与本地保存。"] },
      ] },
      { kind: "skills", entries: [{ title: "技术基础", subtitle: "", period: "", fact_ids: [skill.id], bullets: ["使用过 JavaScript、TypeScript、React、HTML、CSS、Git。", "能阅读基础 SQL。"] }] },
    ] };
    changeResume({ type: "task.request", kind: "rewrite" });
    proposeResume({ kind: "rewrite", body });
    changeResume({ type: "document.save", header: { name: "林穗（虚构测试）", headline: "前端开发实习", contact: "test@example.invalid" }, body });
    changeResume({ type: "document.confirm" });

    const starters = [
      ["[预置虚构测试资料] 我是林穗。" + Object.values(profile).join("\n"), "[预置测试说明] 画像、技能、目标岗位和行动已准备好。可以查看职业画像，或直接问：帮我比较当前基础与目标岗位的差距。"],
      ["[预置虚构测试资料] 我已选定前端实习方向，每周可学习六小时。类型基础已学完，正在练习 React 表单。", "[预置测试说明] 学习路线已保存，当前停在 React 表单与组件。可以打开学习路线，搜索教程、记录笔记和提交成果，也可以继续聊学习中的问题。"],
      ["[预置虚构测试资料] 我已有一份基于校园活动和记账项目的简历草稿，请在这些已有事实范围内帮我改进。", "[预置测试说明] 简历草稿与来源已准备好。可以打开简历预览，框选项目经历并要求修改，或直接测试导出。所有人物、经历和岗位均为虚构。"],
    ];
    conversations.forEach((item, index) => {
      guidance.change(user, item.conversation.id, { revision: 0, kind: item.kind, ...(item.kind === "resume" ? { reuse_shared_resume: true } : {}) });
      store.message(item.conversation.id, null, "user", starters[index][0]);
      store.message(item.conversation.id, null, "assistant", starters[index][1]);
    });
    store.updateOnboarding(user.id, { status: "skipped", step: 0 });
    const summary: TestWorkspaceSummary = { conversations: conversations.map(item => ({ id: item.conversation.id, title: item.title })), jobId: job.id, pathId: path.id, fictional: true };
    store.db.prepare("INSERT INTO development_workspaces(user_id,seed_key,summary,created_at) VALUES(?,?,?,?)").run(user.id, input.seedKey, JSON.stringify(summary), now());
    return { created: true, summary };
  });
}
