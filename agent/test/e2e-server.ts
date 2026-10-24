/** 青穗集 · 浏览器验收专用服务：独立数据和脚本模型，绝不注入正式配置或账号。 */
import { createFixtureProvider } from "./fixture-provider.js";
import { createApp } from "../src/http.js";
import { loadConfig } from "../src/config.js";
import { resolve } from "node:path";
const dir = resolve(
  process.cwd(),
  "../logs/agent-foundation-implementation-20261020/browser-data",
);
const provider = await createFixtureProvider(8131);
const config = loadConfig({ AGENT_PORT: "8111", AGENT_DATA_DIR: dir });
const ctx = createApp({ config, staticDir: resolve("../web/dist") });
await ctx.app.listen({ host: "127.0.0.1", port: 8111 });
console.log(
  JSON.stringify({
    test_fixture: true,
    real_llm: false,
    url: "http://127.0.0.1:8111",
    model_url: provider.url,
    data: dir,
  }),
);
let closing = false;
const close = async () => {
  if (closing) return;
  closing = true;
  await ctx.app.close();
  await provider.close();
};
process.once("SIGINT", () => void close());
process.once("SIGTERM", () => void close());
