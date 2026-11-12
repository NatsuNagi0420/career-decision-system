/** 青穗集 · 官方积分同源代理：凭证只在服务端读取，不允许浏览器直接连接中转或指定其他账号。 */
import { z } from "zod";
import { AppError, invariant } from "./errors.js";
import { readLimited, normalizeBaseUrl, validateEndpoint } from "./provider.js";
import type { OfficialCredits } from "./credits-contract.js";
const creditSchema = z.object({
  enabled: z.boolean(),
  account: z.object({ id: z.number().nullable(), username: z.string(), role: z.enum(["member", "admin", "owner"]), permissions: z.array(z.enum(["accounts.read", "credits.manage", "permissions.manage"])) }),
  summary: z.object({ day: z.string(), timezone: z.string(), resets_at: z.string(), daily_points: z.number().nonnegative(), adjustment_points: z.number(), used_points: z.number().nonnegative(), reserved_points: z.number().nonnegative(), remaining_points: z.number().nonnegative() }),
  pricing: z.object({ version: z.string(), input_per_1000: z.number(), cached_input_per_1000: z.number(), output_per_1000: z.number(), image_per_item: z.number() }),
  entries: z.array(z.object({ id: z.string(), created_at: z.string(), completed_at: z.string().nullable(), capability: z.string(), state: z.enum(["reserved", "completed", "failed", "interrupted", "unmetered"]), points: z.number(), reserved_points: z.number(), input_tokens: z.number().nullable(), output_tokens: z.number().nullable(), cached_input_tokens: z.number(), price_version: z.string().nullable() })),
  next_cursor: z.string().nullable(),
});
export async function fetchOfficialCredits(url: string, key: string | null | undefined, cursor?: string): Promise<OfficialCredits> {
  invariant(key, 401, "请先登录官方账号。", "official_auth_required");
  const base = normalizeBaseUrl(url, true);
  await validateEndpoint(base, true);
  let response: Response;
  try { response = await fetch(base + "/account/credits" + (cursor ? "?cursor=" + encodeURIComponent(cursor) : ""), { headers: { Accept: "application/json", Authorization: "Bearer " + key }, redirect: "error", signal: AbortSignal.timeout(15000) }); }
  catch { throw new AppError(503, "暂时无法读取积分，请稍后重试。", "official_credits_unavailable"); }
  invariant(response.ok, response.status === 401 ? 401 : 503, response.status === 401 ? "官方连接已失效，请重新登录。" : "暂时无法读取积分，请稍后重试。", "official_credits_unavailable");
  let value: unknown;
  try { value = JSON.parse(await readLimited(response, 256 * 1024)); } catch { throw new AppError(502, "积分记录读取失败。", "official_credits_response"); }
  const parsed = creditSchema.safeParse(value);
  invariant(parsed.success, 502, "积分记录读取失败。", "official_credits_response");
  return parsed.data;
}
