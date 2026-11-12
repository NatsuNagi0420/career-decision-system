/** 青穗集 · 积分与账号权限接口：用户仅访问本人账本，管理操作逐次验证官方账号权限。 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { ACCOUNT_PERMISSIONS } from "./credits-contract.js";
import { RelayAccountAccess } from "./relay-account-access.js";
import type { RelayOperations } from "./relay-operations.js";
export function registerCreditRoutes(app: FastifyInstance, operations: RelayOperations) {
  const access = new RelayAccountAccess(operations.store);
  const id = (value: string) => z.coerce.number().int().positive().safe().parse(value);
  app.get("/v1/account/credits", async request => {
    const token = await operations.authorize(request.headers);
    const query = z.object({ cursor: z.string().max(600).optional(), limit: z.coerce.number().int().min(1).max(100).default(30) }).strict().parse(request.query);
    return operations.points.view(await operations.owner(token), await access.accountId(token), query.cursor, query.limit);
  });
  app.get("/v1/admin/accounts", async request => {
    await access.require(await operations.authorize(request.headers), "accounts.read");
    const query = z.object({ before: z.coerce.number().int().positive().optional() }).strict().parse(request.query);
    return { accounts: await operations.store.all("SELECT a.id,a.username,a.status,p.role,p.daily_points_micros FROM relay_accounts a LEFT JOIN relay_account_policies p ON p.account_id=a.id" + (query.before ? " WHERE a.id<?" : "") + " ORDER BY a.id DESC LIMIT 100", ...(query.before ? [query.before] : [])) };
  });
  app.post<{ Params: { id: string } }>("/v1/admin/accounts/:id/permissions", async request => {
    const actor = await access.require(await operations.authorize(request.headers), "permissions.manage");
    const body = z.object({ permissions: z.array(z.enum(ACCOUNT_PERMISSIONS)).max(ACCOUNT_PERMISSIONS.length) }).strict().parse(request.body);
    return access.setPermissions(actor.id, id(request.params.id), body.permissions);
  });
  app.post<{ Params: { id: string } }>("/v1/admin/accounts/:id/points-limit", async request => {
    const actor = await access.require(await operations.authorize(request.headers), "credits.manage");
    const body = z.object({ daily_points: z.number().min(0).max(1_000_000) }).strict().parse(request.body);
    return operations.points.setLimit(actor.id, id(request.params.id), body.daily_points);
  });
  app.post<{ Params: { id: string } }>("/v1/admin/accounts/:id/points", async request => {
    const actor = await access.require(await operations.authorize(request.headers), "credits.manage");
    const body = z.object({ points: z.number().positive().max(1_000_000), reference: z.string().min(8).max(120), reason: z.string().trim().min(1).max(300) }).strict().parse(request.body);
    return operations.points.adjust(actor.id, id(request.params.id), body.points, body.reference, body.reason);
  });
}
