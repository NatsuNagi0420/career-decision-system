/** 青穗集 · 模型连接层：统一地址、受限请求、脱敏诊断和模型发现，不自动转发到其他服务。 */
import { lookup } from "node:dns/promises";
import { fetchWithIdleTimeout } from "./idle-timeout.js";
import { isIP } from "node:net";
import { AppError, invariant, isRecord } from "./errors.js";
import type { DiscoveredModel } from "./types.js";
export interface ProviderConnection {
  base_url: string;
  key: string;
  allow_local: boolean;
  timeout_ms: number;
}
export function normalizeBaseUrl(value: string, allowLocal = false): string {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new AppError(400, "请输入完整的模型接口地址。");
  }
  invariant(
    !url.username && !url.password && !url.search && !url.hash,
    400,
    "接口地址不能包含账号、密码、查询参数或片段。",
  );
  invariant(
    url.protocol === "https:" || (url.protocol === "http:" && allowLocal),
    400,
    "默认只允许 HTTPS；本机或私网 HTTP 服务需显式允许本机接口。",
  );
  const path = url.pathname.replace(/\/+$/, "");
  const suffix = /\/(?:chat\/completions|responses|models)$/i;
  // 完整端点按原路径去掉已知后缀；仅域名输入才补 /v1，不重写自定义前缀。
  url.pathname = suffix.test(path)
    ? path.replace(suffix, "") || "/"
    : path || "/v1";
  return url.toString().replace(/\/$/, "");
}
function addressKind(ip: string): "public" | "private" | "metadata" {
  let value = ip.toLowerCase().replace(/^\[|\]$/g, "");
  if (value.startsWith("::ffff:")) {
    value = value.slice(7);
    if (/^[0-9a-f]{1,4}:[0-9a-f]{1,4}$/.test(value)) {
      const [high, low] = value.split(":").map((part) => parseInt(part, 16));
      value = [high >> 8, high & 255, low >> 8, low & 255].join(".");
    }
  }
  if (
    value === "::" ||
    /^fe[89ab][0-9a-f]:/.test(value) ||
    value.startsWith("ff") ||
    /^169\.254\./.test(value) ||
    value === "100.100.100.200" ||
    /^0\./.test(value)
  )
    return "metadata";
  if (
    value === "::1" ||
    /^(fc|fd|fe[c-f])/.test(value) ||
    /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(value) ||
    /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(value)
  )
    return "private";
  return "public";
}
export async function validateEndpoint(baseUrl: string, allowLocal: boolean) {
  const url = new URL(baseUrl);
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  let addresses: string[];
  try {
    addresses = isIP(hostname)
      ? [hostname]
      : (await lookup(hostname, { all: true })).map((item) => item.address);
  } catch {
    throw new AppError(400, "接口地址无法解析，请检查域名。");
  }
  invariant(addresses.length > 0, 400, "接口地址无法解析。");
  for (const address of addresses) {
    const kind = addressKind(address);
    invariant(
      kind !== "metadata",
      400,
      "不允许连接系统元数据、链路本地或未指定地址。",
    );
    invariant(
      kind !== "private" || allowLocal,
      400,
      "连接本机或私网接口前，请勾选明确授权。",
    );
  }
  if (url.protocol === "http:")
    invariant(
      addresses.every((value) => addressKind(value) === "private"),
      400,
      "明文 HTTP 只允许显式授权的本机或私网地址。",
    );
}

export async function readLimited(
  response: Response,
  limit = 2_000_000,
): Promise<string> {
  invariant(response.body, 502, "模型服务返回空响应。");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  let bytes = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      invariant(bytes <= limit, 502, "模型返回内容超过安全上限。");
      text += decoder.decode(chunk.value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    await reader.cancel().catch(() => {});
  }
}

