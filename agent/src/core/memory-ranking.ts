/** 青穗集 · 记忆检索与衰减：中文二元词索引、证据重复强化，不以模型自我回想强化记忆。 */
import type { MemoryNode } from "../memory-contract.js";
const stop = new Set(["我们", "你们", "这个", "那个", "一下", "什么", "怎么", "如何", "可以", "需要", "帮我", "然后", "目前", "还是", "已经", "就是", "一个", "一些", "觉得", "的", "了", "我", "你", "是", "和", "与", "the", "a", "to", "of", "in"]);
export function memoryTerms(text: string): string[] {
  const normalized = text.normalize("NFKC").toLowerCase();
  const words = normalized.match(/[a-z0-9][a-z0-9_+#.-]*|[\p{Script=Han}]+/gu) ?? [];
  return [...new Set(words.flatMap(word => /^[\p{Script=Han}]+$/u.test(word) && word.length > 1 ? Array.from({ length: word.length - 1 }, (_, index) => word.slice(index, index + 2)) : [word]).filter(word => !stop.has(word)))].slice(0, 256);
}
export function memoryRetention(node: Pick<MemoryNode, "kind" | "anchor" | "confirmed" | "mentions" | "last_mentioned_at">, time = Date.now()): number {
  const age = Math.max(0, (time - Date.parse(node.last_mentioned_at)) / 86400000);
  const halfLife = (node.kind === "emotion" ? 2 : node.kind === "plan" ? 14 : 45) * (1 + Math.min(8, Math.max(0, node.mentions - 1)) * 0.55);
  const decay = Math.exp(-Math.LN2 * age / halfLife);
  return Math.max(node.kind === "emotion" ? 0 : node.anchor ? 0.95 : node.confirmed ? 0.8 : 0, decay);
}
export function memoryRelevance(query: string, node: Pick<MemoryNode, "text" | "kind">): number {
  const terms = memoryTerms(query), evidence = new Set(memoryTerms(node.text));
  const overlap = terms.filter(term => evidence.has(term)).length;
  let score = overlap / Math.max(1, Math.min(terms.length, 10));
  if (/简历|项目经历|resume/i.test(query) && ["experience", "skill", "goal"].includes(node.kind)) score += 0.2;
  if (/岗位|职业方向|工作推荐|求职/.test(query) && ["experience", "skill", "preference", "goal"].includes(node.kind)) score += 0.2;
  if (/学习|路线|计划/.test(query) && ["skill", "goal", "plan"].includes(node.kind)) score += 0.2;
  return Math.min(1, score);
}
export function memoryScore(query: string, node: MemoryNode): number {
  const relevance = memoryRelevance(query, node);
  if (relevance <= 0 || node.status !== "active" || node.phase === "dormant" || node.conflict_ids.length) return 0;
  return relevance * (0.45 + 0.2 * node.retention + 0.2 * node.confidence + 0.15 * node.importance) * (node.demoted ? 0.25 : 1);
}

/** MMR 的词项版本：兼顾相关性与覆盖，避免八条结果都在重复同一件事。 */
export function diversifyMemories(items: {node: MemoryNode; score: number}[], limit = 8) {
  const remaining = [...items], selected: typeof items = [];
  const terms = (node: MemoryNode) => new Set(memoryTerms(node.text));
  while (remaining.length && selected.length < limit) {
    const weighted = remaining.map(item => {
      const own = terms(item.node);
      const redundancy = Math.max(0, ...selected.map(other => {
        const otherTerms = terms(other.node), intersection = [...own].filter(term => otherTerms.has(term)).length;
        return intersection / Math.max(1, own.size + otherTerms.size - intersection);
      }));
      return {item, value: .75 * item.score - .25 * redundancy};
    }).sort((a,b) => b.value - a.value);
    selected.push(weighted[0].item); remaining.splice(remaining.indexOf(weighted[0].item), 1);
  }
  return selected;
}
