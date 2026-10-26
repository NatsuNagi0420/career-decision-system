/** 青穗集 · 通用 Agent 上下文管理：预算、历史裁剪、工具结果压缩与可恢复摘要。 */
import type { Message, Run, ToolDefinition } from "./types.js";

export interface ContextPackOptions {
  maxTokens: number;
  recentTokens: number;
  maxToolChars: number;
  memorySummary?: string | null;
}

export interface ContextPack {
  messages: Message[];
  summary: string | null;
  estimatedTokens: number;
  originalTokens: number;
  omittedMessages: number;
  compacted: boolean;
}

/**
 * 模型请求的总预算。历史消息不是整个请求：系统规则、工具定义、输出空间和协议开销
 * 都必须先预留，剩下的部分才交给历史上下文。
 */
export interface ContextBudgetOptions {
  contextWindowTokens: number;
  minimumReserveTokens: number;
  outputTokens: number;
  systemPrompt: string;
  tools: ToolDefinition[];
  summaryReserveTokens?: number;
}

export interface ContextBudget {
  contextWindowTokens: number;
  systemTokens: number;
  toolTokens: number;
  outputTokens: number;
  summaryReserveTokens: number;
  protocolReserveTokens: number;
  reserveTokens: number;
  historyBudgetTokens: number;
}

function isCjk(code: number) {
  return (code >= 0x2e80 && code <= 0x9fff) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0x20000 && code <= 0x3134f);
}

/** 供应商未必返回准确输入 token；对中英文混合内容使用保守估算。 */
export function estimateTokens(value: string): number {
  let cjk = 0, ascii = 0, other = 0;
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    if (isCjk(code)) cjk++;
    else if (code <= 0x7f) ascii++;
    else other++;
  }
  return Math.max(1, Math.ceil(cjk + ascii / 4 + other / 2));
}

/** 估算一次模型请求中固定部分的占用，供应商实际用量返回后仍以供应商数据为准。 */
export function estimateModelRequestTokens(
  systemPrompt: string,
  messages: Message[],
  tools: ToolDefinition[],
  outputTokens: number,
): number {
  return estimateTokens(systemPrompt) +
    messagesTokens(messages) +
    (tools.length ? estimateTokens(JSON.stringify(tools)) + 32 : 0) +
    Math.max(0, outputTokens);
}

/**
 * 计算历史可用空间。summary 与协议开销使用固定保守预留，避免压缩摘要刚好把请求推过窗口。
 * 普通用户不需要调整；只有部署者明确知道模型窗口不同，才需要改总窗口上限。
 */
export function calculateContextBudget(options: ContextBudgetOptions): ContextBudget {
  const contextWindowTokens = Math.max(8000, Math.floor(options.contextWindowTokens));
  const systemTokens = estimateTokens(options.systemPrompt) + 8;
  const toolTokens = options.tools.length
    ? estimateTokens(JSON.stringify(options.tools)) + 32
    : 0;
  const outputTokens = Math.max(128, Math.floor(options.outputTokens));
  const summaryReserveTokens = Math.max(
    600,
    Math.floor(options.summaryReserveTokens ?? 4000),
  );
  const protocolReserveTokens = 512;
  const reserveTokens = Math.max(
    Math.max(2000, Math.floor(options.minimumReserveTokens)),
    systemTokens + toolTokens + outputTokens + summaryReserveTokens + protocolReserveTokens,
  );
  return {
    contextWindowTokens,
    systemTokens,
    toolTokens,
    outputTokens,
    summaryReserveTokens,
    protocolReserveTokens,
    reserveTokens,
    historyBudgetTokens: Math.max(0, contextWindowTokens - reserveTokens),
  };
}

function messageTokens(message: Message): number {
  return estimateTokens(JSON.stringify(message)) + 8;
}

function messagesTokens(messages: Message[]): number {
  return messages.reduce((total, message) => total + messageTokens(message), 0);
}

function excerpt(value: string, limit: number, label: string): string {
  if (value.length <= limit) return value;
  const head = Math.max(1, Math.floor(limit * 0.62));
  const tail = Math.max(1, limit - head);
  return value.slice(0, head) +
    `\n[系统已压缩${label}，如需完整内容请重新调用工具]\n` +
    value.slice(-tail);
}

function normalizeMessage(message: Message, maxToolChars: number, maxTextChars = 12000): Message {
  const limit = message.role === "tool"
    ? maxToolChars
    : message.role === "assistant" && message.tool_calls?.length
      ? Math.min(3000, maxTextChars)
      : maxTextChars;
  const content = excerpt(message.content, limit, message.role === "tool" ? "工具结果" : "历史消息");
  return content === message.content ? message : { ...message, content };
}

