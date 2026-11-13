/** 青穗集 · 多端任务窗口：扫码绑定、电脑项目和跨端进度集中展示，保持主对话简洁。 */
import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { DesktopWindow } from "./DesktopWindow";
import { AgentIcon } from "./AgentIcon";
import { AnimatedInput } from "./AnimatedInput";
import { agentApi } from "./api";
import type { AgentUser } from "./types";
import "./remote.css";
type Settings = { allow_remote: boolean; workspace_id: string | null; workspace_access: string; model_source: string; reasoning_effort: string; sync_chats: boolean };
type Device = { id: string; name: string; status: string; online: boolean; settings: Settings; catalogue: { workspaces: { id: string; name: string }[] } };
type Session = { id: string; title: string; target: "pc" | "cloud"; device_id: string | null; archived: boolean };
export type RemoteState = { configured: boolean; logged_in: boolean; device: Device | null; devices: Device[]; sessions: Session[]; pairing: { payload: string; expires_at: string } | null; limits: { workspace_ids: string[]; allow_project_write: boolean }; error: string | null };
type Snapshot = { conversation: Session; messages: { id: string; role: string; content: string }[]; drafts: Record<string, string>; tasks: { id: string; input: string; status: string; error: string | null }[]; files: { id: string; name: string; bytes: number }[] };
const statuses: Record<string, string> = { queued: "排队中", waiting_pc: "等待电脑上线", running: "正在执行", awaiting_approval: "等待确认", waiting_input: "等待补充", completed: "已完成", failed: "未完成", cancelled: "已停止", interrupted: "连接中断", paused: "已暂停" };
export function RemoteConnections({ cloud = false, open, onClose, user, onLogin }: { cloud?: boolean; open: boolean; onClose: () => void; user: AgentUser; onLogin: () => void }) {
  const [state, setState] = useState<RemoteState | null>(null), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const [name, setName] = useState("我的电脑"), [clock, setClock] = useState(Date.now());
  const [selected, setSelected] = useState<string | null>(null), [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  useEffect(() => {
    if (!open) return;
    let disposed = false; let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const next = await agentApi.remote(cloud);
        if (disposed) return;
        setState(next);
        if (selected) { const s = await agentApi.remoteSnapshot<Snapshot>(selected, cloud); if (!disposed) setSnapshot(s); }
      } catch (e) { if (!disposed) setError((e as Error).message); }
      finally { if (!disposed) timer = setTimeout(() => void poll(), 3500); }
    };
    void poll(); return () => { disposed = true; clearTimeout(timer); };
  }, [open, selected, cloud]);
  useEffect(() => {
    if (!open || !state?.pairing) return;
    setClock(Date.now()); const timer = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [open, state?.pairing?.expires_at]);
  async function action(fn: () => Promise<unknown>) { setBusy(true); setError(""); try { await fn(); setState(await agentApi.remote(cloud)); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }
  const device = state?.device;
  const expired = !state?.pairing || Date.parse(state.pairing.expires_at) <= clock;
  async function download(id: string, name: string) {
    try { const blob = await agentApi.remoteDownload(id, cloud); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); } catch (e) { setError((e as Error).message); }
  }
  return <DesktopWindow id="remote-connections-window" open={open} onClose={onClose} onMinimize={onClose} title="设备与同步" status={device ? (device.online ? "这台电脑在线" : "等待连接") : "小程序 · 电脑 · 云端"}>
    <div className="remote-layout">
      <section className="remote-devices">
        {cloud ? <>
          <div className="remote-heading"><AgentIcon name="computer" size={24} /><strong>我的电脑</strong></div>
          {state?.devices.filter(item => item.status !== "revoked").map(item => <div key={item.id} className="remote-connected"><AgentIcon name="computer" size={24} /><strong>{item.name}</strong><span className="remote-dot" data-online={item.online} title={item.online ? "在线" : "离线"} /></div>)}
          {state && !state.devices.some(item => item.status !== "revoked") && <p>还没有连接的电脑。在电脑端登录后，用小程序扫码连接。</p>}
        </> : user.identity !== "official" ? <button onClick={onLogin}>登录官方账号</button> : !state?.configured ? <p>云端同步地址尚未配置。</p> : <>
          <div className="remote-heading"><AgentIcon name="computer" size={24} /><strong>{device?.name || "连接这台电脑"}</strong>{device && <span className="remote-dot" data-online={device.online} title={device.online ? "在线" : "离线"} />}</div>
          {!device || device.status === "revoked" ? <label>电脑名称<AnimatedInput maxLength={80} value={name} onChange={e => setName(e.target.value)} /></label> : null}
          {device?.status === "pending" && <div className="remote-pairing">
            <strong>用小程序扫码连接</strong>
            <div className="remote-qr" aria-label={expired ? "二维码已过期" : "电脑绑定二维码"}>
              {!expired && state?.pairing ? <QRCodeSVG value={state.pairing.payload} size={220} level="M" marginSize={4} /> : <div className="remote-qr-expired"><AgentIcon name="computer" size={40} /><span>二维码已过期</span></div>}
            </div>
            <span className="remote-qr-hint">手机与电脑需登录同一官方账号</span>
            <button disabled={busy} onClick={() => void action(() => agentApi.refreshRemotePairing())}>刷新二维码</button>
          </div>}
          <div className="remote-actions">
            {!device || device.status === "revoked" ? <button className="remote-primary" disabled={busy} onClick={() => void action(() => agentApi.connectRemote(name))}>连接此电脑</button> : <button disabled={busy} onClick={() => void action(() => agentApi.disconnectRemote())}>断开连接</button>}
          </div>
          {device?.status === "active" && <>
            <div className="remote-connected"><AgentIcon name="computer" size={28} /><strong>此电脑已连接</strong></div>
            <div className="remote-projects"><h3>电脑项目 <span>{device.catalogue.workspaces.length}</span></h3>
              {device.catalogue.workspaces.map(w => <div key={w.id}><AgentIcon name="folder" size={16} /><span>{w.name}</span></div>)}
            </div>
            <p className="remote-boundary">在小程序继续已有对话，或选择项目新开对话。电脑需保持运行。</p>
          </>}
        </>}
        {(error || state?.error) && <p role="alert">{error || state?.error}</p>}
      </section>
      <section className="remote-sessions" aria-label="跨端对话">
        {selected && snapshot ? <>
          <header><button aria-label="返回对话列表" title="返回" onClick={() => { setSelected(null); setSnapshot(null); }}><AgentIcon name="restore" /></button><h3>{snapshot.conversation.title}</h3><span>{snapshot.conversation.target === "cloud" ? "云端" : "电脑"}</span></header>
          <div className="remote-messages">{snapshot.messages.map(m => <article key={m.id} data-role={m.role}><strong>{m.role === "user" ? "我" : "穗奈"}</strong><p>{m.content}</p></article>)}{Object.entries(snapshot.drafts || {}).map(([id, text]) => <article key={id}><strong>穗奈</strong><p>{text}</p></article>)}</div>
          {snapshot.tasks.slice(-1).map(t => <div className="remote-task" key={t.id}><span>{statuses[t.status] || t.status}</span>{["queued", "waiting_pc", "running", "awaiting_approval"].includes(t.status) && <button disabled={busy} onClick={() => void action(() => agentApi.cancelRemoteTask(t.id, cloud))}>停止</button>}{t.error && <p role="alert">{t.error}</p>}</div>)}
          {snapshot.files.map(f => <button className="remote-file" key={f.id} onClick={() => void download(f.id, f.name)}><AgentIcon name="download" size={16} />{f.name}</button>)}
        </> : <><h3>跨端对话</h3>{state?.sessions.length ? state.sessions.map(s => <button className="remote-session" key={s.id} onClick={() => setSelected(s.id)}><AgentIcon name={s.target === "cloud" ? "cloud" : "computer"} /><span>{s.title}</span><AgentIcon name="chevron" size={16} /></button>) : <div className="remote-empty"><AgentIcon name="cloud" size={40} /><p>{cloud ? "还没有跨端对话。" : "连接电脑，在小程序继续对话。"}</p></div>}</>}
      </section>
    </div>
  </DesktopWindow>;
}
