/** 青穗集 · 消息操作与原位编辑：悬浮复制、编辑重发，明确后续对话分支与已保存资料的边界。 */
import { useEffect, useRef, useState } from "react";
import { AgentIcon } from "./AgentIcon";
import { AnimatedTextarea } from "./AnimatedTextarea";
export function MessageActions({ content, onEdit, disabled, onError }: { content: string; onEdit?: () => void; disabled: boolean; onError: (message: string) => void }) {
  const [copied, setCopied] = useState(false), reset = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(reset.current), []);
  async function copy() {
    try { await navigator.clipboard.writeText(content); setCopied(true); clearTimeout(reset.current); reset.current = setTimeout(() => setCopied(false), 1500); }
    catch { onError("复制未完成，请选中文字后复制。"); }
  }
  return <footer className="message-actions" aria-label="消息操作">
    <span className="agent-tooltip" data-tooltip={copied ? "已复制" : "复制文字"}><button type="button" aria-label={copied ? "已复制" : "复制文字"} onClick={() => void copy()}><AgentIcon name={copied ? "check" : "copy"} size={15} /></button></span>
    {onEdit && <span className="agent-tooltip" data-tooltip="编辑并重新发送"><button type="button" aria-label="编辑并重新发送" disabled={disabled} onClick={onEdit}><AgentIcon name="edit" size={15} /></button></span>}
    <span className="message-actions__announcement" role="status">{copied ? "已复制" : ""}</span>
  </footer>;
}
export function MessageEditor({ content, disabled, onCancel, onSend }: { content: string; disabled: boolean; onCancel: () => void; onSend: (text: string) => void }) {
  const [value, setValue] = useState(content), input = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { input.current?.focus({ preventScroll: true }); input.current?.setSelectionRange(content.length, content.length); }, [content]);
  return <form className="message-editor" onSubmit={event => { event.preventDefault(); if (value.trim() && !disabled) onSend(value.trim()); }}>
    <AnimatedTextarea ref={input} aria-label="编辑这条消息" value={value} maxLength={20000} disabled={disabled} onChange={event => setValue(event.target.value)} onKeyDown={event => { if (event.key === "Escape" && !disabled) { event.preventDefault(); onCancel(); } }} />
    <div className="message-editor__footer"><small>从此处重新回复，已保存的文件和资料保留。</small><div><button type="button" disabled={disabled} onClick={onCancel}>取消</button><button className="message-editor__send" type="submit" disabled={disabled || !value.trim()}><AgentIcon name="send" size={13} />重新发送</button></div></div>
  </form>;
}
