/** 青穗集 · 穗奈交互隔离预览：合成账号和模型替身，仅用于本地验收，不接触真实会话或外部模型。 */
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { createApp } from "../../agent/src/http.js";
import { loadConfig } from "../../agent/src/config.js";
import { Store, id, now } from "../../agent/src/store.js";
import type { Model, ModelRequest } from "../../agent/src/types.js";
const root = resolve(import.meta.dirname, "../.."), log = resolve(root, process.env.AGENT_PREVIEW_LOG_DIR || "logs/guided-companion-20261023");
await mkdir(log, { recursive: true });
const dir = await mkdtemp(join(log, "browser-data-"));
const config = loadConfig({ AGENT_PORT: "8112", AGENT_DATA_DIR: dir });
const store = new Store(join(dir, "agent.sqlite"));
let replyDelayMs = 0, streamPreview = false;
const model: Model = { async complete(request: ModelRequest) {
  if (request.tools.length && replyDelayMs) await new Promise(resolve => setTimeout(resolve, replyDelayMs));
  let text = "【界面测试替身，不是真实模型回答】\n\n可以先从你负责的那一部分说起：你做的登录表单，具体解决了什么问题？我会区分你亲自做的内容和团队完成的内容，不替你编造经历。";
  if (!request.tools.length) {
    const data = JSON.parse(request.messages.at(-1)!.content) as { messages: { id: string; role: string }[] };
    text = JSON.stringify({ summary: "用户提到自己用 React 完成过课程项目中的登录表单，希望把真实经历整理得更清楚；目标岗位和具体成果还没确定。", next_step: "先聊清楚自己负责的部分，再决定是否整理成简历。", suggestion: { kind: "resume", message: "是不是想把这段项目经历整理成简历？我们可以只从你负责的部分开始。", evidence_message_id: data.messages.filter(m => m.role === "user").at(-1)!.id } });
  }
  if (request.tools.length && streamPreview) {
    const input = request.messages.filter(message => message.role === "user").at(-1)?.content ?? "";
    text = "【本地流式测试替身】\n\n你刚才说：「" + input + "」。\n\n我们先从你实际做过的一件事开始，区分你负责的部分与团队合作的部分。\n\n1. 先说清楚做了什么。\n2. 再聊聊你怎么解决问题。\n3. 最后整理下一步。\n\n文字按不规则分片返回，用于观察缓冲和尾部解码，不代表真实职业建议。";
    for (let offset = 0, index = 0; offset < text.length; index++) {
      await new Promise<void>((resolve, reject) => {
        const abort = () => { clearTimeout(timer); reject(new Error("预览已停止")); };
        const timer = setTimeout(() => { request.signal.removeEventListener("abort", abort); resolve(); }, [140, 600, 220, 900, 100][index % 5]);
        if (request.signal.aborted) abort(); else request.signal.addEventListener("abort", abort, { once: true });
      });
      request.signal.throwIfAborted();
      const chunk = text.slice(offset, offset + [6, 16, 8, 28, 10][index % 5]); request.onDelta?.(chunk); offset += chunk.length;
    }
  }
  return { ...(streamPreview && request.tools.length ? { streamed: true } : {}), text, tool_calls: [], input_tokens: 10, output_tokens: 10, finish_reason: "stop" };
} };
const context = createApp({ config, store, modelFactory: () => model, staticDir: join(root, "web/dist"), sandbox: { async health() { return { available: false, provider: "docker", image: "test-only", isolation_tested: false, message: "隔离界面测试：无真实命令执行。" }; }, async execute() { throw Error("预览禁止执行命令"); } } });
const session = context.auth.register("companion_demo", "Demo-only-2026", true);
const profile = await context.profiles.save(session.user, { name: "界面测试模型替身", mode: "custom", base_url: "https://example.invalid/v1", model: "fixture-not-real", api_key: "synthetic-ui-key" });
profile.capabilities = { chat: true, tools: true, stream: false, tested_at: now(), note: "仅测试替身" }; store.saveProfile(profile, null);
const conversation = store.createConversation(session.user.id, profile.id, "交互演示 · 不是真实用户资料");
context.runtime.start(session.user, conversation.id, profile.id, "我在课程项目中用 React 做了登录表单，想把这段经历写清楚，但不知道怎么写进简历。", id());
await context.runtime.waitIdle();
const message = store.messages(conversation.id).find(message => message.role === "user")!;
await context.runtime.guidance.analyze(session.user, conversation.id, profile.id, message.id);
replyDelayMs = Math.min(60_000, Math.max(0, Number(process.env.AGENT_PREVIEW_DELAY_MS) || 0));
streamPreview = process.env.AGENT_PREVIEW_STREAM === "1";
await context.app.listen({ host: "127.0.0.1", port: 8112 });
await writeFile(join(log, "browser-fixture.json"), JSON.stringify({ url: "http://127.0.0.1:8112/", username: "companion_demo", password: "Demo-only-2026", conversation_id: conversation.id, synthetic_only: true, pid: process.pid }, null, 2));
console.log("隔离交互预览已启动 http://127.0.0.1:8112/；只使用测试替身。");
let closing = false;
async function stop() { if (closing) return; closing = true; await context.app.close(); store.close(); process.exit(0); }
process.on("SIGINT", stop); process.on("SIGTERM", stop);
