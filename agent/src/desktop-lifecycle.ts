/** 青穗集 · 桌面控制接口：只在本机发行入口注册，完全退出须登录、同源并明确确认。 */
import { z } from "zod";
import type { createApp } from "./http.js";
import { invariant } from "./errors.js";
export function registerDesktopLifecycle(ctx: ReturnType<typeof createApp>, options: { version: string; requestExit: () => void }) {
  ctx.app.get("/api/v1/desktop", async () => ({ managed: true, version: options.version, close_behavior: "background" }));
  ctx.app.post("/api/v1/desktop/quit", async (request, reply) => {
    await (ctx.accounts ? ctx.accounts.user(request.headers.authorization) : ctx.auth.user(request.headers.authorization));
    z.object({ confirmed: z.literal(true) }).strict().parse(request.body);
    const origin = request.headers.origin;
    invariant(origin === "http://" + request.headers.host, 403, "请从本机窗口确认退出。", "desktop_origin_required");
    reply.raw.once("finish", options.requestExit);
    return reply.send({ ok: true, stopping: true });
  });
}
