/** 青穗集 · 对话管理浏览器夹具：独立端口与合成账号，不调用模型，不修改用户真实数据。 */
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { createApp } from "../src/http.js";
import { loadConfig } from "../src/config.js";
import { noSandbox } from "./helpers.js";
const logs = resolve("../logs/conversation-management-20261023");
await mkdir(logs, { recursive: true });
const dataDir = await mkdtemp(join(logs, "browser-data-"));
const config = loadConfig({ AGENT_PORT: "8112", AGENT_DATA_DIR: dataDir, AGENT_OFFICIAL_API_KEY: "", AGENT_ALLOWED_ORIGINS: "http://127.0.0.1:8112" });
const ctx = createApp({ config, sandbox: noSandbox });
const username = "conversation_ui_fixture", password = "Fixture-only-20261023";
const { user } = ctx.auth.register(username, password, false);
const conversations = [
  ctx.store.createConversation(user.id, null, "前端方向与学习计划（合成测试）"),
  ctx.store.createConversation(user.id, null, "整理项目经历（合成测试）"),
  ctx.store.createConversation(user.id, null, "另一段想法（合成测试）"),
  ctx.store.createConversation(user.id, null, "之前的职业方向（已归档测试）"),
];
conversations[3].archived = true; ctx.store.updateConversation(conversations[3]);
ctx.store.message(conversations[0].id, null, "user", "【合成测试内容】我还不确定应该做什么，想先聊自己的经历和要学的东西。");
ctx.store.message(conversations[0].id, null, "assistant", "【界面测试预置消息，不是真实模型回答】我们可以先聊你亲手做过的一件事，再一起判断可能的方向，不用急着制作简历。");
await ctx.workspace.write(conversations[0].id, null, "outputs/示例学习记录.md", "# 合成测试文件\n仅用于检查预览和会话管理，不是真实职业建议。");
await ctx.app.listen({ host: config.host, port: config.port });
await writeFile(join(logs, "browser-fixture.json"), JSON.stringify({ url: "http://127.0.0.1:8112/", username, password, conversations, dataDir, pid: process.pid, note: "仅本轮独立夹具；无外部模型。不得把预置文字当成模型质量验收。" }, null, 2));
console.log("会话管理独立夹具：http://127.0.0.1:8112/，合成测试账号，未调用模型。");
for (const signal of ["SIGINT", "SIGTERM"] as const) process.once(signal, () => { void ctx.app.close(); });
