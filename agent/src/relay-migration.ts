/** 青穗集 · 官方数据库迁移：空目标导入、完整性校验与事务回滚，保留 SQLite 源库。 */
import { createHash } from "node:crypto";
import type { RelayStore, RelayRow } from "./relay-store.js";
import { initializeRelayStore, relayTables } from "./relay-store.js";
import { invariant } from "./errors.js";
function fingerprint(rows: RelayRow[]) {
  const normalized = rows.map(row => JSON.stringify(Object.entries(row).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => [key, value == null ? null : String(value)]))).sort();
  return createHash("sha256").update(normalized.join("\n")).digest("hex");
}
export async function migrateRelayStore(source: RelayStore, target: RelayStore) {
  invariant(source !== target, 400, "源数据库和目标数据库不能相同。", "migration_same_store");
  await initializeRelayStore(source);
  await initializeRelayStore(target);
  return source.transaction(async snapshot => target.transaction(async destination => {
    if (destination.dialect === "postgres") await destination.get("SELECT pg_advisory_xact_lock(7168210)");
    const active = await snapshot.get("SELECT COUNT(*) AS count FROM relay_leases WHERE expires_at>?", new Date().toISOString());
    invariant(Number(active?.count ?? 0) === 0, 409, "请先停止官方服务，等待当前任务结束后再迁移。", "migration_active_tasks");
    const pending = await snapshot.get("SELECT COUNT(*) AS count FROM relay_usage_events WHERE state='reserved'");
    invariant(Number(pending?.count ?? 0) === 0, 409, "还有未结算任务，请先让后台完成或过期回收。", "migration_pending_usage");
    for (const table of relayTables) {
      const count = await destination.get("SELECT COUNT(*) AS count FROM " + table);
      invariant(Number(count?.count ?? 0) === 0, 409, "目标数据库已有资料，请使用空数据库。", "migration_target_not_empty");
    }
    const report: Array<{ table: string; rows: number; sha256: string }> = [];
    for (const table of relayTables) {
      if (table === "relay_leases" || table === "relay_auth_limits") continue;
      const rows = await snapshot.all("SELECT * FROM " + table);
      for (const row of rows) {
        const keys = Object.keys(row);
        invariant(keys.every(key => /^[a-z_]+$/.test(key)), 500, "源数据结构不兼容。", "migration_columns");
        await destination.run("INSERT INTO " + table + "(" + keys.join(",") + ") VALUES(" + keys.map(() => "?").join(",") + ")", ...keys.map(key => row[key]));
      }
      const copied = await destination.all("SELECT * FROM " + table);
      const checksum = fingerprint(rows);
      invariant(rows.length === copied.length && checksum === fingerprint(copied), 500, "迁移完整性校验未通过，目标事务已回滚。", "migration_checksum");
      report.push({ table, rows: rows.length, sha256: checksum });
    }
    if (destination.dialect === "postgres") for (const table of ["relay_accounts", "relay_request_log"]) {
      await destination.get("SELECT setval(pg_get_serial_sequence('" + table + "','id'),COALESCE(MAX(id),1),MAX(id) IS NOT NULL) FROM " + table);
    }
    return { migrated_at: new Date().toISOString(), tables: report };
  }));
}
