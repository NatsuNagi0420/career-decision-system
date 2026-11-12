/** 青穗集 · 云端 Agent 入口：共用执行核心，以官方账号隔离云端会话和资料。 */
import { config as dotenv } from "dotenv";
import { loadConfig } from "./config.js";
import { createApp } from "./http.js";
dotenv({ path: process.env.AGENT_ENV_FILE || ".env.cloud", override: true, quiet: true });
const config = loadConfig({ ...process.env, AGENT_DEPLOYMENT_MODE: "server", OFFICIAL_ACCESS_TOKEN: "" });
if (!config.officialUrl || !config.officialModel || !config.publicOrigin) throw new Error("云端 Agent 缺少官方网关、公开域名或模型配置。");
const { app } = createApp({ config, unifiedIdentity: true });
try {
  await app.listen({ host: config.host, port: config.port });
  console.log("青穗集云端 Agent 已启动：" + config.host + ":" + config.port);
} catch { console.error("云端 Agent 启动失败，请检查配置与端口。"); process.exitCode = 1; }
for (const signal of ["SIGINT", "SIGTERM"] as const) process.once(signal, () => { void app.close(); });
