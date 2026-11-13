/** 青穗集 · 穗奈·忆迹场：三维星云、真实召回路径和可纠正的证据档案。 */
import { AnimatedTextarea } from "./AnimatedTextarea";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { AgentIcon } from "./AgentIcon";
import { CareerIcon } from "./CareerVisuals";
import { MEMORY_LABELS, type MemoryChange, type MemoryKind, type MemoryNode, type MemorySeaView, type MemoryRelation } from "../../../agent/src/memory-contract";
import { memoryTerms } from "../../../agent/src/core/memory-ranking";
import { MemoryNebula } from "./MemoryNebula";
import { MEMORY_COLORS as COLORS } from "./memory-nebula-layout";
import "./memory-sea.css";
const EMPTY_RELATIONS: MemoryRelation[] = [];
type Filter = "active" | "recalled" | "archived";
export interface MemorySeaProps {
  view: MemorySeaView | null; loading: boolean; error: string; activity?: "idle" | "working" | "consolidating"; active?: boolean;
  onRetry?: () => Promise<void>; onRefresh: () => void; onChange: (id: string, change: MemoryChange) => Promise<void>;
  onSettings: (value: { enabled?: boolean; recall_enabled?: boolean; sync_enabled?: boolean }) => Promise<void>; onExport: () => Promise<void>;
  onConfirmDelete: (node: MemoryNode) => Promise<boolean>;
}
export function MemorySea({ view, loading, error, activity = "idle", active = true, onRefresh, onChange, onSettings, onExport, onConfirmDelete, onRetry }: MemorySeaProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null), [search, setSearch] = useState(""), [kind, setKind] = useState<MemoryKind | null>(null), [filter, setFilter] = useState<Filter>("active"), [tab, setTab] = useState<"memories" | "recalls" | "documents">("memories");
  const [changing, setChanging] = useState(false), [actionError, setActionError] = useState(""), [settingsOpen, setSettingsOpen] = useState(false);
  const [pendingSettings, setPendingSettings] = useState<{ enabled?: boolean; recall_enabled?: boolean; sync_enabled?: boolean } | null>(null);
  const settingValues = { ...view?.settings, ...pendingSettings };
  if (view?.processing && view.processing.queued + view.processing.running > 0) activity = "consolidating";
  const nodes = view?.nodes ?? [], selected = nodes.find(node => node.id === selectedId) ?? null, recall = view?.selected_conversation_id ? view.recalls[0] : undefined;
  const recalledIds = useMemo(() => new Set(recall?.items.map(item => item.id) ?? []), [recall]);
  const terms = memoryTerms(search);
  const filtered = nodes.filter(node => (filter === "archived" ? node.status === "archived" : node.status === "active") && (!kind || node.kind === kind) && (filter !== "recalled" || recalledIds.has(node.id)) && (!search.trim() || node.text.toLowerCase().includes(search.toLowerCase()) || MEMORY_LABELS[node.kind].includes(search) || terms.some(term => memoryTerms(node.text).includes(term))));
  const sceneNodes = useMemo(() => nodes.filter(node => (filter === "archived" ? node.status === "archived" : node.status === "active") || node.id === selectedId), [nodes, filter, selectedId]);
  const matchingIds = useMemo(() => new Set(filtered.map(node => node.id)), [view, filter, kind, search, recalledIds]);
  function selectMemory(id: string | null) { setSelectedId(id); setTab("memories"); setActionError(""); }
  useEffect(() => { if (selectedId && !nodes.some(node => node.id === selectedId)) setSelectedId(null); }, [nodes, selectedId]);
  useEffect(() => { if (!active) setSettingsOpen(false); }, [active]);
  async function change(action: MemoryChange["action"], text?: string) {
    if (!selected || changing) return;
    if (action === "delete" && !await onConfirmDelete(selected)) return;
    setChanging(true); setActionError("");
    try { await onChange(selected.id, { action, revision: selected.revision, ...(text ? { text } : {}) }); if (action === "delete" || action === "archive") setSelectedId(null); }
    catch (cause) { setActionError((cause as Error).message); }
    finally { setChanging(false); }
  }
  async function settings(value: { enabled?: boolean; recall_enabled?: boolean; sync_enabled?: boolean }) {
    setPendingSettings(value); setChanging(true); setActionError("");
    try { await onSettings(value); } catch (cause) { setActionError((cause as Error).message); } finally { setPendingSettings(null); setChanging(false); }
  }
  function openKind(value: MemoryKind) { setKind(current => current === value ? null : value); setSelectedId(null); setTab("memories"); }
  return <section className="memory-sea" aria-label="穗奈·忆迹场" data-active={active} aria-busy={loading}>
    <header className="memory-sea__toolbar"><div className="memory-sea__identity"><CareerIcon name="memory" size={28} className="memory-sea__sigil" /><h2>穗奈·忆迹场</h2><span className="memory-sea__live" data-state={activity}><i />{activity === "working" ? "正在行动" : activity === "consolidating" ? "正在巩固" : "静候回响"}</span></div>
      <div className="memory-sea__tools"><label className="memory-sea__search"><AgentIcon name="search" size={15} /><input value={search} onChange={event => { setSearch(event.target.value); setTab("memories"); setSelectedId(null); }} placeholder="寻找一段记忆" aria-label="搜索记忆" /></label><button type="button" title="导出记忆文档" aria-label="导出记忆文档" onClick={() => { setActionError(""); void onExport().catch(cause => setActionError((cause as Error).message)); }}><AgentIcon name="download" size={16} /></button><button type="button" title="刷新忆迹场" aria-label="刷新忆迹场" onClick={onRefresh} disabled={loading}>↻</button><div className="memory-sea__settings-anchor" onKeyDown={event => { if (event.key === "Escape") setSettingsOpen(false); }} onBlur={event => { if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) setSettingsOpen(false); }}><button type="button" title="记忆设置" aria-label="记忆设置" aria-expanded={settingsOpen} onClick={() => setSettingsOpen(value => !value)}><AgentIcon name="more" size={17} /></button>{settingsOpen && <><button className="memory-sea__dismiss" aria-label="关闭记忆设置" onClick={() => setSettingsOpen(false)} /><div className="memory-sea__settings"><label><input type="checkbox" checked={settingValues.enabled ?? true} disabled={changing || !view} onChange={event => void settings({ enabled: event.target.checked })} />记录新的线索</label><label><input type="checkbox" checked={settingValues.recall_enabled ?? true} disabled={changing || !view} onChange={event => void settings({ recall_enabled: event.target.checked })} />在回答中召回</label><label><input type="checkbox" checked={settingValues.sync_enabled ?? true} disabled={changing || !view} onChange={event => void settings({ sync_enabled: event.target.checked })} />随官方账号同步</label></div></>}</div></div>
    </header>
    {(error || actionError) && <div className="memory-sea__error" role="alert">{actionError || error}<button type="button" onClick={onRefresh}>重新读取</button></div>}
    {!!view?.processing?.failed && <div className="memory-sea__error" role="status">有些线索还没整理好<button type="button" disabled={changing} onClick={async () => { setChanging(true); try { await onRetry?.(); } catch (cause) { setActionError((cause as Error).message); } finally { setChanging(false); } }}>重新整理</button></div>}
    <div className="memory-sea__body"><div className="memory-sea__canvas">
      <MemoryNebula nodes={sceneNodes} relations={view?.relations ?? EMPTY_RELATIONS} selectedId={selectedId} recalledIds={recalledIds} matchingIds={matchingIds} kind={kind} active={active} recallEnabled={view?.settings.recall_enabled !== false} onSelect={selectMemory} onKind={openKind} />
    </div>
    <aside className="memory-sea__inspector" aria-label="记忆与来源"><nav className="memory-sea__tabs" aria-label="忆迹场内容">{([["memories","记忆"],["recalls","回想"],["documents","文档"]] as const).map(([id,label]) => <button type="button" key={id} aria-pressed={tab === id} onClick={() => { setTab(id); setSelectedId(null); }}>{label}</button>)}</nav>
      {tab === "memories" ? selected ? <MemoryDetail key={selected.id + ":" + selected.revision} node={selected} all={nodes} changing={changing} onChange={change} onBack={() => setSelectedId(null)} onSelect={setSelectedId} /> : <><div className="memory-sea__list-heading"><strong>{kind ? MEMORY_LABELS[kind] : "关于你的记忆"}</strong>{kind && <button type="button" title="显示全部分类" aria-label="显示全部分类" onClick={() => setKind(null)}><AgentIcon name="close" size={13} /></button>}<span>{filtered.length}</span></div><div className="memory-sea__filters">{([["active","全部"],["recalled","本次召回"],["archived","已归档"]] as const).map(([id,label]) => <button type="button" key={id} aria-pressed={filter === id} onClick={() => setFilter(id)}>{label}</button>)}</div><div className="memory-sea__list">{filtered.map(node => <button type="button" className="memory-sea__item" key={node.id} data-recalled={recalledIds.has(node.id)} data-phase={node.phase} onClick={() => selectMemory(node.id)} style={{ "--memory-color": COLORS[node.kind] } as CSSProperties}><span><i />{MEMORY_LABELS[node.kind]}{node.anchor && <AgentIcon name="shield" size={12} />}</span><strong>{node.text}</strong><small>{node.conflict_ids.length ? "表述有变化 · 待核对" : node.confirmed ? "你已确认" : "来自原话 · 待核对"}<time>{new Date(node.last_mentioned_at).toLocaleDateString("zh-CN",{month:"2-digit",day:"2-digit"})}</time></small></button>)}</div>{!filtered.length && <div className="memory-sea__empty"><span>✧</span><p>{loading ? "正在读取…" : search ? "没有找到这段记忆" : filter === "archived" ? "没有归档的记忆" : "新的线索会在对话后留下"}</p></div>}</> : tab === "recalls" ? <div className="memory-sea__recalls">{view?.recalls.map(item => <section key={item.id}><header><time>{new Date(item.created_at).toLocaleString("zh-CN",{month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"})}</time><span>{item.items.length} 段关联</span></header><p>{item.query}</p>{item.items.map(reference => <button key={reference.id} type="button" onClick={() => { setSelectedId(reference.id); setTab("memories"); }}><strong>{reference.text}</strong><span>{reference.reason}</span></button>)}{!item.items.length && <small>这次没有用到长期记忆</small>}</section>)}{!view?.recalls.length && <div className="memory-sea__empty"><span>↝</span><p>下一次回答时，相关的记忆会在这里相遇。</p></div>}</div> : <div className="memory-sea__documents">{view?.documents.map(document => <details key={document.id}><summary>{document.title}<span>{document.memory_ids.length}</span></summary><pre>{document.memory_ids.length ? document.text : "还没有相关记忆"}</pre></details>)}<p>文档随记忆即时更新，纠正或删除会同步生效。</p></div>}
    </aside></div>
  </section>;
}
function MemoryDetail({ node, all, changing, onChange, onBack, onSelect }: { node: MemoryNode; all: MemoryNode[]; changing: boolean; onChange: (action: MemoryChange["action"],text?:string) => Promise<void>; onBack: () => void; onSelect: (id:string) => void }) {
  const [editing, setEditing] = useState(false), [text, setText] = useState(node.text);
  return <div className="memory-sea__detail"><button type="button" className="memory-sea__back" onClick={onBack}>← 返回记忆</button><span className="memory-sea__detail-kind" style={{color:COLORS[node.kind]}}>{MEMORY_LABELS[node.kind]}</span><h3>{node.text}</h3><div className="memory-sea__detail-meta"><span>{node.confirmed ? "已确认" : "待核对"}</span><span>{node.anchor ? "长期锚点" : node.phase === "dormant" ? "低频记忆" : node.phase === "fading" ? "慢慢淡出" : "记忆清晰"}</span></div><dl><div><dt>提及</dt><dd>{node.mentions} 次</dd></div><div><dt>召回</dt><dd>{node.recall_count} 次</dd></div><div><dt>最近提及</dt><dd>{new Date(node.last_mentioned_at).toLocaleDateString("zh-CN")}</dd></div></dl>
    {node.conflict_ids.length > 0 && <div className="memory-sea__conflict"><strong>这和之前的表述有些不同</strong>{all.filter(item => node.conflict_ids.includes(item.id)).map(item => <button type="button" key={item.id} onClick={() => onSelect(item.id)}>{item.text}</button>)}<p>确认当前这条后，另一条会归档。</p></div>}
    <div className="memory-sea__sources"><h4>原话与出处</h4>{node.sources.map(source => <details key={source.id}><summary>{source.conversation_title}<time>{source.created_at.slice(0,10)}</time></summary><blockquote>{source.quote}</blockquote>{(source.kind === "message" || source.kind === "synced") && <small>{source.kind === "synced" ? "已同步原话" : "对话原文"} · {source.source_id.slice(0,8)}</small>}</details>)}</div>
    {editing && <form className="memory-sea__correction" onSubmit={event => { event.preventDefault(); void onChange("correct",text.trim()); }}><AnimatedTextarea value={text} onChange={event => setText(event.target.value)} maxLength={480} aria-label="正确的记忆内容" rows={4} /><div><button type="button" onClick={() => setEditing(false)}>取消</button><button type="submit" disabled={changing || text.trim().length < 2}>保存改正</button></div><small>改正忆迹场记忆；正式画像和简历仍由对应流程核对。</small></form>}
    <div className="memory-sea__actions">{(!node.confirmed || node.conflict_ids.length > 0) && <button type="button" disabled={changing} onClick={() => void onChange("confirm")}>确认这条</button>}<button type="button" disabled={changing} onClick={() => setEditing(value => !value)}>改一下</button>{node.kind !== "emotion" && <button type="button" disabled={changing} onClick={() => void onChange(node.anchor ? "unanchor":"anchor")}>{node.anchor ? "取消长期锚点":"一直记得"}</button>}<button type="button" disabled={changing} onClick={() => void onChange(node.demoted ? "restore":"demote")}>{node.demoted ? "恢复参考":"降低参考"}</button><button type="button" disabled={changing} onClick={() => void onChange(node.status === "archived" ? "restore":"archive")}>{node.status === "archived" ? "恢复记忆":"归档"}</button><button type="button" className="is-danger" disabled={changing} onClick={() => void onChange("delete")}>永久删除</button></div>
  </div>;
}
