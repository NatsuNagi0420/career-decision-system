/** 青穗集 · Windows 原生沙箱人工验收入口：没有通过真实自检时返回失败，不降级普通宿主终端。 */
import { WindowsNativeSandbox } from "../dist/native-sandbox.js";
import { loadConfig } from "../dist/config.js";

if (process.platform !== "win32") {
  console.log(JSON.stringify({ ok: false, skipped: true, reason: "此验收脚本只在 Windows 主机执行。" }, null, 2));
  process.exit(0);
}
const config = loadConfig(process.env);
const sandbox = new WindowsNativeSandbox(config.dataDir, { timeoutMs: 60000, outputLimit: 128000 });
const health = await sandbox.health(true);
console.log(JSON.stringify(health, null, 2));
if (!health.available || !health.isolation_tested || !health.tested_checks?.includes("input-write-denied") || !health.tested_checks?.includes("outside-write-denied")) {
  process.exitCode = 2;
}
