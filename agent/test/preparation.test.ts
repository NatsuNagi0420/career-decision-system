/** 青穗集 · 求职准备回归：持久问答、分支回退、试卷保密、真实依据与训练资料隔离。 */
import test from "node:test";
import assert from "node:assert/strict";
import { CareerWorkspace } from "../src/career.js";
import { id } from "../src/store.js";
import { startPreparationInput, type PreparationMode } from "../src/preparation-contract.js";
import type { z } from "zod";
import { fixture, reply, tool } from "./helpers.js";
import type { Run, RunOptions } from "../src/types.js";
type StartPreparationInput = z.infer<typeof startPreparationInput>;

type Fixture = Awaited<ReturnType<typeof fixture>>;
function seed(f: Fixture) {
  const career = f.runtime.career;
  for (const title of ["前端实习", "全栈实习"]) career.change(f.user.id, { revision: career.get(f.user.id).revision,
    change: { type: "job.add", job: { title, company: "模拟岗位", url: "", description: "掌握 TypeScript，能够进行组件开发。" } } });
  return { career, preparation: career.preparation, jobs: career.get(f.user.id).jobs };
}
async function round(f: Fixture, input: string, call?: () => ReturnType<typeof tool>, options: RunOptions = {}) {
  let used = false;
  f.model.respond = request => {
    if (!request.tools.length) return reply(JSON.stringify({ summary: "只总结实际聊天", next_step: "继续交流", suggestion: null, memories: [] }));
    if (call && !used) { used = true; return reply("", [call()]); }
    return reply("已收到。");
  };
  const run = f.runtime.start(f.user, f.conversation.id, f.profile.id, input, id(), options);
  await f.runtime.waitIdle();
  return f.store.run(f.user.id, run.id);
}
const question = { topic: "类型收窄", prompt: "请说明如何安全处理 string | null。", requirement: "掌握 TypeScript", rubric: ["检查空值"], reference_answer: "先判断 null 再读取字符串。" };
function startInput(f: Fixture, jobId: string, mode: PreparationMode = "practice", total = 2): StartPreparationInput {
  return { revision: f.runtime.career.preparation.view(f.user.id).revision, job_id: jobId, mode,
    background: "模拟开发团队的技术交流，不代表真实企业面试。", focus: ["类型安全"], total, bank_ids: [],
    questions: Array.from({ length: mode === "interview" ? 1 : total }, () => ({ ...question })) };
}
function evaluation(f: Fixture, run: Run, followup: typeof question | null = null) {
  const session = f.runtime.career.preparation.view(f.user.id).sessions[0];
  return { session_id: session.id, question_id: session.questions[session.answers.length].id, answer_quote: run.input,
    verdict: "partial" as const, strengths: ["指出了空值风险"], gaps: ["还需要具体检查方法"], next_exercise: "补写一个空值保护分支", followup };
}

test("求职准备接口鉴权、账号隔离、持久化且未作答时不暴露答案", async t => {
  const f = await fixture(t), s = seed(f);
  assert.equal((await f.app.inject({ url: "/api/v1/agent/career/preparation" })).statusCode, 401);
  const payload = startInput(f, s.jobs[0].id);
  await round(f, "穗奈，我想针对前端实习做一轮岗位练习。", () => tool("start_career_preparation", payload));
  const startingRequest = f.model.requests.find(request => request.tools.some(tool => tool.name === "start_career_preparation"))!;
  assert.ok(startingRequest.tools.length <= 20);
  assert.ok(!startingRequest.tools.some(tool => tool.name === "write_file"));
  const response = await f.app.inject({ url: "/api/v1/agent/career/preparation", headers: f.headers });
  assert.equal(response.statusCode, 200, response.body);
  assert.equal(response.json().sessions[0].questions.length, 1);
  assert.ok(!response.body.includes("reference_answer"));
  assert.ok(!response.body.includes("rubric"));
  const other = f.auth.register("prep_other", "Only-a-test-password", false);
  const isolated = await f.app.inject({ url: "/api/v1/agent/career/preparation", headers: { ...f.headers, authorization: "Bearer " + other.token } });
  assert.equal(isolated.json().sessions.length, 0);
  assert.equal(new CareerWorkspace(f.store).preparation.view(f.user.id).sessions.length, 1);
  const bank = await f.app.inject({ url: "/api/v1/agent/career/preparation/questions?query=TypeScript", headers: f.headers });
  assert.ok(bank.json().questions.some((q: { id: string }) => q.id === "ts-narrowing"));
  assert.ok(!bank.body.includes("reference_answer"));
});

