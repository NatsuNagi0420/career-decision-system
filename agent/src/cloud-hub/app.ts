/** 青穗集 · 统一云端入口：开启云执行时供网页使用同一运行核心，纯中转模式保持写入限制。 */
import { createApp, type AppOptions } from "../http.js";
import { registerHub } from "./http.js";
import { startCloudExecutor } from "./cloud-executor.js";

export function createHubApp(options: AppOptions, cloudEnabled: boolean) {
  const ctx = createApp({ ...options, unifiedIdentity: true, hubOnly: !cloudEnabled });
  const repo = registerHub(ctx, { cloudEnabled });
  if (cloudEnabled) startCloudExecutor(ctx, repo, options.config.maxActiveRuns);
  return ctx;
}
