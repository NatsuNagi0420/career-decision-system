/** 青穗集 · 文件侧栏浏览器验收：隔离账号与示例文件，仅脚本数据，无真实模型调用/系统应用启动。 */
import { mkdir, mkdtemp, writeFile, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createApp } from "../src/http.js";
import { loadConfig } from "../src/config.js";
import { id, now } from "../src/store.js";
import { noSandbox } from "./helpers.js";
const logs = resolve("../logs/file-link-preview-20261022"); await mkdir(logs, { recursive: true });
const dataDir = await mkdtemp(join(logs, "browser-data-"));
const username = "file_preview_fixture", password = "Fixture-preview-only-2026";
const ctx = createApp({ config: loadConfig({ AGENT_PORT: "8112", AGENT_DATA_DIR: dataDir }), staticDir: resolve("../web/dist"), sandbox: noSandbox, localFileLauncher: async (path, action) => { await writeFile(join(logs, "fixture-open.json"), JSON.stringify({ fixture: true, path, action })); } });
const { user } = ctx.auth.register(username, password, true);
const conversation = ctx.store.createConversation(user.id, null);
conversation.title = "文件预览 · 独立测试示例"; ctx.store.updateConversation(conversation);
const run1 = id(), run2 = id();
for (const run of [run1, run2]) ctx.store.saveRun({ id: run, conversation_id: conversation.id, user_id: user.id, profile_id: id(), request_id: id(), input: "浏览器验收数据，不是真实模型产出", status: "completed", steps: 1, input_tokens: 0, output_tokens: 0, error: null, created_at: now(), updated_at: now() }, true);
const first = await ctx.workspace.write(conversation.id, run1, "outputs/职业发展路线.md", "# 职业发展路线\n\n这是第一版测试文件，用于验证历史版本不串文件。\n\n- 第一周：梳理经历。\n- 第二周：准备简历。");
ctx.store.message(conversation.id, run1, "user", "请准备一份职业路线和每周学习清单。（界面测试示例）");
ctx.store.message(conversation.id, run1, "assistant", "已准备第一版职业路线。你可以直接点击文件名在右侧查看。\n\n[职业发展路线.md](artifact:" + first.id + ")\n\n这是独立验收数据，未调用真实模型。");
const updated = await ctx.workspace.write(conversation.id, run2, "outputs/职业发展路线.md", "# 职业发展路线\n\n> 这是一份文件预览示例，不代表对真实用户的职业判断。\n\n## 01 · 明确你的方向\n\n先从已有经历里找证据，不急着给自己贴标签。\n\n- **目标岗位**：前端工程师 / 应用开发\n- **当前重点**：一个能够演示的完整项目\n- **下一步**：整理两段可验证的项目经历\n\n## 02 · 未来四周\n\n| 阶段 | 重点 | 交付 |\n| --- | --- | --- |\n| 第 1 周 | 基础与画像 | 个人优势清单 |\n| 第 2 周 | 实战与复盘 | 项目演示与 README |\n| 第 3 周 | 简历与表达 | 一页简历、面试提纲 |\n| 第 4 周 | 投递与调整 | 投递记录、反馈分析 |\n\n## 03 · 本周可以做的小事\n\n1. 写下你真正做过的三件事。\n2. 选择一个你愿意持续投入的方向。\n3. 将任务缩小到今天就能开始的一步。\n\n慢一点也没关系，我们一直在向前。\n");
const csv = await ctx.workspace.write(conversation.id, run2, "outputs/每周学习清单.csv", '阶段,学习内容,时间,完成标准\n第1周,TypeScript 基础,5小时,完成10道类型练习\n第2周,"React 组件, 状态与交互",8小时,完成一个可演示页面\n第3周,接口与文件处理,6小时,打通真实文件交付\n第4周,简历与面试,4小时,整理两段项目经历');
const json = await ctx.workspace.write(conversation.id, run2, "outputs/路线配置.json", JSON.stringify({ version: 2, goal: "前端工程师", weeks: 4, demo: true }));
const workspace = await ctx.workspace.root(conversation.id);
for (const [name, bytes] of [["穗奈头像.png", await readFile(resolve("../assets/web/brand/suinai-avatar/suinai-avatar.png"))], ["附件示例.docx", Buffer.from("Fixture-only: unsupported format placeholder, not an actual Word document")]] as const) {
  await writeFile(join(workspace, "outputs", name), bytes); await ctx.workspace.publish(conversation.id, run2, "outputs/" + name);
}
ctx.store.message(conversation.id, run2, "user", "再细化成四周，附上学习表格与配置示例。（界面测试示例）");
ctx.store.message(conversation.id, run2, "assistant", "已经整理成四周的路线，保留了上一版记录。\n\n[打开职业发展路线](artifact:" + updated.id + ")\n\n[查看每周学习清单](artifact:" + csv.id + ")\n\n[查看路线配置](artifact:" + json.id + ")\n\n左键在右侧预览，右键可以下载或在本机打开。下方附件用于验证图片和不支持格式的提示。");
await ctx.app.listen({ host: "127.0.0.1", port: 8112 });
console.log(JSON.stringify({ fixture: true, real_llm: false, url: "http://127.0.0.1:8112", username, password, conversation: conversation.id }));
let closing = false; const close = async () => { if (closing) return; closing = true; await ctx.app.close(); };
process.once("SIGINT", () => void close()); process.once("SIGTERM", () => void close());
