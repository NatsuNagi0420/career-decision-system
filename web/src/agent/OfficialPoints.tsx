/** 青穗集 · 官方积分窗口：账号余额与用量明细，规则平滑展开，保持正文宽度稳定。 */
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { OfficialCredits } from "../../../agent/src/credits-contract";
import { agentApi } from "./api";
import { AgentIcon } from "./AgentIcon";
import { DesktopWindow } from "./DesktopWindow";
import { AnimatedDisclosure } from "./AnimatedDisclosure";
import "./official-points.css";
export function formatPoints(value: number) { return value > 0 && value < 0.01 ? "<0.01" : new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 }).format(value); }
const time = (value: string) => new Date(value).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Shanghai" });
const states: Record<string, string> = { reserved: "进行中", completed: "已完成", failed: "未扣费", interrupted: "已退回", unmetered: "未计费" };
export function PointsDetails({ data }: { data: OfficialCredits }) {
  const { summary: s, pricing: p } = data;
  return <>
    <div className="official-points__balance"><span>剩余积分</span><strong>{formatPoints(s.remaining_points)}</strong><span>每日 {formatPoints(s.daily_points)} · 北京时间零点刷新</span></div>
    {s.reserved_points > 0 && <p className="official-points__hold" role="status">任务已预留 {formatPoints(s.reserved_points)} 积分，结束后按实际用量结算。</p>}
    <AnimatedDisclosure className="official-points__pricing" summary="积分规则"><p>每 1,000 输入词元 {formatPoints(p.input_per_1000)} 积分，缓存输入 {formatPoints(p.cached_input_per_1000)} 积分，输出 {formatPoints(p.output_per_1000)} 积分。</p><p>按模型实际用量结算。每日积分不累计，失败或取消释放预留积分。一次任务可能包含多次模型调用。</p>{s.adjustment_points > 0 && <p>今日额外获得 {formatPoints(s.adjustment_points)} 积分。</p>}</AnimatedDisclosure>
    <div className="official-points__history"><h3>用量明细</h3>{data.entries.length === 0 ? <p className="official-points__empty">还没有用量记录</p> : <ul>{data.entries.map(entry => <li key={entry.id}><div><strong>{entry.capability}</strong><time dateTime={entry.created_at}>{time(entry.created_at)}</time></div><div className="official-points__usage"><span>{entry.input_tokens === null ? "—" : `输入 ${entry.input_tokens.toLocaleString()} · 输出 ${(entry.output_tokens ?? 0).toLocaleString()}`}</span>{entry.cached_input_tokens > 0 && <small>含缓存 {entry.cached_input_tokens.toLocaleString()}</small>}</div><div className="official-points__charge" data-state={entry.state}><strong>{entry.state === "reserved" ? formatPoints(entry.reserved_points) : entry.points > 0 ? "−" + formatPoints(entry.points) : "0"}</strong><small>{entry.state === "reserved" ? "预留" : states[entry.state]}</small></div></li>)}</ul>}</div>
  </>;
}
export function OfficialPoints({ refreshKey }: { refreshKey: string }) {
  const [data, setData] = useState<OfficialCredits | null>(null), [open, setOpen] = useState(false), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const requestId = useRef(0), previous = useRef<OfficialCredits | null>(null);
  const load = useCallback(async (more = false) => {
    const current = ++requestId.current;
    setBusy(true); setError("");
    try {
      const before = previous.current;
      const next = await agentApi.officialCredits(more ? before?.next_cursor ?? undefined : undefined);
      if (requestId.current !== current) return;
      const result = more && before ? { ...next, entries: [...before.entries, ...next.entries.filter(e => !before.entries.some(old => old.id === e.id))] } : next;
      previous.current = result; setData(result);
    } catch (err) { if (requestId.current === current) setError(err instanceof Error ? err.message : "暂时无法读取积分。"); }
    finally { if (requestId.current === current) setBusy(false); }
  }, []);
  useEffect(() => { void load(); return () => { requestId.current++; }; }, [load, refreshKey]);
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === "visible" && !open) void load(); };
    window.addEventListener("focus", refresh);
    const timer = window.setInterval(() => { if (document.visibilityState === "visible" && (!open || !previous.current?.next_cursor)) void load(); }, 60000);
    return () => { clearInterval(timer); window.removeEventListener("focus", refresh); };
  }, [load, open]);
  if (data && !data.enabled) return null;
  return <>
    <button className="official-points__entry" type="button" aria-label="查看剩余积分和用量明细" aria-controls="official-points-window" aria-expanded={open} onClick={() => { setOpen(true); void load(); }}><AgentIcon name="coins" size={19} /><span>{data ? formatPoints(data.summary.remaining_points) + " 积分" : "积分"}</span><AgentIcon name="chevron" size={14} /></button>
    {createPortal(<DesktopWindow id="official-points-window" open={open} title="积分" status="用量按北京时间记录" onClose={() => setOpen(false)} onMinimize={() => setOpen(false)}><div className="official-points"><div className="official-points__tools"><button type="button" className="agent-icon-button" title="刷新积分" aria-label="刷新积分" disabled={busy} onClick={() => void load()}><AgentIcon name="restore" size={18} /></button></div>{error && <p className="official-points__error" role="alert">{error}<button type="button" disabled={busy} onClick={() => void load()}>重试</button></p>}{data ? <PointsDetails data={data} /> : !error && <p role="status">正在读取积分…</p>}{data?.next_cursor && <button className="official-points__more" type="button" disabled={busy} onClick={() => void load(true)}>{busy ? "读取中…" : "查看更多"}</button>}</div></DesktopWindow>, document.body)}
  </>;
}
