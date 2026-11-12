/** 青穗集 · Cloud Hub 入口：账号、设备和同步常驻，可选启用云端执行器。 */
import { config as dotenv } from "dotenv";
import { loadConfig } from "./config.js";
import { createHubApp } from "./cloud-hub/app.js";
dotenv({ path: process.env.AGENT_ENV_FILE || ".env.hub", override: true, quiet: true });
const config = loadConfig({ ...process.env, AGENT_DEPLOYMENT_MODE: "server", OFFICIAL_ACCESS_TOKEN: "" });
if (!config.officialUrl || !config.officialModel || !config.publicOrigin) throw new Error("Cloud Hub 缺少官方账号地址、模型或公开域名。");
const ctx = createHubApp({ config }, process.env.HUB_CLOUD_EXECUTOR === "true");
try {
  await ctx.app.listen({ host: config.host, port: config.port });
  console.log("青穗集 Cloud Hub 已启动：" + config.host + ":" + config.port);
} catch { console.error("Cloud Hub 启动失败，请检查配置和端口。"); process.exitCode = 1; }
for (const signal of ["SIGINT", "SIGTERM"] as const) process.once(signal, () => { void ctx.app.close(); });
