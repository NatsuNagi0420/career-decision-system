/** 青穗集 · 官方模型中转：固定上游、独立访问凭证、请求与输出配额，不运行用户电脑工具。 */
import Fastify from "fastify";
import { DatabaseSync } from "node:sqlite";
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { normalizeBaseUrl, validateEndpoint, readLimited } from "./model.js";
import { AppError, invariant, isRecord, publicError } from "./errors.js";
import { validateRelayPayload } from "./relay-policy.js";
import { responseError } from "./provider.js";
import { fetchWithIdleTimeout } from "./idle-timeout.js";
export interface RelayConfig {
  dataDir: string;
  upstreamUrl: string;
  upstreamKey: string;
  model: string;
  kind: "chat-completions" | "responses";
  maxOutput: number;
  dailyOutput: number;
  dailyRequests: number;
  allowLocal: boolean;
  idleTimeoutMs?: number;
}
const digest = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export function relayDatabase(dir: string) {
  mkdirSync(dir, { recursive: true });
  const db = new DatabaseSync(join(dir, "relay.sqlite"));
  db.exec(
    "PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS access_tokens(hash TEXT PRIMARY KEY,label TEXT NOT NULL,revoked INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL); CREATE TABLE IF NOT EXISTS daily_usage(token_hash TEXT NOT NULL,day TEXT NOT NULL,requests INTEGER NOT NULL,output_reserved INTEGER NOT NULL,PRIMARY KEY(token_hash,day));",
  );
  return db;
}
export function issueRelayToken(db: DatabaseSync, label: string) {
  const token = "qsg_" + randomBytes(32).toString("base64url");
  const hash = digest(token);
  db.prepare("INSERT INTO access_tokens VALUES(?,?,0,?)").run(
    hash,
    label,
    new Date().toISOString(),
  );
  return { token, hash };
}
export function createRelay(
  config: RelayConfig,
  fetcher: typeof fetch = fetch,
) {
  invariant(
    config.upstreamKey && config.model,
    500,
    "官方中转需要配置上游 Key 和模型。",
  );
  const baseUrl = normalizeBaseUrl(config.upstreamUrl, config.allowLocal);
  const db = relayDatabase(config.dataDir);
  const app = Fastify({
    logger: false,
    bodyLimit: 768000,
    requestTimeout: 70000,
  });
  const active = new Set<string>();
  app.setErrorHandler((error, _request, reply) =>
    reply
      .code(
        error instanceof AppError
          ? error.status
          : error instanceof z.ZodError
            ? 400
            : 500,
      )
      .send({ error: { message: publicError(error), type: "relay_error", code: error instanceof AppError ? error.code : "request_failed" } }),
  );
  app.get("/healthz", () => ({ ok: true, service: "official-model-relay" }));
  app.post(
    "/v1/" + (config.kind === "responses" ? "responses" : "chat/completions"),
    async (request, reply) => {
      invariant(
        !request.headers.origin,
        403,
        "官方上游凭证不能由浏览器直接使用。",
      );
      const authorization = request.headers.authorization;
      invariant(
        authorization?.startsWith("Bearer "),
        401,
        "缺少官方访问凭证。",
      );
      const tokenHash = digest(authorization!.slice(7));
      const token = db
        .prepare("SELECT hash FROM access_tokens WHERE hash=? AND revoked=0")
        .get(tokenHash);
      invariant(token, 401, "官方访问凭证无效或已撤销。");
      invariant(
        !active.has(tokenHash) && active.size < 20,
        429,
        "官方服务当前任务较多，请稍后重试。",
      );
      const body = z.record(z.string(), z.unknown()).parse(request.body);
      invariant(
        body.model === config.model,
        403,
        "该官方入口不允许切换到其他上游模型。",
      );
      const allowed = new Set(
        config.kind === "responses"
          ? [
              "model",
              "input",
              "tools",
              "tool_choice",
              "max_output_tokens",
              "stream",
              "store",
              "include",
              "reasoning",
            ]
          : [
              "model",
              "messages",
              "tools",
              "tool_choice",
              "max_tokens",
              "max_completion_tokens",
              "stream",
              "stream_options",
              "reasoning_effort",
            ],
      );
      invariant(
        Object.keys(body).every((key) => allowed.has(key)),
        400,
        "中转请求包含不支持的字段。",
      );
      const items = config.kind === "responses" ? body.input : body.messages;
      invariant(
        Array.isArray(items) && items.length > 0 && items.length <= 150,
        400,
        "对话数量不符合要求。",
      );
      invariant(
        typeof body.stream === "boolean" || body.stream === undefined,
        400,
        "stream 必须是布尔值。",
      );
      validateRelayPayload(body, config.kind);
      const maxKey =
        config.kind === "responses"
          ? "max_output_tokens"
          : body.max_completion_tokens !== undefined
            ? "max_completion_tokens"
            : "max_tokens";
      const requested = Number(body[maxKey] ?? config.maxOutput);
      invariant(
        Number.isInteger(requested) && requested > 0,
        400,
        "输出上限不合法。",
      );
      body[maxKey] = Math.min(requested, config.maxOutput);
      if (config.kind === "responses") body.store = false;
      const day = new Date().toISOString().slice(0, 10);
      db.exec("BEGIN IMMEDIATE");
      try {
        const usage = db
          .prepare(
            "SELECT requests,output_reserved FROM daily_usage WHERE token_hash=? AND day=?",
          )
          .get(tokenHash, day);
        invariant(
          Number(usage?.requests ?? 0) < config.dailyRequests &&
            Number(usage?.output_reserved ?? 0) + Number(body[maxKey]) <=
              config.dailyOutput,
          429,
          "此官方凭证的今日额度已用完。",
        );
        db.prepare(
          "INSERT INTO daily_usage VALUES(?,?,1,?) ON CONFLICT(token_hash,day) DO UPDATE SET requests=requests+1,output_reserved=output_reserved+excluded.output_reserved",
        ).run(tokenHash, day, Number(body[maxKey]));
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
      active.add(tokenHash);
      const abort = new AbortController();
      const onClose = () => {
        if (!reply.raw.writableEnded) abort.abort();
      };
      reply.raw.on("close", onClose);
      try {
        await validateEndpoint(baseUrl, config.allowLocal);
        const response = await fetchWithIdleTimeout(
          baseUrl +
            "/" +
            (config.kind === "responses" ? "responses" : "chat/completions"),
          {
            method: "POST",
            headers: {
              Authorization: "Bearer " + config.upstreamKey,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
            redirect: "error",
            signal: abort.signal,
          },
          config.idleTimeoutMs ?? 120000,
          fetcher,
        );
        if (!response.ok) {
          // 仅转发经过连接层分类的参数名，绝不回显可能含密钥或对话的上游原始错误。
          const error = await responseError(response);
          if (error.rejectedParameter)
            return reply.code(response.status).send({
              error: {
                message: "接口不支持参数 " + error.rejectedParameter + "。",
                type: "invalid_request_error",
                code: "unsupported_parameter",
                param: error.rejectedParameter,
              },
            });
          throw new AppError(
            response.status === 429 ? 429 : 502,
            "官方上游暂时不可用（HTTP " + response.status + "）。",
            error.code,
          );
        }
        if (body.stream) {
          invariant(
            response.body &&
              response.headers
                .get("content-type")
                ?.includes("text/event-stream"),
            502,
            "上游不支持此流式请求。",
          );
          reply.hijack();
          reply.raw.writeHead(200, {
            "Content-Type": "text/event-stream; charset=utf-8",
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",
          });
          let size = 0;
          try {
            for await (const chunk of response.body) {
              size += chunk.byteLength;
              if (size > 2_000_000)
                throw new AppError(502, "上游输出超过上限。");
              if (!reply.raw.write(Buffer.from(chunk)))
                await new Promise<void>((resolve, reject) => {
                  reply.raw.once("drain", resolve);
                  reply.raw.once("close", () => reject(new Error("closed")));
                });
            }
          } catch (error) {
            if (!abort.signal.aborted && !reply.raw.destroyed) {
              const code = error instanceof Error && error.name === "TimeoutError" ? "provider_timeout" : "provider_stream";
              reply.raw.write("data: " + JSON.stringify({ error: { code, message: "官方模型本次回复未完成。" } }) + "\n\n");
            }
          } finally {
            reply.raw.end();
          }
          return reply;
        }
        const text = await readLimited(response);
        let parsed: unknown;
        try {
          parsed = JSON.parse(text);
        } catch {
          throw new AppError(502, "官方上游返回无效响应。");
        }
        invariant(isRecord(parsed), 502, "官方上游返回无效响应。");
        return reply.type("application/json").send(parsed);
      } catch (error) {
        if (reply.raw.headersSent) {
          reply.raw.end();
          return reply;
        }
        if (error instanceof AppError) throw error;
        throw new AppError(502, "官方模型请求未完成，请稍后重试。", error instanceof Error && error.name === "TimeoutError" ? "provider_timeout" : "provider_network");
      } finally {
        reply.raw.removeListener("close", onClose);
        active.delete(tokenHash);
      }
    },
  );
  app.addHook("onClose", async () => db.close());
  return { app, db };
}
