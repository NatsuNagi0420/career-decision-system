/** 青穗集 · 三维忆迹场窗口交互：投影标签、分类导航与无障碍视角控制。 */
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { MEMORY_KINDS, type MemoryKind, type MemoryNode, type MemoryRelation } from "../../../agent/src/memory-contract";
import { AgentIcon } from "./AgentIcon";
import { MEMORY_COLORS } from "./memory-nebula-layout";
import { createMemoryNebula, type NebulaScene, type NebulaState } from "./memory-nebula-scene";

const LABELS: Record<MemoryKind, string> = { experience: "经历", skill: "技能", goal: "目标", preference: "偏好", plan: "计划", anchor: "锚点", emotion: "近况" };
interface MemoryNebulaProps {
  nodes: MemoryNode[];
  relations: MemoryRelation[];
  selectedId: string | null;
  recalledIds: Set<string>;
  matchingIds: Set<string>;
  kind: MemoryKind | null;
  active: boolean;
  recallEnabled: boolean;
  onSelect: (id: string | null) => void;
  onKind: (kind: MemoryKind) => void;
}
function useMotionPreference() {
  const [motion, setMotion] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)"), app = document.querySelector(".agent-app");
    const update = () => setMotion(!media.matches && app?.getAttribute("data-ui-motion") !== "off");
    const observer = new MutationObserver(update);
    if (app) observer.observe(app, { attributes: true, attributeFilter: ["data-ui-motion"] });
    media.addEventListener("change", update); update();
    return () => { observer.disconnect(); media.removeEventListener("change", update); };
  }, []);
  return motion;
}
export function MemoryNebula({ nodes, relations, selectedId, recalledIds, matchingIds, kind, active, recallEnabled, onSelect, onKind }: MemoryNebulaProps) {
  const host = useRef<HTMLDivElement>(null), scene = useRef<NebulaScene | null>(null);
  const labels = useRef(new Map<string, HTMLButtonElement>());
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [hovered, setHovered] = useState<string | null>(null), [orbit, setOrbit] = useState(true), [attempt, setAttempt] = useState(0);
  const motion = useMotionPreference();
  const labelNodes = useMemo(() => {
    const focus = selectedId ?? hovered;
    const related = focus ? relations.flatMap(edge => edge.from === focus ? [edge.to] : edge.to === focus ? [edge.from] : []) : [];
    const categoryLabels = MEMORY_KINDS.map(value => nodes.filter(node => node.kind === value && matchingIds.has(node.id)).sort((a, b) => b.importance - a.importance)[0]?.id);
    const ids = focus ? [focus, ...related] : [...categoryLabels, ...recalledIds];
    return [...new Set(ids.filter((id): id is string => Boolean(id)))].map(id => nodes.find(node => node.id === id))
      .filter((node): node is MemoryNode => node !== undefined && (node.id === selectedId || matchingIds.has(node.id))).slice(0, focus ? 8 : 7);
  }, [selectedId, hovered, relations, recalledIds, nodes, matchingIds]);
  const state: NebulaState = { nodes, relations, selectedId, highlighted: recalledIds, matching: matchingIds, labelIds: labelNodes.map(node => node.id), kind, active, motion, orbit };
  const current = useRef({ state, onSelect }); current.current = { state, onSelect };
  useEffect(() => {
    if (!host.current) return;
    setStatus("loading");
    try {
      scene.current = createMemoryNebula(host.current, current.current.state, {
        select: id => current.current.onSelect(id), hover: setHovered, interact: () => setOrbit(false),
        ready: () => setStatus("ready"), error: () => { setStatus("error"); scene.current?.dispose(); scene.current = null; },
        project: points => {
          for (const point of points) {
            const element = labels.current.get(point.id); if (!element) continue;
            element.hidden = !point.visible; element.style.transform = `translate3d(${point.x.toFixed(1)}px,${point.y.toFixed(1)}px,0)`;
          }
        },
      });
    } catch { setStatus("error"); }
    return () => { scene.current?.dispose(); scene.current = null; };
  }, [attempt]);
  useEffect(() => { scene.current?.update(state); });
  const recalled = nodes.filter(node => recalledIds.has(node.id)).length;
  return <div className="memory-nebula" data-renderer={status === "ready" ? "webgl" : status} aria-label="三维忆迹场">
    <div className="memory-nebula__viewport" ref={host}>
      <div className="memory-nebula__vignette" aria-hidden="true" />
      <div className="memory-nebula__labels">
        {labelNodes.map(node => <button type="button" key={node.id} hidden
          ref={element => { if (element) labels.current.set(node.id, element); else labels.current.delete(node.id); }}
          className="memory-nebula__label" data-memory-id={node.id} data-selected={selectedId === node.id} data-recalled={recalledIds.has(node.id)}
          style={{ "--memory-color": MEMORY_COLORS[node.kind] } as CSSProperties}
          title={node.text} aria-label={`查看记忆：${node.text}`} onClick={() => onSelect(node.id)}>
          <i /><span>{node.text}</span>
        </button>)}
      </div>
    </div>
    <div className="memory-nebula__overview"><span className="memory-nebula__mark" aria-hidden="true">✧</span><span>{nodes.length}<small>段记忆</small></span></div>
    <nav className="memory-nebula__legend" aria-label="记忆星群分类">
      {MEMORY_KINDS.map(value => <button key={value} type="button" aria-pressed={kind === value} title={`查看${LABELS[value]}记忆`} onClick={() => onKind(value)} style={{ "--memory-color": MEMORY_COLORS[value] } as CSSProperties}>
        <i /><span>{LABELS[value]}</span><small>{nodes.filter(node => node.kind === value).length}</small>
      </button>)}
    </nav>
    {status === "error" && <div className="memory-nebula__fallback" role="status"><span>暂时无法打开三维忆迹场</span><small>仍可在记忆列表中查看和管理。</small><button type="button" onClick={() => setAttempt(value => value + 1)}>重新打开</button></div>}
    {status === "loading" && <div className="memory-nebula__loading" role="status"><i />星光正在汇聚</div>}
    <footer className="memory-nebula__footer"><div className="memory-nebula__hint"><span>拖动旋转<span className="memory-nebula__desktop-hint"> · 滚轮缩放</span> · 点选记忆</span><span className="memory-nebula__recall" data-lit={recalled > 0}><i />{!recallEnabled ? "召回已暂停" : recalled ? `本次唤起 ${recalled} 段记忆` : "等待下一次回响"}</span></div>
      <div className="memory-nebula__controls" role="group" aria-label="忆迹场视角控制">
        <button type="button" title={orbit ? "暂停自动漫游" : "自动漫游忆迹场"} aria-label="自动漫游忆迹场" aria-pressed={orbit && motion} disabled={status !== "ready" || !motion} onClick={() => setOrbit(value => !value)}><AgentIcon name={orbit && motion ? "pause" : "play"} size={16} /></button>
        <span aria-hidden="true" /><button type="button" title="缩小" aria-label="缩小忆迹场" disabled={status !== "ready"} onClick={() => scene.current?.zoom(-1)}><AgentIcon name="minus" size={16} /></button>
        <button type="button" title="放大" aria-label="放大忆迹场" disabled={status !== "ready"} onClick={() => scene.current?.zoom(1)}><AgentIcon name="plus" size={16} /></button>
        <button type="button" title="回到初始视角" aria-label="重置忆迹场视角" disabled={status !== "ready"} onClick={() => scene.current?.reset()}><AgentIcon name="restore" size={16} /></button>
      </div>
    </footer>
  </div>;
}
