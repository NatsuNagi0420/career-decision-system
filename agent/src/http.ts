/** 青穗集 · 本机 HTTP 服务：用户隔离、同源保护、模型设置、真实资料与 SSE 进度。 */
import Fastify from "fastify";
import { registerWebAssets } from "./assets.js";
import { describePreview } from "./artifact-preview.js";
import { canOpenArtifact, launchLocalFile, localFileAccess, materializeArtifact, type LocalFileLauncher } from "./local-artifacts.js";
import { z } from "zod";
import { join, resolve, extname, relative, sep } from "node:path";
import { readFile, stat, realpath } from "node:fs/promises";
import { Store } from "./store.js";
import { Auth } from "./auth.js";
import { Secrets } from "./secrets.js";
import { Profiles } from "./profiles.js";
import { Workspace } from "./files.js";
import { createSandbox } from "./sandbox.js";
import { Runtime } from "./runtime.js";
import { careerChangeInput } from "./career.js";
import { resumeChangeInput } from "./resume.js";
import { taskChangeInput } from "./guidance.js";
import { renderResumeHtml } from "./resume-render.js";
import { AppError, invariant, publicError, isRecord } from "./errors.js";
import type { Config } from "./config.js";
import type { Model, Profile, Sandbox } from "./types.js";
const uuid = z.string().uuid();
const credentials = z
  .object({
    username: z
      .string()
      .trim()
      .min(2)
      .max(40)
      .regex(/^[\p{L}\p{N}_-]+$/u),
    password: z.string().min(8).max(128),
    external_ai_consent: z.boolean().optional(),
  })
  .strict();
