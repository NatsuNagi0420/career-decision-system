/** 青穗集 · 对话简历回归：无 JD 的增量收集、来源约束、恢复隔离、亲自确认及固定替身的工具循环。 */
import test from "node:test";
import assert from "node:assert/strict";
import { fixture, ScriptedModel, reply, tool } from "./helpers.js";
import { id } from "../src/store.js";
import type { ResumeChange } from "../src/resume-contract.js";
import type { Run } from "../src/types.js";
import { guidedToolAllowed } from "../src/guidance.js";
import { executeTool, toolDefinitionsFor } from "../src/tools.js";
type Fixture = Awaited<ReturnType<typeof fixture>>;
function change(f: Fixture, value: ResumeChange) { return f.runtime.resume.change(f.user.id, { revision: f.runtime.resume.get(f.user.id).revision, change: value }); }
const quote = "我用 React 和 TypeScript 写了报名表单，后端不是我做的。";
const fact = { kind: "projects", title: "报名表单", detail: "使用 React 和 TypeScript 实现报名表单；未负责后端。", quote };
function capture(f: Fixture, cid: string, text = quote) {
  return f.runtime.resume.capture(f.user.id, cid, { context_version: f.runtime.resume.get(f.user.id).context_version, section: "experience", quote: text, source: { kind: "message" } }, text, "对话原文");
}
function prepare(f: Fixture, cid: string, kind: "facts" | "selection" | "rewrite") { return f.runtime.resume.prepare(f.user.id, cid, { context_version: f.runtime.resume.get(f.user.id).context_version, kind }); }
function propose(f: Fixture, cid: string, data: unknown) { return f.runtime.resume.propose(f.user.id, cid, { request_id: f.runtime.resume.get(f.user.id).pending!.id, data }); }

test("明确要求复用职业画像时可安全进入简历材料，岗位样本和未确认内容仍被拒绝", async t => {
  const f = await fixture(t);
  const profile = { goal: "寻找全栈实习", education: "软件工程专业，在校。", experience: "使用 React 与 SpringBoot 完成课程项目。", skills: "React、SpringBoot。", preferences: "优先南京。", weekly_hours: "每周实习 4 天。" };
  f.runtime.career.change(f.user.id, { revision: 0, change: { type: "profile.save", profile } });
  assert.equal(guidedToolAllowed("resume", "read_career_context"), true);
  const run = { id: id(), user_id: f.user.id, conversation_id: f.conversation.id, input: "根据当前画像生成简历" } as Run;
  const captureCall = tool("capture_resume_material", {
    context_version: f.runtime.resume.get(f.user.id).context_version,
    section: "experience",
    quote: profile.experience,
    source: { kind: "career_context", source_id: "profile.experience" },
  });
  const recorded = await executeTool(captureCall, run, f.workspace, f.runtime.sandbox, new AbortController().signal, f.runtime.career, f.runtime.resume);
  assert.equal((recorded.value as { status: string }).status, "recorded_not_confirmed");
  const resumeState = f.runtime.resume.get(f.user.id);
  assert.ok(resumeState.source_text.includes(profile.experience));
  assert.equal(guidedToolAllowed("resume", "prepare_resume_step", resumeState), true);

  const jobChange = f.runtime.career.change(f.user.id, { revision: f.runtime.career.get(f.user.id).revision, change: { type: "job.add", job: { title: "全栈实习", company: "样本公司", url: "", description: "熟悉 React。" } } });
  const jobId = jobChange.jobs[0]!.id;
  await assert.rejects(() => executeTool(tool("capture_resume_material", {
    context_version: f.runtime.resume.get(f.user.id).context_version,
    section: "experience",
    quote: "熟悉 React。",
    source: { kind: "career_context", source_id: "job." + jobId },
  }), run, f.workspace, f.runtime.sandbox, new AbortController().signal, f.runtime.career, f.runtime.resume), /岗位样本只能/);
  await assert.rejects(() => executeTool(tool("capture_resume_material", {
    context_version: f.runtime.resume.get(f.user.id).context_version,
    section: "experience",
    quote: profile.preferences,
    source: { kind: "career_context", source_id: "profile.preferences" },
  }), run, f.workspace, f.runtime.sandbox, new AbortController().signal, f.runtime.career, f.runtime.resume), /偏好与时间约束/);
});

