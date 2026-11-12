/** 青穗集 · 官方传输边界：隐藏上游模型和错误原文，保留工具协议及实时 SSE。 */
import { AppError, isRecord } from "./errors.js";
import { meteredUsage, type MeteredUsage } from "./relay-operations.js";
export function publicModelResponse(value: unknown, model: string): unknown {
  if (!isRecord(value)) return value;
  const result = { ...value };
  for (const key of ["system_fingerprint", "provider", "routing", "upstream_model", "upstream_id", "service_tier", "headers", "metadata", "model_name", "provider_name"]) delete result[key];
  if ("model" in result) result.model = model;
  if (isRecord(result.response)) result.response = publicModelResponse(result.response, model);
  if (result.error) result.error = { code: "provider_error", message: "穗奈本次回复未完成，请稍后再试。" };
  return result;
}
export class PublicEventStream {
  private decoder = new TextDecoder();
  private buffer = "";
  usage: MeteredUsage | null = null;
  completed = false;
  constructor(private model: string) {}
  push(chunk: Uint8Array, end = false): string[] {
    this.buffer += this.decoder.decode(chunk, { stream: !end });
    this.buffer = this.buffer.replaceAll("\r\n", "\n");
    if (this.buffer.length > 2_000_000) throw new AppError(502, "模型回复超过本次上限。", "provider_stream");
    const events = this.buffer.split("\n\n");
    this.buffer = events.pop() || "";
    if (end && this.buffer.trim()) { events.push(this.buffer); this.buffer = ""; }
    return events.map(event => {
      const data = event.split("\n").filter(line => line.startsWith("data:")).map(line => line.slice(5).trimStart()).join("\n");
      if (!data) return event + "\n\n";
      if (data.trim() === "[DONE]") { this.completed = true; return "data: [DONE]\n\n"; }
      let parsed: unknown;
      try { parsed = JSON.parse(data); } catch { throw new AppError(502, "模型回复未完整接收。", "provider_stream"); }
      if (isRecord(parsed)) {
        if (parsed.error || parsed.type === "error" || parsed.type === "response.failed") throw new AppError(502, "模型回复未完成。", "provider_stream");
        this.usage = meteredUsage(parsed) || this.usage;
        if (parsed.type === "response.completed") this.completed = true;
      }
      const prefix = event.split("\n").filter(line => line.startsWith("event:")).join("\n");
      return (prefix ? prefix + "\n" : "") + "data: " + JSON.stringify(publicModelResponse(parsed, this.model)) + "\n\n";
    });
  }
}
