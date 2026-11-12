/** 青穗集 · 官方后台维护：任务过期、租约回收、日志保留与可重试的脱敏告警投递。 */
import { randomBytes } from "node:crypto";
import type { RelayStore } from "./relay-store.js";
import type { RelayOperations } from "./relay-operations.js";
import { validateEndpoint } from "./model.js";
export interface MaintenanceConfig { logRetentionDays?: number; alertWebhookUrl?: string; alertWebhookToken?: string; allowLocal: boolean }
export function relayMaintenance(store: RelayStore, operations: RelayOperations, config: MaintenanceConfig, fetcher: typeof fetch, pollImages: () => Promise<void>) {
  let running: Promise<void> | null = null;
  let closed = false;
  async function work() {
    const lease = "maintenance_" + randomBytes(16).toString("hex"), timestamp = new Date().toISOString();
    const acquired = await store.transaction(async tx => {
      await tx.run("UPDATE relay_coordination SET version=version+1 WHERE id=1");
      const lock = await tx.get("SELECT expires_at FROM relay_leases WHERE owner_id='service' AND lane='maintenance'");
      if (lock && String(lock.expires_at) > timestamp) return false;
      await tx.run("DELETE FROM relay_leases WHERE owner_id='service' AND lane='maintenance'");
      await tx.run("INSERT INTO relay_leases(owner_id,lane,lease_id,expires_at) VALUES('service','maintenance',?,?)", lease, new Date(Date.now() + 180000).toISOString());
      await operations.expire(tx);
      const expired = await tx.all("SELECT id,operation_id FROM relay_image_tasks WHERE expires_at<? AND status<>'expired'", timestamp);
      for (const task of expired) {
        if (task.operation_id) await operations.settleIn(tx, String(task.operation_id), null, "failed");
        await tx.run("UPDATE relay_image_tasks SET status='expired',result_json=NULL,upstream_id='' WHERE id=?", String(task.id));
      }
      await tx.run("DELETE FROM relay_request_log WHERE created_at<?", new Date(Date.now() - (config.logRetentionDays ?? 30) * 86400000).toISOString());
      await tx.run("DELETE FROM relay_auth_limits WHERE started_at<?", Date.now() - 3600000);
      return true;
    });
    if (acquired) {
      try {
        if (config.alertWebhookUrl) {
          await validateEndpoint(config.alertWebhookUrl, config.allowLocal);
          const alerts = await store.all("SELECT id,kind,created_at,failures,code,attempts FROM relay_alerts WHERE status='pending' AND next_attempt_at<=? ORDER BY created_at LIMIT 5", timestamp);
          for (const alert of alerts) {
            let success = false;
            try {
              const response = await fetcher(config.alertWebhookUrl, { method: "POST", headers: { "Content-Type": "application/json", ...(config.alertWebhookToken ? { Authorization: "Bearer " + config.alertWebhookToken } : {}) }, body: JSON.stringify({ id: alert.id, event: alert.kind, occurred_at: alert.created_at, consecutive_failures: Number(alert.failures), error_code: alert.code }), redirect: "error", signal: AbortSignal.timeout(5000) });
              success = response.ok;
              await response.body?.cancel();
            } catch { /* 不记录 URL、凭据或远端响应正文。 */ }
            const attempts = Number(alert.attempts) + 1;
            await store.run("UPDATE relay_alerts SET status=?,attempts=?,next_attempt_at=? WHERE id=?", success ? "delivered" : attempts >= 8 ? "failed" : "pending", attempts, new Date(Date.now() + Math.min(3600000, 5000 * 2 ** attempts)).toISOString(), String(alert.id));
          }
        }
      } finally { await store.run("DELETE FROM relay_leases WHERE lease_id=?", lease); }
    }
    await pollImages();
  }
  return {
    tick() {
      if (closed) return Promise.resolve();
      if (!running) running = work().finally(() => { running = null; });
      return running;
    },
    async close() { closed = true; await running; },
  };
}
