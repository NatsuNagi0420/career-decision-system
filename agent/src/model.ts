/** 青穗集 · OpenAI 兼容模型适配：Chat / Responses、流式工具参数、超时和无凭据错误。 */
import { fetchProvider, ProviderError, readLimited } from "./provider.js";
export { normalizeBaseUrl, validateEndpoint, readLimited } from "./provider.js";
import { AppError, invariant, isRecord } from "./errors.js";
import type {
  WireApiKind,
  Model,
  ModelReply,
  ModelRequest,
  ToolCall,
} from "./types.js";
export interface Connection {
  base_url: string;
  model: string;
  api_kind: WireApiKind;
  key: string;
  allow_local: boolean;
  timeout_ms: number;
  max_output_tokens: number;
}
function textContent(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value))
    return value
      .map((item) =>
        isRecord(item) && typeof item.text === "string" ? item.text : "",
      )
      .join("");
  return "";
}
function call(value: unknown): ToolCall {
  invariant(isRecord(value), 502, "模型返回了无效的工具请求。");
  const fn = isRecord(value.function) ? value.function : value;
  invariant(
    typeof fn.name === "string" &&
      typeof value.id === "string" &&
      typeof fn.arguments === "string" &&
      value.id.length > 0 &&
      value.id.length <= 256 &&
      /^[a-zA-Z_][a-zA-Z0-9_-]{0,63}$/.test(fn.name),
    502,
    "模型工具请求缺少调用标识、名称或参数。",
  );
  return { id: value.id, name: fn.name, arguments: fn.arguments };
}
function tokenCount(value: unknown) {
  const count = Number(value ?? 0);
  return Number.isSafeInteger(count) && count >= 0 ? count : 0;
}
export function parseChat(value: unknown): ModelReply {
  invariant(
    isRecord(value) &&
      Array.isArray(value.choices) &&
      isRecord(value.choices[0]),
    502,
    "模型响应不是兼容的 Chat Completions 格式，请检查 API 协议。",
    "provider_response_format",
  );
  const choice = value.choices[0];
  const message = isRecord(choice.message) ? choice.message : {};
  const usage = isRecord(value.usage) ? value.usage : {};
  return {
    text: textContent(message.content),
    tool_calls: Array.isArray(message.tool_calls)
      ? message.tool_calls.map(call)
      : [],
    input_tokens: tokenCount(usage.prompt_tokens),
    output_tokens: tokenCount(usage.completion_tokens),
    finish_reason: String(choice.finish_reason ?? "stop"),
  };
}
export function parseResponses(value: unknown): ModelReply {
  invariant(
    isRecord(value) && Array.isArray(value.output),
    502,
    "模型响应不是兼容的 Responses 格式，请检查 API 协议。",
    "provider_response_format",
  );
  let text = "";
  const calls: ToolCall[] = [];
  for (const item of value.output) {
    if (!isRecord(item)) continue;
    if (item.type === "message") text += textContent(item.content);
    if (item.type === "function_call")
      calls.push(call({ ...item, id: item.call_id }));
  }
  const usage = isRecord(value.usage) ? value.usage : {};
  return {
    text,
    tool_calls: calls,
    input_tokens: tokenCount(usage.input_tokens),
    output_tokens: tokenCount(usage.output_tokens),
    response_items: value.output.filter(isRecord),
    finish_reason:
      value.status === "incomplete"
        ? "length"
        : String(value.status ?? "completed"),
  };
}
export class CompatibleModel implements Model {
  private tokenField = "max_tokens";
  private streamOptions = true;
  private streamEnabled = true;
  private forcedChoice = true;
  private strictField = true;
  private encryptedInclude = true;
  private reasoningEnabled = true;
  constructor(
    readonly connection: Connection,
    private fetcher: typeof fetch = fetch,
    private checkEndpoint = true,
  ) {}
  private payload(
    request: ModelRequest,
    tokenField = this.tokenField,
  ): Record<string, unknown> {
    const c = this.connection;
    const tools = request.tools.map((tool) =>
      c.api_kind === "responses"
        ? {
            type: "function",
            ...tool,
            ...(this.strictField ? { strict: false } : {}),
          }
        : {
            type: "function",
            function: {
              ...tool,
              ...(this.strictField ? { strict: false } : {}),
            },
          },
    );
    if (c.api_kind === "chat-completions") {
      return {
        model: c.model,
        messages: request.messages.map((message) => ({
          ...message,
          tool_calls: message.tool_calls?.map((tool) => ({
            id: tool.id,
            type: "function",
            function: { name: tool.name, arguments: tool.arguments },
          })),
        })),
        ...(tools.length ? { tools } : {}),
        ...(request.forceTool && this.forcedChoice
          ? {
              tool_choice: {
                type: "function",
                function: { name: request.forceTool },
              },
            }
          : {}),
        ...(this.reasoningEnabled && request.reasoningEffort && request.reasoningEffort !== "auto" ? { reasoning_effort: request.reasoningEffort } : {}),
        [tokenField]: request.maxOutputTokens ?? c.max_output_tokens,
        stream: Boolean(request.stream && this.streamEnabled),
        ...(request.stream && this.streamEnabled && this.streamOptions
          ? { stream_options: { include_usage: true } }
          : {}),
      };
    }
    const input: unknown[] = [];
    for (const message of request.messages) {
      if (message.role === "assistant" && message.response_items?.length) {
        input.push(...message.response_items);
        continue;
      }
      if (message.role === "tool") {
        input.push({
          type: "function_call_output",
          call_id: message.tool_call_id,
          output: message.content,
        });
        continue;
      }
      if (message.content)
        input.push({ role: message.role, content: message.content });
      for (const tool of message.tool_calls ?? [])
        input.push({
          type: "function_call",
          call_id: tool.id,
          name: tool.name,
          arguments: tool.arguments,
        });
    }
    return {
      model: c.model,
      input,
      tools,
      max_output_tokens: request.maxOutputTokens ?? c.max_output_tokens,
      store: false,
      ...(this.reasoningEnabled && request.reasoningEffort && request.reasoningEffort !== "auto" ? { reasoning: { effort: request.reasoningEffort } } : {}),
      ...(this.encryptedInclude
        ? { include: ["reasoning.encrypted_content"] }
        : {}),
      stream: Boolean(request.stream && this.streamEnabled),
      ...(request.forceTool && this.forcedChoice
        ? { tool_choice: { type: "function", name: request.forceTool } }
        : {}),
    };
  }
  async complete(request: ModelRequest): Promise<ModelReply> {
    const c = this.connection;
    // 超时由传输层按空闲数据计时；整轮上限和用户取消由 request.signal 决定。
    const signal = request.signal;
    try {
      let response: Response | undefined;
      // 仅对明确的“不支持参数”做有界协商；401、额度、503、网络等错误不重试，不换服务商。
      for (let attempt = 0; attempt < 8; attempt++) {
        try {
          response = await fetchProvider(
            c,
            c.api_kind === "responses" ? "responses" : "chat/completions",
            {
              method: "POST",
              body: this.payload(request),
              signal,
            },
            this.fetcher,
            this.checkEndpoint,
          );
          break;
        } catch (error) {
          if (!(error instanceof ProviderError)) throw error;
          const param = error.rejectedParameter;
          if (
            param === "max_tokens" &&
            c.api_kind === "chat-completions" &&
            this.tokenField === "max_tokens"
          )
            this.tokenField = "max_completion_tokens";
          else if (
            param === "stream_options" &&
            request.stream &&
            this.streamOptions
          )
            this.streamOptions = false;
          else if (param === "stream" && request.stream && this.streamEnabled)
            this.streamEnabled = false;
          else if (
            param === "tool_choice" &&
            request.forceTool &&
            this.forcedChoice
          )
            this.forcedChoice = false;
          else if (
            param === "strict" &&
            request.tools.length &&
            this.strictField
          )
            this.strictField = false;
          else if (
            param === "include" &&
            c.api_kind === "responses" &&
            this.encryptedInclude
          )
            this.encryptedInclude = false;
          else if ((param === "reasoning_effort" || param === "reasoning") && this.reasoningEnabled && request.reasoningEffort && request.reasoningEffort !== "auto") {
            this.reasoningEnabled = false;
            request.onNotice?.("当前模型服务不支持所选思考强度，已回到服务商默认值。后续请求不会伪称该档位生效。");
          }
          else throw error;
        }
      }
      invariant(
        response,
        502,
        "接口参数协商未成功，请检查服务商的兼容性说明。",
        "provider_parameters",
      );
      let reply: ModelReply;
      if (
        request.stream &&
        response.headers
          .get("content-type")
          ?.toLowerCase()
          .includes("text/event-stream")
      ) {
        reply = { ...(await this.stream(response, request)), streamed: true };
      } else {
        let body: unknown;
        try {
          body = JSON.parse(await readLimited(response));
        } catch (error) {
          if (error instanceof AppError) throw error;
          throw new AppError(
            502,
            "模型接口未返回合法 JSON，请检查是否填入了 API 地址而非网站首页。",
            "provider_response_format",
          );
        }
        reply =
          c.api_kind === "responses" ? parseResponses(body) : parseChat(body);
        reply.streamed = false;
      }
      invariant(
        ![
          "length",
          "content_filter",
          "failed",
          "cancelled",
          "in_progress",
        ].includes(reply.finish_reason),
        502,
        "模型输出被截断或过滤，本轮未执行工具；推理模型也可能因输出预算不足而截断，请调整模型或预算。",
        "provider_incomplete",
      );
      invariant(
        reply.text.trim() || reply.tool_calls.length,
        502,
        "模型没有返回有效回答或工具请求。",
      );
      return reply;
    } catch (error) {
      if (error instanceof AppError) throw error;
      if (request.signal.aborted)
        throw request.signal.reason ?? new DOMException("已停止", "AbortError");
      throw new AppError(
        502,
        error instanceof Error && error.name === "TimeoutError"
          ? "模型数据长时间未继续返回。"
          : "无法连接模型服务，请检查网络、接口地址及证书。",
        error instanceof Error && error.name === "TimeoutError" ? "provider_timeout" : "provider_network",
      );
    }
  }
  private async stream(
    response: Response,
    request: ModelRequest,
  ): Promise<ModelReply> {
    invariant(response.body, 502, "模型返回空进度流。");
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "",
      text = "",
      finish = "stop",
      input = 0,
      output = 0,
      bytes = 0,
      completed = false;
    const slots = new Map<
      number,
      { id: string; name: string; arguments: string }
    >();
    let final: ModelReply | null = null;
    const consume = (data: string) => {
      if (data === "[DONE]") {
        completed = true;
        return;
      }
      let value: unknown;
      try {
        value = JSON.parse(data);
      } catch {
        throw new AppError(502, "模型进度流包含无效 JSON。");
      }
      if (!isRecord(value)) return;
      if (value.error || value.type === "response.failed") {
        const code = isRecord(value.error) && value.error.code === "provider_timeout" ? "provider_timeout" : "provider_stream";
        throw new AppError(502, code === "provider_timeout" ? "模型数据长时间未继续返回。" : "模型在生成过程中返回失败。", code);
      }
      if (this.connection.api_kind === "responses") {
        if (
          value.type === "response.output_text.delta" &&
          typeof value.delta === "string"
        ) {
          text += value.delta;
          request.onDelta?.(value.delta);
        }
        if (value.type === "response.completed" && isRecord(value.response)) {
          final = parseResponses(value.response);
          completed = true;
        }
        if (value.type === "response.incomplete")
          throw new AppError(502, "模型输出未完整结束，本轮未执行工具。");
        return;
      }
      if (isRecord(value.usage)) {
        input = tokenCount(value.usage.prompt_tokens);
        output = tokenCount(value.usage.completion_tokens);
      }
      if (!Array.isArray(value.choices)) return;
      for (const choice of value.choices) {
        if (!isRecord(choice)) continue;
        if (choice.finish_reason) {
          finish = String(choice.finish_reason);
          completed = true;
        }
        const delta = isRecord(choice.delta) ? choice.delta : {};
        if (typeof delta.content === "string") {
          text += delta.content;
          request.onDelta?.(delta.content);
        }
        if (Array.isArray(delta.tool_calls))
          for (const item of delta.tool_calls) {
            if (!isRecord(item)) continue;
            const index = Number(item.index ?? 0);
            const slot = slots.get(index) ?? {
              id: "",
              name: "",
              arguments: "",
            };
            if (typeof item.id === "string") slot.id += item.id;
            const fn = isRecord(item.function) ? item.function : {};
            if (typeof fn.name === "string") slot.name += fn.name;
            if (typeof fn.arguments === "string")
              slot.arguments += fn.arguments;
            slots.set(index, slot);
          }
      }
    };
    try {
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) break;
        bytes += chunk.value.byteLength;
        invariant(bytes <= 2_000_000, 502, "模型进度流超过安全上限。");
        buffer += decoder.decode(chunk.value, { stream: true });
        buffer = buffer.replace(/\r\n/g, "\n");
        let index: number;
        while ((index = buffer.indexOf("\n\n")) !== -1) {
          const event = buffer.slice(0, index);
          buffer = buffer.slice(index + 2);
          const data = event
            .split("\n")
            .filter((line) => line.startsWith("data:"))
            .map((line) => line.slice(5).trimStart())
            .join("\n");
          if (data) consume(data);
        }
      }
      buffer += decoder.decode();
      if (buffer.trim()) {
        const data = buffer
          .split("\n")
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trimStart())
          .join("\n");
        if (data) consume(data);
      }
      invariant(completed, 502, "模型连接提前结束，不能将中断当作完成。", "provider_stream");
      if (final) return final;
      invariant(
        this.connection.api_kind !== "responses",
        502,
        "Responses 流缺少完整终止事件，未继续执行工具。",
      );
      return {
        text,
        tool_calls: [...slots.values()].map((value) =>
          call({ id: value.id, function: value }),
        ),
        input_tokens: input,
        output_tokens: output,
        finish_reason: finish,
      };
    } finally {
      await reader.cancel().catch(() => {});
    }
  }
}
