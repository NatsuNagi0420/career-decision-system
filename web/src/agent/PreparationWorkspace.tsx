/** 青穗集 · 求职准备交互：岗位并排权衡、题库与试卷入口，文字面试由独立通话窗口承接。 */
import { useEffect, useState } from "react";
import { AutoHeight } from "../components/AutoHeight";
import { AnimatedTextarea } from "./AnimatedTextarea";
import { AnimatedInput } from "./AnimatedInput";
import { AnimatedDisclosure } from "./AnimatedDisclosure";
import { AgentIcon } from "./AgentIcon";
import { ComposerMenu } from "./ComposerMenu";
import { agentApi } from "./api";
import { PREPARATION_LABELS, type DecisionBoard, type PreparationMode, type PublicPreparationSession, type PublicQuestion } from "../../../agent/src/preparation-contract";
import type { PreparationController } from "./preparation-workspace";
import type { CareerJob } from "./career";
import "./preparation.css";

const MODE_HELP: Record<PreparationMode, string> = { practice: "逐题作答，答后讲解", exam: "现场出卷，提交后看结果", interview: "穗奈担任考官，逐题追问" };
type Props = { workspace: PreparationController; jobs: CareerJob[]; onPrompt: (text: string) => void; onConversation: (id: string) => void; disabled?: boolean };

export function JobDecisionWorkspace({ workspace, jobs, onPrompt, disabled }: Omit<Props, "onConversation">) {
  const boards = workspace.state?.boards ?? [];
  return <section className="preparation-decisions" aria-label="岗位决策">
    <header className="preparation-heading"><h3>把选择放在一起</h3><button type="button" className="workbench-secondary" disabled={disabled || jobs.length < 2} onClick={() => onPrompt("请帮我比较已保存的岗位，挑出2至3个方向，把吸引点、准备成本、取舍和还不了解的地方放在一起，保存到方向与岗位。根据已有材料分析，资料不够就先问我，不替我作决定。")}>比较岗位<AgentIcon name="chevron" size={14}/></button></header>
    {jobs.length < 2 && <p className="preparation-note">保留两个感兴趣的岗位，就能一起权衡。</p>}
    {workspace.error && <p role="alert" className="agent-error">{workspace.error}</p>}
    {boards.map(board => <DecisionBoardView key={board.id} board={board} jobs={jobs} workspace={workspace} onPrompt={onPrompt} disabled={Boolean(disabled)} />)}
  </section>;
}
function DecisionBoardView({ board, jobs, workspace, onPrompt, disabled }: { board: DecisionBoard; jobs: CareerJob[]; workspace: PreparationController; onPrompt: (text: string) => void; disabled: boolean }) {
  const [reason, setReason] = useState(board.reason);
  useEffect(() => setReason(board.reason), [board.id, board.reason]);
  const save = (primary: string | null, backups: string[]) => void workspace.change({ type: "decision.select", id: board.id, primary_job_id: primary, backup_job_ids: backups, reason });
  return <article className="preparation-board">
    <h4>{board.title}</h4>
    {board.stale && <div className="preparation-stale">资料已变化，先更新比较。<button type="button" disabled={disabled} onClick={() => onPrompt("请读取最新职业画像和求职准备记录，重新生成岗位比较「" + board.title + "」，保留仍有依据的部分。")}>重新比较</button></div>}
    <div className="preparation-options">{board.options.map(option => <section key={option.job_id} data-choice={board.primary_job_id === option.job_id ? "primary" : board.backup_job_ids.includes(option.job_id) ? "backup" : "none"}>
      <header><h5>{jobs.find(job => job.id === option.job_id)?.title ?? "原岗位已移除"}</h5>{board.primary_job_id === option.job_id ? <span>首选</span> : board.backup_job_ids.includes(option.job_id) ? <span>备选</span> : null}</header>
      <dl><dt>吸引点</dt><dd>{option.attraction}</dd><dt>准备成本</dt><dd>{option.preparation_cost}</dd><dt>需要取舍</dt><dd>{option.tradeoff}</dd></dl>
      <div className="preparation-unknowns"><strong>作决定前还要知道</strong><ul>{option.unknowns.map((item, i) => <li key={i}>{item}</li>)}</ul></div>
      <AnimatedDisclosure summary="查看依据">{option.evidence.map((item, i) => <blockquote key={i}>{item.quote}</blockquote>)}</AnimatedDisclosure>
      <footer><button type="button" className="workbench-primary" disabled={disabled || workspace.saving || board.stale} onClick={() => save(option.job_id, board.backup_job_ids.filter(id => id !== option.job_id))}>{board.primary_job_id === option.job_id ? "已选为首选" : "设为首选"}</button><button type="button" className="workbench-secondary" disabled={disabled || workspace.saving || board.stale || board.primary_job_id === option.job_id} onClick={() => save(board.primary_job_id, board.backup_job_ids.includes(option.job_id) ? board.backup_job_ids.filter(id => id !== option.job_id) : [...board.backup_job_ids, option.job_id])}>{board.backup_job_ids.includes(option.job_id) ? "移出备选" : "保留备选"}</button></footer>
    </section>)}</div>
    <label className="preparation-reason"><span>留下这次选择的理由</span><AnimatedTextarea rows={2} maxLength={1000} value={reason} disabled={disabled || workspace.saving || board.stale} onChange={event => setReason(event.target.value)} placeholder="也可以继续和穗奈聊聊，想清楚再决定。" /></label>
    <div className="preparation-board-footer"><button type="button" className="workbench-text-button" disabled={disabled || workspace.saving || board.stale || reason === board.reason} onClick={() => save(board.primary_job_id, board.backup_job_ids)}>保存理由</button><button type="button" className="workbench-text-button" disabled={disabled} onClick={() => onPrompt(board.next_question)}>{board.next_question}<span aria-hidden="true"> ↗</span></button></div>
  </article>;
}

