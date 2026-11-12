/** 青穗集 · 执行记录侧栏：按轮次查看实际命令、标准输出、错误、文件及计划，用户内容只以文字呈现。 */
import { useEffect, useRef, useState } from "react";
import { AgentIcon } from "./AgentIcon";
import { ComposerMenu } from "./ComposerMenu";
import { EXECUTION_STATUS, executionLabel, executionPlan, executionSummary, executionTarget, formatDuration, object, pretty, runDuration, type ExecutionRecord } from "./execution";
import { STATUS_LABEL, type AgentEvent, type AgentFile, type AgentRun, type ChatMessage } from "./types";
interface Props {
  run: AgentRun;
  runs: AgentRun[];
  messages: ChatMessage[];
  records: ExecutionRecord[];
  events: AgentEvent[];
  selectedKey?: string;
  selectionId?: number;
  files: AgentFile[];
  onSelect: (runId: string, recordKey?: string) => void;
  onClose: () => void;
  onPreview: (file: AgentFile) => void;
}
export function ExecutionPanel({ run, runs, messages, records, events, selectedKey, selectionId, files, onSelect, onClose, onPreview }: Props) {
  const panel = useRef<HTMLElement>(null);
  const [tab, setTab] = useState<"operations" | "plan">("operations");
  const [now, setNow] = useState(Date.now);
  const active = ["queued", "running", "awaiting_approval"].includes(run.status);
  useEffect(() => { panel.current?.focus({ preventScroll: true }); }, [run.id]);
  useEffect(() => { setTab("operations"); }, [selectedKey, selectionId, run.id]);
  useEffect(() => {
    if (!active) return;
    setNow(Date.now()); const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [active, run.id]);
  const current = records.filter(record => record.runId === run.id);
  const runEvents = events.filter(event => event.run_id === run.id);
  const plan = executionPlan(current, runEvents);
  const input = (id: string) => messages.find(message => message.role === "user" && message.run_id === id)?.content ?? "这轮对话";
  const preferred = selectedKey ?? [...current].reverse().find(record => record.call.name === "run_command")?.key ?? current.at(-1)?.key;
  const failed = current.filter(record => record.status === "failed").length;
  const notices = [...new Set(runEvents.filter(event => event.kind === "model.notice").map(event => String(event.data.message ?? "")))].filter(Boolean);
  return <aside ref={panel} tabIndex={-1} className="agent-inspector workspace-detail-panel execution-panel" id="career-context" aria-label="执行记录侧栏" onKeyDown={event => { if (event.key === "Escape" && !document.querySelector(":popover-open")) { event.stopPropagation(); onClose(); } }}>
    <header className="execution-panel__heading"><span><AgentIcon name="terminal" size={17} />执行记录</span><button className="agent-icon-button" type="button" aria-label="关闭执行记录" title="关闭记录 · Esc" onClick={onClose}><AgentIcon name="close" size={17} /></button></header>
    <div className="execution-panel__summary"><div className="execution-panel__run"><h2 title={input(run.id)}>{input(run.id)}</h2><ComposerMenu label="切换执行轮次" title="查看其他轮次" trigger={<><span>第 {runs.findIndex(item => item.id === run.id) + 1} 轮</span><AgentIcon name="down" size={12} /></>} disabled={runs.length < 2} role="menu" align="end" panelClassName="file-picker-menu execution-run-menu">{close => [...runs].reverse().map((item) => <button key={item.id} type="button" role="menuitemradio" aria-checked={item.id === run.id} onClick={() => { close(); setTab("operations"); onSelect(item.id); }}><span>第 {runs.findIndex(value => value.id === item.id) + 1} 轮 · {input(item.id).slice(0, 40)}<small>{STATUS_LABEL[item.status]} · {new Date(item.created_at).toLocaleString()}</small></span>{item.id === run.id && <AgentIcon name="check" size={14} />}</button>)}</ComposerMenu></div>
      <div className="execution-panel__meta"><span data-active={active}><i />{STATUS_LABEL[run.status]}</span><span><AgentIcon name="clock" size={12} />{runDuration(run, now)}</span><span>{current.length} 次操作</span>{run.checkpoint_step != null && <span title="已保存的可恢复执行现场">检查点 {run.checkpoint_step}</span>}{run.total_steps != null && run.total_steps > run.steps && <span title="包含前序续接运行的累计模型步骤">累计 {run.total_steps} 步</span>}{failed > 0 && <span className="execution-panel__failure">{failed} 次失败记录</span>}</div>
    </div>
    <div className="execution-panel__tabs" role="tablist" aria-label="执行记录内容"><button type="button" id="execution-operations-tab" role="tab" aria-selected={tab === "operations"} aria-controls="execution-content" onClick={() => setTab("operations")}><AgentIcon name="terminal" size={14} />操作与输出<span>{current.length}</span></button><button type="button" id="execution-plan-tab" role="tab" aria-selected={tab === "plan"} aria-controls="execution-content" onClick={() => setTab("plan")}><AgentIcon name="check" size={14} />任务计划{plan.length > 0 && <span>{plan.filter(step => step.status === "done").length}/{plan.length}</span>}</button></div>
    <div className="execution-panel__body" id="execution-content" role="tabpanel" aria-labelledby={tab === "operations" ? "execution-operations-tab" : "execution-plan-tab"}>
      {tab === "operations" ? <>
        {!current.length ? <div className="execution-panel__empty"><AgentIcon name="terminal" size={30} /><strong>{active ? "暂未调用工具" : "本轮没有工具操作"}</strong></div> : <div className="execution-panel__timeline">{current.map((record, index) => <ExecutionEntry key={record.key} record={record} index={index} selected={preferred === record.key} selectionId={selectionId} files={files} onPreview={onPreview} />)}</div>}
        {notices.map((notice, index) => <p className="execution-panel__notice" key={index}><AgentIcon name="warning" size={14} />{notice}</p>)}
      </> : <div className="execution-panel__plan"><h3>这轮要完成的事</h3>{plan.length ? <ol>{plan.map((step, index) => <li key={index} data-status={step.status}><span>{step.status === "done" ? <AgentIcon name="check" size={14} /> : step.status === "working" ? <AgentIcon name="activity" size={14} /> : String(index + 1).padStart(2, "0")}</span><div>{step.title}<small>{step.status === "done" ? "已完成" : step.status === "working" ? "进行中" : "待处理"}</small></div></li>)}</ol> : <p>本轮还没有计划</p>}</div>}
      <details className="execution-panel__metrics"><summary>运行信息<AgentIcon name="down" size={12} /></summary><dl><div><dt>模型请求</dt><dd>{run.steps} 次</dd></div><div><dt>输入 / 输出</dt><dd>{run.input_tokens.toLocaleString()} / {run.output_tokens.toLocaleString()} tokens</dd></div><div><dt>执行权限</dt><dd>{run.permission_mode === "full-access" ? "完全访问（主机权限）" : "默认权限（受限环境）"}</dd></div><div><dt>开始时间</dt><dd>{new Date(run.created_at).toLocaleString()}</dd></div></dl><p>实际调用与返回 · 非模型内部思维。Token 用量以供应商返回为准；未提供时显示 0。日志沿用服务端脱敏与长度限制。</p></details>
      {run.error && <p className="execution-panel__notice" role="alert">{run.error}</p>}
    </div>
  </aside>;
}
function ExecutionEntry({ record, index, selected, selectionId, files, onPreview }: { record: ExecutionRecord; index: number; selected: boolean; selectionId?: number; files: AgentFile[]; onPreview: (file: AgentFile) => void }) {
  const ref = useRef<HTMLDetailsElement>(null);
  const [open, setOpen] = useState(selected || ["running", "waiting"].includes(record.status));
  useEffect(() => { if (selected) { setOpen(true); ref.current?.scrollIntoView({ block: "nearest", behavior: "instant" }); } }, [selected, selectionId]);
  const value = object(record.result), command = record.call.name === "run_command";
  const liveOutput = record.result === undefined ? record.liveOutput : undefined;
  const artifactId = object(value.artifact).id ?? value.artifact_id ?? record.args.artifact_id;
  const file = typeof artifactId === "string" ? files.find(item => item.id === artifactId) : undefined;
  return <details ref={ref} className="execution-entry" data-status={record.status} data-selected={selected} open={open} onToggle={event => setOpen(event.currentTarget.open)}>
    <summary><span className="execution-entry__number">{String(index + 1).padStart(2, "0")}</span><div><span className="execution-entry__title"><AgentIcon name={command ? "terminal" : record.call.name.includes("file") ? "file" : "activity"} size={14} />{executionLabel(record)}<small data-status={record.status}>{EXECUTION_STATUS[record.status]}</small></span><code className="execution-entry__target">{executionTarget(record)}</code><span className="execution-entry__meta">{new Date(record.startedAt ?? record.requestedAt).toLocaleTimeString([], { hour12: false })}{record.durationMs !== undefined && " · " + formatDuration(record.durationMs)}{record.exitCode !== undefined && " · 退出码 " + record.exitCode}</span></div><AgentIcon name="down" size={13} /></summary>
    {open && <div className="execution-entry__body">
      {command && <LogBlock title="实际命令" text={typeof record.args.command === "string" ? record.args.command : record.call.arguments} command />}
      {!command && <div className="execution-entry__tool"><span>工具</span><code>{record.call.name}</code></div>}
       {record.status === "running" && <p className="execution-entry__waiting">正在执行{command ? "；实时输出会在命令运行中逐段出现。" : "，等待工具返回。"}</p>}
      {record.status === "waiting" && <p className="execution-entry__waiting">等待你确认后才会继续，不会自动批准。</p>}
      {record.status === "pending" && <p className="execution-entry__waiting">模型已提出这项操作，尚未开始执行。</p>}
      {record.status === "unknown" && <p className="execution-entry__waiting">缺少可确认的完成记录，请核对文件或输出；不会自动重跑。</p>}
      {record.error && <LogBlock title={record.status === "failed" ? "错误" : "停止说明"} text={record.error} error />}
       {record.call.name === "apply_project_patch" && <ProjectChanges value={value} />}
       {command && liveOutput && (liveOutput.stdout || liveOutput.stderr) && <>
         {liveOutput.stdout && <LogBlock title="实时输出 stdout" text={liveOutput.stdout} command />}
         {liveOutput.stderr && <LogBlock title="实时输出 stderr" text={liveOutput.stderr} error />}
         {record.liveOutputTruncated && <p className="execution-entry__output-note">实时输出已展示前 16 KB；命令结束后的完整结果仍以最终记录为准。</p>}
       </>}
      {command && (record.result !== undefined) && <>
        {typeof value.stdout === "string" && <LogBlock title="标准输出 stdout" text={value.stdout} empty="（没有标准输出）" />}
        {typeof value.stderr === "string" && <LogBlock title="标准错误 stderr" text={value.stderr} empty="（没有标准错误）" error={record.status === "failed" && Boolean(value.stderr)} />}
        {typeof value.stdout !== "string" && typeof value.stderr !== "string" && <LogBlock title="返回结果" text={pretty(record.result)} />}
      </>}
      {!command && record.result !== undefined && <LogBlock title="返回结果" text={pretty(record.result)} />}
      {file && <button className="execution-entry__file" type="button" onClick={() => onPreview(file)}><AgentIcon name="file" size={14} />预览 {file.name}<small>v{file.version}</small><AgentIcon name="chevron" size={12} /></button>}
      <details className="execution-entry__arguments"><summary>调用参数<AgentIcon name="down" size={12} /></summary><LogBlock title="参数 JSON" text={prettyJson(record.call.arguments)} /></details>
      <p className="execution-entry__result" data-status={record.status}>{executionSummary(record)}</p>
    </div>}
  </details>;
}
function ProjectChanges({ value }: { value: Record<string, unknown> }) {
  const changes = Array.isArray(value.changes) ? value.changes.map(object).filter(change => typeof change.path === "string") : [];
  if (!changes.length) return null;
  return <div className="execution-project-changes"><div className="execution-project-changes__heading">变更预览</div>{changes.map((change, index) => <LogBlock key={index} title={`${change.operation === "create" ? "新增" : "更新"} ${String(change.path)}`} text={typeof change.diff === "string" ? change.diff : "（没有可展示的行级 diff）"} />)}</div>;
}
function prettyJson(value: string) { try { return JSON.stringify(JSON.parse(value), null, 2); } catch { return value; } }
function LogBlock({ title, text, empty = "（空）", command = false, error = false }: { title: string; text: string; empty?: string; command?: boolean; error?: boolean }) {
  const [copied, setCopied] = useState(false), [copyFailed, setCopyFailed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text); setCopied(true); setCopyFailed(false);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1800);
    } catch { setCopyFailed(true); }
  }
  return <div className="execution-log" data-command={command} data-error={error}><div className="execution-log__heading"><span>{title}</span>{text && <button type="button" title="复制这一段记录" aria-label={"复制" + title} onClick={() => void copy()}><AgentIcon name={copied ? "check" : "copy"} size={12} />{copied ? "已复制" : "复制"}</button>}</div><pre tabIndex={0}><code>{text || empty}</code></pre>{copyFailed && <p role="status">无法自动复制，请选择上方文字手动复制。</p>}</div>;
}
