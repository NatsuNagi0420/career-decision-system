/** 青穗集 · 会话历史与管理：标题搜索、重命名、归档恢复和永久删除，所有入口复用同一菜单。 */
import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { AgentIcon } from "./AgentIcon";
import { CareerIcon } from "./CareerVisuals";
import { ComposerMenu } from "./ComposerMenu";
import type { Conversation } from "./types";
import "./conversation-history.css";
export function filterConversations(items: Conversation[], archived: boolean, query: string) {
  const keyword = query.trim().normalize("NFKC").toLocaleLowerCase();
  return items.filter(item => Boolean(item.archived) === archived && item.title.normalize("NFKC").toLocaleLowerCase().includes(keyword))
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}
interface Actions {
  onRename: (conversation: Conversation) => void;
  onArchive: (conversation: Conversation) => void;
  onDelete: (conversation: Conversation) => void;
}
export function ConversationActions({ conversation, disabled, active = false, onRename, onArchive, onDelete, compact = false }: Actions & {
  conversation: Conversation; disabled: boolean; active?: boolean; compact?: boolean;
}) {
  return <ComposerMenu label={"对话操作：" + conversation.title} title="对话操作" trigger={<AgentIcon name="more" size={19} />} disabled={disabled}
    role="menu" align="end" className={"conversation-actions" + (compact ? " conversation-actions--compact" : "")} panelClassName="conversation-actions-panel">
    {close => <><small className="conversation-menu-caption">管理这段对话</small>
      <button type="button" role="menuitem" onClick={() => { close(); onRename(conversation); }}><AgentIcon name="edit" size={16} />重命名</button>
      <button type="button" role="menuitem" disabled={active} title={active ? "请先完成或停止当前任务" : undefined} onClick={() => { close(); onArchive(conversation); }}><AgentIcon name={conversation.archived ? "restore" : "archive"} size={16} />{conversation.archived ? "恢复对话" : "归档对话"}</button>
      <div className="conversation-menu-separator" role="separator" />
      <button type="button" role="menuitem" disabled={active} className="conversation-menu-danger" title={active ? "请先完成或停止当前任务" : undefined} onClick={() => { close(); onDelete(conversation); }}><AgentIcon name="trash" size={16} />永久删除</button>
      {active && <small className="conversation-menu-caption">任务结束或停止后可归档、删除</small>}
    </>}
  </ComposerMenu>;
}
export function ConversationHistory({ conversations, selectedId, disabled, activeId, archived, onArchived, onChoose, onPrefetch, ...actions }: Actions & {
  conversations: Conversation[]; selectedId: string | null; disabled: boolean; activeId: string | null;
  archived: boolean; onArchived: (value: boolean) => void; onChoose: (id: string) => void;
  onPrefetch?: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const items = useMemo(() => filterConversations(conversations, archived, query), [conversations, archived, query]);
  const prefetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function cancelPrefetch() { if (prefetchTimer.current !== null) clearTimeout(prefetchTimer.current); prefetchTimer.current = null; }
  function prefetch(id: string, delay = 0) {
    cancelPrefetch();
    if (disabled || id === selectedId || !onPrefetch) return;
    if (delay) prefetchTimer.current = setTimeout(() => onPrefetch(id), delay);
    else onPrefetch(id);
  }
  useEffect(() => cancelPrefetch, []);
  return <section className="conversation-history" aria-label="对话记录">
    <div className="agent-history-tabs" aria-label="对话分类">
      <button type="button" aria-pressed={!archived} data-active={!archived} onClick={() => onArchived(false)}>最近对话 <small>{conversations.filter(item => !item.archived).length}</small></button>
      <button type="button" aria-pressed={archived} data-active={archived} onClick={() => onArchived(true)}>已归档 <small>{conversations.filter(item => item.archived).length}</small></button>
    </div>
    <div className="conversation-search"><AgentIcon name="search" size={15} /><input aria-label="搜索对话标题" type="search" placeholder="搜索对话…" value={query} onChange={event => setQuery(event.target.value)} />{query && <button type="button" title="清空搜索" aria-label="清空搜索" onClick={() => setQuery("")}><AgentIcon name="close" size={13} /></button>}</div>
    <nav key={archived ? "archived" : "recent"} className="conversation-history-list" aria-label={archived ? "已归档对话" : "历史对话"}>
      {items.map(conversation => <div className="agent-history-row" key={conversation.id} data-selected={selectedId === conversation.id}>
        <button className="agent-history-open" type="button" disabled={disabled} aria-current={selectedId === conversation.id ? "page" : undefined} title={conversation.title}
          onPointerEnter={event => { if (event.pointerType !== "touch") prefetch(conversation.id, 90); }} onPointerLeave={cancelPrefetch}
          onFocus={() => prefetch(conversation.id)} onBlur={cancelPrefetch} onPointerDown={() => prefetch(conversation.id)}
          onClick={() => { cancelPrefetch(); onChoose(conversation.id); }}>{conversation.sync_origin ? <AgentIcon name={conversation.sync_origin.target === "pc" ? "computer" : "cloud"} size={21} /> : <CareerIcon name="history" size={21} />}<span>{conversation.title}<small>{new Date(conversation.updated_at).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" })}</small></span></button>
        <ConversationActions {...actions} compact conversation={conversation} disabled={disabled} active={conversation.id === activeId} />
      </div>)}
      {!items.length && <p className="agent-muted conversation-history-empty">{query.trim() ? "这里没有找到这个标题，试试其他关键词或另一个分类。" : archived ? "还没有归档的对话。归档只收起记录，不会删除资料。" : "聊过的事会留在这里。每段对话的 ··· 里可以重命名、归档或删除。"}</p>}
    </nav>
  </section>;
}
export function RenameConversationDialog({ conversation, onSave, onClose }: {
  conversation: Conversation; onSave: (title: string) => Promise<void>; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null), input = useRef<HTMLInputElement>(null);
  const id = useId();
  const [title, setTitle] = useState(conversation.title), [saving, setSaving] = useState(false), [error, setError] = useState("");
  useEffect(() => {
    const element = dialog.current, previous = document.activeElement;
    element?.showModal(); input.current?.select();
    return () => { element?.close(); if (previous instanceof HTMLElement && previous.isConnected) previous.focus({ preventScroll: true }); };
  }, []);
  async function submit(event: FormEvent) {
    event.preventDefault(); if (saving) return;
    const value = title.trim();
    if (!value || value.length > 80) { setError("请输入 1–80 个字符的对话名称。"); input.current?.focus(); return; }
    setSaving(true); setError("");
    try { if (value !== conversation.title) await onSave(value); onClose(); }
    catch (cause) { setError((cause as Error).message); setSaving(false); input.current?.focus(); }
  }
  return createPortal(<dialog ref={dialog} className="conversation-rename" aria-labelledby={id + "-title"} aria-describedby={id + "-hint"}
    onCancel={event => { event.preventDefault(); if (!saving) onClose(); }} onClick={event => { const r = event.currentTarget.getBoundingClientRect(); if (!saving && event.target === event.currentTarget && (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom)) onClose(); }}>
    <header><AgentIcon name="edit" size={18} /><h2 id={id + "-title"}>给这段对话起个名字</h2><button type="button" disabled={saving} aria-label="关闭重命名" onClick={onClose}><AgentIcon name="close" size={18} /></button></header>
    <form onSubmit={event => void submit(event)}><label htmlFor={id + "-input"}>对话名称</label><input ref={input} id={id + "-input"} maxLength={80} autoComplete="off" value={title} disabled={saving} onChange={event => { setTitle(event.target.value); setError(""); }} /><p id={id + "-hint"}>只改名字，不改变聊天内容。Enter 保存，Esc 取消。</p>{error && <p className="conversation-rename-error" role="alert">{error}</p>}<footer><button type="button" disabled={saving} onClick={onClose}>取消</button><button className="conversation-rename-save" type="submit" disabled={saving || !title.trim()}>{saving ? "保存中…" : "保存名称"}</button></footer></form>
  </dialog>, document.body);
}
