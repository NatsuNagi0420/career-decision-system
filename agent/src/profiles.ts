/** 青穗集 · 官方与自带接口配置：密钥只写不回显，实际测试聊天、流式和工具往返。 */
import { z } from "zod";
import { Store, id, now } from "./store.js";
import { Secrets } from "./secrets.js";
import { CompatibleModel } from "./model.js";
import { discoverModels, normalizeBaseUrl, ProviderError } from "./provider.js";
import type { Config } from "./config.js";
import type {
  ConnectionCheck,
  Model,
  ModelDiscovery,
  Profile,
  User,
  WireApiKind,
} from "./types.js";
import { AppError, invariant, publicError } from "./errors.js";
export const profileInput = z
  .object({
    name: z.string().trim().min(1).max(60),
    mode: z.enum(["official", "custom"]),
    api_kind: z.enum(["auto", "chat-completions", "responses"]).default("auto"),
    base_url: z.string().max(2048).default(""),
    model: z.string().trim().max(200).default(""),
    api_key: z.string().max(4096).optional(),
    allow_local: z.boolean().default(false),
    remember_key: z.boolean().default(false),
  })
  .strict();
export const discoveryInput = z
  .object({
    base_url: z.string().min(1).max(2048),
    api_key: z.string().max(4096).optional(),
    profile_id: z.string().uuid().optional(),
    allow_local: z.boolean().default(false),
  })
  .strict();
