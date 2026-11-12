/** 青穗集 · 官方中转请求策略：仅放行文本与客户端函数，禁止借官方凭证启用收费内建工具或文件资源引用。 */
import { invariant, isRecord } from "./errors.js";
const IMAGE_DATA_URL = /^data:image\/(?:png|jpeg|gif|webp);base64,[A-Za-z0-9+/]+={0,2}$/i;
function validContent(value: unknown, kind: "chat-completions" | "responses", role: string): boolean {
  if (typeof value === "string") return true;
  if (!Array.isArray(value)) return value === null && role === "assistant";
  return value.every((part) => {
    if (!isRecord(part)) return false;
    if (kind === "responses") {
      if (part.type === "input_text" || part.type === "output_text") return typeof part.text === "string";
      return role === "user" && part.type === "input_image" && typeof part.image_url === "string" && IMAGE_DATA_URL.test(part.image_url) && part.image_url.length <= 6_000_000;
    }
    if (part.type === "text") return typeof part.text === "string";
    return role === "user" && part.type === "image_url" && isRecord(part.image_url) && typeof part.image_url.url === "string" && IMAGE_DATA_URL.test(part.image_url.url) && part.image_url.url.length <= 6_000_000;
  });
}
export function validateRelayPayload(
  body: Record<string, unknown>,
  kind: "chat-completions" | "responses",
) {
  const efforts = ["low", "medium", "high"];
  if (kind === "chat-completions" && body.reasoning_effort !== undefined)
    invariant(
      typeof body.reasoning_effort === "string" && efforts.includes(body.reasoning_effort),
      400,
      "思考强度只允许 low、medium 或 high；自动档应省略该参数。",
    );
  if (kind === "responses" && body.reasoning !== undefined)
    invariant(
      isRecord(body.reasoning) &&
        Object.keys(body.reasoning).length === 1 &&
        typeof body.reasoning.effort === "string" &&
        efforts.includes(body.reasoning.effort),
      400,
      "思考设置只允许包含 effort，且取值为 low、medium 或 high。",
    );
  const tools = body.tools;
  if (tools !== undefined)
    invariant(
      Array.isArray(tools) &&
        tools.length <= 20 &&
        tools.every((item) => {
          if (!isRecord(item) || item.type !== "function") return false;
          const fn = kind === "responses" ? item : item.function;
          return (
            isRecord(fn) &&
            typeof fn.name === "string" &&
            /^[a-zA-Z_][a-zA-Z0-9_-]{0,63}$/.test(fn.name) &&
            isRecord(fn.parameters)
          );
        }),
      400,
      "官方入口只开放客户端函数工具，不开放内建联网、文件库或远程代码工具。",
    );
  const choice = body.tool_choice;
  if (choice !== undefined)
    invariant(
      typeof choice === "string"
        ? ["auto", "none", "required"].includes(choice)
        : isRecord(choice) &&
            choice.type === "function" &&
            typeof (kind === "responses"
              ? choice.name
              : isRecord(choice.function)
                ? choice.function.name
                : null) === "string",
      400,
      "工具选择不符合官方入口约定。",
    );
  if (kind === "responses" && body.include !== undefined)
    invariant(
      Array.isArray(body.include) &&
        body.include.every((item) => item === "reasoning.encrypted_content"),
      400,
      "官方入口只允许必要的不透明续答状态，不开放额外资源查询。",
    );
  const items = kind === "responses" ? body.input : body.messages;
  if (!Array.isArray(items)) return;
  for (const item of items) {
    invariant(isRecord(item), 400, "消息格式错误。");
    if (kind === "responses" && item.type === "reasoning") continue;
    if (kind === "responses" && item.type === "function_call") {
      invariant(
        typeof item.call_id === "string" &&
          typeof item.name === "string" &&
          typeof item.arguments === "string",
        400,
        "函数调用格式错误。",
      );
      continue;
    }
    if (kind === "responses" && item.type === "function_call_output") {
      invariant(
        typeof item.call_id === "string" && typeof item.output === "string",
        400,
        "函数结果必须是文本。",
      );
      continue;
    }
    invariant(
      kind !== "responses" ||
        item.type === undefined ||
        item.type === "message",
      400,
      "官方入口不接受文件或图片资源引用。",
    );
    invariant(
      ["user", "assistant", "system", "developer", "tool"].includes(
        String(item.role),
      ),
      400,
      "官方入口不接受文件或图片资源引用。",
    );
    invariant(validContent(item.content, kind, String(item.role)), 400, "官方入口只接受文本和内联图片，不接受外部文件或网络地址。", "relay_content");
    if (item.tool_calls !== undefined)
      invariant(
        Array.isArray(item.tool_calls) &&
          item.tool_calls.every(
            (call) =>
              isRecord(call) &&
              call.type === "function" &&
              isRecord(call.function) &&
              typeof call.function.name === "string" &&
              typeof call.function.arguments === "string",
          ),
        400,
        "消息只允许客户端函数调用。",
      );
  }
}
