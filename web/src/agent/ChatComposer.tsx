/** 青穗集 · 对话输入工具栏：统一模型、权限与思考浮层，保留显式确认与真实参数。 */
import { useEffect, type FormEvent, type RefObject } from "react";
import { AgentIcon } from "./AgentIcon";
import { CareerIcon } from "./CareerVisuals";
import { ComposerMenu } from "./ComposerMenu";
import { ReasoningSlider } from "./ReasoningSlider";
import { usePixelConfirm } from "../components/PixelConfirmDialog";
import type { AgentInfo, ModelProfile, PermissionMode, ReasoningEffort } from "./types";
const EFFORT_LABEL = { auto: "自动", low: "轻量", medium: "标准", high: "深入" };
function connectionNote(profile: ModelProfile) {
  if (!profile.has_key) return "需要填写密钥";
  if (!profile.capabilities.tested_at) return "尚未测试";
  if (!profile.capabilities.chat) return "连接测试未通过";
  return profile.capabilities.tools ? "支持工具调用" : "支持对话";
}
export function ChatComposer({ environment, text, onText, composer, fileInput, onSubmit, onUpload, onCancel, onModelSettings, busy, working, fileBusy, waiting, archived, profiles, selected, onSelect, permission, onPermission, effort, onEffort }: {
  environment?: AgentInfo["sandbox"];
  text: string; onText: (text: string) => void; composer: RefObject<HTMLTextAreaElement | null>;
  fileInput: RefObject<HTMLInputElement | null>; onSubmit: (event?: FormEvent) => void;
  onUpload: (items: FileList | null) => void; onCancel: () => void; onModelSettings?: () => void;
  busy: boolean; working: boolean; fileBusy: boolean; waiting: boolean; archived: boolean;
  profiles: ModelProfile[]; selected: string; onSelect: (id: string) => void;
  permission: PermissionMode; onPermission: (value: PermissionMode) => void;
  effort: ReasoningEffort; onEffort: (value: ReasoningEffort) => void;
}) {
  const locked = busy || working || archived;
  const profile = profiles.find(item => item.id === selected);
  const { confirm, cancel, dialog } = usePixelConfirm();
  useEffect(() => { if (locked) cancel(); }, [locked, cancel]);
  return <><form className="agent-composer" onSubmit={onSubmit}>
    <label className="sr-only" htmlFor="agent-message">告诉穗奈你想完成什么</label>
    <textarea ref={composer} id="agent-message" rows={3} maxLength={20000} disabled={archived}
      placeholder={archived ? "这是已归档的对话，恢复后可以继续。" : waiting ? "补充刚才缺少的信息，我们接着来…" : "聊聊你的经历、方向，或交给穗奈一件事…"}
      value={text} onChange={event => onText(event.target.value)}
      onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); onSubmit(); } }} />
    <footer className="agent-composer__toolbar">
      <div className="agent-composer__left">
        <input ref={fileInput} className="sr-only" type="file" multiple accept=".txt,.md,.csv,.json,.yaml,.yml,.log" aria-label="导入文本资料" onChange={event => onUpload(event.target.files)} />
        <span className="agent-tooltip" data-tooltip={fileBusy ? "正在导入…" : "导入文件"}>
          <button className="agent-icon-button agent-attach" type="button" aria-label="导入文件" title="导入文件" disabled={fileBusy || locked} onClick={() => fileInput.current?.click()}><AgentIcon name="attach" size={20} /></button>
        </span>
        <ComposerMenu className="agent-permission" label="权限设置" title="选择执行权限" disabled={locked} fullAccess={permission === "full-access"}
          trigger={<><AgentIcon name={permission === "full-access" ? "unlock" : "shield"} size={16} /><span>{permission === "full-access" ? "完全访问" : "默认配置"}</span><AgentIcon name="down" size={12} /></>}>
          {close => <>
            <strong>执行权限</strong>
            <button type="button" className="agent-menu-option" aria-pressed={permission === "default"} disabled={locked} onClick={() => { close(); onPermission("default"); }}>
              <AgentIcon name="shield" /><span><b>默认配置</b><small>使用受限环境；导出仍需确认。</small></span>{permission === "default" && <AgentIcon name="check" size={15} />}
            </button>
            <button type="button" className="agent-menu-option" aria-pressed={permission === "full-access"} disabled={locked} onClick={async () => {
              close();
              if (permission === "full-access") return;
              const accepted = await confirm({
                title: "开启完全访问？", confirmLabel: "确认开启", cancelLabel: "保持默认",
                description: <>
                  <p>开启后，穗奈可通过终端，以<strong>当前系统用户权限读取、修改本机文件并联网</strong>，不再受默认写入限制。</p>
                  <ul><li>命令可能造成文件更改或<strong>数据丢失</strong>。</li><li>不会获得管理员权限，导出仍需你确认。</li></ul>
                  <p className="pixel-confirm__note">仅用于当前对话；切换对话后自动恢复默认配置。拿不准时，请保持默认。</p>
                </>,
              });
              if (accepted) onPermission("full-access");
            }}><AgentIcon name="unlock" /><span><b>完全访问</b><small>直接使用本机终端 · 需要你明确确认</small></span>{permission === "full-access" && <AgentIcon name="check" size={15} />}</button>
            <div className="agent-permission-boundary"><strong>默认环境说明</strong><p>{environment?.message ?? "默认环境并非完全隔离；命令环境不可用时不会改用无限制终端。"}</p>{environment?.provider === "windows-native" && <p>Windows 写入受限环境：读取与联网未隔离，每条命令最长 60 秒。只处理当前对话明确交给穗奈的材料。</p>}</div>
          </>}
        </ComposerMenu>
      </div>
      <div className="agent-composer__right">
        <ComposerMenu className="agent-composer-model" panelClassName="agent-model-panel" label="当前模型连接" title="选择模型连接" disabled={locked} role="menu" align="end"
          trigger={<><span className="agent-model-tag" aria-hidden="true">模型</span><span className="agent-model-name" title={profile ? (profile.display_name || profile.model) + " · " + profile.name : undefined}>{profile?.display_name || profile?.model || "选择模型"}</span><AgentIcon name="down" size={12} /></>}>
          {close => <>
            <div className="agent-model-heading"><strong>模型连接</strong><span>{profiles.length} 个</span></div>
            {profiles.length ? profiles.map(item => <button key={item.id} type="button" role="menuitemradio" aria-checked={selected === item.id} className="agent-menu-option agent-model-option" disabled={locked} onClick={() => { onSelect(item.id); close(); }}>
              <span><b>{item.display_name || item.model}</b><small>{item.name} · {connectionNote(item)}</small></span><span className="agent-model-check" aria-hidden="true">{selected === item.id && <AgentIcon name="check" size={17} />}</span>
            </button>) : <p className="agent-model-empty">还没有模型连接，先添加一个再开始对话。</p>}
            {onModelSettings && <button type="button" role="menuitem" className="agent-model-settings" onClick={() => { close(); onModelSettings(); }}><CareerIcon name="settings" size={18} /><span>管理模型连接</span><span aria-hidden="true">↗</span></button>}
          </>}
        </ComposerMenu>
        <ComposerMenu className="agent-effort" panelClassName="agent-effort-panel" label={"思考强度：" + EFFORT_LABEL[effort]} title="设置思考强度" disabled={locked} align="end"
          trigger={<><span>思考 · {EFFORT_LABEL[effort]}</span><AgentIcon name="down" size={12} /></>}>
          {() => <ReasoningSlider effort={effort} disabled={locked} onChange={onEffort} />}
        </ComposerMenu>
        <span className="agent-tooltip" data-tooltip={busy ? "停止执行" : "发送消息 · Enter"}>
          <button className={"agent-send " + (busy ? "agent-send--stop" : "")} type={busy ? "button" : "submit"} aria-label={busy ? "停止执行" : "发送消息"} disabled={!busy && (working || fileBusy || archived || !text.trim())} onClick={busy ? onCancel : undefined}>
            {busy ? <AgentIcon name="stop" size={18} /> : <CareerIcon name="send" size={23} />}
          </button>
        </span>
      </div>
    </footer>
    <div className="agent-composer__hint"><span>{permission === "full-access" ? "完全访问已开启 · 切换对话将恢复默认" : "只处理你交给我的资料"}</span><span>Shift + Enter 换行</span></div>
  </form>{dialog}</>;
}
