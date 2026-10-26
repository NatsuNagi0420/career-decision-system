/** 青穗集 · 本机服务配置：回环监听、显式官方中转和独立本地状态，不自动读取旧系统密钥。 */
import "dotenv/config";
import { resolve } from "node:path";
import { AppError } from "./errors.js";
export interface Config {
  host: string;
  deploymentMode: "local" | "server";
  port: number;
  dataDir: string;
  origins: string[];
  maxSteps: number;
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
      "本机 Agent 只允许监听回环地址；公网服务请单独部署官方中转。",
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
  return {
    host,
    deploymentMode: deploymentMode as Config["deploymentMode"],
    port: number(env, "AGENT_PORT", 8110, 1024, 65535),
    dataDir: resolve(env.AGENT_DATA_DIR ?? "./var"),
    origins: (
      env.AGENT_ALLOWED_ORIGINS ??
      "http://127.0.0.1:5173,http://localhost:5173,http://127.0.0.1:5174,http://localhost:5174"
    )
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    maxSteps: number(env, "AGENT_MAX_STEPS", 12, 1, 30),
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
