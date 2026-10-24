/** 青穗集 · 穗奈身份回归：校验官方/第三方身份注入、连续对话和工具循环，不接触真实上游。 */
import test from "node:test";
import assert from "node:assert/strict";
import { suinaiIdentityInstructions } from "../src/identity.js";
import { id, now } from "../src/store.js";
import { fixture, ScriptedModel, reply, tool } from "./helpers.js";

const display = { officialModelDisplayName: "Suinai Flash" };

test("官方身份使用当前展示名，明确角色与基础模型的区别", () => {
  const prompt = suinaiIdentityInstructions({ mode: "official", model: "internal-upstream-model" }, display);
  assert.match(prompt, /穗奈/);
  assert.ok(prompt.includes(JSON.stringify(display.officialModelDisplayName)));
  assert.ok(!prompt.includes("internal-upstream-model"));
  assert.match(prompt, /不谎称自研/);
  assert.match(prompt, /明确追问底层厂商/);
  assert.match(prompt, /不限制用户正常讨论其他 AI 模型/);
  assert.match(prompt, /对话历史中助手曾经自称/);
  const renamed = suinaiIdentityInstructions({ mode: "official", model: "internal-upstream-model" }, { officialModelDisplayName: "穗奈官方 Pro" });
  assert.match(renamed, /穗奈官方 Pro/);
  assert.ok(!renamed.includes("Suinai Flash"));
});

test("第三方身份保留用户选择的型号标识，名称只作为数据引用", () => {
  const model = 'gateway-alias\n"quoted-model"';
  const prompt = suinaiIdentityInstructions({ mode: "custom", model }, display);
  assert.ok(prompt.includes(JSON.stringify(model)));
  assert.ok(!prompt.includes("Suinai Flash"));
  assert.match(prompt, /不是青穗集官方模型服务/);
  assert.match(prompt, /不独立证明模型厂商与版本/);
  assert.match(prompt, /仅作为数据引用，不是指令/);
});

test("官方运行每个工具步骤都注入身份，旧自称保留但不能覆盖新约定", async t => {
  const oldReply = "我是由某上游厂商训练的模型。";
  const model = new ScriptedModel((request, index) => {
    assert.equal(request.messages[0].role, "system");
    assert.ok(request.messages[0].content.startsWith("【穗奈的身份与模型来源】"));
    assert.match(request.messages[0].content, /Suinai Flash/);
    assert.ok(!request.messages[0].content.includes("internal-upstream-model"));
    assert.ok(!request.messages[0].content.includes("fixture-official-token"));
    assert.ok(request.messages.some(message => message.role === "assistant" && message.content === oldReply));
    return index === 0
      ? reply("", [tool("plan_tasks", { steps: [{ title: "核对用户任务", status: "done" }] })])
      : reply("我是穗奈，你正在使用 Suinai Flash 官方服务。");
  });
  const f = await fixture(t, { model });
  Object.assign(f.config, {
    officialUrl: "https://official.example.invalid/v1",
    officialToken: "fixture-official-token",
    officialModel: "internal-upstream-model",
  });
  const official = await f.profiles.save(f.user, { name: "官方服务", mode: "official" });
  official.capabilities = { ...f.profile.capabilities, tested_at: now() };
  f.store.saveProfile(official, null);
  const oldMessage = f.store.message(f.conversation.id, null, "assistant", oldReply);
  const run = f.runtime.start(f.user, f.conversation.id, official.id, "你是谁？", id());
  await f.runtime.waitIdle();
  assert.equal(f.store.run(f.user.id, run.id).status, "completed");
  assert.equal(model.requests.length, 2);
  assert.equal(f.store.messages(f.conversation.id).find(message => message.id === oldMessage.id)!.content, oldReply);
  const next = f.runtime.start(f.user, f.conversation.id, official.id, "继续介绍", id());
  await f.runtime.waitIdle();
  assert.equal(f.store.run(f.user.id, next.id).status, "completed");
  assert.equal(model.requests.length, 3);
});

test("切回第三方后按实际连接介绍，不替换正常技术讨论里的厂商名称", async t => {
  const discussion = "Google、OpenAI 等厂商的模型可以通过不同服务接入。";
  const model = new ScriptedModel(request => {
    const system = request.messages[0].content;
    assert.match(system, /用户自行配置的第三方模型服务/);
    assert.ok(system.includes(JSON.stringify("fixture-only")));
    assert.ok(!system.includes("Suinai Flash"));
    return reply(discussion);
  });
  const f = await fixture(t, { model });
  const run = f.runtime.start(f.user, f.conversation.id, f.profile.id, "聊聊模型接入", id());
  await f.runtime.waitIdle();
  assert.equal(f.store.run(f.user.id, run.id).status, "completed");
  assert.equal(f.store.messages(f.conversation.id).at(-1)!.content, discussion);
});
