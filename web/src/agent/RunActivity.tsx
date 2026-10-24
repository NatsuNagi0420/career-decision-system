/** 青穗集 · 轻量回复状态与真实操作：穗奈微动效、就地命令，完整执行记录仅从标题栏进入。 */
import { useEffect, useState } from "react";
import { AgentIcon } from "./AgentIcon";
import { SUINAI_AVATAR_URL } from "../assets";
import { useUiMotion } from "./uiMotion";
import { executionLabel, executionSummary, executionTarget, formatDuration, runDuration, type ExecutionRecord } from "./execution";
import type { AgentRun } from "./types";
interface Props {
  run?: AgentRun;
  records: ExecutionRecord[];
  submitting?: boolean;
  drafting?: boolean;
  onOpen: (runId: string, recordKey?: string) => void;
}
/** 标题栏的唯一执行记录入口；图标通过悬浮提示和无障碍名称说明用途。 */
export function ExecutionToggle({ open, active, onClick }: { open: boolean; active: boolean; onClick: () => void }) {
  const label = open ? "收起执行记录" : "打开执行记录";
  return <span className="agent-tooltip" data-tooltip="执行记录"><button className="execution-toolbar-button" type="button" aria-label={label} aria-expanded={open} aria-controls="career-context" data-running={active} onClick={onClick}><AgentIcon name="panel" size={17} />{active && <i aria-hidden="true" />}</button></span>;
}
function RunPresence({ working }: { working: boolean }) {
  return <span className="run-presence" data-phase={working ? "working" : "waiting"} aria-hidden="true">
    <span className="run-presence__halo" /><img src={SUINAI_AVATAR_URL} alt="" width={36} height={36} />
    <svg className="run-presence__spark" width="16" height="16" viewBox="0 0 20 20" fill="currentColor"><path d="M10 1.5 12.3 7.7 18.5 10 12.3 12.3 10 18.5 7.7 12.3 1.5 10 7.7 7.7Z" /></svg>
    <i className="run-presence__satellite" />
  </span>;
}
export function RunActivity({ run, records, submitting = false, drafting = false, onOpen }: Props) {
  const { playing } = useUiMotion();
  const active = submitting || Boolean(run && ["queued", "running", "awaiting_approval"].includes(run.status));
  const [now, setNow] = useState(Date.now), [expanded, setExpanded] = useState(false);
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [active, run?.id]);
  if ((!active && !records.length) || (drafting && !records.length)) return null;
  const working = records.find(record => record.status === "running");
  const errors = records.filter(record => record.status === "failed").length;
  const visible = expanded ? records : records.slice(-3);
  const approval = run?.status === "awaiting_approval";
  const elapsedMs = run ? Math.max(0, (active ? now : Date.parse(run.updated_at)) - Date.parse(run.created_at)) : 0;
  const waitingText = elapsedMs >= 25_000 ? "还在认真整理，这次需要久一点" : run?.retry_count ? "正在接着整理" : "正在构思";
  const status = submitting ? "连接中" : run?.status === "awaiting_approval" ? "等待你的确认"
    : active ? working ? "正在" + executionLabel(working) : drafting ? "正在回复" : run?.status === "queued" ? "准备开始" : waitingText
    : run?.status === "completed" ? "本轮已完成" : run?.status === "waiting_input" ? "等待你补充信息"
    : run?.status === "cancelled" ? "已停止" : "本轮未完成";
  const elapsed = elapsedMs < 60_000 ? Math.floor(elapsedMs / 1000) + " 秒" : run ? runDuration(run, now) : "";
  return <section className="run-activity" data-active={active} data-motion={playing ? "playing" : "still"} data-drafting={drafting} aria-label="执行进度">
    <header className="run-activity__heading"><span className="run-activity__status" role="status">{active && !approval ? <RunPresence working={Boolean(working)} /> : <span className="execution-state" data-status={approval ? "waiting" : run?.status === "completed" ? "completed" : "stopped"}><AgentIcon name={approval ? "clock" : run?.status === "completed" ? "check" : "stop"} size={14} /></span>}{status}</span>
      {run && elapsedMs >= 3_000 && <small className="run-activity__elapsed" aria-label={"已用时 " + elapsed}>{elapsed}</small>}
      {errors > 0 && <span className="run-activity__errors">{errors} 次失败记录</span>}
    </header>
    {visible.length > 0 && <ol className="run-activity__operations">{visible.map(record => <li key={record.key}><button type="button" onClick={() => onOpen(record.runId, record.key)} title="查看参数、输出与执行结果" aria-label={executionLabel(record) + "：" + executionTarget(record)}>
      <span className="execution-state" data-status={record.status}><AgentIcon name={record.status === "completed" ? "check" : record.status === "failed" ? "warning" : record.status === "running" ? "activity" : "clock"} size={13} /></span>
      <span className="run-activity__label">{executionLabel(record)}</span>
      <code>{executionTarget(record)}</code>
      <small data-status={record.status}>{executionSummary(record)}{record.durationMs !== undefined && " · " + formatDuration(record.durationMs)}</small>
      <AgentIcon name="chevron" size={12} />
    </button></li>)}</ol>}
    {records.length > 3 && <button className="run-activity__more" type="button" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}><AgentIcon name="down" size={12} />{expanded ? "收起操作" : "查看前 " + (records.length - 3) + " 项操作"}</button>}
  </section>;
}
