/** 青穗集 · 桌面设置入口：收拢低频操作，按部署能力展示连接设置并保留数据边界说明。 */
import { AgentIcon } from "./AgentIcon";
import { CareerIcon } from "./CareerVisuals";
import { ComposerMenu } from "./ComposerMenu";
import { UiMotionToggle } from "./AsciiArt";

export function DesktopSettings({ modelConnections, local, guideDisabled, onGuide, onConnect, onRemote }: {
  modelConnections: boolean; local: boolean; guideDisabled: boolean;
  onGuide: () => void; onConnect: () => void; onRemote: () => void;
}) {
  return <ComposerMenu className="desktop-settings" panelClassName="desktop-settings-panel" label="桌面设置" title="桌面设置" trigger={<CareerIcon name="settings" size={22} />} disabled={false} align="end">
    {close => <>
      {modelConnections && <button type="button" aria-label="模型设置" onClick={() => { close(); onConnect(); }}><CareerIcon name="settings" size={20} /><span>AI 连接</span></button>}
      <button type="button" onClick={() => { close(); onRemote(); }}><AgentIcon name="computer" size={19} /><span>设备与同步</span></button>
      <div className="desktop-settings-panel__motion"><span>界面动效</span><UiMotionToggle /></div>
      <button type="button" aria-label="重新查看使用引导" disabled={guideDisabled} onClick={() => { close(); onGuide(); }}><AgentIcon name="help" size={19} /><span>使用引导</span></button>
      {local && <p>资料保存在本机。调用外部模型时，相关内容仍会发送给所选服务。</p>}
    </>}
  </ComposerMenu>;
}
