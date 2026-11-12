/** 青穗集 · 官方账号管理员命令：仅在服务器执行，不向客户端分发管理密钥。 */
import { config as loadEnv } from "dotenv";
import { existsSync } from "node:fs";
import { configuredLocalStateDir } from "./local-state-path.js";
import { relayDatabase } from "./relay-app.js";
import { connectRelayPostgres, initializeRelayStore, sqliteRelayStore } from "./relay-store.js";
import { RelayAccountAccess } from "./relay-account-access.js";
import { ACCOUNT_PERMISSIONS, type AccountPermission } from "./credits-contract.js";
import { pointsConfigFromEnv } from "./relay-points-config.js";
import { RelayPoints } from "./relay-points.js";
import { invariant, AppError } from "./errors.js";
loadEnv({ path: process.env.RELAY_ENV_FILE || (existsSync(".env.relay") ? ".env.relay" : ".env"), quiet: true });
async function main() {
  const url = process.env.RELAY_DATABASE_URL?.trim();
  const store = url ? await connectRelayPostgres(url) : sqliteRelayStore(relayDatabase(configuredLocalStateDir(process.env.RELAY_DATA_DIR, "relay")));
  try {
    await initializeRelayStore(store);
    const access = new RelayAccountAccess(store);
    const points = new RelayPoints(store, pointsConfigFromEnv(process.env));
    const [command, username, argument, reference, ...reason] = process.argv.slice(2);
    if (command === "list") return console.log(JSON.stringify(await store.all("SELECT a.id,a.username,a.status,COALESCE(p.role,'member') AS role,p.daily_points_micros FROM relay_accounts a LEFT JOIN relay_account_policies p ON p.account_id=a.id ORDER BY a.id DESC LIMIT 100"), null, 2));
    invariant(username, 400, "请指定官方账号名称。", "admin_argument");
    const row = await store.get("SELECT id FROM relay_accounts WHERE username=?", username);
    invariant(row, 404, "没有找到这个官方账号。", "relay_account_not_found");
    const accountId = Number(row.id);
    let result: unknown;
    if (command === "owner") result = await access.bootstrapOwner(username);
    else if (command === "inspect") result = await points.view("account:" + accountId, accountId);
    else if (command === "limit") { invariant(argument !== undefined && argument.trim() !== "", 400, "请提供每日积分额度。", "admin_argument"); result = await points.setLimit(null, accountId, Number(argument)); }
    else if (command === "grant") result = await points.adjust(null, accountId, Number(argument), reference || "", reason.join(" "));
    else if (command === "permissions") {
      invariant(argument !== undefined, 400, "请提供逗号分隔的权限，或 none 撤销权限。", "admin_argument");
      const permissions = argument === "none" ? [] : argument.split(",");
      invariant(permissions.every(p => ACCOUNT_PERMISSIONS.includes(p as AccountPermission)), 400, "权限名称无效。", "admin_argument");
      result = await access.setPermissions(null, accountId, permissions as AccountPermission[]);
    } else throw new AppError(400, "可用命令：list、inspect、owner、limit、grant、permissions。", "admin_argument");
    console.log(JSON.stringify(result, null, 2));
  } finally { await store.close(); }
}
await main().catch(error => { console.error(error instanceof AppError ? error.message : "账号管理未完成，请检查数据库连接和命令参数。"); process.exitCode = 1; });
