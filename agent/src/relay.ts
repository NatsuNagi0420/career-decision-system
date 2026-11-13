/** 青穗集 · 官方中转独立入口：上游密钥只配置在运营方服务器，不随本地应用发布。 */
import { config as loadEnv } from "dotenv";
import { pointsConfigFromEnv } from "./relay-points-config.js";
import { existsSync } from "node:fs";
loadEnv({ path: existsSync(".env.relay") ? ".env.relay" : ".env", quiet: true });
import { configuredLocalStateDir } from "./local-state-path.js";
import { createRelay, createRelayWithStore, type RelayConfig } from "./relay-app.js";
import { connectRelayPostgres } from "./relay-store.js";
function positive(key: string, fallback: number) {
  const value = Number(process.env[key] ?? fallback);
  if (!Number.isInteger(value) || value < 1)
    throw new Error("Invalid relay configuration");
  return value;
}
async function main() {
const routeCapabilities = [
  "conversation_support",
  "profile_diagnose",
  "direction_explore",
  "compare_decide",
  "action_plan",
  "career_prepare",
  "resume_build",
  "artifact_delivery",
] as const;
const modelRoutes = Object.fromEntries(
  routeCapabilities.flatMap((capability) => {
    const value = process.env["RELAY_MODEL_" + capability.toUpperCase()]?.trim();
    return value ? [[capability, value] as const] : [];
  }),
);
const routePaths = Object.fromEntries(
  routeCapabilities.flatMap((capability) => {
    const value = process.env["RELAY_PATH_" + capability.toUpperCase()]?.trim();
    return value ? [[capability, value] as const] : [];
  }),
);
const relayConfig: RelayConfig = {
  publicModel: process.env.RELAY_PUBLIC_MODEL?.trim() || "Suinai Flash",
  dataDir: configuredLocalStateDir(process.env.RELAY_DATA_DIR, "relay"),
  upstreamUrl: process.env.RELAY_UPSTREAM_BASE_URL ?? "",
  upstreamKey: process.env.RELAY_UPSTREAM_API_KEY ?? "",
  model: process.env.RELAY_UPSTREAM_MODEL ?? "",
  modelRoutes,
  routePaths,
  decisionModel: process.env.RELAY_DECISION_MODEL?.trim(),
  decisionPath: process.env.RELAY_DECISION_PATH?.trim(),
  imageModel: process.env.RELAY_IMAGE_MODEL?.trim(),
  imagePath: process.env.RELAY_IMAGE_PATH?.trim() || "images/tasks",
  imageDisplayName: process.env.RELAY_IMAGE_DISPLAY_NAME?.trim() || "Suinai Image",
  kind:
    process.env.RELAY_API_KIND === "responses"
      ? "responses"
      : "chat-completions",
  maxOutput: positive("RELAY_MAX_OUTPUT_TOKENS", 2048),
  dailyOutput: positive("RELAY_DAILY_OUTPUT_TOKEN_LIMIT", 64000),
  dailyRequests: positive("RELAY_DAILY_REQUEST_LIMIT", 100),
  allowLocal: process.env.RELAY_ALLOW_LOCAL_UPSTREAM === "true",
  idleTimeoutMs: positive("RELAY_UPSTREAM_IDLE_TIMEOUT_MS", 120000),
  adminToken: process.env.RELAY_ADMIN_TOKEN?.trim() || undefined,
  trustLoopbackProxy: process.env.RELAY_TRUST_LOOPBACK_PROXY === "true",
  tokenTtlMs: positive("RELAY_TOKEN_TTL_DAYS", 30) * 86400000,
  leaseTtlMs: positive("RELAY_LEASE_TTL_MS", 300000),
  billingEnabled: process.env.RELAY_BILLING_ENABLED === "true",
  ...pointsConfigFromEnv(process.env),
  inputMicrosPerToken: positive("RELAY_INPUT_MICROS_PER_TOKEN", 1),
  outputMicrosPerToken: positive("RELAY_OUTPUT_MICROS_PER_TOKEN", 4),
  imageMicros: positive("RELAY_IMAGE_MICROS", 1000000),
  initialCreditMicros: Number(process.env.RELAY_INITIAL_CREDIT_MICROS || 0),
  imagePollIntervalMs: positive("RELAY_IMAGE_POLL_INTERVAL_MS", 5000),
  imageTaskTtlMs: positive("RELAY_IMAGE_TASK_TTL_HOURS", 24) * 3600000,
  logRetentionDays: positive("RELAY_LOG_RETENTION_DAYS", 30),
  alertWebhookUrl: process.env.RELAY_ALERT_WEBHOOK_URL?.trim() || undefined,
  alertWebhookToken: process.env.RELAY_ALERT_WEBHOOK_TOKEN?.trim() || undefined,
};
const databaseUrl = process.env.RELAY_DATABASE_URL?.trim();
const { app } = databaseUrl
  ? createRelayWithStore(relayConfig, await connectRelayPostgres(databaseUrl))
  : createRelay(relayConfig);
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

}
await main().catch(() => { console.error("官方服务启动失败，请检查配置和数据库连接。"); process.exitCode = 1; });
