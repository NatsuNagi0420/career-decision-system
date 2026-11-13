/** 青穗集 · 对话输入工具栏：统一模型、权限与思考浮层，保留显式确认与真实参数。 */
import { useEffect, useRef, type FormEvent, type RefObject } from "react";
import { AgentIcon } from "./AgentIcon";
import { CareerIcon } from "./CareerVisuals";
import { ComposerMenu } from "./ComposerMenu";
import { ReasoningSlider } from "./ReasoningSlider";
import { AnimatedTextarea } from "./AnimatedTextarea";
import { usePixelConfirm } from "../components/PixelConfirmDialog";
import type { AgentFile, AgentInfo, ModelProfile, PermissionMode, ReasoningEffort } from "./types";
const EFFORT_LABEL = { auto: "自动", low: "轻量", medium: "标准", high: "深入" };
function connectionNote(profile: ModelProfile) {
  if (!profile.has_key) return "需要填写密钥";
  if (!profile.capabilities.tested_at) return "尚未测试";
  if (!profile.capabilities.chat) return "连接测试未通过";
  return profile.capabilities.tools ? "支持工具调用" : "支持对话";
}
export function ChatComposer({ ui, supportedExtensions, text, onText, composer, fileInput, onSubmit, onUpload, onUploadProject = () => {}, onOpenWorkspace, onRemoveAttachment = () => {}, pendingAttachments = [], attachmentPreviews = {}, onCancel, onModelSettings, busy, working, fileBusy, waiting, archived, profiles, selected, onSelect, permission, onPermission, effort, onEffort }: {
  environment?: AgentInfo["sandbox"];
  ui?: import("../../../agent/src/ui-contract").DeploymentUi;
  supportedExtensions?: string[];
  text: string; onText: (text: string) => void; composer: RefObject<HTMLTextAreaElement | null>;
  fileInput: RefObject<HTMLInputElement | null>; onSubmit: (event?: FormEvent) => void;
  onUpload: (items: FileList | File[] | null) => void; onUploadProject?: (items: FileList | null) => void; onOpenWorkspace?: () => void;
  onRemoveAttachment?: (id: string) => void; pendingAttachments?: AgentFile[]; attachmentPreviews?: Record<string, string>; onCancel: () => void; onModelSettings?: () => void;
  busy: boolean; working: boolean; fileBusy: boolean; waiting: boolean; archived: boolean;
  profiles: ModelProfile[]; selected: string; onSelect: (id: string) => void;
  permission: PermissionMode; onPermission: (value: PermissionMode) => void;
  effort: ReasoningEffort; onEffort: (value: ReasoningEffort) => void;
}) {
  const locked = busy || working || archived;
  const actions = ui ?? { local_projects: true, host_permissions: true, model_selector: true, model_connections: true };
  const accept = supportedExtensions?.map(ext => "." + ext.replace(/^\./, "")).join(",");
  const profile = profiles.find(item => item.id === selected);
  const projectInput = useRef<HTMLInputElement>(null);
  const { confirm, cancel, dialog } = usePixelConfirm();
  useEffect(() => { if (locked) cancel(); }, [locked, cancel]);
  useEffect(() => {
    projectInput.current?.setAttribute("webkitdirectory", "");
    projectInput.current?.setAttribute("directory", "");
  }, []);
  return <><form className="agent-composer" onSubmit={onSubmit}>
    <label className="sr-only" htmlFor="agent-message">告诉穗奈你想完成什么</label>
    <AnimatedTextarea ref={composer} data-onboarding="chat" id="agent-message" rows={3} maxLength={20000} disabled={archived}
      placeholder={archived ? "这是已归档的对话，恢复后可以继续。" : waiting ? "补充刚才缺少的信息，我们接着来…" : "聊聊你的经历、方向，或交给穗奈一件事…"}
      value={text} onChange={event => onText(event.target.value)}
      onPaste={event => {
        const image = Array.from(event.clipboardData.items).find(item => item.kind === "file" && item.type.startsWith("image/"))?.getAsFile();
        if (image) {
          event.preventDefault();
          onUpload([image]);
        }
      }}
      onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); onSubmit(); } }} />
    {pendingAttachments.length > 0 && <div className="agent-composer__attachments" aria-label="待发送图片">
      {pendingAttachments.map(file => <span className="agent-composer__attachment" key={file.id}>
        {attachmentPreviews[file.id] ? <img src={attachmentPreviews[file.id]} alt="" /> : <AgentIcon name="image" size={15} />}<span title={file.name}>{file.name}</span>
        <button type="button" aria-label={`移除 ${file.name}`} title="移除图片" onClick={() => onRemoveAttachment(file.id)} disabled={locked}><AgentIcon name="close" size={13} /></button>
      </span>)}
    </div>}
    <footer className="agent-composer__toolbar">
      <div className="agent-composer__left">
        <input ref={fileInput} className="sr-only" type="file" multiple accept={accept ?? ".pdf,.docx,.txt,.md,.csv,.json,.yaml,.yml,.log,.ts,.tsx,.js,.jsx,.mjs,.cjs,.java,.py,.go,.rs,.cs,.c,.h,.cpp,.hpp,.kt,.kts,.dart,.php,.rb,.swift,.proto,.csproj,.vue,.svelte,.html,.css,.scss,.sass,.less,.sql,.sh,.ps1,.xml,.gradle,.properties,.toml,.ini,.conf,.graphql,.gql,.png,.jpg,.jpeg,.gif,.webp"} aria-label="导入文件" aria-hidden="true" tabIndex={-1} onChange={event => onUpload(event.target.files)} />
        {actions.local_projects && <input ref={projectInput} className="sr-only" type="file" multiple aria-label="导入项目文件夹" aria-hidden="true" tabIndex={-1} onChange={event => { onUploadProject(event.target.files); event.currentTarget.value = ""; }} />}
        <span className="agent-tooltip" data-tooltip={fileBusy ? "正在导入…" : "导入文件"}>
          <button className="agent-icon-button agent-attach" data-onboarding="upload" type="button" aria-label="导入文件" title="导入文件" disabled={fileBusy || locked} onClick={() => fileInput.current?.click()}><AgentIcon name="attach" size={20} /></button>
        </span>
        {actions.local_projects && <span className="agent-tooltip" data-tooltip="打开本机项目工作区">
          <button className="agent-icon-button agent-attach" type="button" aria-label="打开本机项目工作区" title="打开本机项目工作区" disabled={fileBusy || locked} onClick={() => onOpenWorkspace ? onOpenWorkspace() : projectInput.current?.click()}><AgentIcon name="folder" size={19} /></button>
        </span>}
        {actions.host_permissions && <ComposerMenu className="agent-permission" label="权限设置" title="选择执行权限" disabled={locked} fullAccess={permission === "full-access"}
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
          </>}
        </ComposerMenu>}
      </div>
      <div className="agent-composer__right">
        {actions.model_selector && <ComposerMenu className="agent-composer-model" panelClassName="agent-model-panel" label="当前模型连接" title="选择模型连接" disabled={locked} role="menu" align="end"
          trigger={<><span className="agent-model-tag" aria-hidden="true">模型</span><span className="agent-model-name" title={profile ? (profile.display_name || profile.model) + " · " + profile.name : undefined}>{profile?.display_name || profile?.model || "选择模型"}</span><AgentIcon name="down" size={12} /></>}>
          {close => <>
            <div className="agent-model-heading"><strong>模型连接</strong><span>{profiles.length} 个</span></div>
            {profiles.length ? profiles.map(item => <button key={item.id} type="button" role="menuitemradio" aria-checked={selected === item.id} className="agent-menu-option agent-model-option" disabled={locked} onClick={() => { onSelect(item.id); close(); }}>
              <span><b>{item.display_name || item.model}</b><small>{item.name} · {connectionNote(item)}</small></span><span className="agent-model-check" aria-hidden="true">{selected === item.id && <AgentIcon name="check" size={17} />}</span>
            </button>) : <p className="agent-model-empty">还没有模型连接，先添加一个再开始对话。</p>}
            {onModelSettings && <button type="button" role="menuitem" className="agent-model-settings" onClick={() => { close(); onModelSettings(); }}><CareerIcon name="settings" size={18} /><span>管理模型连接</span><span aria-hidden="true">↗</span></button>}
          </>}
        </ComposerMenu>}
        <ComposerMenu className="agent-effort" panelClassName="agent-effort-panel" label={"思考强度：" + EFFORT_LABEL[effort]} title="设置思考强度" disabled={locked} align="end"
          trigger={<><span>思考 · {EFFORT_LABEL[effort]}</span><AgentIcon name="down" size={12} /></>}>
          {() => <ReasoningSlider effort={effort} disabled={locked} onChange={onEffort} />}
        </ComposerMenu>
        <span className="agent-tooltip" data-tooltip={busy ? "停止执行" : "发送消息 · Enter"}>
          <button className={"agent-send " + (busy ? "agent-send--stop" : "")} type={busy ? "button" : "submit"} aria-label={busy ? "停止执行" : "发送消息"} disabled={!busy && (working || fileBusy || archived || (!text.trim() && !pendingAttachments.length))} onClick={busy ? onCancel : undefined}>
            {busy ? <AgentIcon name="stop" size={18} /> : <CareerIcon name="send" size={23} />}
          </button>
        </span>
      </div>
    </footer>
    <div className="agent-composer__hint"><span>{actions.host_permissions && permission === "full-access" ? "完全访问已开启 · 切换对话将恢复默认" : "只处理你交给我的资料"}</span><span>Shift + Enter 换行</span></div>
  </form>{dialog}</>;
}
