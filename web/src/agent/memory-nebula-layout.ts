/** 青穗集 · 星云忆迹场的稳定空间布局与分类配色。 */
import { nebulaVeil } from "./memory-nebula-form";
import { type MemoryKind, type MemoryNode, type MemoryRelation } from "../../../agent/src/memory-contract";

export const MEMORY_COLORS: Record<MemoryKind, string> = {
  experience: "#69e8d3", skill: "#80b9ff", goal: "#f3d291", preference: "#c6a2fa",
  plan: "#92ddad", anchor: "#f6a5cb", emotion: "#b1a8ee",
};

const CLUSTERS: Record<MemoryKind, [number, number]> = {
  experience: [-.78, 0], skill: [.24, 0], goal: [.83, 1],
  preference: [-.72, 1], plan: [.91, 0], anchor: [-.17, 0], emotion: [.02, 1],
};

export function memoryCluster(kind: MemoryKind): [number, number, number] { return nebulaVeil(...CLUSTERS[kind]); }

export function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = Math.imul(state ^ state >>> 15, 1 | state);
    value ^= value + Math.imul(value ^ value >>> 7, 61 | value);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

export function memoryPosition(id: string, kind: MemoryKind): [number, number, number] {
  let seed = 2166136261;
  for (const char of id) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619);
  const random = seededRandom(seed), [t, branch] = CLUSTERS[kind];
  return nebulaVeil(t + (random() - .5) * .42, branch, (random() - .5) * 2.5, (random() - .5) * .36);
}


/** 全景显示真实关系的最小骨架，选中时补全该记忆的关系，避免整片交叉线遮住星体。 */
export function visibleMemoryRelations(nodes: MemoryNode[], relations: MemoryRelation[], selectedId: string | null, recalled: Set<string>): MemoryRelation[] {
  const byId = new Map(nodes.map(node => [node.id, node])), unique = new Map<string, MemoryRelation>();
  for (const relation of relations) {
    if (relation.from === relation.to || !byId.has(relation.from) || !byId.has(relation.to)) continue;
    const key = [relation.from, relation.to].sort().join("/");
    if (!unique.has(key) || relation.kind === "conflict") unique.set(key, relation);
  }
  const positions = new Map(nodes.map(node => [node.id, memoryPosition(node.id, node.kind)]));
  const distance = (edge: MemoryRelation) => {
    const a = positions.get(edge.from)!, b = positions.get(edge.to)!;
    return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
  };
  const sorted = [...unique.values()].sort((a, b) => distance(a) - distance(b) || a.from.localeCompare(b.from) || a.to.localeCompare(b.to));
  const parent = new Map(nodes.map(node => [node.id, node.id]));
  function find(id: string): string {
    let root = id;
    while (parent.get(root) !== root) root = parent.get(root)!;
    while (id !== root) { const next = parent.get(id)!; parent.set(id, root); id = next; }
    return root;
  }
  const skeleton = new Set<MemoryRelation>();
  for (const edge of sorted) { const a = find(edge.from), b = find(edge.to); if (a !== b) { parent.set(a, b); skeleton.add(edge); } }
  const important = sorted.filter(edge => edge.from === selectedId || edge.to === selectedId || edge.kind === "conflict");
  const recallEdges = sorted.filter(edge => recalled.has(edge.from) && recalled.has(edge.to));
  return [...new Set([...important, ...skeleton, ...recallEdges.slice(0, 12)])].slice(0, 160);
}
