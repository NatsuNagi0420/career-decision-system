/** 青穗集 · 通用工具注册表：以同一份声明生成模型定义、参数校验和执行入口。 */
import { z } from "zod";
import { AppError, invariant } from "../errors.js";
import type { ToolCall, ToolDefinition } from "../types.js";
import type { AgentToolResult } from "./contracts.js";

export type ToolEffect = "read" | "draft" | "interaction" | "approval" | "command";
export interface ToolSpec<C> {
  name: string;
  description: string;
  schema: z.ZodType;
  effect: ToolEffect;
  execute(args: Record<string, unknown>, context: C): Promise<AgentToolResult>;
}
export class ToolRegistry<C> {
  private readonly byName = new Map<string, ToolSpec<C>>();
  constructor(readonly specs: readonly ToolSpec<C>[]) {
    for (const spec of specs) {
      invariant(/^[a-zA-Z_][a-zA-Z0-9_-]{0,63}$/.test(spec.name) && !this.byName.has(spec.name), 500, "工具名称不合法或重复：" + spec.name);
      invariant(spec.description.trim() && typeof spec.execute === "function", 500, "工具声明不完整：" + spec.name);
      this.byName.set(spec.name, spec);
    }
  }
  definitions(): ToolDefinition[] {
    return [...this.byName.values()].map(spec => ({ name: spec.name, description: spec.description, parameters: z.toJSONSchema(spec.schema) as Record<string, unknown> }));
  }
  capabilities() {
    return [...this.byName.values()].map(({ name, effect }) => ({ name, effect }));
  }
  async execute(call: ToolCall, context: C): Promise<AgentToolResult> {
    const spec = this.byName.get(call.name);
    invariant(spec, 400, "未开放这个工具，不能调用任意程序。", "tool_unavailable");
    let raw: unknown;
    try { raw = JSON.parse(call.arguments); }
    catch { throw new AppError(400, "工具参数不是合法 JSON。", "tool_arguments"); }
    const parsed = spec.schema.safeParse(raw);
    if (!parsed.success) {
      const issues = parsed.error.issues.slice(0, 12).map(issue => `${issue.path.join(".") || "参数"}: ${issue.message}`).join("；");
      throw new AppError(400, `工具参数不符合约定：${issues}`, "tool_arguments");
    }
    return spec.execute(parsed.data as Record<string, unknown>, context);
  }
}
