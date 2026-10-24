/** 青穗集 · 消息内文件链接与右键菜单：左键侧栏预览，操作由真实文件 ID 驱动。 */
import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type KeyboardEvent } from "react";
import type { AgentFile } from "./types";
import { AgentIcon } from "./AgentIcon";
import { canOpenLocally, formatFileSize, latestFiles } from "./artifactLinks";
interface Actions {
  local: boolean;
  busy: boolean;
  preview: (file: AgentFile) => void;
  download: (file: AgentFile) => void;
  open: (file: AgentFile, action: "open" | "reveal") => void;
}
interface FileMenu { file: AgentFile; x: number; y: number; origin: HTMLElement }
const Context = createContext<(Actions & { menu: (value: FileMenu) => void }) | null>(null);
export function FileActionProvider({ children, scope, ...actions }: Actions & { children: ReactNode; scope: string | null }) {
  const popup = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<FileMenu | null>(null);
  useEffect(() => { popup.current?.hidePopover(); setMenu(null); }, [scope]);
  useLayoutEffect(() => {
    if (!menu || !popup.current) return;
    const element = popup.current;
    element.showPopover();
    const rect = element.getBoundingClientRect();
    element.style.left = Math.max(10, Math.min(menu.x, window.innerWidth - rect.width - 12)) + "px";
    element.style.top = Math.max(10, Math.min(menu.y, window.innerHeight - rect.height - 12)) + "px";
    element.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus({ preventScroll: true });
  }, [menu]);
  function choose(action: () => void) { popup.current?.hidePopover(); menu?.origin.focus({ preventScroll: true }); action(); }
  function navigate(event: KeyboardEvent) {
    if (event.key === "Escape") { menu?.origin.focus({ preventScroll: true }); return; }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const buttons = [...(popup.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [])];
    const current = buttons.findIndex(button => button === document.activeElement);
    const index = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (current + (event.key === "ArrowUp" ? -1 : 1) + buttons.length) % buttons.length;
    buttons[index]?.focus();
  }
  return <Context.Provider value={{ ...actions, menu: setMenu }}>{children}
    <div ref={popup} className="file-context-menu" role="menu" aria-label="文件操作" popover="auto" onKeyDown={navigate}>
      {menu && <><small>{menu.file.name} · v{menu.file.version}</small>
        <button type="button" role="menuitem" onClick={() => choose(() => actions.preview(menu.file))}>在侧栏预览</button>
        {actions.local && <><button type="button" role="menuitem" disabled={actions.busy || !canOpenLocally(menu.file.name)} onClick={() => choose(() => actions.open(menu.file, "open"))}>用默认应用打开</button><button type="button" role="menuitem" disabled={actions.busy} onClick={() => choose(() => actions.open(menu.file, "reveal"))}>打开所在文件夹</button></>}
        <button type="button" role="menuitem" disabled={actions.busy} onClick={() => choose(() => actions.download(menu.file))}>下载此版本</button>
      </>}
    </div>
  </Context.Provider>;
}
export function FileLink({ file, children, compact = false }: { file: AgentFile; children?: ReactNode; compact?: boolean }) {
  const actions = useContext(Context);
  return <a className={"file-text-link" + (compact ? " file-text-link--compact" : "")} href={"#file=" + file.id} data-file-id={file.id} title={file.name + " · 左键预览，右键更多操作"} onClick={event => { event.preventDefault(); actions?.preview(file); }} onContextMenu={event => { if (!actions) return; event.preventDefault(); actions.menu({ file, x: event.clientX, y: event.clientY, origin: event.currentTarget }); }} onKeyDown={event => { if ((event.key === "F10" && event.shiftKey) || event.key === "ContextMenu") { event.preventDefault(); const rect = event.currentTarget.getBoundingClientRect(); actions?.menu({ file, x: rect.left, y: rect.bottom, origin: event.currentTarget }); } }}><AgentIcon name="attach" size={compact ? 13 : 15} /><span>{children ?? file.name}</span></a>;
}
export function MessageFileLinks({ files }: { files: AgentFile[] }) {
  if (!files.length) return null;
  return <div className="message-file-links" aria-label="本次生成的文件">{files.map(file => <div key={file.id}><FileLink file={file} /><small>v{file.version} · {formatFileSize(file.bytes)}</small><FileQuickAction file={file} /></div>)}</div>;
}
function FileQuickAction({ file }: { file: AgentFile }) {
  const actions = useContext(Context);
  if (!actions) return null;
  const open = actions.local && canOpenLocally(file.name);
  return <button className="file-inline-action" type="button" disabled={actions.busy} title={open ? "用系统默认应用打开" : "下载这个文件版本"} onClick={() => open ? actions.open(file, "open") : actions.download(file)}>{open ? "打开" : "下载"}<AgentIcon name={open ? "external" : "download"} size={12} /></button>;
}
export function FileDirectory({ files }: { files: AgentFile[] }) {
  const latest = latestFiles(files);
  return <section className="file-directory" aria-label="本次对话文件"><header><h2>本次对话文件</h2><span>{latest.length}</span></header>{latest.length ? <ul>{latest.map(file => <li key={file.id}><FileLink file={file} compact /><small>{file.kind === "input" ? "导入" : "生成"} · v{file.version} · {formatFileSize(file.bytes)}</small></li>)}</ul> : <p>生成或导入文件后，可点击文件名预览。</p>}</section>;
}
