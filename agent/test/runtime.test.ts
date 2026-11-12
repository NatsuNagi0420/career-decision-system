/** 青穗集 · 执行核心回归：真实文件与 SQLite，模型和命令仅为可控测试替身。 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  fixture,
  ScriptedModel,
  reply,
  tool,
  noSandbox,
  TEST_KEY,
} from "./helpers.js";
import { id } from "../src/store.js";
import { Runtime } from "../src/runtime.js";
import type { ContextPack } from "../src/context.js";
import type { Run, Sandbox } from "../src/types.js";

test("导入→计划→读取→写文件→下一轮精简，产生真实不可变 v1/v2，事件能恢复", async (t) => {
  const model = new ScriptedModel((request, index) => {
    if (index === 0)
      return reply("", [
        tool("plan_tasks", {
          steps: [
            { title: "阅读资料", status: "working" },
            { title: "保存结果", status: "pending" },
          ],
        }),
        tool("read_file", { path: "inputs/经历.txt" }),
      ]);
    if (index === 1) {
      assert.match(request.messages.at(-1)!.content, /计算机专业/);
      return reply("", [
        tool("write_file", {
          path: "outputs/简历草稿.md",
          content: "计算机专业；参与校园网站项目。",
        }),
      ]);
    }
    if (index === 2) {
      const result = JSON.parse(request.messages.at(-1)!.content).result;
      assert.equal(result.link, "artifact:" + result.artifact.id);
      return reply("已保存草稿。");
    }
    if (index === 3) {
      assert.ok(
        request.messages.some(
          (m) => m.role === "user" && m.content === "整理经历",
        ),
      );
      return reply("", [tool("read_file", { path: "outputs/简历草稿.md" })]);
    }
    if (index === 4)
      return reply("", [
        tool("write_file", {
          path: "outputs/简历草稿.md",
          content: "计算机专业，校园网站项目。",
        }),
      ]);
    return reply("已精简，保留原始事实。");
  });
  const f = await fixture(t, { model });
  await f.workspace.import(
    f.conversation.id,
    "经历.txt",
    Buffer.from("计算机专业；参与校园网站项目。").toString("base64"),
  );
  const first = f.runtime.start(
    f.user,
    f.conversation.id,
    f.profile.id,
    "整理经历",
    id(),
  );
  await f.runtime.waitIdle();
  assert.equal(f.store.run(f.user.id, first.id).status, "completed");
  const v1 = f.store
    .artifacts(f.conversation.id)
    .find((a) => a.kind === "output")!;
  assert.equal(v1.version, 1);
  f.runtime.start(f.user, f.conversation.id, f.profile.id, "请精简", id());
  await f.runtime.waitIdle();
  const versions = f.store
    .artifacts(f.conversation.id)
    .filter((a) => a.kind === "output");
  assert.equal(versions.length, 2);
  assert.equal(versions[0].version, 2);
  assert.notEqual(versions[0].sha256, versions[1].sha256);
  assert.match((await f.workspace.artifactBytes(v1)).toString(), /参与/);
  const snapshot = f.runtime.snapshot(f.user, f.conversation.id);
  assert.ok(snapshot.events.some((e) => e.kind === "plan.updated"));
  assert.ok(snapshot.events.some((e) => e.kind === "tool.finished"));
  assert.equal(snapshot.messages.filter((m) => m.role === "user").length, 2);
  const disk = await readFile(
    join(f.dir, "workspaces", f.conversation.id, "outputs", "简历草稿.md"),
    "utf8",
  );
  assert.equal(disk, "计算机专业，校园网站项目。");
});

test("相同提交只执行一次，不同内容不能复用提交标识；对话忙时阻止第二任务", async (t) => {
  let release!: () => void;
  const waiting = new Promise<void>((resolve) => (release = resolve));
  const model = new ScriptedModel(async () => {
    await waiting;
    return reply();
  });
  const f = await fixture(t, { model });
  const key = id();
  const run = f.runtime.start(
    f.user,
    f.conversation.id,
    f.profile.id,
    "一次请求",
    key,
  );
  assert.equal(
    f.runtime.start(f.user, f.conversation.id, f.profile.id, "一次请求", key)
      .id,
    run.id,
  );
  assert.throws(
    () =>
      f.runtime.start(
        f.user,
        f.conversation.id,
        f.profile.id,
        "另一个请求",
        key,
      ),
    /相同提交/,
  );
  assert.throws(
    () =>
      f.runtime.start(
        f.user,
        f.conversation.id,
        f.profile.id,
        "并行请求",
        id(),
      ),
    /正在处理/,
  );
  release();
  await f.runtime.waitIdle();
  assert.equal(model.requests.length, 1);
  assert.equal(
    f.store.messages(f.conversation.id).filter((m) => m.role === "user").length,
    1,
  );
});

test("取消正在进行的工具不重复结果、不复活状态，后续工具绝不执行", async (t) => {
  let entered!: () => void, release!: () => void;
  const started = new Promise<void>((resolve) => (entered = resolve));
  const wait = new Promise<void>((resolve) => (release = resolve));
  const sandbox: Sandbox = {
    ...noSandbox,
    async execute() {
      entered();
      await wait;
      return {
        exit_code: 0,
        stdout: "已结束的测试替身",
        stderr: "",
        duration_ms: 1,
      };
    },
  };
  const f = await fixture(t, {
    sandbox,
    model: new ScriptedModel(() =>
      reply("", [
        tool("run_command", { command: "not-executed-fixture" }),
        tool("write_file", { path: "outputs/不该出现.txt", content: "no" }),
      ]),
    ),
  });
  const run = f.runtime.start(
    f.user,
    f.conversation.id,
    f.profile.id,
    "取消竞态测试",
    id(),
  );
  await started;
  f.runtime.cancel(f.user, run.id);
  assert.throws(
    () =>
      f.runtime.start(
        f.user,
        f.conversation.id,
        f.profile.id,
        "清理前重试",
        id(),
      ),
    /清理/,
  );
  release();
  await f.runtime.waitIdle();
  assert.equal(f.store.run(f.user.id, run.id).status, "cancelled");
  assert.equal(f.store.artifacts(f.conversation.id).length, 0);
  const messages = f.store.messages(f.conversation.id),
    calls = messages.flatMap((m) => m.tool_calls ?? []);
  for (const call of calls)
    assert.equal(messages.filter((m) => m.tool_call_id === call.id).length, 1);
});

test("取消等待中的模型请求，不把残缺回复当成果", async (t) => {
  let entered!: () => void;
  const started = new Promise<void>((resolve) => (entered = resolve));
  const model = new ScriptedModel(async (request) => {
    entered();
    return new Promise((_, reject) =>
      request.signal.addEventListener(
        "abort",
        () => reject(new DOMException("stopped", "AbortError")),
        { once: true },
      ),
    );
  });
  const f = await fixture(t, { model });
  const run = f.runtime.start(
    f.user,
    f.conversation.id,
    f.profile.id,
    "等待",
    id(),
  );
  await started;
  f.runtime.cancel(f.user, run.id);
  await f.runtime.waitIdle();
  assert.equal(f.store.run(f.user.id, run.id).status, "cancelled");
  assert.equal(
    f.store.messages(f.conversation.id).filter((m) => m.role === "assistant")
      .length,
    0,
  );
});

test("导出审批绑定不可变版本；拒绝后续答，不伪称已经写入本机", async (t) => {
  let artifactId = "";
  const model = new ScriptedModel((request, index) =>
    index === 0
      ? reply("", [tool("request_export", { artifact_id: artifactId })])
      : (assert.match(request.messages.at(-1)!.content, /拒绝/),
        reply("未导出。")),
  );
  const f = await fixture(t, { model });
  const file = await f.workspace.write(
    f.conversation.id,
    null,
    "outputs/结果.txt",
    "原版",
  );
  artifactId = file.id;
  const run = f.runtime.start(
    f.user,
    f.conversation.id,
    f.profile.id,
    "导出",
    id(),
  );
  await f.runtime.waitIdle();
  assert.equal(f.store.run(f.user.id, run.id).status, "awaiting_approval");
  const approval = f.store.approvals(f.conversation.id)[0];
  assert.equal(approval.sha256, file.sha256);
  await f.runtime.decide(f.user, approval.id, false);
  await f.runtime.waitIdle();
  assert.equal(f.store.run(f.user.id, run.id).status, "completed");
  assert.equal(f.store.approval(f.user.id, approval.id).status, "rejected");
  assert.equal(f.store.toolExecutions(f.conversation.id)[0].status, "failed");
  const response = await f.app.inject({
    url:
      "/api/v1/agent/artifacts/" +
      file.id +
      "/download?approval=" +
      approval.id,
    headers: f.headers,
  });
  assert.equal(response.statusCode, 403);
});

test("确认可下载已批准旧版本，不能把该授权用于新版本", async (t) => {
  const f = await fixture(t);
  const v1 = await f.workspace.write(
    f.conversation.id,
    null,
    "outputs/结果.txt",
    "v1",
  );
  const approval = await f.runtime.requestExport(f.user, v1.id);
  await f.runtime.decide(f.user, approval.id, true);
  const v2 = await f.workspace.write(
    f.conversation.id,
    null,
    "outputs/结果.txt",
    "v2",
  );
  const ok = await f.app.inject({
    url:
      "/api/v1/agent/artifacts/" + v1.id + "/download?approval=" + approval.id,
    headers: f.headers,
  });
  assert.equal(ok.statusCode, 200);
  assert.equal(ok.body, "v1");
  const forbidden = await f.app.inject({
    url:
      "/api/v1/agent/artifacts/" + v2.id + "/download?approval=" + approval.id,
    headers: f.headers,
  });
  assert.equal(forbidden.statusCode, 403);
});

test("等待用户确认不消耗执行时长；确认过期后不导出", async (t) => {
  let fileId = "";
  const f = await fixture(t, {
    timeout: 1000,
    model: new ScriptedModel((_, i) =>
      i === 0
        ? reply("", [tool("request_export", { artifact_id: fileId })])
        : reply("已经确认。"),
    ),
  });
  fileId = (
    await f.workspace.write(f.conversation.id, null, "outputs/a.txt", "a")
  ).id;
  const run = f.runtime.start(
    f.user,
    f.conversation.id,
    f.profile.id,
    "导出",
    id(),
  );
  await f.runtime.waitIdle();
  const paused = f.store.run(f.user.id, run.id);
  paused.created_at = "2020-01-01T00:00:00.000Z";
  f.store.saveRun(paused);
  await f.runtime.decide(
    f.user,
    f.store.approvals(f.conversation.id)[0].id,
    true,
  );
  await f.runtime.waitIdle();
  assert.equal(f.store.run(f.user.id, run.id).status, "completed");
  const expired = await f.runtime.requestExport(f.user, fileId);
  expired.expires_at = "2020-01-01T00:00:00.000Z";
  f.store.saveApproval(expired);
  assert.equal(
    (await f.runtime.decide(f.user, expired.id, true)).status,
    "expired",
  );
});

test("沙箱不可用返回真实错误，绝不运行宿主命令，工具参数逐项校验", async (t) => {
  const f = await fixture(t, {
    model: new ScriptedModel((request, index) =>
      index === 0
        ? reply("", [
            tool("run_command", { command: "echo no-host" }),
            tool("write_file", { path: "inputs/原文.txt", content: "覆写" }),
            tool("unknown_tool", {}),
            tool("read_file", { path: "inputs/a.txt", extra: true }),
          ])
        : (assert.match(JSON.stringify(request.messages), /未执行宿主命令/),
          reply("命令不可用。")),
    ),
  });
  const run = f.runtime.start(
    f.user,
    f.conversation.id,
    f.profile.id,
    "工具校验",
    id(),
  );
  await f.runtime.waitIdle();
  assert.equal(f.store.run(f.user.id, run.id).status, "completed");
  assert.equal(
    f.store
      .events(f.conversation.id)
      .filter((e) => e.kind === "tool.finished" && e.data.ok === false).length,
    4,
  );
  assert.equal(f.store.artifacts(f.conversation.id).length, 0);
});

test("步骤间隔只生成检查点；达到安全上限后可从检查点续接", async (t) => {
  const f = await fixture(t, {
    maxSteps: 2,
    maxTotalSteps: 2,
    model: new ScriptedModel((_, index) => index < 2
      ? reply("", [tool("list_files", {})])
      : reply("续接完成")),
  });
  const run = f.runtime.start(
    f.user,
    f.conversation.id,
    f.profile.id,
    "循环",
    id(),
  );
  await f.runtime.waitIdle();
  assert.equal(f.model.requests.length, 2);
  const stopped = f.store.run(f.user.id, run.id);
  assert.equal(stopped.status, "paused");
  assert.equal(stopped.error_code, "agent_step_budget");
  assert.equal(stopped.can_retry, true);
  const checkpoint = f.store.checkpoint(f.user.id, run.id)!;
  assert.equal(checkpoint.status, "paused");
  assert.equal(checkpoint.pending_tool_call_ids.length, 0);
  assert.ok(f.store.events(f.conversation.id).some(event => event.kind === "run.checkpoint"));
  const continuation = f.runtime.retry(f.user, run.id, id());
  await f.runtime.waitIdle();
  assert.notEqual(continuation.id, run.id);
  assert.equal(f.store.run(f.user.id, continuation.id).status, "completed");
  assert.equal(f.store.run(f.user.id, continuation.id).total_steps, 3);
  const repeated = f.runtime.retry(f.user, run.id, continuation.request_id);
  assert.equal(repeated.id, continuation.id);
  const g = await fixture(t, {
    model: new ScriptedModel(() =>
      reply("", [
        tool("ask_user", { question: "你希望申请什么岗位？" }),
        tool("write_file", { path: "outputs/no.txt", content: "no" }),
      ]),
    ),
  });
  const ask = g.runtime.start(
    g.user,
    g.conversation.id,
    g.profile.id,
    "缺资料",
    id(),
  );
  await g.runtime.waitIdle();
  assert.equal(g.store.run(g.user.id, ask.id).status, "waiting_input");
  assert.equal(g.store.artifacts(g.conversation.id).length, 0);
});

test("撤回外部模型授权会在下一步停止，不会继续调用", async (t) => {
  const model = new ScriptedModel(() => reply("", [tool("list_files", {})]));
  const f = await fixture(t, { model });
  f.runtime.subscribe(f.conversation.id, (event) => {
    if (event.kind === "tool.finished") f.store.setConsent(f.user.id, false);
  });
  const run = f.runtime.start(
    f.user,
    f.conversation.id,
    f.profile.id,
    "授权测试",
    id(),
  );
  await f.runtime.waitIdle();
  assert.equal(f.store.run(f.user.id, run.id).status, "failed");
  assert.equal(model.requests.length, 1);
});

test("事件提交后才推送，序号严格递增；消息、事件不泄露已登记密钥", async (t) => {
  const f = await fixture(t, {
    model: new ScriptedModel((request) => {
      request.onDelta?.(TEST_KEY.slice(0, 12));
      request.onDelta?.(TEST_KEY.slice(12));
      return reply(TEST_KEY);
    }),
  });
  let inspected = 0;
  f.runtime.subscribe(f.conversation.id, (event) => {
    assert.ok(
      f.store.events(f.conversation.id).some((e) => e.seq === event.seq),
    );
    inspected++;
  });
  f.runtime.start(
    f.user,
    f.conversation.id,
    f.profile.id,
    "测试" + TEST_KEY,
    id(),
  );
  await f.runtime.waitIdle();
  assert.ok(inspected > 0);
  assert.ok(
    !JSON.stringify(f.runtime.snapshot(f.user, f.conversation.id)).includes(
      TEST_KEY,
    ),
  );
  const events = f.store.events(f.conversation.id);
  assert.ok(
    events.every(
      (event, index) => index === 0 || event.seq > events[index - 1].seq,
    ),
  );
});

test("服务重启把运行中任务标为中断，未完成工具不自动重放", async (t) => {
  const f = await fixture(t);
  const run = {
    id: id(),
    conversation_id: f.conversation.id,
    user_id: f.user.id,
    profile_id: f.profile.id,
    request_id: id(),
    input: "重启测试",
    status: "running" as const,
    steps: 1,
    input_tokens: 0,
    output_tokens: 0,
    error: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  f.store.saveRun(run, true);
  f.store.message(f.conversation.id, run.id, "assistant", "", {
    tool_calls: [tool("write_file", { path: "outputs/no.txt", content: "no" })],
  });
  const recovered = new Runtime(
    f.store,
    f.workspace,
    f.profiles,
    f.sandbox,
    f.config,
  );
  assert.equal(f.store.run(f.user.id, run.id).status, "interrupted");
  assert.equal(f.store.run(f.user.id, run.id).error_code, "runtime_interrupted");
  assert.equal(recovered.snapshot(f.user, f.conversation.id).runs.at(-1)?.can_retry, true);
  assert.equal(f.store.artifacts(f.conversation.id).length, 0);
  assert.equal(
    f.store.messages(f.conversation.id).filter((m) => m.role === "tool").length,
    1,
  );
  const resumed = recovered.retry(f.user, run.id, id());
  await recovered.waitIdle();
  assert.equal(resumed.id, run.id);
  assert.equal(f.store.run(f.user.id, run.id).status, "completed");
  await recovered.shutdown();
});

test("工具收据已成功但消息尚未落库时，重启只回放收据而不重复执行", async (t) => {
  const f = await fixture(t);
  const call = tool("write_file", { path: "outputs/once.txt", content: "一次" });
  const run = {
    id: id(),
    conversation_id: f.conversation.id,
    user_id: f.user.id,
    profile_id: f.profile.id,
    request_id: id(),
    input: "收据恢复",
    status: "running" as const,
    steps: 1,
    input_tokens: 0,
    output_tokens: 0,
    error: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  f.store.saveRun(run, true);
  f.store.message(f.conversation.id, run.id, "assistant", "", { tool_calls: [call] });
  f.store.saveToolExecution({
    call_id: call.id,
    run_id: run.id,
    conversation_id: f.conversation.id,
    user_id: f.user.id,
    name: call.name,
    arguments_hash: "fixture-receipt",
    status: "succeeded",
    result: { path: "outputs/once.txt", version: 1 },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  const recovered = new Runtime(f.store, f.workspace, f.profiles, f.sandbox, f.config);
  const toolMessages = f.store.messages(f.conversation.id).filter(message => message.role === "tool");
  assert.equal(toolMessages.length, 1);
  assert.match(toolMessages[0].content, /outputs\/once\.txt/);
  assert.equal(f.store.events(f.conversation.id).filter(event => event.kind === "tool.finished").at(-1)?.data.replayed, true);
  await recovered.shutdown();
});

test("成果快照被外部改写后阻止预览和授权", async (t) => {
  const f = await fixture(t);
  const file = await f.workspace.write(
    f.conversation.id,
    null,
    "outputs/a.txt",
    "可信版本",
  );
  await writeFile(join(f.workspace.snapshots, file.id), "tampered");
  await assert.rejects(
    f.runtime.requestExport(f.user, file.id),
    /版本已发生变化/,
  );
});

test("供应商不报告用量时，超出预留输出仍能终止循环", async (t) => {
  const f = await fixture(t, {
    model: new ScriptedModel(() => ({
      ...reply("x".repeat(600), [tool("list_files", {})]),
      input_tokens: 0,
      output_tokens: 0,
    })),
  });
  f.config.maxOutputTokens = 128;
  f.config.maxRunOutputTokens = 128;
  const run = f.runtime.start(
    f.user,
    f.conversation.id,
    f.profile.id,
    "不报告用量",
    id(),
  );
  await f.runtime.waitIdle();
  assert.equal(f.model.requests.length, 1);
  assert.equal(f.store.run(f.user.id, run.id).status, "failed");
  assert.match(f.store.run(f.user.id, run.id).error!, /输出预算/);
});

test("审批刚出现便立即确认时不会丢失续跑，也不重复工具结果", async (t) => {
  let fileId = "";
  const f = await fixture(t, {
    model: new ScriptedModel((_, i) =>
      i === 0
        ? reply("", [tool("request_export", { artifact_id: fileId })])
        : reply("确认后继续成功"),
    ),
  });
  fileId = (
    await f.workspace.write(
      f.conversation.id,
      null,
      "outputs/即时确认.txt",
      "test",
    )
  ).id;
  let decision: Promise<unknown> | undefined;
  f.runtime.subscribe(f.conversation.id, (event) => {
    if (
      event.kind === "run.status" &&
      (event.data.run as any).status === "awaiting_approval"
    )
      decision = f.runtime.decide(
        f.user,
        f.store.approvals(f.conversation.id)[0].id,
        true,
      );
  });
  const run = f.runtime.start(
    f.user,
    f.conversation.id,
    f.profile.id,
    "立即确认测试",
    id(),
  );
  await f.runtime.waitIdle();
  await decision;
  await f.runtime.waitIdle();
  assert.equal(f.store.run(f.user.id, run.id).status, "completed");
  assert.equal(f.store.toolExecutions(f.conversation.id)[0].status, "succeeded");
  const messages = f.store.messages(f.conversation.id);
  const calls = messages.flatMap((m) => m.tool_calls ?? []);
  assert.equal(calls.length, 1);
  assert.equal(
    messages.filter((m) => m.tool_call_id === calls[0].id).length,
    1,
  );
});


test("修改待确认建议时裁剪旧岗位工具历史，仍保留当前问题", async (t) => {
  const editPrompt = [
    "我想修改职业工作台里这份待确认建议。",
    "标题：岗位对照",
    "建议 ID：00000000-0000-0000-0000-000000000001",
    "类型：comparison",
    "请先读取最新职业工作台。",
  ].join("\n");
  const model = new ScriptedModel((request, index) => {
    const visible = JSON.stringify(request.messages);
    assert.doesNotMatch(visible, /旧岗位历史正文/);
    assert.ok(visible.length < 20000);
    if (index === 0) return reply("", [tool("read_career_context", {})]);
    if (index === 1) return reply("想先改哪一部分？工作地点、在校与实习节奏，还是 Agent 基座？");
    assert.match(visible, /工作地点、在校与实习节奏，还是 Agent 基座/);
    assert.match(visible, /我都满足/);
    return reply("新的待确认草稿已经整理好，请检查后再确认。");
  });
  const f = await fixture(t, { model });
  f.store.message(f.conversation.id, null, "assistant", "更早的普通对话");
  for (let index = 0; index < 24; index++)
    f.store.message(
      f.conversation.id,
      null,
      "tool",
      "旧岗位历史正文 " + "x".repeat(6500),
    );
  const first = f.runtime.start(f.user, f.conversation.id, f.profile.id, editPrompt, id());
  await f.runtime.waitIdle();
  assert.equal(f.store.run(f.user.id, first.id).status, "completed");
  const second = f.runtime.start(f.user, f.conversation.id, f.profile.id, "我都满足", id());
  await f.runtime.waitIdle();
  assert.equal(f.store.run(f.user.id, second.id).status, "completed");
  assert.equal(model.requests.length, 3);
});

test("整轮超时且没有未完成工具时允许安全续接，并重新计算本轮时长", async (t) => {
  const model = new ScriptedModel(() => reply("续接成功"));
  const f = await fixture(t, { model, timeout: 1000 });
  const run = {
    id: id(),
    conversation_id: f.conversation.id,
    user_id: f.user.id,
    profile_id: f.profile.id,
    request_id: id(),
    input: "超时测试",
    status: "failed" as const,
    steps: 1,
    input_tokens: 0,
    output_tokens: 0,
    output_budget_used: 10,
    elapsed_ms: 1000,
    error: "任务达到时长上限或请求被中断，已停止。",
    error_code: "run_timeout",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  f.store.saveRun(run, true);
  f.store.message(f.conversation.id, run.id, "user", run.input);
  assert.equal(f.runtime.snapshot(f.user, f.conversation.id).runs.at(-1)?.can_retry, true);
  f.runtime.retry(f.user, run.id, id());
  await f.runtime.waitIdle();
  const resumed = f.store.run(f.user.id, run.id);
  assert.equal(resumed.status, "completed");
  assert.equal(resumed.retry_count, 1);
  assert.equal(model.requests.length, 1);
});


test("未闭合的压缩事件链会续写结束事件，不重复开始和摘要", async t => {
  const f = await fixture(t);
  const signature = "recoverable-compaction";
  const compactionId = "compact-recover";
  const common = { compaction_id: compactionId, trigger: "pressure", source_signature: signature, source_message_count: 8, omitted_message_ids: ["m1"], omitted_message_count: 6, pruned_message_count: 1, before_tokens: 9000, after_tokens: 3000, omitted_messages: 6 };
  f.store.appendEvent(f.conversation.id, "old-run", "context.compaction.start", common);
  f.store.appendEvent(f.conversation.id, "old-run", "context.compaction.summary", { ...common, summary: "保留用户目标", summary_tokens: 8 });
  const run = { id: "recovery-run", conversation_id: f.conversation.id } as Run;
  const pack = { ...common, messages: [], summary: "保留用户目标", estimatedTokens: 3000, originalTokens: 9000, sourceMessageCount: 8, omittedMessages: 6, omittedMessageIds: ["m1"], prunedMessageIds: ["m2"], compactionKey: signature, compacted: true } as unknown as ContextPack;
  (f.runtime as unknown as { recordContextCompaction: (run: Run, pack: ContextPack) => void }).recordContextCompaction(run, pack);
  const events = f.store.events(f.conversation.id).filter(event => event.data.source_signature === signature);
  assert.deepEqual(events.map(event => event.kind), ["context.compaction.start", "context.compaction.summary", "context.compaction.end"]);
  assert.equal(events.at(-1)?.data.recovered, true);
});

test("上下文压缩记录可回放的 start-summary-end 事件链，且不覆盖原消息", async t => {
  const f = await fixture(t);
  f.config.contextMaxTokens = 32000;
  f.config.contextReserveTokens = 8000;
  f.config.contextRecentTokens = 2000;
  for (let index = 0; index < 100; index++)
    f.store.message(f.conversation.id, "old-run-" + index, "user", "很早之前的对话内容：" + "历史".repeat(600));
  const run = f.runtime.start(f.user, f.conversation.id, f.profile.id, "请继续", id());
  await f.runtime.waitIdle();
  assert.equal(f.store.run(f.user.id, run.id).status, "completed");
  const first = f.store.events(f.conversation.id).filter(event => event.kind.startsWith("context.compaction."));
  assert.deepEqual(first.map(event => event.kind), [
    "context.compaction.start",
    "context.compaction.summary",
    "context.compaction.end",
  ]);
  const summary = first.find(event => event.kind === "context.compaction.summary")!;
  const end = first.find(event => event.kind === "context.compaction.end")!;
  assert.equal(end.data.status, "completed");
  assert.equal(typeof summary.data.source_signature, "string");
  assert.ok(Number(summary.data.source_message_count) > 100);
  assert.ok(Number(summary.data.omitted_message_count) > 0);
  assert.ok(String(summary.data.summary).includes("系统自动压缩"));
  const messageCount = f.store.messages(f.conversation.id, true).length;

  const next = f.runtime.start(f.user, f.conversation.id, f.profile.id, "再继续", id());
  await f.runtime.waitIdle();
  assert.equal(f.store.run(f.user.id, next.id).status, "completed");
  assert.equal(f.store.events(f.conversation.id).filter(event => event.kind.startsWith("context.compaction.")).length, 3);
  assert.ok(f.store.messages(f.conversation.id, true).length > messageCount);
});
