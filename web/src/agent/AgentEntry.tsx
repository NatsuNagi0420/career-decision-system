/** 青穗集 · 本机登录入口：官方账号与 API Key 同级，配置完成后才进入工作区。 */
import type { ReactNode } from "react";
import { Login } from "../components/Login";
type Props = { busy?: boolean; error?: string; localContent?: ReactNode; onLocalMode: () => Promise<void>; onOfficialSuccess: () => void };
export function AgentEntry({ busy = false, error = "", localContent, onLocalMode, onOfficialSuccess }: Props) {
  return <Login variant="agent" onSuccess={onOfficialSuccess} onLocalMode={onLocalMode} localContent={localContent} localBusy={busy} localError={error} />;
}
