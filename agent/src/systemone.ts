/** 青穗集 · Jev 结构化判断契约：校验 state/questions、保留零值与小数，不把概率当作事实。 */
import { z } from "zod";
import { AppError, invariant, isRecord } from "./errors.js";

const material = z.union([z.string(), z.record(z.string(), z.unknown()), z.array(z.unknown()), z.null()]);
const candidates = z.record(z.string().min(1), material).refine(value => Object.keys(value).length > 0);
const question = z.discriminatedUnion("type", [
  z.object({ type: z.literal("noul"), instructions: material,
    criteria: z.object({ true: material.optional(), false: material.optional() }).strict().nullable().optional() }).strict(),
  z.object({ type: z.literal("choice"), instructions: material, criteria: candidates }).strict(),
  z.object({ type: z.literal("score"), instructions: material, criteria: z.array(material).min(2) }).strict(),
]);
const payloadSchema = z.object({
  model: z.string().min(1).max(200),
  state: material,
  questions: z.record(z.string().min(1), question).refine(value => Object.keys(value).length > 0 && Object.keys(value).length <= 64),
  stream: z.literal(false).optional(),
}).strict();
type Questions = z.infer<typeof payloadSchema>["questions"];
const probability = z.number().finite().min(0).max(1);
const details = {
  probabilities: z.record(z.string(), probability).optional(),
  confidence: probability.optional(),
};
export function systemOnePayload(raw: unknown) {
  const result = payloadSchema.safeParse(raw);
  if (!result.success) throw new AppError(400,
    "判断请求需要 model、state 和 1—64 个 questions；不接受 messages、工具或流式参数。", "decision_invalid_request");
  return result.data;
}
export function systemOneResult(raw: unknown, questions: Questions) {
  invariant(isRecord(raw) && isRecord(raw.answers), 502, "判断响应缺少 answers。", "decision_invalid_response");
  const entries = Object.entries(questions).map(([id, item]) => {
    const schema = item.type === "noul"
      ? z.object({ type: z.literal("noul").optional(), noul: probability })
      : item.type === "choice"
        ? z.object({ type: z.literal("choice").optional(), choice: z.string().refine(value => Object.hasOwn(item.criteria, value)), ...details })
        : z.object({ type: z.literal("score").optional(), score: z.number().finite().min(0).max(item.criteria.length - 1),
            ...details, legend: z.record(z.string(), material).optional() });
    const result = schema.safeParse((raw.answers as Record<string, unknown>)[id]);
    invariant(result.success, 502, "判断响应的问题或取值不符合请求。", "decision_invalid_response");
    return [id, result.data] as const;
  });
  const usage = z.object({ input_tokens: z.number().int().nonnegative(), output_tokens: z.number().int().nonnegative() }).safeParse(raw.usage);
  return {
    ...(typeof raw.model === "string" ? { model: raw.model } : {}),
    answers: Object.fromEntries(entries),
    ...(usage.success ? { usage: usage.data } : {}),
  };
}
