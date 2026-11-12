/** 青穗集 · 官方运营管理：按当前数据库配置管理凭证、用量与一致备份，不输出上游密钥。 */
import { config as loadEnv } from "dotenv";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { spawn } from "node:child_process";
import { configuredLocalStateDir } from "./local-state-path.js";
import { relayDatabase, backupRelayDatabase } from "./relay-app.js";
import { connectRelayPostgres, initializeRelayStore, sqliteRelayStore } from "./relay-store.js";
import { issueStoredToken, rotateStoredToken } from "./relay-operations.js";
loadEnv({ path: existsSync(".env.relay") ? ".env.relay" : ".env", quiet: true });
async function main() {
  const url = process.env.RELAY_DATABASE_URL?.trim();
  const database = url ? null : relayDatabase(configuredLocalStateDir(process.env.RELAY_DATA_DIR, "relay"));
  const store = url ? await connectRelayPostgres(url) : sqliteRelayStore(database!);
  try {
    await initializeRelayStore(store);
    const action = process.argv[2] ?? "list", argument = process.argv[3];
    if (action === "issue") {
      const value = await issueStoredToken(store, argument || "manual-installation");
      console.log(JSON.stringify({ ...value, notice: "仅展示一次，请安全保存官方凭证。" }, null, 2));
    } else if (action === "rotate" || action === "revoke") {
      if (!argument || !/^[a-f0-9]{64}$/.test(argument)) throw new Error("凭证摘要不合法。");
      if (action === "revoke") await store.run("UPDATE access_tokens SET revoked=1 WHERE hash=?", argument);
      else console.log(JSON.stringify(await rotateStoredToken(store, argument, process.argv[4]), null, 2));
    } else if (action === "usage") {
      const day = argument || new Date().toISOString().slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error("日期不合法。");
      console.log(JSON.stringify(await store.all("SELECT owner_id,state,COUNT(*) AS requests,COALESCE(SUM(input_tokens),0) AS input_tokens,COALESCE(SUM(output_tokens),0) AS output_tokens,COALESCE(SUM(charged_micros),0) AS charged_micros FROM relay_usage_events WHERE day=? GROUP BY owner_id,state", day), null, 2));
    } else if (action === "backup") {
      if (!argument) throw new Error("请指定新的备份路径。");
      const target = resolve(argument);
      if (existsSync(target)) throw new Error("备份目标已经存在，请换一个新路径。");
      await mkdir(dirname(target), { recursive: true });
      if (database) backupRelayDatabase(database, target);
      else {
        const endpoint = new URL(url!);
        if (!["postgres:", "postgresql:"].includes(endpoint.protocol)) throw new Error("数据库协议不支持。");
        const env = { ...process.env, PGPASSWORD: decodeURIComponent(endpoint.password) };
        endpoint.password = "";
        await new Promise<void>((done, reject) => {
          const child = spawn("pg_dump", ["--dbname=" + endpoint.toString(), "--format=custom", "--file=" + target], { env, shell: false, windowsHide: true, stdio: "ignore" });
          child.once("error", () => reject(new Error("请先安装与生产数据库匹配的 PostgreSQL 客户端工具。")));
          child.once("exit", code => code === 0 ? done() : reject(new Error("PostgreSQL 备份未完成，请检查数据库权限。")));
        });
      }
      console.log(JSON.stringify({ ok: true, path: target }, null, 2));
    } else if (action === "list") console.log(JSON.stringify(await store.all("SELECT hash,label,revoked,created_at,account_id,last_used_at FROM access_tokens ORDER BY created_at DESC"), null, 2));
    else throw new Error("不支持的管理命令。");
  } finally { await store.close(); }
}
await main().catch(() => { console.error("官方管理操作未完成，请检查命令参数、数据库连接或备份工具。"); process.exitCode = 1; });