export interface AppOptions {
  config: Config;
  store?: Store;
  secrets?: Secrets;
  sandbox?: Sandbox;
  modelFactory?: (profile: Profile, key: string) => Model;
  localFileLauncher?: LocalFileLauncher;
  staticDir?: string;
  assetsDir?: string;
}
export function createApp(options: AppOptions) {
  const { config } = options;
  const store =
    options.store ?? new Store(join(config.dataDir, "agent.sqlite"));
  const auth = new Auth(store);
  const secrets = options.secrets ?? new Secrets();
  secrets.protect(config.officialToken);
  const profiles = new Profiles(store, secrets, config, options.modelFactory);
  const workspace = new Workspace(store, config.dataDir);
  const sandbox =
    options.sandbox ??
    createSandbox(config);
  const runtime = new Runtime(store, workspace, profiles, sandbox, config);
  const app = Fastify({
    logger: false,
    bodyLimit: 2 * 1024 * 1024,
    requestTimeout: 30000,
    // 模型连接测试可能进行数次受限请求，不能被普通 15 秒空闲超时提前切断。
    connectionTimeout: Math.max(30000, config.modelTimeoutMs * 4),
    routerOptions: { maxParamLength: 200 },
  });
  const buckets = new Map<string, { count: number; until: number }>();
  const streamClosers = new Set<() => void>();
  const rate = (key: string, max = 20) => {
    const old = buckets.get(key);
    if (!old || old.until < Date.now()) {
      if (buckets.size > 2000) buckets.clear();
      buckets.set(key, { count: 1, until: Date.now() + 60000 });
      return;
    }
    invariant(++old.count <= max, 429, "请求较频繁，请稍后重试。");
  };
  app.addHook("onRequest", async (request, reply) => {
    const host = request.hostname.replace(/^\[|\]$/g, "");
    invariant(
      ["127.0.0.1", "localhost", "::1"].includes(host),
      403,
      "不允许通过非本机域名访问本地服务。",
    );
    const origin = request.headers.origin;
    invariant(
      !origin ||
        config.origins.includes(origin) ||
        origin === "http://127.0.0.1:" + config.port ||
        origin === "http://localhost:" + config.port,
      403,
      "请求来源未被允许。",
    );
    reply
      .header("X-Content-Type-Options", "nosniff")
      .header("Referrer-Policy", "no-referrer")
      .header("Cache-Control", "no-store");
  });
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof z.ZodError)
      return reply.code(400).send({
        detail: "输入格式不符合要求，请检查必填项、长度和文件格式。",
        code: "invalid_input",
      });
    const status =
      error instanceof AppError
        ? error.status
        : isRecord(error) &&
            typeof error.statusCode === "number" &&
            error.statusCode < 500
          ? error.statusCode
          : 500;
    return reply.code(status).send({
      detail: secrets.redact(publicError(error)),
      code: error instanceof AppError ? error.code : "request_failed",
    });
  });
  registerWebAssets(app, options.assetsDir);
  app.get("/healthz", () => ({
    ok: true,
    runtime: "typescript",
    version: "0.1.0",
  }));
  app.post("/api/v1/auth/register", async (request, reply) => {
    rate("auth:" + request.ip);
    const body = credentials.parse(request.body);
    reply.code(201);
    return auth.register(
      body.username,
      body.password,
      body.external_ai_consent ?? false,
    );
  });
  app.post("/api/v1/auth/login", async (request) => {
    rate("auth:" + request.ip);
    const body = credentials.parse(request.body);
    return auth.login(body.username, body.password);
  });
  app.get("/api/v1/auth/me", async (request) =>
    auth.user(request.headers.authorization),
  );
  app.post("/api/v1/auth/logout", async (request) => {
    const user = auth.user(request.headers.authorization);
    for (const conversation of store.conversations(user.id)) {
      runtime.guidance.cancelAnalysis(conversation.id);
      const run = store.activeRun(conversation.id);
      if (run) runtime.cancel(user, run.id);
    }
    auth.logout(request.headers.authorization);
    secrets.clear(user.id);
    return { ok: true };
  });
  app.post("/api/v1/auth/ai-consent", async (request) => {
    const user = auth.user(request.headers.authorization);
    const { granted } = z
      .object({ granted: z.boolean() })
      .strict()
      .parse(request.body);
    store.setConsent(user.id, granted);
    if (!granted)
      for (const conversation of store.conversations(user.id)) {
        runtime.guidance.cancelAnalysis(conversation.id);
        const run = store.activeRun(conversation.id);
        if (run) runtime.cancel(user, run.id);
      }
    return { external_ai_consent: granted };
  });
  app.post("/api/v1/agent/resume/conversation", async request => {
    const user = auth.user(request.headers.authorization);
    const body = z.object({ profile_id: z.string().uuid().nullable().optional() }).strict().parse(request.body ?? {});
    return runtime.openResumeConversation(user, body.profile_id ?? null);
  });
  app.get("/api/v1/agent/resume", async request => runtime.resume.get(auth.user(request.headers.authorization).id));
  app.post("/api/v1/agent/resume/changes", async request => {
    const user = auth.user(request.headers.authorization);
    const body = resumeChangeInput.extend({ conversation_id: uuid.optional() }).parse(request.body);
    if (body.conversation_id) { store.conversation(user.id, body.conversation_id); runtime.assertConversationIdle(user, body.conversation_id); }
    runtime.guidance.assertResumeAccess(user.id, body.conversation_id);
    const state = runtime.resume.change(user.id, { revision: body.revision, change: body.change });
    if (body.conversation_id) runtime.guidance.refresh(user.id, body.conversation_id);
    return state;
  });
  app.post("/api/v1/agent/resume/export", async request => {
    const user = auth.user(request.headers.authorization);
    const body = z.object({ revision: z.number().int().nonnegative(), conversation_id: z.string().uuid(), template_id: z.enum(["one-page", "study", "compact"]).default("one-page") }).strict().parse(request.body);
    store.conversation(user.id, body.conversation_id);
    runtime.guidance.assertResumeAccess(user.id, body.conversation_id);
    runtime.assertConversationIdle(user, body.conversation_id);
    const state = runtime.resume.confirmed(user.id, body.revision);
    const base = "outputs/resume-v" + state.revision;
    const html = renderResumeHtml(state.header, state.body!, false, body.template_id);
    const document = JSON.stringify({ schema_version: 1, template_id: body.template_id, header: state.header, body: state.body }, null, 2);
    const artifacts = [];
    for (const [extension, content] of [["html", html], ["json", document]]) {
      const artifact = await workspace.write(body.conversation_id, null, base + "." + extension, content);
      runtime.event(body.conversation_id, null, "artifact.created", { artifact });
      artifacts.push(artifact);
    }
    return { artifacts };
  });
  app.get("/api/v1/agent/career", async request => runtime.career.view(auth.user(request.headers.authorization).id));
  app.get("/api/v1/agent/career/catalogue/directions", async request => {
    auth.user(request.headers.authorization);
    const query = z.record(z.string(), z.string()).parse(request.query);
    return runtime.career.catalogue.listCareerDirections({ ...query, ...(query.limit !== undefined ? { limit: Number(query.limit) } : {}) });
  });
  app.get("/api/v1/agent/career/catalogue/jobs", async request => {
    auth.user(request.headers.authorization);
    const query = z.record(z.string(), z.string()).parse(request.query);
    return runtime.career.catalogue.searchJobSamples({ ...query, ...(query.limit !== undefined ? { limit: Number(query.limit) } : {}) });
  });
  app.get("/api/v1/agent/career/catalogue/jobs/:id", async request => {
    auth.user(request.headers.authorization);
    return runtime.career.catalogue.readJobSample({ id: z.object({ id: z.string() }).parse(request.params).id });
  });
  app.post("/api/v1/agent/career/changes", async request => {
    const user = auth.user(request.headers.authorization);
    runtime.career.change(user.id, careerChangeInput.parse(request.body));
    return runtime.career.view(user.id);
  });
  app.get("/api/v1/agent/info", async (request) => {
    auth.user(request.headers.authorization);
    return {
      runtime: "typescript",
      deployment_mode: config.deploymentMode,
      local_file_actions: localFileAccess(config.deploymentMode, request.ip, request.headers.host ?? "", request.headers.origin),
      official_configured: profiles.officialConfigured(),
      persistent_secrets_supported: process.platform === "win32",
      file_workspace: {
        available: true,
        message: "结构化文件工具只访问本对话资料副本，不等于任意代码沙箱。",
        supported_extensions: [
          "txt",
          "md",
          "csv",
          "json",
          "yaml",
          "yml",
          "log",
        ],
        max_file_bytes: 1024 * 1024,
      },
      sandbox: await sandbox.health(true),
      limits: {
        steps: config.maxSteps,
        run_timeout_ms: config.runTimeoutMs,
        max_run_output_tokens: config.maxRunOutputTokens,
        context_max_tokens: config.contextMaxTokens,
        context_reserve_tokens: config.contextReserveTokens,
        context_recent_tokens: config.contextRecentTokens,
        context_max_tool_chars: config.contextMaxToolChars,
      },
    };
  });
  app.get("/api/v1/agent/models", async (request) =>
    profiles.list(auth.user(request.headers.authorization)),
  );
  app.post("/api/v1/agent/models/discover", async (request) => {
    const user = auth.user(request.headers.authorization);
    rate("discover:" + user.id, 10);
    return profiles.discover(user, request.body);
  });
  app.post("/api/v1/agent/models", async (request, reply) => {
    const user = auth.user(request.headers.authorization);
    invariant(store.profiles(user.id).length < 30, 400, "模型配置已达到上限。");
    reply.code(201);
    return profiles.save(user, request.body);
  });
  app.put<{ Params: { id: string } }>(
    "/api/v1/agent/models/:id",
    async (request) =>
      profiles.save(
        auth.user(request.headers.authorization),
        request.body,
        uuid.parse(request.params.id),
      ),
  );
  app.delete<{ Params: { id: string } }>(
    "/api/v1/agent/models/:id",
    async (request) => {
      profiles.delete(
        auth.user(request.headers.authorization),
        uuid.parse(request.params.id),
      );
      return { ok: true };
    },
  );
  app.post<{ Params: { id: string } }>(
    "/api/v1/agent/models/:id/test",
    async (request) => {
      const user = auth.user(request.headers.authorization);
      rate("test:" + user.id, 5);
      return profiles.test(user, uuid.parse(request.params.id));
    },
  );
  app.get("/api/v1/agent/conversations", async (request) =>
    store
      .conversations(auth.user(request.headers.authorization).id)
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at)),
  );
  app.post("/api/v1/agent/conversations", async (request, reply) => {
    const user = auth.user(request.headers.authorization);
    invariant(
      store.conversations(user.id).length < 1000,
      400,
      "本地对话数达到上限，请先整理历史。",
    );
    const body = z
      .object({
        profile_id: uuid.nullable().optional(),
        title: z.string().trim().min(1).max(80).optional(),
      })
      .strict()
      .parse(request.body ?? {});
    if (body.profile_id) store.profile(user.id, body.profile_id);
    reply.code(201);
    return store.createConversation(
      user.id,
      body.profile_id ?? null,
      body.title,
    );
  });
  app.get<{ Params: { id: string } }>(
    "/api/v1/agent/conversations/:id",
    async (request) =>
      runtime.snapshot(
        auth.user(request.headers.authorization),
        uuid.parse(request.params.id),
      ),
  );
  app.patch<{ Params: { id: string } }>(
    "/api/v1/agent/conversations/:id",
    async (request) => {
      const user = auth.user(request.headers.authorization);
      const conversation = store.conversation(
        user.id,
        uuid.parse(request.params.id),
      );
      const body = z
        .object({
          title: z.string().trim().min(1).max(80).optional(),
          profile_id: uuid.optional(),
          archived: z.boolean().optional(),
        })
        .strict()
        .parse(request.body);
      if (body.profile_id || body.archived !== undefined) runtime.assertConversationIdle(user, conversation.id);
      if (body.profile_id) {
        store.profile(user.id, body.profile_id);
        conversation.profile_id = body.profile_id;
      }
      if (body.title) { conversation.title = body.title; conversation.title_manual = true; }
      if (body.archived !== undefined) conversation.archived = body.archived;
      store.updateConversation(conversation);
      return conversation;
    },
  );
  app.post<{ Params: { id: string } }>("/api/v1/agent/conversations/:id/task", async request => {
    const user = auth.user(request.headers.authorization), cid = uuid.parse(request.params.id);
    runtime.assertConversationIdle(user, cid);
    return runtime.guidance.change(user, cid, taskChangeInput.parse(request.body));
  });
  app.post<{ Params: { id: string } }>("/api/v1/agent/conversations/:id/insights", async (request, reply) => {
    const user = auth.user(request.headers.authorization), cid = uuid.parse(request.params.id);
    const body = z.object({ profile_id: uuid, message_id: uuid }).strict().parse(request.body);
    store.conversation(user.id, cid);
    rate("insights:" + user.id, 6);
    runtime.assertConversationIdle(user, cid);
    const disconnected = () => { if (!reply.raw.writableFinished) runtime.guidance.cancelAnalysis(cid); };
    reply.raw.once("close", disconnected);
    try { return await runtime.guidance.analyze(user, cid, body.profile_id, body.message_id); }
    finally { reply.raw.off("close", disconnected); }
  });
  app.delete<{ Params: { id: string } }>("/api/v1/agent/conversations/:id", async request => {
    const user = auth.user(request.headers.authorization);
    return runtime.deleteConversation(user, uuid.parse(request.params.id));
  });
  app.post<{ Params: { id: string } }>(
    "/api/v1/agent/conversations/:id/files",
    async (request) => {
      const user = auth.user(request.headers.authorization);
      const conversation = store.conversation(
        user.id,
        uuid.parse(request.params.id),
      );
      store.assertIdle(conversation.id);
      const body = z
        .object({
          name: z.string().min(1).max(120),
          base64: z.string().max(1_400_000),
        })
        .strict()
        .parse(request.body);
      const artifact = await workspace.import(
        conversation.id,
        body.name,
        body.base64,
      );
      runtime.event(conversation.id, null, "artifact.created", { artifact });
      return artifact;
    },
  );
  app.post<{ Params: { id: string } }>(
    "/api/v1/agent/conversations/:id/runs",
    async (request) => {
      const user = auth.user(request.headers.authorization);
      rate("run:" + user.id, 20);
      const body = z
        .object({
          profile_id: uuid,
          input: z.string().trim().min(1).max(20000),
          request_id: uuid,
          replaces_message_id: uuid.optional(),
          permission_mode: z.enum(["default", "full-access"]).default("default"),
          reasoning_effort: z.enum(["auto", "low", "medium", "high"]).default("auto"),
          full_access_confirmed: z.boolean().default(false),
        })
        .strict()
        .parse(request.body);
      invariant(
        store
          .conversations(user.id)
          .filter((conversation) => store.activeRun(conversation.id)).length <
          3 || store.findRequest(user.id, body.request_id),
        429,
        "同时运行的任务较多，请先停止或完成其他任务。",
      );
      return runtime.start(
        user,
        uuid.parse(request.params.id),
        body.profile_id,
        body.input,
        body.request_id,
        { replaces_message_id: body.replaces_message_id, permission_mode: body.permission_mode, reasoning_effort: body.reasoning_effort, full_access_confirmed: body.full_access_confirmed },
      );
    },
  );
  app.post<{ Params: { id: string } }>(
    "/api/v1/agent/runs/:id/retry",
    async (request) => {
      const user = auth.user(request.headers.authorization);
      rate("run:" + user.id, 20);
      const body = z.object({ request_id: uuid, full_access_confirmed: z.boolean().default(false) }).strict().parse(request.body);
      invariant(store.conversations(user.id).filter(conversation => store.activeRun(conversation.id)).length < 3, 429, "同时运行的任务较多，请先完成其他任务。");
      return runtime.retry(user, uuid.parse(request.params.id), body.request_id, body.full_access_confirmed);
    },
  );
  app.post<{ Params: { id: string } }>(
    "/api/v1/agent/runs/:id/cancel",
    async (request) =>
      runtime.cancel(
        auth.user(request.headers.authorization),
        uuid.parse(request.params.id),
      ),
  );
  app.post<{ Params: { id: string } }>(
    "/api/v1/agent/artifacts/:id/export",
    async (request) =>
      runtime.requestExport(
        auth.user(request.headers.authorization),
        uuid.parse(request.params.id),
      ),
  );
  app.post<{ Params: { id: string } }>(
    "/api/v1/agent/approvals/:id",
    async (request) => {
      const user = auth.user(request.headers.authorization);
      const body = z
        .object({ approved: z.boolean() })
        .strict()
        .parse(request.body);
      return runtime.decide(user, uuid.parse(request.params.id), body.approved);
    },
  );
  app.get<{ Params: { id: string } }>(
    "/api/v1/agent/artifacts/:id/preview",
    async (request) => {
      const user = auth.user(request.headers.authorization);
      const artifact = store.artifact(user.id, uuid.parse(request.params.id));
      const bytes = await workspace.artifactBytes(artifact);
      return { artifact, ...describePreview(artifact.name, bytes) };
    },
  );
  app.get<{ Params: { id: string } }>("/api/v1/agent/artifacts/:id/content", async (request, reply) => {
    const user = auth.user(request.headers.authorization);
    const artifact = store.artifact(user.id, uuid.parse(request.params.id));
    const bytes = await workspace.artifactBytes(artifact);
    const preview = describePreview(artifact.name, bytes);
    invariant(preview.preview_kind === "image" || preview.preview_kind === "pdf", 415, "此文件没有二进制预览，请使用文本预览或下载。");
    return reply.header("Content-Type", preview.mime).header("Content-Disposition", "inline; filename*=UTF-8''" + encodeURIComponent(artifact.name)).header("Content-Security-Policy", "default-src 'none'; sandbox").send(bytes);
  });
  app.post<{ Params: { id: string } }>("/api/v1/agent/artifacts/:id/local-open", async (request) => {
    const user = auth.user(request.headers.authorization);
    invariant(localFileAccess(config.deploymentMode, request.ip, request.headers.host ?? "", request.headers.origin), 403, "仅本机页面可使用系统打开功能；服务器文件请下载。");
    const { action } = z.object({ action: z.enum(["open", "reveal"]) }).strict().parse(request.body);
    const artifact = store.artifact(user.id, uuid.parse(request.params.id));
    invariant(action === "reveal" || canOpenArtifact(artifact.name), 415, "此格式不能直接交给系统应用；脚本、程序与网页仅允许预览或下载。");
    const target = await materializeArtifact(workspace, artifact);
    await (options.localFileLauncher ?? launchLocalFile)(target, action);
    runtime.event(artifact.conversation_id, null, "artifact.local_open_requested", { artifact_id: artifact.id, action, version: artifact.version });
    return { ok: true, message: action === "open" ? "已请求默认应用打开此版本的副本，编辑不会自动同步到对话。" : "已请求打开此版本副本所在的文件夹。" };
  });
  app.get<{ Params: { id: string }; Querystring: { approval?: string } }>(
    "/api/v1/agent/artifacts/:id/download",
    async (request, reply) => {
      const user = auth.user(request.headers.authorization);
      const artifact = store.artifact(user.id, uuid.parse(request.params.id));
      const approval = store.approval(
        user.id,
        uuid.parse(request.query.approval),
      );
      invariant(
        approval.status === "approved" &&
          approval.artifact_id === artifact.id &&
          approval.sha256 === artifact.sha256 &&
          approval.expires_at > new Date().toISOString(),
        403,
        "请先确认导出这个文件版本，授权过期后需重新确认。",
      );
      const bytes = await workspace.artifactBytes(artifact);
      runtime.event(
        artifact.conversation_id,
        null,
        "artifact.download_requested",
        {
          artifact_id: artifact.id,
          version: artifact.version,
          bytes: bytes.length,
        },
      );
      reply
        .header("Content-Type", "application/octet-stream")
        .header(
          "Content-Disposition",
          "attachment; filename*=UTF-8''" + encodeURIComponent(artifact.name),
        );
      return reply.send(bytes);
    },
  );
  app.get<{ Params: { id: string }; Querystring: { after?: string } }>(
    "/api/v1/agent/conversations/:id/events",
    async (request, reply) => {
      const user = auth.user(request.headers.authorization);
      const conversation = store.conversation(
        user.id,
        uuid.parse(request.params.id),
      );
      let cursor = z.coerce
        .number()
        .int()
        .min(0)
        .max(Number.MAX_SAFE_INTEGER)
        .parse(request.query.after ?? 0);
      request.raw.socket.setTimeout(0);
      reply.hijack();
      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
        "X-Content-Type-Options": "nosniff",
      });
      let closed = false;
      const send = (value: ReturnType<Store["appendEvent"]>) => {
        if (closed || value.seq <= cursor) return;
        cursor = value.seq;
        reply.raw.write(
          "id: " + value.seq + "\ndata: " + JSON.stringify(value) + "\n\n",
        );
      };
      let batch;
      do {
        batch = store.events(conversation.id, cursor, 1000);
        for (const event of batch) send(event);
      } while (batch.length === 1000);
      const unsubscribe = runtime.subscribe(conversation.id, send);
      reply.raw.write(": connected\n\n");
      const timer = setInterval(() => {
        try {
          auth.user(request.headers.authorization);
        } catch {
          close();
          return;
        }
        if (!closed) reply.raw.write(": heartbeat\n\n");
      }, 15000);
      const close = () => {
        if (closed) return;
        closed = true;
        clearInterval(timer);
        unsubscribe();
        streamClosers.delete(close);
        runtime.hub.off("conversation.deleted", onDeleted);
        reply.raw.end();
      };
      const onDeleted = (id: string) => {
        if (id !== conversation.id || closed) return;
        send({ seq: cursor + 1, conversation_id: id, run_id: null, kind: "conversation.deleted", data: {}, created_at: new Date().toISOString() });
        close();
      };
      runtime.hub.on("conversation.deleted", onDeleted);
      streamClosers.add(close);
      reply.raw.on("close", close);
    },
  );
  const staticDir = options.staticDir ?? resolve(process.cwd(), "../web/dist");
  app.setNotFoundHandler(async (request, reply) => {
    if (request.url.startsWith("/api/"))
      return reply.code(404).send({ detail: "接口不存在。" });
    let pathname: string;
    try {
      pathname = decodeURIComponent(
        new URL(request.url, "http://localhost").pathname,
      );
    } catch {
      return reply.code(400).send({ detail: "地址格式错误。" });
    }
    invariant(
      !pathname.includes("\\") && !pathname.includes("\0"),
      400,
      "地址格式错误。",
    );
    let target = resolve(staticDir, "." + pathname);
    invariant(
      !relative(staticDir, target).startsWith(".." + sep) &&
        relative(staticDir, target) !== "..",
      403,
      "路径超出范围。",
    );
    try {
      if (!(await stat(target)).isFile())
        target = join(staticDir, "index.html");
      const actual = await realpath(target);
      invariant(
        actual
          .toLowerCase()
          .startsWith((resolve(staticDir) + sep).toLowerCase()),
        403,
        "不允许访问链接目标。",
      );
      const data = await readFile(target);
      const mime: Record<string, string> = {
        ".html": "text/html; charset=utf-8",
        ".js": "text/javascript; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".json": "application/json",
        ".png": "image/png",
        ".svg": "image/svg+xml",
        ".woff2": "font/woff2",
        ".ico": "image/x-icon",
        ".jpg": "image/jpeg",
        ".webp": "image/webp",
      };
      reply.type(mime[extname(target)] ?? "application/octet-stream");
      return reply.send(data);
    } catch (error) {
      if (error instanceof AppError) throw error;
      return reply.code(404).send({
        detail: "前端尚未构建，请运行 web 的 npm run build，或启动 Vite。",
      });
    }
  });
  app.addHook("preClose", async () => {
    for (const close of streamClosers) close();
  });
  app.addHook("onClose", async () => {
    await runtime.shutdown();
    if (!options.store) store.close();
  });
  return { app, store, auth, secrets, profiles, workspace, sandbox, runtime };
}
