/** 青穗集 · 官方中转独立入口：上游密钥只配置在运营方服务器，不随本地应用发布。 */
import "dotenv/config";
import { resolve } from "node:path";
import { createRelay } from "./relay-app.js";
function positive(key: string, fallback: number) {
  const value = Number(process.env[key] ?? fallback);
  if (!Number.isInteger(value) || value < 1)
    throw new Error("Invalid relay configuration");
  return value;
}
const { app } = createRelay({
  dataDir: resolve(process.env.RELAY_DATA_DIR ?? "./relay-var"),
  upstreamUrl: process.env.RELAY_UPSTREAM_BASE_URL ?? "",
  upstreamKey: process.env.RELAY_UPSTREAM_API_KEY ?? "",
  model: process.env.RELAY_UPSTREAM_MODEL ?? "",
  kind:
    process.env.RELAY_API_KIND === "responses"
      ? "responses"
      : "chat-completions",
  maxOutput: positive("RELAY_MAX_OUTPUT_TOKENS", 2048),
  dailyOutput: positive("RELAY_DAILY_OUTPUT_TOKEN_LIMIT", 64000),
  dailyRequests: positive("RELAY_DAILY_REQUEST_LIMIT", 100),
  allowLocal: process.env.RELAY_ALLOW_LOCAL_UPSTREAM === "true",
  idleTimeoutMs: positive("RELAY_UPSTREAM_IDLE_TIMEOUT_MS", 120000),
});
try {
  await app.listen({
    host: process.env.RELAY_HOST ?? "127.0.0.1",
    port: positive("RELAY_PORT", 8120),
  });
  console.log(
    "官方模型中转已启动。请使用独立凭证访问，并在公网部署 HTTPS 反向代理。",
  );
} catch {
  console.error("官方中转启动失败，请检查配置和端口。");
  process.exitCode = 1;
}
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.once(signal, () => {
    void app.close();
  });
