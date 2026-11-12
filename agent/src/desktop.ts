/** 青穗集 · 桌面运行入口：生产网页、公共岗位初始数据与仅由启动器控制的进程生命周期。 */
import { createInterface } from "node:readline";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { loadConfig } from "./config.js";
import { createApp } from "./http.js";
import { installPcBridge } from "./cloud-hub/pc-bridge.js";
import { CatalogueRepository } from "./job-catalogue-store.js";
import { registerDesktopLifecycle } from "./desktop-lifecycle.js";

const root = fileURLToPath(new URL("../../", import.meta.url));
const config = loadConfig({ ...process.env, AGENT_DEPLOYMENT_MODE: "local", AGENT_HOST: "127.0.0.1" });
const ctx = createApp({ config, unifiedIdentity: true, staticDir: join(root, "web/dist"), assetsDir: join(root, "assets/web") });
installPcBridge(ctx, config);
let closing: Promise<void> | undefined;
function shutdown() {
  if (closing) return closing;
  const deadline = setTimeout(() => process.exit(1), 20000);
  deadline.unref();
  closing = ctx.app.close().then(() => {
    console.log("QINGSUIJI_STOPPED");
    process.exitCode = 0;
    input.close();
    process.stdin.destroy();
  }).catch(() => { console.error("本机服务关闭时遇到问题；已停止接收新任务。"); process.exitCode = 1; })
    .finally(() => clearTimeout(deadline));
  return closing;
}
const input = createInterface({ input: process.stdin, terminal: false });
input.on("line", line => {
  if (line.length > 128) return;
  try { if ((JSON.parse(line) as { command?: string }).command === "shutdown") void shutdown(); } catch { /* 非控制消息不执行。 */ }
});
input.on("close", () => { void shutdown(); });
process.once("SIGINT", () => { void shutdown(); });
process.once("SIGTERM", () => { void shutdown(); });
registerDesktopLifecycle(ctx, {
  version: process.env.QINGSUIJI_VERSION || "0.1.0",
  requestExit: () => console.log("QINGSUIJI_EXIT_REQUEST"),
});
try {
  const catalogue = new CatalogueRepository(ctx.store);
  if (!catalogue.version()) {
    // 只在空岗位库导入明确随包发布的公共样本，不复制开发数据库、不覆盖用户数据。
    const seed = JSON.parse(await readFile(join(root, "resources/job-catalogue.json"), "utf8"));
    catalogue.import(seed, { expectedVersion: null });
  }
  await ctx.app.listen({ host: config.host, port: config.port });
  console.log("QINGSUIJI_READY " + JSON.stringify({ version: process.env.QINGSUIJI_VERSION || "0.1.0", port: config.port }));
} catch (error) {
  console.error("青穗集启动失败：" + ctx.secrets.redact(error instanceof Error ? error.message : "初始化失败"));
  await shutdown();
  process.exitCode = 1;
}