export function PracticeWorkspace({ workspace, jobs, onPrompt, onConversation, disabled }: Props) {
  const [mode, setMode] = useState<PreparationMode>("practice"), [jobId, setJobId] = useState(""), [count, setCount] = useState(3);
  const [source, setSource] = useState<"generated" | "curated">("generated"), [query, setQuery] = useState("");
  const [bank, setBank] = useState<PublicQuestion[]>([]), [bankError, setBankError] = useState(""), [selected, setSelected] = useState<string[]>([]), [open, setOpen] = useState(false);
  const job = jobs.find(item => item.id === jobId) ?? jobs[0];
  const curated = mode === "practice" && source === "curated";
  const shown = bank.filter(item => !query.trim() || [item.topic, item.prompt].join(" ").toLowerCase().includes(query.trim().toLowerCase()));
  useEffect(() => { if (!open) return; const abort = new AbortController(); void agentApi.preparationQuestions("", abort.signal).then(result => { setBank(result.questions); setBankError(""); }).catch(error => { if (!abort.signal.aborted) setBankError(error.message); }); return () => abort.abort(); }, [open]);
  function start() {
    if (!job) return;
    if (curated && !selected.length) return;
    const selection = curated ? `使用整理题库中的${selected.map(id => "「" + (bank.find(item => item.id === id)?.topic ?? id) + "」").join("、")}，共${selected.length}题。` : `围绕岗位要求和我的基础，现场出${count}题。`;
    onPrompt(`穗奈，我想针对「${job.title}」做一轮${PREPARATION_LABELS[mode]}。${selection}${mode === "interview" ? "请你担任考官，读取最新训练记录，开始全新的一轮。设定一个模拟工作场景，一次问一题，等我打字回答后再追问。" : mode === "exam" ? "先不讲解，提交后一起看结果。" : "一次一题，我答完再讲解。"}`);
  }
  return <section className="preparation-practice" aria-label="岗位练习与面试">
    <header className="preparation-heading"><h3>练一练，再去应聘</h3><button type="button" className="workbench-secondary" aria-expanded={open} onClick={() => setOpen(value => !value)}>{open ? "收起" : "开始练习"}<AgentIcon name="activity" size={15}/></button></header>
    <AutoHeight open={open} changeKey={mode + source}>
      <div className="preparation-launch">
        <div className="preparation-modes" role="group" aria-label="练习形式">{(Object.keys(PREPARATION_LABELS) as PreparationMode[]).map(item => <button type="button" key={item} aria-pressed={mode === item} onClick={() => setMode(item)}>{PREPARATION_LABELS[item]}</button>)}</div>
        <p className="preparation-note">{MODE_HELP[mode]}</p>
        <div className="preparation-launch-controls"><ComposerMenu label="选择练习岗位" title="目标岗位" role="menu" panelClassName="preparation-job-menu" trigger={<span>{job?.title ?? "先保留目标岗位"}</span>} disabled={!jobs.length || Boolean(disabled)}>{close => <>{jobs.map(item => <button type="button" key={item.id} role="menuitemradio" aria-checked={item.id === job?.id} onClick={() => { setJobId(item.id); close(); }}>{item.title}</button>)}</>}</ComposerMenu>{!curated && <div role="group" aria-label="题目数量">{[3, 5, 8].map(value => <button type="button" key={value} aria-pressed={count === value} onClick={() => setCount(value)}>{value} 题</button>)}</div>}</div>
        {mode === "practice" && <div className="preparation-sources" role="group" aria-label="题目来源"><button type="button" aria-pressed={!curated} onClick={() => setSource("generated")}>按岗位出题</button><button type="button" aria-pressed={curated} onClick={() => setSource("curated")}>整理题库{selected.length > 0 && <span>{selected.length}</span>}</button></div>}
        {curated && <><AnimatedInput aria-label="搜索整理题" value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索知识点，如 React、SQL"/><div className="preparation-bank">{bankError && <p role="alert">{bankError}</p>}{!shown.length && <p className="preparation-note">{query ? "暂时没有这一类整理题，可使用按岗位出题。" : "正在读取题库…"}</p>}{shown.map(item => <label key={item.id}><input type="checkbox" checked={selected.includes(item.id)} disabled={!selected.includes(item.id) && selected.length >= 8} onChange={() => setSelected(values => values.includes(item.id) ? values.filter(id => id !== item.id) : [...values, item.id])}/><span><strong>{item.topic}</strong><span>{item.prompt}</span><a href={item.source_url ?? undefined} target="_blank" rel="noopener noreferrer" onClick={event => event.stopPropagation()}>{item.source_title} ↗</a></span></label>)}</div></>}
        <button type="button" className="workbench-primary" disabled={Boolean(disabled) || !job || (curated && !selected.length)} onClick={start}>和穗奈开始{mode === "interview" ? "面试" : "作答"}<AgentIcon name="send" size={15}/></button>
      </div>
    </AutoHeight>
    {workspace.error && <p role="alert" className="agent-error">{workspace.error}</p>}
    <div className="preparation-history">{workspace.state?.sessions.map(session => <SessionRecord key={session.id} session={session} onConversation={onConversation} onPrompt={onPrompt} disabled={Boolean(disabled)} />)}</div>
  </section>;
}
function SessionRecord({ session, onConversation, onPrompt, disabled }: { session: PublicPreparationSession; onConversation: (id: string) => void; onPrompt: (text: string) => void; disabled: boolean }) {
  const current = session.status === "completed" ? undefined : session.questions[session.answers.length];
  return <article className="preparation-session"><header><div><span>{PREPARATION_LABELS[session.mode]}</span><h4>{session.job_title}</h4></div><span>{session.answers.length} / {session.total}</span></header>
    <div className="preparation-progress" role="progressbar" aria-label="已作答进度" aria-valuenow={session.answers.length} aria-valuemin={0} aria-valuemax={session.total}><i style={{ width: (session.answers.length / session.total * 100) + "%" }}/></div>
    <p>{session.focus.join(" · ")}</p><footer><span>{session.status === "completed" ? "已结束" : session.status === "paused" ? "已暂停" : "进行中"}</span><button type="button" className="workbench-text-button" disabled={disabled} onClick={() => onConversation(session.conversation_id)}>{session.mode === "interview" ? "打开面试窗口" : "回到对话"} ↗</button></footer>
    <AnimatedDisclosure summary={"查看" + (session.status === "completed" ? "结果" : "记录")}>
      <p>{session.background}</p>
      {session.stale && <p>岗位或画像已有变化，本轮仍保留当时的训练记录。</p>}
      {!current && !session.answers.length && <p>本轮未提交答案。</p>}
      {session.answers.map((answer, i) => <section className="preparation-answer" key={answer.question_id}>
        <strong>第 {i + 1} 题 · {session.questions[i]?.topic}</strong><p>{session.questions[i]?.prompt}</p>
        <small>{session.questions[i]?.origin === "curated" ? <a href={session.questions[i].source_url ?? undefined} target="_blank" rel="noopener noreferrer">原创整理 · {session.questions[i].source_title} ↗</a> : "穗奈 · AI生成题"}</small>
        <blockquote>{answer.text}</blockquote>
        {answer.verdict ? <>
          <ul>{answer.strengths?.map((text, index) => <li key={"s"+index}>已体现：{text}</li>)}{answer.gaps?.map((text, index) => <li key={"g"+index}>可补充：{text}</li>)}</ul>
          <p>参考思路：{session.questions[i]?.reference_answer}</p><p>下次练习：{answer.next_exercise}</p>
          <button type="button" className="workbench-text-button" disabled={disabled} onClick={() => onPrompt("请根据练习记录中「" + session.job_title + "」的这项薄弱点：「" + answer.next_exercise + "」，读取我的学习路线并提出调整建议，保留已有进度，不自动标记学完。")}>把这点接到学习安排 ↗</button>
        </> : <p>交卷后展示反馈</p>}
      </section>)}
      {current && <section className="preparation-answer"><strong>当前题 · {current.topic}</strong><p>{current.prompt}</p><small>{current.origin === "curated" ? "原创整理题" : "穗奈 · AI生成题"}</small></section>}
    </AnimatedDisclosure>
  </article>;
}
export function PreparationChatBar({ session, workspace, busy, onReview }: { session?: PublicPreparationSession; workspace: PreparationController; busy: boolean; onReview: () => void }) {
  if (!session) return null;
  const done = session.status === "completed", paused = session.status === "paused";
  const finish = async () => { if (await workspace.change({ type: "session.status", id: session.id, status: "completed" })) onReview(); };
  return <div className="preparation-chat-bar" data-mode={session.mode} role="region" aria-label="当前岗位练习"><span className="preparation-chat-dot"/><strong>{PREPARATION_LABELS[session.mode]}</strong><span className="preparation-chat-job">{session.job_title}</span><span>{done ? "已结束" : paused ? "已暂停" : `${Math.min(session.answers.length + 1, session.total)} / ${session.total}`}</span><button type="button" title={done ? "查看结果" : "查看本轮题目与记录"} aria-label={done ? "查看结果" : "查看本轮题目与记录"} onClick={onReview}><AgentIcon name="file" size={15}/></button>{!done && <><button type="button" aria-label={paused ? "恢复练习" : "暂停练习"} title={paused ? "恢复练习" : "暂停练习"} disabled={busy || workspace.saving} onClick={() => void workspace.change({ type: "session.status", id: session.id, status: paused ? "active" : "paused" })}><AgentIcon name={paused ? "play" : "pause"} size={15}/></button><button type="button" className="preparation-chat-end" disabled={busy || workspace.saving} onClick={() => void finish()}>{session.mode === "exam" ? "交卷" : "结束"}</button></>}</div>;
}
