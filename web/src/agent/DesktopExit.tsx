/** 青穗集 · 本机完全退出入口：仅安装版显示，明确区分账号退出与停止本机服务。 */
import { useEffect, useState } from "react";
import { tokenStore } from "../api/client";
import { usePixelConfirm } from "../components/PixelConfirmDialog";
import { AgentIcon } from "./AgentIcon";
export function DesktopExit() {
  const [managed, setManaged] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [error, setError] = useState("");
  const { confirm, dialog } = usePixelConfirm();
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/v1/desktop", { signal: controller.signal }).then(async response => {
      if (response.ok) { const info = await response.json(); setManaged(info.managed === true); }
    }).catch(() => {});
    return () => controller.abort();
  }, []);
  async function quit() {
    if (stopping || !await confirm({ title: "完全退出青穗集？", confirmLabel: "完全退出", description: <><p>将停止这台电脑上的任务和手机远程连接。</p><p>对话、画像和文件保留；云端服务不受影响。</p></> })) return;
    setStopping(true); setError("");
    try {
      const response = await fetch("/api/v1/desktop/quit", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + tokenStore.get() }, body: JSON.stringify({ confirmed: true }) });
      if (!response.ok) throw new Error("未能退出，请使用任务栏托盘中的“完全退出”。");
    } catch (caught) { setError((caught as Error).message); setStopping(false); }
  }
  if (!managed) return null;
  return <><button className="career-sidebar-setting" type="button" title="停止本机服务并退出程序" disabled={stopping} onClick={() => void quit()}><AgentIcon name="exit" size={21} />{stopping ? "正在退出…" : "完全退出"}</button>{error && <p className="career-privacy" role="alert">{error}</p>}{stopping && <div role="status" className="desktop-exit-status"><strong>青穗集已收到退出请求</strong><p>正在停止本机服务，稍后可关闭此网页。</p></div>}{dialog}</>;
}
