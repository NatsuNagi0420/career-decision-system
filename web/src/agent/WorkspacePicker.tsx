/** 青穗集 · 本机项目工作区面板：登记原目录、绑定当前对话并切换只读/可写权限。 */
import { AgentIcon } from "./AgentIcon";
import type { Conversation, LocalWorkspace, WorkspaceAccess } from "./types";
import "./workspace-picker.css";

export function WorkspacePicker({ open, conversation, workspaces, access, busy, onClose, onPick, onBind, onUnbind, onDelete }: {
  open: boolean;
  conversation: Conversation | null;
  workspaces: LocalWorkspace[];
  access: WorkspaceAccess;
  busy?: boolean;
  onClose: () => void;
  onPick: () => void;
  onBind: (id: string, access: WorkspaceAccess) => void;
  onUnbind: () => void;
  onDelete: (workspace: LocalWorkspace) => void;
}) {
  if (!open) return null;
  const current = workspaces.find(item => item.id === conversation?.workspace_id);
  return <>
    <button className="workspace-picker-backdrop" type="button" aria-label="关闭本机项目工作区" onClick={onClose} />
    <section className="workspace-picker" role="dialog" aria-modal="true" aria-label="本机项目工作区">
      <header className="workspace-picker__header">
        <div><span className="workspace-picker__eyebrow">LOCAL WORKSPACE</span><h2>项目工作区</h2></div>
        <button type="button" className="agent-icon-button" aria-label="关闭" title="关闭" onClick={onClose}><AgentIcon name="close" size={18} /></button>
      </header>
      <div className="workspace-picker__current">
        <div className="workspace-picker__current-icon"><AgentIcon name="folder" size={22} /></div>
        <div className="workspace-picker__current-copy">
          <strong>{current?.name ?? "未绑定项目"}</strong>
          <span>{current ? (access === "workspace-write" ? "当前对话可写项目" : "当前对话只读项目") : "选择一个本机项目，让穗奈实时读取它"}</span>
        </div>
        {current && <button type="button" className="workspace-picker__plain" disabled={busy} onClick={onUnbind}>解除绑定</button>}
      </div>
      <div className="workspace-picker__actions">
        <button type="button" className="workspace-picker__pick" disabled={busy} onClick={onPick}><AgentIcon name="folder" size={18} /><span>选择本机项目</span><small>不会复制整个项目</small></button>
      </div>
      <div className="workspace-picker__list" aria-label="最近项目工作区">
        {workspaces.length ? workspaces.map(item => <article key={item.id} className={"workspace-picker__item" + (item.id === conversation?.workspace_id ? " is-current" : "")}>
          <div className="workspace-picker__item-main"><strong>{item.name}</strong><span title={item.root_path}>{item.root_path}</span></div>
          <div className="workspace-picker__item-actions">
            <button type="button" className="workspace-picker__bind" disabled={busy} onClick={() => onBind(item.id, "read-only")}>{item.id === conversation?.workspace_id && access === "read-only" ? "已只读" : "只读分析"}</button>
            <button type="button" className="workspace-picker__bind workspace-picker__bind--write" disabled={busy} onClick={() => onBind(item.id, "workspace-write")}>{item.id === conversation?.workspace_id && access === "workspace-write" ? "已可写" : "允许修改"}</button>
            <button type="button" className="agent-icon-button" aria-label={`移除 ${item.name}`} title="从列表移除" disabled={busy || item.id === conversation?.workspace_id} onClick={() => onDelete(item)}><AgentIcon name="close" size={14} /></button>
          </div>
        </article>) : <p className="workspace-picker__empty">还没有登记本机项目。</p>}
      </div>
      <footer className="workspace-picker__footer"><span>穗奈只会读取工具实际需要的文件片段</span><span>项目目录仍由你掌控</span></footer>
    </section>
  </>;
}