test("进入简历对话不要求模型或 JD，可恢复同一会话并隔离账号", async t => {
  const f = await fixture(t);
  const request = () => f.app.inject({ method: "POST", url: "/api/v1/agent/resume/conversation", headers: f.headers, payload: {} });
  assert.equal((await f.app.inject({ method: "POST", url: "/api/v1/agent/resume/conversation", payload: {} })).statusCode, 401);
  const response = await request(); assert.equal(response.statusCode, 200);
  const conversation = response.json(); assert.equal(conversation.mode, "resume");
  assert.equal((await request()).json().id, conversation.id);
  assert.equal(f.store.messages(conversation.id).length, 1);
  assert.match(f.store.messages(conversation.id)[0].content, /不用先填表/);
  const other = f.auth.register("coach_other", "Test-password-2026", true);
  const otherConversation = f.runtime.openResumeConversation(other.user, null);
  assert.notEqual(otherConversation.id, conversation.id);
  assert.throws(() => f.runtime.resume.coachingContext(other.user.id, conversation.id), /对话不存在/);
  conversation.archived = true; f.store.updateConversation(conversation);
  assert.notEqual((await request()).json().id, conversation.id);
});

test("增量记录原句无需 JD，保留版本并拒绝猜测、越权与旧版本", async t => {
  const f = await fixture(t), conversation = f.runtime.openResumeConversation(f.user, f.profile.id);
  // 普通主对话也可以按用户要求整理简历，无需离开当前对话。
  assert.equal(f.runtime.resume.coachingContext(f.user.id, f.conversation.id).source_text, "");
  const result = capture(f, conversation.id);
  let state = f.runtime.resume.get(f.user.id); assert.equal(state.source_text, quote); assert.equal(state.target.description, ""); assert.equal(state.facts_confirmed, false);
  capture(f, conversation.id); assert.equal(f.runtime.resume.get(f.user.id).revision, state.revision);
  assert.throws(() => f.runtime.resume.capture(f.user.id, conversation.id, { context_version: state.context_version, section: "experience", quote: "我负责了全栈", source: { kind: "message" } }, quote, "对话"), /只能记录/);
  assert.throws(() => f.runtime.resume.capture(f.user.id, conversation.id, { context_version: state.context_version, section: "direction", quote: "我想找前端实习", title: "算法工程师", source: { kind: "message" } }, "我想找前端实习", "对话"), /岗位名称必须/);
  const direction = "我想找前端实习";
  f.runtime.resume.capture(f.user.id, conversation.id, { context_version: result.context_version, section: "direction", quote: direction, title: "前端实习", source: { kind: "message" } }, direction, "对话");
  assert.throws(() => f.runtime.resume.capture(f.user.id, conversation.id, { context_version: result.context_version, section: "experience", quote, source: { kind: "message" } }, quote, "对话"), /材料已更新/);
  state = f.runtime.resume.get(f.user.id);
  assert.equal(state.target.title, "前端实习"); assert.equal(state.target.description, "");
  assert.equal(f.runtime.career.get(f.user.id).profile.experience, "");
});

test("没有 JD 也能从经历到方向版简历，但不能跳过两次亲自确认", async t => {
  const f = await fixture(t), conversation = f.runtime.openResumeConversation(f.user, f.profile.id), cid = conversation.id;
  capture(f, cid); prepare(f, cid, "facts"); propose(f, cid, { kind: "facts", facts: [fact], questions: [] });
  assert.throws(() => prepare(f, cid, "selection"), /亲自确认经历/);
  let state = change(f, { type: "facts.confirm", facts: f.runtime.resume.get(f.user.id).facts });
  const choices = state.facts.map(item => ({ fact_id: item.id, use: "primary" as const, reason: "具体展示前端实践，不增加负责范围。" }));
  prepare(f, cid, "selection");
  assert.throws(() => propose(f, cid, { kind: "selection", selection: { requirements: [{ quote: "会 Vue", importance: "preferred", status: "unknown", fact_ids: [], note: "无依据" }], choices } }), /没有 JD/);
  propose(f, cid, { kind: "selection", selection: { requirements: [], choices } });
  assert.throws(() => prepare(f, cid, "rewrite"), /确认本次简历/);
  state = change(f, { type: "selection.confirm", choices }); prepare(f, cid, "rewrite");
  propose(f, cid, { kind: "rewrite", body: { summary: { text: "", fact_ids: [] }, sections: [{ kind: "projects", entries: [{ title: "报名表单", subtitle: "", period: "", fact_ids: [state.facts[0].id], bullets: [fact.detail] }] }] } });
  state = f.runtime.resume.get(f.user.id); assert.ok(state.body); assert.equal(state.confirmed_at, null);
  assert.throws(() => f.runtime.resume.confirmed(f.user.id, state.revision), /先确认/);
  capture(f, cid, "补充：这个项目是课程作业，还没有上线。");
  const next = f.runtime.resume.get(f.user.id); assert.equal(next.body, null); assert.equal(next.facts_confirmed, false); assert.ok(next.source_text.includes(quote));
});