const parameters = [
  "reasoning_effort",
  "reasoning",
  "max_tokens",
  "max_completion_tokens",
  "stream_options",
  "tool_choice",
  "strict",
  "include",
  "stream",
] as const;
export type RejectedParameter = (typeof parameters)[number];
export class ProviderError extends AppError {
  constructor(
    public readonly upstreamStatus: number,
    message: string,
    code = "provider_" + upstreamStatus,
    public readonly rejectedParameter: RejectedParameter | null = null,
  ) {
    super(502, "上游 HTTP " + upstreamStatus + "：" + message, code);
  }
}
export async function responseError(response: Response): Promise<ProviderError> {
  let value: unknown;
  try {
    value = JSON.parse(await readLimited(response, 65536));
  } catch (error) {
    if (error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name)) throw error;
  }
  const record = isRecord(value)
    ? isRecord(value.error)
      ? value.error
      : value
    : {};
  // 原始错误体可能含 Key、URL、提示词或 HTML：只用它做分类，不回显原文。
  const raw = [record.code, record.type, record.message]
    .filter((v) => typeof v === "string")
    .join(" ")
    .toLowerCase();
  const param =
    typeof record.param === "string" ? record.param.toLowerCase() : "";
  const status = response.status;
  if (record.code === "relay_insufficient_points") return new ProviderError(402, "本次任务所需积分超出剩余积分，可缩短内容或等待每日刷新。", "relay_insufficient_points");
  if (status === 429 && record.type === "relay_error") {
    const messages: Record<string, string> = {
      relay_busy: "官方中转还有请求正在处理，请稍后再试。",
      relay_daily_request_limit: "官方中转的每日请求次数已达上限，请调整 RELAY_DAILY_REQUEST_LIMIT 或等待次日重置；这不代表上游余额不足。",
      relay_daily_output_limit: "官方中转的每日输出预算不足，请调整 RELAY_DAILY_OUTPUT_TOKEN_LIMIT 或等待次日重置；这不代表上游余额不足。",
    };
    const code = typeof record.code === "string" ? record.code : "";
    if (Object.hasOwn(messages, code)) return new ProviderError(status, messages[code], code);
  }
  if (["provider_timeout", "provider_network"].includes(String(record.code)))
    return new ProviderError(status, record.code === "provider_timeout" ? "模型数据长时间未继续返回。" : "模型连接暂时中断。", String(record.code));
  if (
    /no[_ -]?available[_ -]?(channels?|providers?)|no (available |suitable )?channels?|无可用渠道|无可用通道|没有可用.*渠道|没有可用.*通道/.test(
      raw,
    )
  )
    return new ProviderError(
      status,
      "网关当前没有该模型可用的通道。请从列表重选已授权的聊天模型，或让中转方检查模型映射、分组和通道。",
      "provider_channel_unavailable",
    );
  if (
    /model[_ -]?not[_ -]?found|model.*(?:does not exist|not exist|not found)|不存在.*模型|模型.*不存在/.test(
      raw,
    )
  )
    return new ProviderError(
      status,
      "当前 Key 无法使用这个模型。请重新拉取模型列表并检查模型权限与映射。",
      "provider_model_unavailable",
    );
  if (
    /insufficient[_ -]?quota|insufficient.*balance|余额不足|额度不足/.test(raw) ||
    (record.type === "relay_error" && record.code === "provider_quota")
  )
    return new ProviderError(
      status,
      "服务余额或额度不足，请检查中转账户与 Key 的可用额度。",
      "provider_quota",
    );
  if ([400, 413, 422].includes(status) && /context[_ -]?(?:length[_ -]?)?(?:exceeded|overflow|limit)|maximum context length|context window|prompt (?:is )?too (?:long|large)|too many (?:input )?tokens|上下文.{0,10}(?:超|长)|输入.{0,10}token.{0,10}超/.test(raw))
    return new ProviderError(status, "当前请求超过模型上下文窗口。", "provider_context");
  let rejected: RejectedParameter | null = null;
  if (status === 400 || status === 422) {
    const unsupported =
      /unsupported|not support|unknown|unrecognized|unexpected|not permitted|not allowed|not accept|不支持|未知|不允许/.test(
        raw,
      );
    rejected =
      parameters.find(
        (p) =>
          (param === p || param.endsWith("." + p)) && (!raw || unsupported),
      ) ?? null;
    if (!rejected && unsupported)
      rejected = parameters.find((p) => raw.includes(p)) ?? null;
    if (
      !rejected &&
      /max_tokens.*(?:max_completion_tokens)|max_completion_tokens.*(?:instead|rather)/.test(
        raw,
      )
    )
      rejected = "max_tokens";
  }
  const messages: Record<number, string> = {
    400: "接口不接受当前请求。请检查协议、聊天模型权限及参数支持。",
    401: "密钥无效或已过期，请检查是否完整复制 API Key。",
    402: "模型服务余额或额度不足。",
    403: "服务拒绝访问，请检查 Key 的模型权限、分组和访问限制。",
    404: "请求路径或模型不存在，请检查接口前缀及模型权限。",
    405: "服务不接受此请求方式，请检查协议和接口路径。",
    408: "上游处理超时，请稍后再试。",
    422: "接口参数校验未通过，请检查协议和模型参数。",
    429: "模型服务限制了本次请求，请稍后重试；HTTP 429 本身不能说明余额不足。",
    502: "中转无法得到正常的上游响应，请检查中转通道。",
    503: "服务暂不可用，或当前模型没有可用通道；请重选模型或让中转方检查上游。",
    504: "中转等待上游超时，请稍后再试。",
  };
  return new ProviderError(
    status,
    rejected
      ? "接口不支持参数 " + rejected + "。"
      : (messages[status] ?? "服务暂时不可用。"),
    undefined,
    rejected,
  );
}
export async function fetchProvider(
  connection: ProviderConnection,
  path: "models" | "chat/completions" | "responses" | "career/decisions",
  init: {
    method: "GET" | "POST";
    body?: Record<string, unknown>;
    headers?: Record<string, string>;
    signal: AbortSignal;
  },
  fetcher: typeof fetch = fetch,
  checkEndpoint = true,
): Promise<Response> {
  if (checkEndpoint)
    await validateEndpoint(connection.base_url, connection.allow_local);
  const signal = init.signal;
  try {
    const response = await fetchWithIdleTimeout(connection.base_url + "/" + path, {
      method: init.method,
      headers: {
        Authorization: "Bearer " + connection.key,
        Accept:
          init.method === "GET"
            ? "application/json"
            : "application/json, text/event-stream",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...(init.headers ?? {}),
      },
      ...(init.body ? { body: JSON.stringify(init.body) } : {}),
      signal,
      redirect: "error",
    }, connection.timeout_ms, fetcher);
    if (!response.ok) throw await responseError(response);
    return response;
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (init.signal.aborted && init.signal.reason?.name !== "TimeoutError")
      throw new DOMException("已停止", "AbortError");
    throw new AppError(
      502,
      signal.aborted || (error instanceof Error && error.name === "TimeoutError")
        ? "模型数据长时间未继续返回。"
        : "无法连接模型服务，请检查网络、接口地址及证书。",
      signal.aborted || (error instanceof Error && error.name === "TimeoutError") ? "provider_timeout" : "provider_network",
    );
  }
}
export async function discoverModels(
  connection: ProviderConnection,
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
  checkEndpoint = true,
): Promise<DiscoveredModel[]> {
  const response = await fetchProvider(
    connection,
    "models",
    { method: "GET", signal },
    fetcher,
    checkEndpoint,
  );
  let value: unknown;
  try {
    value = JSON.parse(await readLimited(response));
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(
      502,
      "模型列表接口未返回 JSON，可能填了网站首页而非 API 地址；也可以在手动模式填写服务商确认的模型标识。",
      "models_format",
    );
  }
  const list = isRecord(value)
    ? Array.isArray(value.data)
      ? value.data
      : Array.isArray(value.models)
        ? value.models
        : isRecord(value.data) && Array.isArray(value.data.models)
          ? value.data.models
          : null
    : null;
  invariant(
    list,
    502,
    "接口未返回兼容的模型列表；可检查 API 前缀，或使用手动模式。",
    "models_format",
  );
  invariant(
    list.length <= 10000,
    502,
    "模型列表过大，请联系服务商缩小当前 Key 的授权范围。",
    "models_limit",
  );
  const models = new Map<string, DiscoveredModel>();
  for (const entry of list) {
    const item = isRecord(entry) ? entry : {};
    const id =
      typeof entry === "string"
        ? entry
        : typeof item.id === "string"
          ? item.id
          : typeof item.name === "string"
            ? item.name
            : "";
    if (
      !id.trim() ||
      id.length > 200 ||
      /[\x00-\x1f\x7f]/.test(id) ||
      id.includes(connection.key)
    )
      continue;
    const label =
      typeof item.name === "string" &&
      item.name !== id &&
      item.name.length <= 200 &&
      !item.name.includes(connection.key)
        ? item.name
        : undefined;
    models.set(id, { id, ...(label ? { label } : {}) });
  }
  invariant(
    models.size,
    502,
    "接口没有返回可选择的模型，请检查 Key 的模型授权，或切换手动模式。",
    "models_empty",
  );
  return [...models.values()].sort((a, b) => a.id.localeCompare(b.id));
}