test("练习由真实用户轮次推进，重试不重复出题或记分，不能使用模型示范作答", async t => {
  const f = await fixture(t), s = seed(f), input = startInput(f, s.jobs[0].id);
  input.bank_ids = ["ts-narrowing", "react-state"]; input.questions = [];
  const started = await round(f, "用整理题练习", () => tool("start_career_preparation", input));
  assert.equal(s.preparation.start(started, input).session.id, s.preparation.view(f.user.id).sessions[0].id);
  assert.equal(s.preparation.view(f.user.id).sessions.length, 1);
  assert.equal(s.preparation.view(f.user.id).sessions[0].questions[0].origin, "curated");
  assert.throws(() => s.preparation.review(started, evaluation(f, started)), /等用户回答/);
  const answer = await round(f, "应该先处理空值风险。");
  const data = evaluation(f, answer);
  assert.throws(() => s.preparation.review(answer, { ...data, answer_quote: "模型编造的回答" }), /真实提交/);
  s.preparation.review(answer, data);
  s.preparation.review(answer, data);
  const session = s.preparation.view(f.user.id).sessions[0];
  assert.equal(session.answers.length, 1); assert.equal(session.questions.length, 2);
  assert.ok(session.questions[0].reference_answer); assert.equal(session.questions[1].reference_answer, undefined);
});

test("试卷交卷前接口和聊天都不泄漏反馈，交卷后可复盘，忙碌状态不允许交卷", async t => {
  const f = await fixture(t), s = seed(f);
  await round(f, "开始模拟试卷", () => tool("start_career_preparation", startInput(f, s.jobs[0].id, "exam")));
  const answer = await round(f, "先检查空值。");
  const reviewed = s.preparation.review(answer, evaluation(f, answer));
  assert.ok(!reviewed.message.includes("关键点比较"));
  assert.ok(!reviewed.message.includes("还需要具体"));
  const before = s.preparation.view(f.user.id);
  assert.equal(before.sessions[0].answers[0].verdict, undefined);
  assert.equal(before.sessions[0].questions[0].reference_answer, undefined);
  f.store.setStatus(answer, "running");
  assert.throws(() => s.preparation.change(f.user.id, { revision: before.revision, change: { type: "session.status", id: before.sessions[0].id, status: "completed" } }), /等待|进行|运行|任务/);
  f.store.setStatus(answer, "completed");
  const after = s.preparation.change(f.user.id, { revision: before.revision, change: { type: "session.status", id: before.sessions[0].id, status: "completed" } });
  assert.equal(after.sessions[0].answers[0].verdict, "partial");
  assert.equal(after.sessions[0].questions[0].reference_answer, question.reference_answer);
  assert.match(s.preparation.instructions(f.user.id, f.conversation.id), /已经结束/);
  const restart = await round(f, "穗奈，我想做一轮模拟面试。请开始全新一轮。", () => tool("start_career_preparation", startInput(f, s.jobs[0].id, "interview")));
  assert.equal(s.preparation.isTrainingRun(restart.id), true);
  assert.equal(s.preparation.view(f.user.id).sessions[0].mode, "interview");
  assert.equal(s.preparation.view(f.user.id).sessions[0].status, "active");
});

test("文字面试逐题动态追问，拒绝其他会话、错误题目和虚构JD", async t => {
  const f = await fixture(t), s = seed(f);
  const initial = startInput(f, s.jobs[0].id, "interview");
  initial.questions.push({ ...question, prompt: "不应提前采用的追问", requirement: "尚未核对的其他要求" });
  await round(f, "开始面试", () => tool("start_career_preparation", initial));
  assert.equal(s.preparation.view(f.user.id).sessions[0].questions.length, 1);
  const answer = await round(f, "我会先考虑空值的风险。");
  const data = evaluation(f, answer, { ...question, prompt: "能给出具体的空值检查分支吗？" });
  assert.throws(() => s.preparation.review({ ...answer, conversation_id: f.store.createConversation(f.user.id, f.profile.id).id }, data), /本会话/);
  assert.throws(() => s.preparation.review(answer, { ...data, question_id: id() }), /题目已经/);
  assert.throws(() => s.preparation.review(answer, { ...data, followup: { ...question, requirement: "必须有十年经验" } }), /真实岗位/);
  assert.throws(() => s.preparation.review(answer, { ...data, followup: null }), /生成下一道/);
  s.career.change(f.user.id, { revision: s.career.get(f.user.id).revision, change: { type: "job.delete", id: s.jobs[0].id } });
  s.preparation.review(answer, data);
  const session = s.preparation.view(f.user.id).sessions[0];
  assert.equal(session.questions.length, 2); assert.match(session.questions[1].prompt, /具体的空值/);
  assert.equal(session.questions[1].reference_answer, undefined);
  assert.equal(session.stale, true);
});

