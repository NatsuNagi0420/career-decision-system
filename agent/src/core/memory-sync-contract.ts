/** 青穗集 · 记忆同步的白名单协议：只交换证据与版本，不携带凭据和宿主配置。 */
import { z } from "zod";
import { MEMORY_KINDS } from "../memory-contract.js";
export const replicaKey = z.string().regex(/^[ns]:[a-f0-9]{64}$/);
const source = z.object({ key: z.string().regex(/^[a-f0-9]{64}$/), kind: z.enum(["message","career","resume","task","job","correction"]), source_id: z.string().min(1).max(160), conversation_id: z.string().uuid().nullable(), conversation_title: z.string().max(160), quote: z.string().min(2).max(1200), created_at: z.string().datetime() }).strict();
export const memoryReplica = z.object({
  kind: z.enum(MEMORY_KINDS), text: z.string().min(2).max(480), confidence: z.number().min(0).max(1), importance: z.number().min(0).max(1), confirmed: z.boolean(), anchor: z.boolean(), demoted: z.boolean(), status: z.enum(["active","archived"]),
  created_at: z.string().datetime(), updated_at: z.string().datetime(), last_mentioned_at: z.string().datetime(), mentions: z.number().int().nonnegative().max(1000000), sources: z.array(source).min(1).max(12), conflicts: z.array(replicaKey).max(8),
}).strict();
export type MemoryReplica = z.infer<typeof memoryReplica>;
export const memoryExchange = z.object({ cursor: z.number().int().nonnegative(), changes: z.array(z.object({ key: replicaKey, base: z.number().int().nonnegative(), value: memoryReplica.nullable() }).strict()).max(40).refine(changes => new Set(changes.map(c => c.key)).size === changes.length, "同一记忆不能重复提交") }).strict();
export type MemoryExchange = z.infer<typeof memoryExchange>;
export interface MemorySyncEntry { key: string; version: number; value: MemoryReplica | null }
export interface MemoryExchangeResult { cursor: number; more: boolean; paused: boolean; entries: MemorySyncEntry[]; acknowledgements: MemorySyncEntry[] }

const syncEntry = z.object({ key: replicaKey, version: z.number().int().positive(), value: memoryReplica.nullable() }).strict();
export const memoryExchangeResult = z.object({ cursor: z.number().int().nonnegative(), more: z.boolean(), paused: z.boolean(), entries: z.array(syncEntry).max(100), acknowledgements: z.array(syncEntry).max(40) }).strict();
