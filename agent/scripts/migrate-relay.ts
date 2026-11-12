/** 青穗集 · 官方 SQLite → PostgreSQL 迁移入口：只读取本机源库，不输出数据库凭据。 */
import { config as loadEnv } from "dotenv";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { connectRelayPostgres, sqliteRelayStore } from "../src/relay-store.js";
import { migrateRelayStore } from "../src/relay-migration.js";
import { configuredLocalStateDir } from "../src/local-state-path.js";
loadEnv({ path: existsSync(".env.relay") ? ".env.relay" : ".env", quiet: true });
const databaseUrl = process.env.RELAY_DATABASE_URL?.trim();
if (!databaseUrl) throw new Error("请先在官方服务配置中填写 RELAY_DATABASE_URL。");
const sourcePath = resolve(process.argv[2] || resolve(configuredLocalStateDir(process.env.RELAY_DATA_DIR, "relay"), "relay.sqlite"));
if (!existsSync(sourcePath)) throw new Error("SQLite 源库不存在，请检查路径。");
const source = sqliteRelayStore(new DatabaseSync(sourcePath));
let target: Awaited<ReturnType<typeof connectRelayPostgres>> | undefined;
try {
  target = await connectRelayPostgres(databaseUrl);
  console.log(JSON.stringify(await migrateRelayStore(source, target), null, 2));
} catch {
  console.error("迁移未完成，SQLite 源库仍保留。请检查空目标库、账号权限和未结算任务。");
  process.exitCode = 1;
} finally { await source.close(); await target?.close(); }
