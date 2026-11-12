/** 青穗集 · 本机服务配置：回环监听、显式官方中转和独立本地状态，不自动读取旧系统密钥。 */
import "dotenv/config";

import { AppError } from "./errors.js";
import { configuredLocalStateDir } from "./local-state-path.js";
export interface Config {
  publicOrigin: string;
  cloudAgentUrl: string;
  serverCommands: boolean;
  maxActiveRuns: number;
  host: string;
  deploymentMode: "local" | "server";
  port: number;
  dataDir: string;
  memoryBackground: boolean;
  origins: string[];
  /** 模型调用达到这个间隔时记录检查点并整理上下文；不代表任务停止。 */
  maxSteps: number;
  /** 单个执行运行的绝对模型调用上限；达到后由用户决定是否从检查点续接。 */
  maxTotalSteps: number;
  /** 一个用户任务跨续接运行共享的模型调用硬上限。 */
  maxTaskSteps: number;
  /** 达到安全步数后允许用户手动续接的次数；每次续接都会生成新的审计运行。 */
  maxContinuations: number;
  runTimeoutMs: number;
  modelTimeoutMs: number;
  maxOutputTokens: number;
  maxRunOutputTokens: number;
  contextMaxTokens: number;
  contextReserveTokens: number;
  contextRecentTokens: number;
  contextMaxToolChars: number;
  sandboxProvider: "auto" | "windows-native" | "docker";
  dockerCommand: string;
  dockerImage: string;
  officialUrl: string;
  officialToken: string;
  officialModel: string;
  officialModelDisplayName: string;
  officialKind: "chat-completions" | "responses";
}
function number(
  env: NodeJS.ProcessEnv,
  key: string,
  fallback: number,
  min: number,
  max: number,
) {
  const value = Number(env[key] ?? fallback);
  if (!Number.isInteger(value) || value < min || value > max)
    throw new AppError(500, "配置项不合法：" + key);
  return value;
}
export function loadConfig(env = process.env): Config {
  const host = env.AGENT_HOST ?? "127.0.0.1";
  if (!["127.0.0.1", "::1", "localhost"].includes(host))
    throw new AppError(
      500,
      "本机 Agent 只允许监听回环地址；云端 Agent 请通过反向代理提供 HTTPS 服务。",
    );
  const deploymentMode = env.AGENT_DEPLOYMENT_MODE ?? "local";
  if (!["local", "server"].includes(deploymentMode))
    throw new AppError(500, "AGENT_DEPLOYMENT_MODE 只允许 local 或 server。");
  const sandboxProvider = env.AGENT_SANDBOX_PROVIDER ?? "auto";
  if (!["auto", "windows-native", "docker"].includes(sandboxProvider))
    throw new AppError(500, "AGENT_SANDBOX_PROVIDER 只允许 auto、windows-native 或 docker。");
  const officialModelDisplayName = env.OFFICIAL_MODEL_DISPLAY_NAME?.trim() || "Suinai Flash";
  if (officialModelDisplayName.length > 60)
    throw new AppError(500, "OFFICIAL_MODEL_DISPLAY_NAME 最多 60 个字符。");
  const contextMaxTokens = number(env, "AGENT_CONTEXT_MAX_TOKENS", 32000, 8000, 120000);
  const contextReserveTokens = number(env, "AGENT_CONTEXT_RESERVE_TOKENS", 8000, 2000, 40000);
  const contextRecentTokens = number(env, "AGENT_CONTEXT_RECENT_TOKENS", 10000, 1000, 60000);
  if (contextReserveTokens >= contextMaxTokens)
    throw new AppError(500, "AGENT_CONTEXT_RESERVE_TOKENS 必须小于 AGENT_CONTEXT_MAX_TOKENS。");
  const maxSteps = number(env, "AGENT_MAX_STEPS", 12, 1, 64);
  const maxTotalSteps = number(env, "AGENT_MAX_TOTAL_STEPS", 120, 1, 1000);
  if (maxTotalSteps < maxSteps)
    throw new AppError(500, "AGENT_MAX_TOTAL_STEPS 必须不小于 AGENT_MAX_STEPS。");
  const maxContinuations = number(env, "AGENT_MAX_CONTINUATIONS", 3, 0, 10);
  const maxTaskSteps = number(env, "AGENT_MAX_TASK_STEPS", maxTotalSteps * (maxContinuations + 1), maxTotalSteps, 10000);
  const publicOrigin = env.AGENT_PUBLIC_ORIGIN?.replace(/\/+$/, "") ?? "";
  const cloudAgentUrl = env.AGENT_CLOUD_URL?.replace(/\/+$/, "") ?? "";
  for (const [key, value] of [["AGENT_PUBLIC_ORIGIN", publicOrigin], ["AGENT_CLOUD_URL", cloudAgentUrl]]) {
    if (!value) continue;
    let url: URL;
    try { url = new URL(value); } catch { throw new AppError(500, "配置项不合法：" + key); }
    if (url.username || url.password || url.search || url.hash || url.pathname !== "/" || (url.protocol !== "https:" && !(url.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)))) throw new AppError(500, "配置项必须为 HTTPS 域名或本机调试地址：" + key);
  }
  return {
    publicOrigin, cloudAgentUrl,
    memoryBackground: env.AGENT_MEMORY_BACKGROUND !== "false",
        serverCommands: env.AGENT_SERVER_COMMANDS === "true",
    maxActiveRuns: number(env, "AGENT_MAX_ACTIVE_RUNS", deploymentMode === "server" ? 2 : 20, 1, 100),
    host,
    deploymentMode: deploymentMode as Config["deploymentMode"],
    port: number(env, "AGENT_PORT", 8110, 1024, 65535),
    dataDir: configuredLocalStateDir(env.AGENT_DATA_DIR, "agent", env),
    origins: (
      env.AGENT_ALLOWED_ORIGINS ??
      (deploymentMode === "server" && publicOrigin ? publicOrigin : "http://127.0.0.1:5173,http://localhost:5173,http://127.0.0.1:5174,http://localhost:5174")
    )
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    maxSteps,
    maxTotalSteps,
    maxTaskSteps,
    maxContinuations,
    runTimeoutMs: number(env, "AGENT_RUN_TIMEOUT_MS", 180000, 1000, 900000),
    modelTimeoutMs: number(env, "AGENT_MODEL_TIMEOUT_MS", 120000, 1000, 180000),
    maxOutputTokens: number(env, "AGENT_MAX_OUTPUT_TOKENS", 2048, 128, 16384),
    maxRunOutputTokens: number(
      env,
      "AGENT_MAX_RUN_OUTPUT_TOKENS",
      16000,
      128,
      100000,
    ),
    contextMaxTokens,
    contextReserveTokens,
    contextRecentTokens,
    contextMaxToolChars: number(env, "AGENT_CONTEXT_MAX_TOOL_CHARS", 12000, 800, 64000),
    sandboxProvider: sandboxProvider as Config["sandboxProvider"],
    dockerCommand: env.AGENT_DOCKER_COMMAND ?? "docker",
    dockerImage: env.AGENT_DOCKER_IMAGE ?? "python:3.12-slim",
    officialUrl: env.OFFICIAL_GATEWAY_URL ?? "",
    officialToken: env.OFFICIAL_ACCESS_TOKEN ?? "",
    officialModel: env.OFFICIAL_MODEL ?? "",
    officialModelDisplayName,
    officialKind:
      env.OFFICIAL_API_KIND === "responses" ? "responses" : "chat-completions",
  };
}