export class Profiles {
  private testing = new Set<string>();
  constructor(
    readonly store: Store,
    readonly secrets: Secrets,
    readonly config: Config,
    readonly factory?: (profile: Profile, key: string) => Model,
  ) {}
  officialConfigured() {
    return Boolean(
      this.config.officialUrl &&
        this.config.officialToken &&
        this.config.officialModel,
    );
  }
  private withDisplayName(profile: Profile): Profile {
    return profile.mode === "official"
      ? { ...profile, display_name: this.config.officialModelDisplayName }
      : profile;
  }
  async list(user: User) {
    if (
      this.officialConfigured() &&
      !this.store
        .profiles(user.id)
        .some((profile) => profile.mode === "official")
    )
      await this.save(user, { name: "官方服务", mode: "official" });
    const values: Profile[] = [];
    for (const profile of this.store.profiles(user.id)) {
      let available = false;
      try {
        available =
          profile.mode === "official"
            ? this.officialConfigured()
            : Boolean(
                await this.secrets.get(
                  user.id,
                  profile.id,
                  this.store.secret(user.id, profile.id),
                ),
              );
      } catch {}
      values.push(this.withDisplayName({ ...profile, has_key: available }));
    }
    return values;
  }
  async save(user: User, raw: unknown, profileId?: string) {
    const input = profileInput.parse(raw);
    if (profileId) {
      this.store.profile(user.id, profileId);
      invariant(
        !this.testing.has(profileId),
        409,
        "连接测试进行中，请稍后再修改。",
      );
      invariant(
        !this.store.db
          .prepare(
            "SELECT id FROM runs WHERE user_id=? AND status IN ('queued','running','awaiting_approval') AND json_extract(data,'$.profile_id')=?",
          )
          .get(user.id, profileId),
        409,
        "该模型仍有任务运行，请先停止任务。",
      );
    }
    if (input.mode === "official")
      invariant(
        this.officialConfigured(),
        409,
        "官方中转尚未配置，请先使用自定义接口。",
      );
    const keyId = profileId ?? id();
    const baseUrl = normalizeBaseUrl(
      input.mode === "official" ? this.config.officialUrl : input.base_url,
      input.mode === "official" || input.allow_local,
    );
    const model =
      input.mode === "official" ? this.config.officialModel : input.model;
    invariant(
      model.trim(),
      400,
      "请先拉取并选择一个模型；接口不提供列表时可使用手动模式。",
    );
    let encrypted: string | null = null;
    let key: string | null = null;
    if (input.mode === "custom") {
      key =
        input.api_key?.trim() ||
        (profileId &&
        this.store.profile(user.id, profileId).mode === "custom" &&
        this.store.profile(user.id, profileId).base_url === baseUrl
          ? await this.secrets.get(
              user.id,
              profileId,
              this.store.secret(user.id, profileId),
            )
          : null);
      invariant(
        key,
        400,
        "请填写 API Key；修改接口地址后需要重新输入该接口的密钥。",
      );
      encrypted = await this.secrets.save(
        user.id,
        keyId,
        key,
        input.remember_key,
      );
    }
    const profile: Profile = {
      id: keyId,
      user_id: user.id,
      name: input.name,
      mode: input.mode,
      api_kind:
        input.mode === "official" ? this.config.officialKind : input.api_kind,
      base_url: baseUrl,
      model,
      allow_local: input.mode === "official" || input.allow_local,
      remember_key: input.mode === "custom" && input.remember_key,
      has_key: true,
      capabilities: {
        chat: false,
        tools: false,
        stream: false,
        tested_at: null,
        note: "尚未测试。",
      },
      updated_at: now(),
    };
    this.store.saveProfile(profile, encrypted);
    if (input.mode === "official") this.secrets.forget(keyId);
    return this.withDisplayName(profile);
  }
  async discover(user: User, raw: unknown): Promise<ModelDiscovery> {
    invariant(
      user.external_ai_consent,
      403,
      "请先同意连接所选模型服务再拉取模型列表。",
    );
    const input = discoveryInput.parse(raw);
    const previous = input.profile_id
      ? this.store.profile(user.id, input.profile_id)
      : null;
    const baseUrl = normalizeBaseUrl(input.base_url, input.allow_local);
    const key =
      input.api_key?.trim() ||
      (previous?.mode === "custom" && previous.base_url === baseUrl
        ? await this.secrets.get(
            user.id,
            previous.id,
            this.store.secret(user.id, previous.id),
          )
        : null);
    invariant(key, 400, "请填写 API Key；更换地址后不能沿用另一个接口的密钥。");
    const models = await discoverModels(
      {
        base_url: baseUrl,
        key,
        allow_local: input.allow_local,
        timeout_ms: this.config.modelTimeoutMs,
      },
      AbortSignal.timeout(this.config.modelTimeoutMs),
    );
    return {
      base_url: baseUrl,
      models,
      note: "已从当前接口获取模型列表；列出不代表模型一定有可用通道或支持工具，请选择后测试。",
    };
  }
  async model(user: User, profile: Profile): Promise<Model> {
    const key =
      profile.mode === "official"
        ? this.config.officialToken
        : await this.secrets.get(
            user.id,
            profile.id,
            this.store.secret(user.id, profile.id),
          );
    invariant(key, 409, "密钥未保存或已随服务重启清除，请重新填写。");
    if (profile.mode === "official")
      invariant(this.officialConfigured(), 409, "官方服务尚未配置。");
    return (
      this.factory?.(profile, key) ??
      new CompatibleModel({
        base_url:
          profile.mode === "official"
            ? normalizeBaseUrl(this.config.officialUrl, true)
            : profile.base_url,
        model:
          profile.mode === "official"
            ? this.config.officialModel
            : profile.model,
        api_kind:
          profile.api_kind === "auto"
            ? (profile.resolved_api_kind ?? "chat-completions")
            : profile.api_kind,
        key,
        allow_local: profile.allow_local,
        timeout_ms: this.config.modelTimeoutMs,
        max_output_tokens: this.config.maxOutputTokens,
      })
    );
  }
  async test(user: User, profileId: string) {
    invariant(
      user.external_ai_consent,
      403,
      "请先同意将测试请求和选取资料发送给所选模型服务。",
    );
    invariant(!this.testing.has(profileId), 409, "这个连接已经在测试中。");
    this.testing.add(profileId);
    try {
      const profile = this.store.profile(user.id, profileId);
      const signal = AbortSignal.timeout(this.config.modelTimeoutMs * 3);
      const protocols: WireApiKind[] =
        profile.api_kind === "auto"
          ? ["chat-completions", "responses"]
          : [profile.api_kind];
      const checks: ConnectionCheck[] = [];
      const notes: string[] = [];
      let chat = false,
        stream = false,
        tools = false;
      let selectedModel: Model | null = null;
      let chosen: WireApiKind | undefined;
      const outputLimit = Math.min(this.config.maxOutputTokens, 2048);
      for (const protocol of protocols) {
        const model = await this.model(user, {
          ...profile,
          resolved_api_kind: protocol,
        });
        let lastError: unknown;
        const messages = [
          { role: "user" as const, content: "连接测试，请只回复 OK。" },
        ];
        try {
          const answer = await model.complete({
            messages,
            tools: [],
            signal,
            stream: true,
            maxOutputTokens: outputLimit,
          });
          chat = true;
          stream = answer.streamed !== false;
          checks.push(
            { stage: "chat", protocol, ok: true, note: "已收到有效回答。" },
            {
              stage: "stream",
              protocol,
              ok: stream,
              note: stream
                ? "已收到完整流式响应。"
                : "网关返回普通 JSON，已使用非流式响应。",
            },
          );
        } catch (error) {
          lastError = error;
          checks.push({
            stage: "stream",
            protocol,
            ok: false,
            note: publicError(error),
          });
          // 鉴权、额度、限流和上游故障不靠重复生成解决；只有协议/流式问题才补一次非流式探测。
          const retryPlain =
            error instanceof ProviderError
              ? [400, 422].includes(error.upstreamStatus)
              : error instanceof AppError &&
                ["provider_response_format", "request_failed"].includes(
                  error.code,
                );
          if (retryPlain && !signal.aborted) {
            try {
              await model.complete({
                messages,
                tools: [],
                signal,
                stream: false,
                maxOutputTokens: outputLimit,
              });
              chat = true;
              checks.push({
                stage: "chat",
                protocol,
                ok: true,
                note: "非流式聊天通过。",
              });
            } catch (error) {
              lastError = error;
            }
          }
          if (!chat)
            checks.push({
              stage: "chat",
              protocol,
              ok: false,
              note: publicError(lastError),
            });
        }
        if (chat) {
          selectedModel = model;
          chosen = protocol;
          break;
        }
        const protocolMismatch =
          lastError instanceof ProviderError
            ? [400, 404, 405, 415, 422, 501].includes(
                lastError.upstreamStatus,
              ) &&
              ![
                "provider_model_unavailable",
                "provider_channel_unavailable",
              ].includes(lastError.code)
            : lastError instanceof AppError &&
              lastError.code === "provider_response_format";
        if (!protocolMismatch || signal.aborted) {
          notes.push(publicError(lastError));
          break;
        }
      }
      if (selectedModel && chosen) {
        const model = selectedModel;
        try {
          const definition = {
            name: "connection_probe",
            description: "无副作用的连接测试；请传入 value=pong。",
            parameters: {
              type: "object",
              properties: { value: { type: "string" } },
              required: ["value"],
              additionalProperties: false,
            },
          };
          const messages = [
            {
              role: "user" as const,
              content:
                "必须调用 connection_probe，并传入 value=pong。这只是接口测试，不需要操作文件。",
            },
          ];
          const first = await model.complete({
            messages,
            tools: [definition],
            forceTool: "connection_probe",
            signal,
            stream,
            maxOutputTokens: outputLimit,
          });
          if (stream && first.streamed === false) {
            stream = false;
            checks.push({
              stage: "stream",
              protocol: chosen,
              ok: false,
              note: "工具请求需要非流式响应，后续任务已统一使用非流式。",
            });
          }
          const probe = first.tool_calls.find(
            (call) => call.name === "connection_probe",
          );
          invariant(
            probe,
            502,
            "模型没有产生有效工具请求；该模型仍可用于聊天。",
          );
          let args: unknown;
          try {
            args = JSON.parse(probe.arguments);
          } catch {
            throw new AppError(502, "模型未返回合法工具参数。");
          }
          invariant(
            typeof args === "object" &&
              args !== null &&
              "value" in args &&
              args.value === "pong",
            502,
            "模型没有正确构造工具参数。",
          );
          const second = await model.complete({
            messages: [
              ...messages,
              {
                role: "assistant",
                content: first.text,
                tool_calls: first.tool_calls,
                response_items: first.response_items,
              },
              ...first.tool_calls.map((call) => ({
                role: "tool" as const,
                tool_call_id: call.id,
                content:
                  call.id === probe.id
                    ? "测试工具已真实返回 pong"
                    : "未执行：测试只允许 connection_probe。",
              })),
            ],
            tools: [definition],
            signal,
            stream: false,
            maxOutputTokens: outputLimit,
          });
          invariant(
            second.text.trim() && !second.tool_calls.length,
            502,
            "工具结果没有正常续答；该模型仍可用于聊天。",
          );
          tools = true;
          checks.push({
            stage: "tools",
            protocol: chosen,
            ok: true,
            note: "工具调用、参数与结果续答均通过。",
          });
        } catch (error) {
          checks.push({
            stage: "tools",
            protocol: chosen,
            ok: false,
            note: publicError(error),
          });
          notes.push("工具：" + publicError(error));
        }
        profile.resolved_api_kind = chosen;
        if (!stream) notes.push("此连接使用非流式聊天。");
      } else if (!notes.length) {
        notes.push("未找到可用的聊天协议，请展开下方分项检查接口与模型权限。");
      }
      profile.capabilities = {
        chat,
        tools,
        stream,
        tested_at: now(),
        checks,
        note:
          (chat ? "聊天连接成功。" : "聊天连接未通过。") +
          (tools
            ? "可使用 Agent 工具。"
            : chat
              ? "可以先聊天，任务工具暂未开放。"
              : "请先解决聊天连接问题。") +
          notes.join(" "),
      };
      this.store.saveProfile(profile, this.store.secret(user.id, profile.id));
      return this.withDisplayName(profile);
    } finally {
      this.testing.delete(profileId);
    }
  }
  delete(user: User, profileId: string) {
    invariant(
      !this.testing.has(profileId),
      409,
      "连接测试进行中，请稍后再删除。",
    );
    invariant(
      !this.store.db
        .prepare(
          "SELECT id FROM runs WHERE user_id=? AND status IN ('queued','running','awaiting_approval') AND json_extract(data,'$.profile_id')=?",
        )
        .get(user.id, profileId),
      409,
      "该模型仍有任务运行，请先停止。",
    );
    this.store.deleteProfile(user.id, profileId);
    this.secrets.forget(profileId);
  }
}