test("旧简历对话与普通主对话共享职业工具，按需保存原句而非强制简历追问", async t => {
  let f: Fixture;
  const model = new ScriptedModel((request, index) => {
    if (index === 0) {
      assert.match(request.messages[0].content, /不是问卷主持人/);
      assert.ok(request.tools.some(t => t.name === "capture_resume_material"));
      assert.ok(request.tools.some(t => t.name === "read_career_context"));
      assert.ok(request.tools.some(t => t.name === "run_command"));
      return reply("", [tool("read_resume_context", {})]);
    }
    if (index === 1) return reply("", [tool("capture_resume_material", { context_version: f.runtime.resume.get(f.user.id).context_version, section: "experience", quote, source: { kind: "message" } })]);
    return reply("你亲手负责的表单值得写，后端就不写成你的贡献。这个项目上线使用了吗？没有数据也没关系。");
  });
  f = await fixture(t, { model });
  const conversation = f.runtime.openResumeConversation(f.user, f.profile.id);
  const run = f.runtime.start(f.user, conversation.id, f.profile.id, quote, id()); await f.runtime.waitIdle();
  assert.equal(f.store.run(f.user.id, run.id).status, "completed"); assert.equal(f.runtime.resume.get(f.user.id).source_text, quote);
  assert.equal(f.runtime.resume.get(f.user.id).facts_confirmed, false);
  f.runtime.start(f.user, f.conversation.id, f.profile.id, "你好", id()); await f.runtime.waitIdle();
  const ordinary = model.requests.at(-1)!; assert.match(ordinary.messages[0].content, /简历只是求职|到求职阶段/);
  assert.match(ordinary.messages[0].content, /不切换或新开对话/);
  assert.ok(ordinary.tools.some(t => t.name === "run_command")); assert.ok(ordinary.tools.some(t => t.name === "capture_resume_material"));
});

test("草稿提交后仍可自然解释，不用旧版固定提示打断对话，且不能自动确认", async t => {
  let f: Fixture;
  const model = new ScriptedModel((_request, index) => {
    if (index === 0) return reply("", [tool("prepare_resume_step", { context_version: f.runtime.resume.get(f.user.id).context_version, kind: "facts" })]);
    if (index === 1) return reply("", [tool("propose_resume_update", { request_id: f.runtime.resume.get(f.user.id).pending!.id, data: { kind: "facts", facts: [fact], questions: [] } })]);
    return reply("我把你负责的表单和团队其他工作分开了，这样更清楚。下面这段小结符合实际吗？");
  });
  f = await fixture(t, { model }); const conversation = f.runtime.openResumeConversation(f.user, f.profile.id);
  capture(f, conversation.id);
  const run = f.runtime.start(f.user, conversation.id, f.profile.id, "先帮我整理一下刚才说的经历", id()); await f.runtime.waitIdle();
  assert.equal(f.store.run(f.user.id, run.id).status, "completed");
  assert.equal(f.runtime.resume.get(f.user.id).facts_confirmed, false);
  assert.match(f.store.messages(conversation.id).at(-1)!.content, /团队其他工作分开/);
  assert.equal(model.requests.length, 3);
});

test("收集导入材料只接受当前会话的 inputs 文本，不接受 outputs 或模型自行编写", async t => {
  const f = await fixture(t), conversation = f.runtime.openResumeConversation(f.user, f.profile.id);
  const artifact = await f.workspace.write(conversation.id, null, "outputs/fake.md", quote);
  const run = f.runtime.start(f.user, conversation.id, f.profile.id, "看看这段经历", id()); await f.runtime.waitIdle();
  await assert.rejects(() => executeTool(tool("capture_resume_material", { context_version: 0, section: "experience", quote, source: { kind: "input_file", path: artifact.path } }), run, f.workspace, f.runtime.sandbox, new AbortController().signal, f.runtime.career, f.runtime.resume), /当前对话导入/);
  assert.equal(f.runtime.resume.get(f.user.id).source_text, "");
  const input = await f.workspace.import(conversation.id, "old-resume.md", Buffer.from(quote).toString("base64"));
  const recorded = await executeTool(tool("capture_resume_material", { context_version: 0, section: "experience", quote, source: { kind: "input_file", path: input.path } }), run, f.workspace, f.runtime.sandbox, new AbortController().signal, f.runtime.career, f.runtime.resume);
  assert.ok(recorded.value); assert.equal(f.runtime.resume.get(f.user.id).source_text, quote);
  assert.ok(toolDefinitionsFor(f.runtime.sandbox, "test").some(t => t.name === "prepare_resume_step"));
});
