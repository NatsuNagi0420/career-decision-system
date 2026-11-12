/** 青穗集 · TypeScript Agent 启动入口：独立本地服务，优雅停止与持久记录。 */
import { loadConfig } from "./config.js";
import { createApp } from "./http.js";
import { installPcBridge } from "./cloud-hub/pc-bridge.js";
const config = loadConfig();
const ctx = createApp({ config, unifiedIdentity: true });
const { app } = ctx;
installPcBridge(ctx, config);
try {
  await app.listen({ host: config.host, port: config.port });
  console.log(
    "青穗集 TypeScript Agent: http://" + config.host + ":" + config.port,
  );
  console.log("模型密钥仅由本机服务保管；未配置模型时不会冒充真实助手。");
} catch {
  console.error("Agent 启动失败，请检查端口、Node 版本和配置。");
  process.exitCode = 1;
}
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.once(signal, () => {
    void app.close().then(() => {
      process.exitCode = 0;
    });
  });
