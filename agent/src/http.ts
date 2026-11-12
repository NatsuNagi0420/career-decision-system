/** 青穗集 · 本机 HTTP 服务：用户隔离、同源保护、模型设置、真实资料与 SSE 进度。 */
import Fastify from "fastify";
import { registerWebAssets } from "./assets.js";
import { ONBOARDING_LAST_STEP } from "./onboarding-contract.js";
import { deploymentUi } from "./ui-contract.js";
import { extractDocumentText } from "./document-text.js";
import { describePreview } from "./artifact-preview.js";
import { canOpenArtifact, launchLocalFile, localFileAccess, materializeArtifact, type LocalFileLauncher } from "./local-artifacts.js";
import { z } from "zod";
import { join, resolve, extname, relative, sep } from "node:path";
import { readFile, stat, realpath } from "node:fs/promises";
import { Store } from "./store.js";
import { Auth } from "./auth.js";
import { AccountIdentity } from "./account-identity.js";
import { Secrets } from "./secrets.js";
import { Profiles } from "./profiles.js";
import { Workspace, MAX_BINARY_FILE_BYTES, MAX_FILE_BYTES, SUPPORTED_INPUT_EXTENSIONS } from "./files.js";
import { pickLocalWorkspace, type LocalWorkspacePicker } from "./local-workspace-picker.js";
import { createSandbox } from "./sandbox.js";
import { Runtime } from "./runtime.js";
import { toolRegistry } from "./tools.js";
import { careerChangeInput } from "./career.js";
import { resumeChangeInput, resumeEditInput } from "./resume.js";
import { taskChangeInput } from "./guidance.js";
import { memoryChangeInput, memorySettingsInput } from "./core/long-term-memory.js";
import { renderResumeHtml } from "./resume-render.js";
import { AppError, invariant, publicError, isRecord } from "./errors.js";
import type { Config } from "./config.js";
import type { Model, Profile, Sandbox, WorkspaceAccess } from "./types.js";
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
  unifiedIdentity?: boolean;
  hubOnly?: boolean;
  store?: Store;
  secrets?: Secrets;
  sandbox?: Sandbox;
  modelFactory?: (profile: Profile, key: string) => Model;
  localFileLauncher?: LocalFileLauncher;
  staticDir?: string;
  assetsDir?: string;
  localWorkspacePicker?: LocalWorkspacePicker;
}
export function createApp(options: AppOptions) {
  const { config } = options;
  const store =
    options.store ?? new Store(join(config.dataDir, "agent.sqlite"));
  const auth = new Auth(store);
  const secrets = options.secrets ?? new Secrets();
  secrets.protect(config.officialToken);
  const accounts = options.unifiedIdentity ? new AccountIdentity(store, auth, secrets, config) : undefined;
  const authenticate = (header?: string) => accounts ? accounts.user(header) : Promise.resolve(auth.user(header));
  const profiles = new Profiles(store, secrets, config, options.modelFactory, accounts ? user => accounts.officialKey(user) : undefined);
  const workspace = new Workspace(store, config.dataDir);
  const sandbox =
    options.sandbox ??
    createSandbox(config);
  const runtime = new Runtime(store, workspace, profiles, sandbox, config);
  const app = Fastify({
    logger: false,
    trustProxy: config.deploymentMode === "server" ? ["127.0.0.1", "::1"] : false,
    bodyLimit: 8 * 1024 * 1024,
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
      ["127.0.0.1", "localhost", "::1", ...(config.deploymentMode === "server" && config.publicOrigin ? [new URL(config.publicOrigin).hostname] : [])].includes(host),
      403,
      "不允许通过非本机域名访问本地服务。",
    );
    if (options.hubOnly && request.url.startsWith("/api/v1/agent/") && request.method !== "GET" && !request.url.startsWith("/api/v1/agent/career/") && !request.url.startsWith("/api/v1/agent/memory/") && request.url.split("?")[0] !== "/api/v1/agent/onboarding") throw new AppError(403, "请通过多端会话提交云端任务。", "use_hub");
    if (config.deploymentMode === "server") {
      const path = request.url.split("?")[0];
      const localOnly = /\/workspaces(?:\/|$)/.test(path) && request.method !== "GET"
        || /\/conversations\/[^/]+\/workspace$/.test(path)
        || /\/artifacts\/[^/]+\/local-open$/.test(path)
        || path === "/api/v1/agent/models/discover";
      invariant(!localOnly, 403, "这项操作需要在 PC 的本机工作区使用。", "local_only");
    }
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
  app.get("/api/v1/auth/config", () => ({ mode: config.deploymentMode, identity: accounts ? "official" : "legacy", device_session: Boolean(accounts && config.deploymentMode === "local"), cloud_agent_url: config.cloudAgentUrl || null }));
  app.post("/api/v1/auth/bootstrap", async (request) => {
    rate("bootstrap:" + request.ip, 30);
    invariant(accounts && config.deploymentMode === "local", 404, "接口不存在。");
    return accounts.bootstrap();
  });
  const accountCredentials = z.object({ username: z.string().trim().min(3).max(64), password: z.string().min(1).max(200), external_ai_consent: z.boolean().optional() }).strict();
  app.post("/api/v1/auth/register", async (request, reply) => {
    rate("auth:" + request.ip);
    const body = (accounts ? accountCredentials : credentials).parse(request.body);
    reply.code(201);
    if (accounts) return accounts.login(body.username, body.password, body.external_ai_consent ?? false, true);
    return auth.register(
      body.username,
      body.password,
      body.external_ai_consent ?? false,
    );
  });
  app.post("/api/v1/auth/login", async (request) => {
    rate("auth:" + request.ip);
    const body = (accounts ? accountCredentials : credentials).parse(request.body);
    if (accounts) return accounts.login(body.username, body.password, body.external_ai_consent ?? false);
    return auth.login(body.username, body.password);
  });
  app.get("/api/v1/auth/me", async (request) =>
    (await authenticate(request.headers.authorization)),
  );
  app.get("/api/v1/agent/onboarding", async request => {
    const user = await authenticate(request.headers.authorization);
    return store.onboarding(user.id);
  });
  app.patch("/api/v1/agent/onboarding", async request => {
    const user = await authenticate(request.headers.authorization);
    const input = z.object({ status: z.enum(["pending", "completed", "skipped"]), step: z.number().int().min(0).max(ONBOARDING_LAST_STEP) }).strict().parse(request.body);
    return store.updateOnboarding(user.id, input);
  });
  app.post("/api/v1/auth/logout", async (request) => {
    const user = (await authenticate(request.headers.authorization));
    for (const conversation of store.conversations(user.id)) {
      runtime.guidance.cancelAnalysis(conversation.id);
      const run = store.activeRun(conversation.id);
      if (run) runtime.cancel(user, run.id);
    }
    if (accounts) await accounts.logout(request.headers.authorization);
    else auth.logout(request.headers.authorization);
    secrets.clear(user.id);
    return { ok: true };
  });
  app.post("/api/v1/auth/ai-consent", async (request) => {
    const user = (await authenticate(request.headers.authorization));
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
  app.get("/api/v1/agent/official/credits", async request => {
    const user = await authenticate(request.headers.authorization);
    const query = z.object({ cursor: z.string().max(600).optional() }).strict().parse(request.query);
    return profiles.officialCredits(user, query.cursor);
  });
  app.get("/api/v1/agent/official/session", async request => {
    const user = await authenticate(request.headers.authorization);
    return accounts ? accounts.session(user) : profiles.officialSession(user);
  });
  app.post("/api/v1/agent/official/login", async request => {
    const user = (await authenticate(request.headers.authorization));
    const body = z.object({ username: z.string().trim().min(3).max(64), password: z.string().min(1).max(200), register: z.boolean().default(false) }).strict().parse(request.body);
    invariant(user.external_ai_consent, 403, "请先同意将请求发送给官方模型服务。", "ai_consent_required");
    if (accounts) {
      const session = await accounts.login(body.username, body.password, user.external_ai_consent, body.register, user);
      auth.logout(request.headers.authorization);
      const profile = (await profiles.list(session.user)).find(value => value.mode === "official")!;
      return { ...session, connected: true, profile };
    }
    return profiles.officialLogin(user, body.username, body.password, body.register);
  });
  app.post("/api/v1/agent/official/logout", async request => {
    if (accounts) {
      const result = await accounts.logout(request.headers.authorization);
      return { ...result, signed_out: true };
    }
    return profiles.officialLogout((await authenticate(request.headers.authorization)));
  });
  app.post("/api/v1/agent/resume/conversation", async request => {
    const user = (await authenticate(request.headers.authorization));
    const body = z.object({ profile_id: z.string().uuid().nullable().optional() }).strict().parse(request.body ?? {});
    return runtime.openResumeConversation(user, body.profile_id ?? null);
  });
  app.get("/api/v1/agent/resume", async request => { const user = (await authenticate(request.headers.authorization)); return { ...runtime.resume.get(user.id), evidence_review: runtime.decisions.resumeReview(user.id) }; });
  app.post("/api/v1/agent/resume/changes", async request => {
    const user = (await authenticate(request.headers.authorization));
    const body = resumeChangeInput.extend({ conversation_id: uuid.optional() }).parse(request.body);
    if (body.conversation_id) { store.conversation(user.id, body.conversation_id); runtime.assertConversationIdle(user, body.conversation_id); }
    runtime.guidance.assertResumeAccess(user.id, body.conversation_id);
    const state = runtime.resume.change(user.id, { revision: body.revision, change: body.change });
    if (body.conversation_id) runtime.guidance.refresh(user.id, body.conversation_id);
    return state;
  });
  app.post("/api/v1/agent/resume/export", async request => {
    const user = (await authenticate(request.headers.authorization));
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
  app.get("/api/v1/agent/career", async request => {
    const user = (await authenticate(request.headers.authorization));
    const { conversation_id } = z.object({ conversation_id: uuid.optional() }).strict().parse(request.query);
    if (conversation_id) store.conversation(user.id, conversation_id);
    return runtime.career.view(user.id, conversation_id);
  });
  app.get("/api/v1/agent/career/catalogue/directions", async request => {
    (await authenticate(request.headers.authorization));
    const query = z.record(z.string(), z.string()).parse(request.query);
    return runtime.career.catalogue.listCareerDirections({ ...query, ...(query.limit !== undefined ? { limit: Number(query.limit) } : {}) });
  });
  app.get("/api/v1/agent/career/catalogue/jobs", async request => {
    (await authenticate(request.headers.authorization));
    const query = z.record(z.string(), z.string()).parse(request.query);
    return runtime.career.catalogue.searchJobSamples({ ...query, ...(query.limit !== undefined ? { limit: Number(query.limit) } : {}) });
  });
  app.get("/api/v1/agent/career/catalogue/jobs/:id", async request => {
    (await authenticate(request.headers.authorization));
    return runtime.career.catalogue.readJobSample({ id: z.object({ id: z.string() }).parse(request.params).id });
  });
  app.post("/api/v1/agent/career/changes", async request => {
    const user = (await authenticate(request.headers.authorization));
    runtime.career.change(user.id, careerChangeInput.parse(request.body));
    return runtime.career.view(user.id);
  });
  app.post("/api/v1/agent/career/facts/:id", async request => {
    const user = (await authenticate(request.headers.authorization));
    const factId = z.object({ id: z.string().regex(/^[a-f0-9]{40}$/) }).parse(request.params).id;
    const body = z.object({ action: z.enum(["confirm", "dismiss"]) }).strict().parse(request.body);
    const { cid } = runtime.decisions.resolve(user, factId, body.action);
    runtime.event(cid, null, "career.updated", { fact_id: factId });
    return runtime.career.view(user.id);
  });
  app.get("/api/v1/agent/memory", async request => {
    const user = await authenticate(request.headers.authorization);
    const query = z.object({ conversation_id: uuid.optional(), search: z.string().trim().max(120).default("") }).strict().parse(request.query);
    return { ...runtime.memory.view(user.id, query.conversation_id, query.search), processing: runtime.memoryJobs.status(user.id) };
  });
  app.post("/api/v1/agent/memory/retry", async request => {
    const user = await authenticate(request.headers.authorization);
    return runtime.memoryJobs.retry(user);
  });
  app.get("/api/v1/agent/memory/export", async (request, reply) => {
    const user = await authenticate(request.headers.authorization);
    const view = runtime.memory.view(user.id);
    const text = "# 穗奈·忆迹场\n\n" + view.documents.map(document => document.text).join("\n\n---\n\n");
    return reply.header("Content-Disposition", 'attachment; filename="suinai-memory.md"').type("text/markdown; charset=utf-8").send(text);
  });
  app.post<{ Params: { id: string } }>("/api/v1/agent/memory/:id", async request => {
    const user = await authenticate(request.headers.authorization);
    const memoryId = uuid.parse(request.params.id);
    runtime.memory.change(user.id, memoryId, memoryChangeInput.parse(request.body));
    return runtime.memory.view(user.id);
  });
  app.post("/api/v1/agent/memory/settings", async request => {
    const user = await authenticate(request.headers.authorization);
    return runtime.memory.configure(user.id, memorySettingsInput.parse(request.body));
  });
  app.get("/api/v1/agent/info", async (request) => {
    (await authenticate(request.headers.authorization));
    return {
      runtime: "typescript",
      deployment_mode: config.deploymentMode,
      ui: deploymentUi(config.deploymentMode, localFileAccess(config.deploymentMode, request.ip, request.headers.host ?? "", request.headers.origin)),
      local_file_actions: localFileAccess(config.deploymentMode, request.ip, request.headers.host ?? "", request.headers.origin),
      official_configured: profiles.officialConfigured(),
      persistent_secrets_supported: process.platform === "win32",
      file_workspace: {
        available: true,
        message: config.deploymentMode === "local"
          ? "本机项目按对话绑定，默认只读；只将任务所需片段交给模型。支持文字版 PDF、DOCX 和图片。"
          : "只处理当前账号上传的资料和会话成果；支持文字版 PDF、DOCX 和图片，不开放服务器完全访问。",
        supported_extensions: SUPPORTED_INPUT_EXTENSIONS.map(value => value.slice(1)),
        max_file_bytes: MAX_FILE_BYTES,
        max_binary_file_bytes: MAX_BINARY_FILE_BYTES,
        project_workspaces: config.deploymentMode === "local",
      },
      sandbox: await sandbox.health(true),
      capabilities: toolRegistry.capabilities(),
      agent_capabilities: runtime.capabilities(),
      limits: {
        steps: config.maxSteps,
        max_total_steps: config.maxTotalSteps,
        max_task_steps: config.maxTaskSteps,
        max_continuations: config.maxContinuations,
        run_timeout_ms: config.runTimeoutMs,
        max_run_output_tokens: config.maxRunOutputTokens,
        context_max_tokens: config.contextMaxTokens,
        context_reserve_tokens: config.contextReserveTokens,
        context_recent_tokens: config.contextRecentTokens,
        context_max_tool_chars: config.contextMaxToolChars,
      },
    };
  });
  app.get("/api/v1/agent/capabilities", async request => {
    (await authenticate(request.headers.authorization));
    return runtime.capabilities();
  });
  app.get("/api/v1/agent/workspaces", async request => {
    const user = (await authenticate(request.headers.authorization));
    return config.deploymentMode === "local" ? store.localWorkspaces(user.id) : [];
  });
  app.post("/api/v1/agent/workspaces/pick", async request => {
    const user = (await authenticate(request.headers.authorization));
    const selected = await (options.localWorkspacePicker ?? pickLocalWorkspace)();
    if (!selected) return { cancelled: true as const, workspace: null };
    const inspected = await workspace.inspectExternalRoot(selected);
    const value = store.saveLocalWorkspace(user.id, inspected);
    return { cancelled: false as const, workspace: value };
  });
  app.post("/api/v1/agent/workspaces", async request => {
    const user = (await authenticate(request.headers.authorization));
    const body = z.object({ root_path: z.string().min(1).max(1000), name: z.string().trim().min(1).max(120).optional() }).strict().parse(request.body);
    const inspected = await workspace.inspectExternalRoot(body.root_path);
    return store.saveLocalWorkspace(user.id, { ...inspected, name: body.name ?? inspected.name });
  });
  app.delete<{ Params: { id: string } }>("/api/v1/agent/workspaces/:id", async request => {
    const user = (await authenticate(request.headers.authorization));
    const workspaceId = uuid.parse(request.params.id);
    invariant(!store.conversations(user.id).some(conversation => conversation.workspace_id === workspaceId), 409, "请先解除对话与该工作区的绑定。", "workspace_in_use");
    store.deleteLocalWorkspace(user.id, workspaceId);
    return { ok: true as const };
  });
  app.get("/api/v1/agent/models", async (request) =>
    profiles.list((await authenticate(request.headers.authorization))),
  );
  app.post("/api/v1/agent/models/discover", async (request) => {
    const user = (await authenticate(request.headers.authorization));
    rate("discover:" + user.id, 10);
    return profiles.discover(user, request.body);
  });
  app.post("/api/v1/agent/models", async (request, reply) => {
    const user = (await authenticate(request.headers.authorization));
    invariant(store.profiles(user.id).length < 30, 400, "模型配置已达到上限。");
    reply.code(201);
    return profiles.save(user, request.body);
  });
  app.put<{ Params: { id: string } }>(
    "/api/v1/agent/models/:id",
    async (request) =>
      profiles.save(
        (await authenticate(request.headers.authorization)),
        request.body,
        uuid.parse(request.params.id),
      ),
  );
  app.delete<{ Params: { id: string } }>(
    "/api/v1/agent/models/:id",
    async (request) => {
      profiles.delete(
        (await authenticate(request.headers.authorization)),
        uuid.parse(request.params.id),
      );
      return { ok: true };
    },
  );
  app.post<{ Params: { id: string } }>(
    "/api/v1/agent/models/:id/test",
    async (request) => {
      const user = (await authenticate(request.headers.authorization));
      rate("test:" + user.id, 5);
      return profiles.test(user, uuid.parse(request.params.id));
    },
  );
  app.get("/api/v1/agent/continuations", async request => runtime.taskMemory.continuations((await authenticate(request.headers.authorization)).id));
  app.get("/api/v1/agent/obligations", async request => {
    const user = (await authenticate(request.headers.authorization));
    const query = z.object({ conversation_id: uuid.optional() }).strict().parse(request.query);
    return runtime.listObligations(user, query.conversation_id);
  });
  app.post<{ Params: { id: string } }>("/api/v1/agent/obligations/:id/claim", async request => {
    const user = (await authenticate(request.headers.authorization));
    return runtime.claimObligation(user, uuid.parse(request.params.id));
  });
  app.post<{ Params: { id: string } }>("/api/v1/agent/obligations/:id/abandon", async request => {
    const user = (await authenticate(request.headers.authorization));
    return runtime.abandonObligation(user, uuid.parse(request.params.id));
  });
  app.get("/api/v1/agent/conversations", async (request) =>
    store
      .conversations((await authenticate(request.headers.authorization)).id)
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at)),
  );
  app.post("/api/v1/agent/conversations", async (request, reply) => {
    const user = (await authenticate(request.headers.authorization));
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
        (await authenticate(request.headers.authorization)),
        uuid.parse(request.params.id),
      ),
  );
  app.patch<{ Params: { id: string } }>(
    "/api/v1/agent/conversations/:id",
    async (request) => {
      const user = (await authenticate(request.headers.authorization));
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
  app.patch<{ Params: { id: string } }>("/api/v1/agent/conversations/:id/workspace", async request => {
    const user = (await authenticate(request.headers.authorization));
    const conversation = store.conversation(user.id, uuid.parse(request.params.id));
    runtime.assertConversationIdle(user, conversation.id);
    invariant(!conversation.archived, 409, "已归档对话不能绑定本机工作区，请先恢复对话。", "conversation_archived");
    const body = z.object({ workspace_id: uuid.nullable(), access: z.enum(["read-only", "workspace-write"]).default("read-only") }).strict().parse(request.body);
    if (body.workspace_id === null) {
      conversation.workspace_id = null;
      delete conversation.workspace_access;
    } else {
      const registration = store.localWorkspace(user.id, body.workspace_id);
      await workspace.inspectExternalRoot(registration.root_path);
      conversation.workspace_id = registration.id;
      conversation.workspace_access = body.access as WorkspaceAccess;
      store.touchLocalWorkspace(user.id, registration.id);
    }
    store.updateConversation(conversation);
    return conversation;
  });
  app.post<{ Params: { id: string } }>("/api/v1/agent/conversations/:id/task", async request => {
    const user = (await authenticate(request.headers.authorization)), cid = uuid.parse(request.params.id);
    runtime.assertConversationIdle(user, cid);
    return runtime.guidance.change(user, cid, taskChangeInput.parse(request.body));
  });
  app.post<{ Params: { id: string } }>("/api/v1/agent/conversations/:id/insights", async (request, reply) => {
    const user = (await authenticate(request.headers.authorization)), cid = uuid.parse(request.params.id);
    const body = z.object({ profile_id: uuid, message_id: uuid, force: z.boolean().default(false) }).strict().parse(request.body);
    store.conversation(user.id, cid);
    rate("insights:" + user.id, 6);
    runtime.assertConversationIdle(user, cid);
    const disconnected = () => { if (!reply.raw.writableFinished && store.profile(user.id, body.profile_id).mode !== "official") runtime.guidance.cancelAnalysis(cid); };
    reply.raw.once("close", disconnected);
    try { return await runtime.guidance.analyze(user, cid, body.profile_id, body.message_id, body.force); }
    finally { reply.raw.off("close", disconnected); }
  });
  app.delete<{ Params: { id: string } }>("/api/v1/agent/conversations/:id", async request => {
    const user = (await authenticate(request.headers.authorization));
    return runtime.deleteConversation(user, uuid.parse(request.params.id));
  });
  app.post<{ Params: { id: string } }>(
    "/api/v1/agent/conversations/:id/files",
    async (request) => {
      const user = (await authenticate(request.headers.authorization));
      const conversation = store.conversation(
        user.id,
        uuid.parse(request.params.id),
      );
      store.assertIdle(conversation.id);
      const body = z
        .object({
          name: z.string().min(1).max(240),
          base64: z.string().max(6_000_000),
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
      const user = (await authenticate(request.headers.authorization));
      rate("run:" + user.id, 20);
      const body = z
        .object({
          profile_id: uuid,
          input: z.string().trim().min(1).max(20000),
          request_id: uuid,
          attachment_ids: z.array(uuid).max(4).default([]),
          replaces_message_id: uuid.optional(),
          resume_edit: resumeEditInput.optional(),
          permission_mode: z.enum(["default", "full-access"]).default("default"),
          reasoning_effort: z.enum(["auto", "low", "medium", "high"]).default("auto"),
          full_access_confirmed: z.boolean().default(false),
          obligation_id: uuid.optional(),
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
        { resume_edit: body.resume_edit, replaces_message_id: body.replaces_message_id, permission_mode: body.permission_mode, reasoning_effort: body.reasoning_effort, full_access_confirmed: body.full_access_confirmed, obligation_id: body.obligation_id, attachment_ids: body.attachment_ids },
      );
    },
  );
  app.post<{ Params: { id: string } }>(
    "/api/v1/agent/runs/:id/retry",
    async (request) => {
      const user = (await authenticate(request.headers.authorization));
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
        (await authenticate(request.headers.authorization)),
        uuid.parse(request.params.id),
      ),
  );
  app.post<{ Params: { id: string } }>(
    "/api/v1/agent/artifacts/:id/export",
    async (request) =>
      runtime.requestExport(
        (await authenticate(request.headers.authorization)),
        uuid.parse(request.params.id),
      ),
  );
  app.post<{ Params: { id: string } }>(
    "/api/v1/agent/approvals/:id",
    async (request) => {
      const user = (await authenticate(request.headers.authorization));
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
      const user = (await authenticate(request.headers.authorization));
      const artifact = store.artifact(user.id, uuid.parse(request.params.id));
      const bytes = await workspace.artifactBytes(artifact);
      if (artifact.name.toLowerCase().endsWith(".docx")) {
        const document = await extractDocumentText(artifact.name, bytes);
        return { artifact, preview_kind: "text", mime: "text/plain; charset=utf-8", content: document.text.slice(0, 120000), truncated: document.text.length > 120000 };
      }
      return { artifact, ...describePreview(artifact.name, bytes) };
    },
  );
  app.get<{ Params: { id: string } }>("/api/v1/agent/artifacts/:id/content", async (request, reply) => {
    const user = (await authenticate(request.headers.authorization));
    const artifact = store.artifact(user.id, uuid.parse(request.params.id));
    const bytes = await workspace.artifactBytes(artifact);
    const preview = describePreview(artifact.name, bytes);
    invariant(preview.preview_kind === "image" || preview.preview_kind === "pdf", 415, "此文件没有二进制预览，请使用文本预览或下载。");
    return reply.header("Content-Type", preview.mime).header("Content-Disposition", "inline; filename*=UTF-8''" + encodeURIComponent(artifact.name)).header("Content-Security-Policy", "default-src 'none'; sandbox").send(bytes);
  });
  app.post<{ Params: { id: string } }>("/api/v1/agent/artifacts/:id/local-open", async (request) => {
    const user = (await authenticate(request.headers.authorization));
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
      const user = (await authenticate(request.headers.authorization));
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
      const user = (await authenticate(request.headers.authorization));
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
      const timer = setInterval(async () => {
        try {
          (await authenticate(request.headers.authorization));
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
    if (config.deploymentMode === "server" || request.url.startsWith("/api/"))
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
  return { app, store, auth, accounts, secrets, profiles, workspace, sandbox, runtime };
}