test("编辑已作答消息会回退题目和追问，回退启动消息清理练习分支，永久删除同步清理", async t => {
  const f = await fixture(t), s = seed(f);
  const started = await round(f, "开始文字面试", () => tool("start_career_preparation", startInput(f, s.jobs[0].id, "interview")));
  const answer = await round(f, "先检查是否为空。");
  s.preparation.review(answer, evaluation(f, answer, { ...question, prompt: "旧追问" }));
  const answerMessage = f.store.messages(f.conversation.id).find(m => m.role === "user" && m.run_id === answer.id)!;
  const edited = await round(f, "使用 value !== null 检查。", () => tool("review_career_answer", evaluation(f, { ...answer, input: "使用 value !== null 检查。" }, { ...question, prompt: "新追问" })), { replaces_message_id: answerMessage.id });
  assert.equal(edited.status, "completed");
  const session = s.preparation.view(f.user.id).sessions[0];
  assert.equal(session.answers.length, 1); assert.equal(session.answers[0].text, "使用 value !== null 检查。");
  assert.equal(session.questions[1].prompt, "新追问");
  const startMessage = f.store.messages(f.conversation.id).find(m => m.role === "user" && m.run_id === started.id)!;
  await round(f, "我们换个话题", undefined, { replaces_message_id: startMessage.id });
  assert.equal(s.preparation.view(f.user.id).sessions.length, 0);
  await round(f, "再练习一次", () => tool("start_career_preparation", startInput(f, s.jobs[0].id)));
  await f.runtime.deleteConversation(f.user, f.conversation.id);
  assert.equal(s.preparation.view(f.user.id).sessions.length, 0);
  assert.equal(f.store.db.prepare("SELECT COUNT(*) AS n FROM preparation_turns").get()?.n, 0);
});

test("训练轮次不触发个人记忆与画像整理，后续普通聊天分析也排除历史模拟回答", async t => {
  const f = await fixture(t), s = seed(f);
  await round(f, "开始一题面试", () => tool("start_career_preparation", startInput(f, s.jobs[0].id, "interview", 1)));
  const answer = await round(f, "模拟回答：我曾主导虚构的百万用户项目。");
  s.preparation.review(answer, evaluation(f, answer));
  const source = f.store.messages(f.conversation.id).find(m => m.run_id === answer.id && m.role === "user")!;
  const previous = f.model.requests.length;
  await f.runtime.guidance.analyze(f.user, f.conversation.id, f.profile.id, source.id, true);
  assert.equal(f.model.requests.length, previous);
  const actual = await round(f, "我的真实目标是找前端实习。");
  const realSource = f.store.messages(f.conversation.id).find(m => m.run_id === actual.id && m.role === "user")!;
  await f.runtime.guidance.analyze(f.user, f.conversation.id, f.profile.id, realSource.id, true);
  const request = f.model.requests.at(-1)!;
  assert.ok(!JSON.stringify(request.messages).includes("主导虚构的百万用户"));
  assert.ok(JSON.stringify(request.messages).includes("真实目标"));
  assert.equal(s.career.get(f.user.id).profile.experience, "");
  const trainingRequest = f.model.requests.find(request => request.tools.some(tool => tool.name === "review_career_answer") && !request.tools.some(tool => tool.name === "propose_career_update"));
  assert.ok(trainingRequest);
});

test("岗位比较要求原文依据，选择由本人保存，资料变化需重新比较", async t => {
  const f = await fixture(t), s = seed(f);
  const run = await round(f, "帮我比较岗位");
  const input = { revision: 0, context_version: s.career.get(f.user.id).context_version, title: "两个方向的取舍",
    options: s.jobs.map(job => ({ job_id: job.id, attraction: "有组件实践机会", preparation_cost: "投入时间待确认", tradeoff: "广度与深度需要取舍", unknowns: ["团队培养方式"], evidence: [{ source_id: "job." + job.id, quote: "掌握 TypeScript" }] })), next_question: "你更想先深入前端还是尝试全栈？" };
  assert.throws(() => s.preparation.proposeDecision(run, { ...input, options: input.options.map(option => ({ ...option, evidence: [{ source_id: "job." + option.job_id, quote: "月薪五万" }] })) }), /逐字引用/);
  s.preparation.proposeDecision(run, input);
  const board = s.preparation.view(f.user.id).boards[0];
  assert.equal(board.primary_job_id, null);
  const change = { type: "decision.select", id: board.id, primary_job_id: s.jobs[0].id, backup_job_ids: [s.jobs[1].id], reason: "先深入组件开发" };
  s.preparation.change(f.user.id, { revision: 1, change });
  assert.equal(s.preparation.view(f.user.id).boards[0].primary_job_id, s.jobs[0].id);
  s.career.change(f.user.id, { revision: s.career.get(f.user.id).revision, change: { type: "profile.save", profile: { goal: "前端", education: "", experience: "", skills: "", preferences: "", weekly_hours: "每周三小时" } } });
  assert.equal(s.preparation.view(f.user.id).boards[0].stale, true);
  assert.throws(() => s.preparation.change(f.user.id, { revision: 2, change }), /重新比较/);
});
