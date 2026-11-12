/** 青穗集 · 官方账号授权：权限绑定账号 ID、逐次校验，管理变更进入不可覆盖的审计记录。 */
import { randomUUID } from "node:crypto";
import { ACCOUNT_PERMISSIONS, type AccountPermission } from "./credits-contract.js";
import { invariant } from "./errors.js";
import type { RelayStore } from "./relay-store.js";
export class RelayAccountAccess {
  constructor(readonly store: RelayStore) {}
  async accountId(tokenHash: string) {
    const row = await this.store.get("SELECT account_id FROM access_tokens WHERE hash=? AND revoked=0", tokenHash);
    invariant(row, 401, "官方连接已失效，请重新登录。", "relay_auth_required");
    return row.account_id == null ? null : Number(row.account_id);
  }
  async describe(accountId: number | null, tx = this.store) {
    if (accountId === null) return { id: null, username: "官方连接", role: "member" as const, permissions: [] as AccountPermission[] };
    const row = await tx.get("SELECT a.username,p.role,p.permissions_json FROM relay_accounts a LEFT JOIN relay_account_policies p ON p.account_id=a.id WHERE a.id=?", accountId);
    invariant(row, 404, "官方账号不存在。", "relay_account_not_found");
    const role: "member" | "admin" | "owner" = row.role === "owner" ? "owner" : row.role === "admin" ? "admin" : "member";
    let permissions: AccountPermission[] = [];
    if (role === "owner") permissions = [...ACCOUNT_PERMISSIONS];
    else if (row.permissions_json) {
      try { const value: unknown = JSON.parse(String(row.permissions_json)); if (Array.isArray(value)) permissions = ACCOUNT_PERMISSIONS.filter(p => value.includes(p)); } catch { /* 损坏的授权默认拒绝。 */ }
    }
    return { id: accountId, username: String(row.username), role, permissions };
  }
  async require(tokenHash: string, permission: AccountPermission) {
    const account = await this.describe(await this.accountId(tokenHash));
    invariant(account.id !== null && account.permissions.includes(permission), 403, "当前账号没有这项管理权限。", "account_permission_denied");
    return account;
  }
  async audit(tx: RelayStore, actor: string, accountId: number, action: string, value: unknown, reference?: string) {
    await tx.run("INSERT INTO relay_admin_audit(id,actor,target_account_id,action,value_json,created_at) VALUES(?,?,?,?,?,?)", reference ?? randomUUID(), actor, accountId, action, JSON.stringify(value), new Date().toISOString());
  }
  /** 只由服务器 CLI 调用：精确匹配已经存在的账号，不创建账号、不更改密码。 */
  async bootstrapOwner(username: string) {
    return this.store.transaction(async tx => {
      await tx.run("UPDATE relay_coordination SET version=version+1 WHERE id=1");
      const row = await tx.get("SELECT id FROM relay_accounts WHERE username=? AND status='active'", username);
      invariant(row, 404, "没有找到这个有效官方账号。", "relay_account_not_found");
      const accountId = Number(row.id);
      const owner = await tx.get("SELECT account_id FROM relay_account_policies WHERE role='owner'");
      invariant(!owner || Number(owner.account_id) === accountId, 409, "已经存在所有者，请由现有所有者管理权限。", "account_owner_exists");
      if (!owner) {
        await tx.run("INSERT INTO relay_account_policies(account_id,role,permissions_json,daily_points_micros,updated_at) VALUES(?,'owner','[]',NULL,?) ON CONFLICT(account_id) DO UPDATE SET role='owner',updated_at=excluded.updated_at", accountId, new Date().toISOString());
        await this.audit(tx, "server-console", accountId, "owner.bootstrap", { username });
      }
      return this.describe(accountId, tx);
    });
  }
  async setPermissions(actorId: number | null, accountId: number, permissions: AccountPermission[]) {
    return this.store.transaction(async tx => {
      await tx.run("UPDATE relay_coordination SET version=version+1 WHERE id=1");
      if (actorId !== null) {
        const actor = await this.describe(actorId, tx);
        invariant(actor.role === "owner", 403, "仅账号所有者可以分配管理权限。", "account_owner_required");
      }
      const target = await this.describe(accountId, tx);
      invariant(target.role !== "owner", 409, "所有者权限不能通过此入口覆盖。", "account_owner_protected");
      const allowed = ACCOUNT_PERMISSIONS.filter(p => permissions.includes(p));
      // permissions.manage 是所有者保留能力，不向普通管理员转授。
      invariant(!allowed.includes("permissions.manage"), 400, "权限分配由所有者保管。", "account_permission_reserved");
      await tx.run("INSERT INTO relay_account_policies(account_id,role,permissions_json,daily_points_micros,updated_at) VALUES(?,?,?,NULL,?) ON CONFLICT(account_id) DO UPDATE SET role=excluded.role,permissions_json=excluded.permissions_json,updated_at=excluded.updated_at", accountId, allowed.length ? "admin" : "member", JSON.stringify(allowed), new Date().toISOString());
      await this.audit(tx, actorId === null ? "server-console" : "account:" + actorId, accountId, "permissions.set", { permissions: allowed });
      return this.describe(accountId, tx);
    });
  }
}