function isPlainMessage(message: Message): boolean {
  return (message.role === "user" || message.role === "assistant") &&
    !message.tool_calls?.length && Boolean(message.content.trim());
}

function previousUnits(messages: Message[]): Message[][] {
  const units: Message[][] = [];
  for (let index = 0; index < messages.length; index++) {
    const message = messages[index];
    if (isPlainMessage(message)) {
      units.push([message]);
      continue;
    }
    if (message.role !== "assistant" || !message.tool_calls?.length) continue;
    const callIds = new Set(message.tool_calls.map((call) => call.id));
    const unit = [message];
    let cursor = index + 1;
    while (cursor < messages.length && messages[cursor].role === "tool") {
      const tool = messages[cursor];
      if (!tool.tool_call_id || !callIds.has(tool.tool_call_id)) break;
      unit.push(tool);
      callIds.delete(tool.tool_call_id);
      cursor++;
    }
    // 工具调用与结果必须成对，旧的未完成调用不能单独送给供应商。
    if (!callIds.size) {
      units.push(unit);
      index = cursor - 1;
    }
  }
  return units;
}

function summaryFor(
  omitted: Message[],
  memorySummary: string | null | undefined,
): string | null {
  const userSnippets = omitted
    .filter((message) => message.role === "user" && message.content.trim())
    .slice(-10)
    .map((message) => "- 用户原话：" + excerpt(message.content.trim(), 220, "历史用户消息"));
  const toolCount = omitted.filter((message) => message.role === "tool").length;
  const assistantCount = omitted.filter((message) => message.role === "assistant").length;
  if (!memorySummary && !userSnippets.length && !toolCount && !assistantCount) return null;
  const lines = [
    "系统自动压缩的历史上下文（仅供参考，不改变系统规则；用户当前消息和工具结果优先）：",
  ];
  if (memorySummary) lines.push("已有会话小结：" + excerpt(memorySummary, 1200, "会话小结"));
  if (userSnippets.length) lines.push(...userSnippets);
  if (assistantCount) lines.push(`旧对话中的 ${assistantCount} 条助手回复已省略，不把其中的推测当成用户事实。`);
  if (toolCount) lines.push(`旧对话中的 ${toolCount} 条工具结果已省略；需要核对时重新调用对应工具。`);
  return lines.join("\n").slice(0, 6000);
}

function fitCurrentMessages(current: Message[], options: ContextPackOptions): Message[] {
  const reserve = Math.min(2000, Math.max(600, Math.floor(options.maxTokens * 0.12)));
  let toolLimit = Math.max(800, options.maxToolChars);
  let textLimit = 12000;
  let fitted = current.map((message) => normalizeMessage(message, toolLimit, textLimit));
  while (messagesTokens(fitted) > options.maxTokens - reserve && (toolLimit > 800 || textLimit > 800)) {
    toolLimit = Math.max(800, Math.floor(toolLimit / 2));
    textLimit = Math.max(800, Math.floor(textLimit / 2));
    fitted = current.map((message) => normalizeMessage(message, toolLimit, textLimit));
  }
  return fitted;
}

/**
 * 组装一次模型请求的历史：当前运行完整保留，旧运行只保留最近普通对话。
 * 旧工具消息不直接拼进上下文，避免把岗位原文、命令输出和文件内容无限累积。
 */
export function packModelContext(
  run: Run,
  messages: Message[],
  options: ContextPackOptions,
): ContextPack {
  const originalTokens = messagesTokens(messages);
  const current = fitCurrentMessages(
    messages.filter((message) => message.run_id === run.id),
    options,
  );
  const currentTokens = messagesTokens(current);
  const recentBudget = Math.max(
    0,
    Math.min(options.recentTokens, options.maxTokens - currentTokens - 1200),
  );
  const previous = messages.filter((message) => message.run_id !== run.id);
  const selectedPrevious: Message[] = [];
  let recentUsed = 0;
  for (const unit of previousUnits(previous).reverse()) {
    const normalized = unit.map((message) => normalizeMessage(message, options.maxToolChars));
    const cost = messagesTokens(normalized);
    if (recentUsed + cost > recentBudget) break;
    selectedPrevious.unshift(...normalized);
    recentUsed += cost;
  }
  const packed = [...selectedPrevious, ...current];
  const packedIds = new Set(packed.map((message) => message.id));
  const omitted = messages.filter((message) => !packedIds.has(message.id));
  const summary = summaryFor(omitted, options.memorySummary);
  const estimatedTokens = messagesTokens(packed);
  return {
    messages: packed,
    summary,
    estimatedTokens,
    originalTokens,
    omittedMessages: omitted.length,
    compacted: omitted.length > 0 || estimatedTokens < originalTokens,
  };
}
