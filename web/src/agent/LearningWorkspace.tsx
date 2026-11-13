/** 青穗集 · 学习窗口：岗位路线与学习成果，视频、字幕及搜索结果的尺寸变化平滑承接。 */
import { AnimatedTextarea } from "./AnimatedTextarea";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import type { LearningNode, LearningPath, LearningResource, LearningSearchResult, LearningSubtitleResult } from "../../../agent/src/learning-contract";
import type { CareerJob } from "./career";
import type { LearningWorkspaceController } from "./learning-workspace";
import { AgentIcon } from "./AgentIcon";
import { CareerIcon } from "./CareerVisuals";
import { agentApi } from "./api";
import { LEARNING_STATUS, learningCaptionTime, learningCoverUrl, learningPlayerUrl, learningProgress, nextLearningNode, nodeReady } from "./learning";
import { usePixelConfirm } from "../components/PixelConfirmDialog";
import { AutoHeight } from "../components/AutoHeight";
import "./learning.css";

export function LearningWorkspace({ workspace, jobs, onPrompt }: { workspace: LearningWorkspaceController; jobs: CareerJob[]; onPrompt: (text: string) => void }) {
  const { state, error, saving, change, refresh } = workspace;
  const [selected, setSelected] = useState(""), [dirty, setDirty] = useState(false);
  const { confirm, dialog } = usePixelConfirm();
  const path = state?.paths.find(item => item.id === state.active_path_id) ?? state?.paths[0];
  const node = path?.nodes.find(item => item.key === selected) ?? (path ? nextLearningNode(path) : undefined);
  useEffect(() => { setSelected(""); setDirty(false); }, [path?.id]);
  async function leave() {
    return !dirty || await confirm({ title: "笔记还没有保存", description: <p>先保存本节笔记，或放弃这次编辑后切换。</p>, confirmLabel: "放弃编辑", cancelLabel: "返回保存" });
  }
  const planPrompt = (job: CareerJob) => "我决定以已保存的岗位「" + job.title + "」为学习目标。请读取我的职业档案和已有学习进度，结合岗位原文、现有基础和可用时间，规划一条分阶段的学习路线。每节说明为什么学、学会什么、做什么练习，以及B站教学搜索词。已有路线请调整并保留进度，提交到工作台让我核对；缺少关键信息时一次只问一个问题。";
  return <div className="learning-workspace">
    {error && <div className="workbench-feedback workbench-feedback--error" role="alert"><span>{error}</span><button type="button" onClick={() => void refresh()}>重试</button></div>}
    {!state ? <p role="status">正在读取学习进度…</p> : <>
      {state.proposal && <section className="learning-proposal" aria-label="待确认的学习路线">
        <header><span><AgentIcon name="activity" />穗奈为你整理了学习路线</span><strong>{state.proposal.path.title}</strong><p>{state.proposal.path.summary}</p></header>
        <ol>{state.proposal.path.nodes.map(item => <li key={item.key}><strong>{item.title}</strong><span>{item.objective}</span><small>{item.estimated_minutes} 分钟</small></li>)}</ol>
        {state.proposal.stale && <p role="alert">岗位或画像已更新，需要重新规划。</p>}
        <footer><button className="workbench-primary" disabled={saving || state.proposal.stale} onClick={() => void change({ type: "proposal.decide", id: state.proposal!.id, approved: true })}>采用这条路线<AgentIcon name="check" size={16} /></button><button className="workbench-secondary" disabled={saving} onClick={() => onPrompt("请读取刚才待确认的学习路线，和我一起调整；先问我最想修改哪一处。")}>和穗奈调整</button><button className="agent-icon-button" title="放弃这份建议" aria-label="放弃学习路线建议" disabled={saving} onClick={() => void change({ type: "proposal.decide", id: state.proposal!.id, approved: false })}><AgentIcon name="close" /></button></footer>
      </section>}
      {!path ? <section className="learning-empty"><CareerIcon name="growth" size={60} /><h3>从想去的岗位，走向学会的每一步</h3><p>{jobs.length ? "选一个目标，和穗奈一起安排学习路线。" : "先保存一个目标岗位，再让穗奈结合你的基础安排学习。"}</p><div className="learning-job-choices">{jobs.map(job => <button key={job.id} className="workbench-secondary" onClick={() => onPrompt(planPrompt(job))}>{job.title}<AgentIcon name="chevron" size={16} /></button>)}</div>{!jobs.length && <button className="workbench-primary" onClick={() => onPrompt("我想先确定一个学习目标。请结合我的职业画像帮我选一个具体岗位，保存岗位原文后再安排学习路线。")}>先和穗奈聊聊方向</button>}</section> : <>
        {(state.paths.length > 1 || jobs.some(job => !state.paths.some(item => item.job_id === job.id))) && <div className="learning-path-tabs" role="group" aria-label="切换学习路线">{state.paths.map(item => <button key={item.id} aria-pressed={item.id === path.id} disabled={saving} onClick={async () => { if (item.id !== path.id && await leave()) await change({ type: "path.select", id: item.id }); }}>{item.title}</button>)}{jobs.filter(job => !state.paths.some(item => item.job_id === job.id)).map(job => <button key={job.id} title={"为" + job.title + "规划学习"} onClick={() => onPrompt(planPrompt(job))}><AgentIcon name="plus" size={14} />{job.title}</button>)}</div>}
        <header className="learning-path-heading"><div><h3>{path.title}</h3><p>{path.summary}</p></div><div className="learning-path-actions"><button className="agent-icon-button" title="和穗奈调整路线" aria-label="调整学习路线" onClick={() => onPrompt("请读取我正在使用的学习路线「" + path.title + "」及已有进度，我想调整后续安排。先问我希望改哪一部分，不重新创建重复路线。") }><AgentIcon name="edit" /></button><button className="agent-icon-button" title="移除这条路线" aria-label="移除学习路线" disabled={saving} onClick={async () => { if (await confirm({ title: "移除学习路线？", description: <p>「{path.title}」的章节、笔记和学习记录会一并移除。</p>, confirmLabel: "确认移除" })) await change({ type: "path.delete", id: path.id }); }}><AgentIcon name="trash" /></button></div></header>
        <LearningProgress path={path} />
        <div className="learning-layout"><nav className="learning-outline" aria-label="学习章节">{path.nodes.map((item, index) => <button key={item.key} aria-current={node?.key === item.key ? "step" : undefined} data-status={item.status} onClick={async () => { if (item.key !== node?.key && await leave()) { setDirty(false); setSelected(item.key); } }}><span className="learning-node-index">{item.status === "done" ? <AgentIcon name="check" size={15} /> : String(index + 1).padStart(2, "0")}</span><span><strong>{item.title}</strong><small>{LEARNING_STATUS[item.status]} · {item.estimated_minutes} 分钟</small></span><AgentIcon name="chevron" size={14} /></button>)}</nav>
        {node && <LearningLesson key={path.id + ":" + node.key} path={path} node={node} workspace={workspace} onDirty={setDirty} onPrompt={onPrompt} />}</div>
      </>}
    </>}{dialog}
  </div>;
}

export function LearningProgress({ path }: { path: LearningPath }) {
  const progress = learningProgress(path);
  return <div className="learning-progress"><div><span>{progress.completed} / {progress.total} 节已完成{progress.skipped > 0 ? ` · 跳过 ${progress.skipped} 节` : ""}</span><strong>{progress.percent}%</strong></div><progress value={progress.completed + progress.skipped} max={progress.total} aria-label="学习路线进度" /></div>;
}

function LearningLesson({ path, node, workspace, onDirty, onPrompt }: { path: LearningPath; node: LearningNode; workspace: LearningWorkspaceController; onDirty: (value: boolean) => void; onPrompt: (text: string) => void }) {
  const [notes, setNotes] = useState(node.notes), [result, setResult] = useState(node.result), [player, setPlayer] = useState<LearningResource | null>(null);
  const [query, setQuery] = useState(node.search_query), [search, setSearch] = useState<LearningSearchResult | null>(null), [searching, setSearching] = useState(false), [searchError, setSearchError] = useState("");
  const [subtitles, setSubtitles] = useState<LearningSubtitleResult | null>(null), [showSubtitles, setShowSubtitles] = useState(false), [loadingSubtitles, setLoadingSubtitles] = useState(false);
  const request = useRef<AbortController | null>(null), subtitleRequest = useRef<AbortController | null>(null);
  const dirty = notes !== node.notes || result !== node.result;
  useEffect(() => { onDirty(dirty); return () => onDirty(false); }, [dirty, onDirty]);
  useEffect(() => () => { request.current?.abort(); subtitleRequest.current?.abort(); }, []);
  useEffect(() => { subtitleRequest.current?.abort(); setSubtitles(null); setShowSubtitles(false); setLoadingSubtitles(false); }, [player?.bvid]);
  useEffect(() => {
    if (!dirty) return;
    const prevent = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", prevent); return () => window.removeEventListener("beforeunload", prevent);
  }, [dirty]);
  async function find(event: FormEvent) {
    event.preventDefault(); request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    setSearching(true); setSearchError(""); setSearch(null);
    try { const value = await agentApi.learningVideos(query.trim(), controller.signal); if (!controller.signal.aborted) setSearch(value); }
    catch (cause) { if (!controller.signal.aborted) setSearchError((cause as Error).message); }
    finally { if (!controller.signal.aborted) setSearching(false); }
  }
  async function toggleSubtitles() {
    if (showSubtitles) { setShowSubtitles(false); return; }
    if (subtitles) { setShowSubtitles(true); return; }
    if (!player) return;
    subtitleRequest.current?.abort();
    const controller = new AbortController(); subtitleRequest.current = controller;
    setLoadingSubtitles(true); setShowSubtitles(true);
    try {
      const value = await agentApi.learningSubtitles(player.bvid, controller.signal);
      if (!controller.signal.aborted) setSubtitles(value);
    } catch (cause) {
      if (!controller.signal.aborted) setSubtitles({ status: "unavailable", tracks: [], message: (cause as Error).message || "字幕暂时无法读取。" });
    } finally { if (!controller.signal.aborted) setLoadingSubtitles(false); }
  }
  async function save(status: LearningNode["status"]) {
    if (await workspace.change({ type: "node.update", path_id: path.id, key: node.key, status, notes, result })) onDirty(false);
  }
  const ready = nodeReady(path, node), playerUrl = player ? learningPlayerUrl(player) : null;
  const ask = (message: string) => onPrompt("我正在学习路线「" + path.title + "」的「" + node.title + "」。请先读取学习进度、我的笔记和练习结果。" + message);
  return <article className="learning-lesson" aria-label={node.title}>
    <header><span className="learning-lesson-status" data-status={node.status}>{LEARNING_STATUS[node.status]}</span><h3>{node.title}</h3><p>{node.objective}</p></header>
    <details className="learning-requirement"><summary>对应哪项岗位要求</summary><blockquote>{node.requirement}</blockquote></details>
    {!ready && <p className="workbench-inline-warning">先完成或跳过：{node.prerequisites.filter(key => !path.nodes.some(item => item.key === key && ["done", "skipped"].includes(item.status))).map(key => path.nodes.find(item => item.key === key)?.title).join("、")}</p>}
    <div className="learning-coach"><button className="workbench-secondary" onClick={() => ask("请用简短讲解和例子带我理解本节内容，再给我一个小问题；不要直接堆课程。")}>让穗奈带我学<AgentIcon name="chevron" size={15} /></button>{node.status === "todo" && <button className="workbench-primary" disabled={workspace.saving || !ready} onClick={() => void save("doing")}><AgentIcon name="play" size={15} />开始本节</button>}</div>
    <AutoHeight><section className="learning-videos" aria-label="教学视频"><h4>教学视频</h4>
      {playerUrl && <div className="learning-player"><div><strong>{player!.title}</strong><div className="learning-player-actions"><button type="button" className="workbench-secondary" disabled={loadingSubtitles} aria-expanded={showSubtitles} onClick={() => void toggleSubtitles()}>{loadingSubtitles ? "读取中…" : showSubtitles ? "收起字幕" : "字幕"}</button><button className="agent-icon-button" title="收起播放器" aria-label="收起播放器" onClick={() => setPlayer(null)}><AgentIcon name="close" size={16} /></button></div></div><iframe src={playerUrl} title={player!.title} allow="fullscreen; encrypted-media; picture-in-picture" allowFullScreen sandbox="allow-scripts allow-same-origin allow-presentation" referrerPolicy="strict-origin-when-cross-origin" /><p>无法播放时可在B站打开；章节进度由你确认。</p>{showSubtitles && <LearningSubtitlePanel subtitles={subtitles} loading={loadingSubtitles} /> }<a href={player!.url} target="_blank" rel="noopener noreferrer">在B站打开<AgentIcon name="external" size={14} /></a></div>}
      {node.resources.map(resource => <VideoRow key={resource.id} resource={resource} onPreview={() => setPlayer(resource)} action={<button className="agent-icon-button" title="从本节移除" aria-label={"移除视频：" + resource.title} disabled={workspace.saving} onClick={() => void workspace.change({ type: "resource.remove", path_id: path.id, key: node.key, resource_id: resource.id })}><AgentIcon name="close" size={15} /></button>} />)}
      <form className="learning-search" onSubmit={event => void find(event)}><input aria-label="B站教学搜索词" required maxLength={120} value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索本节教学视频" /><button className="workbench-secondary" disabled={searching || !query.trim()}><AgentIcon name="search" size={16} />{searching ? "搜索中…" : "搜索B站"}</button></form>
      {searchError && <p className="agent-error" role="alert">{searchError}</p>}
      {search && <div className="learning-search-results" aria-live="polite">{search.message && <p>{search.message}</p>}{search.resources.map(resource => <VideoRow key={resource.id} resource={resource} onPreview={() => setPlayer(resource)} action={<button className="agent-icon-button" title={node.resources.some(item => item.id === resource.id) ? "已加入本节" : "加入本节"} aria-label={"加入本节：" + resource.title} disabled={workspace.saving || node.resources.some(item => item.id === resource.id)} onClick={() => void workspace.change({ type: "resource.attach", path_id: path.id, key: node.key, resource_id: resource.id })}><AgentIcon name={node.resources.some(item => item.id === resource.id) ? "check" : "plus"} size={17} /></button>} />)}<a className="learning-search-link" href={search.search_url} target="_blank" rel="noopener noreferrer">更多B站结果<AgentIcon name="external" size={14} /></a></div>}
    </section></AutoHeight>
    <section className="learning-practice"><h4>动手练一练</h4><p>{node.exercise}</p><blockquote>{node.deliverable}</blockquote></section>
    <form className="learning-notes" onSubmit={event => { event.preventDefault(); void save(node.status); }}><label className="workbench-field"><span>我的笔记</span><AnimatedTextarea rows={3} maxLength={6000} value={notes} onChange={event => setNotes(event.target.value)} placeholder="记下重点、疑问，或视频学到第几节。跳过本节时也请在这里留个原因。" /></label><label className="workbench-field"><span>练习与成果</span><AnimatedTextarea rows={3} maxLength={6000} value={result} onChange={event => setResult(event.target.value)} placeholder="写下理解、练习结果或作品链接，回来和穗奈一起核对。" /></label><footer><button className="workbench-secondary" disabled={workspace.saving || !dirty}>{dirty ? "保存笔记与成果" : "已保存"}</button><button type="button" className="workbench-primary" disabled={workspace.saving || !ready || !result.trim() || node.status === "done"} onClick={() => void save("done")}><AgentIcon name="check" size={16} />完成本节</button><button type="button" className="workbench-text-button" disabled={workspace.saving || !notes.trim() || node.status === "skipped"} onClick={() => void save("skipped")}>已有基础，跳过</button></footer></form>
    {node.result && <button className="workbench-secondary" onClick={() => ask("我已保存本节练习结果。请给出反馈，区分已经有依据的表现与仍需练习的部分，再建议下一步。不要仅凭学习完成把技能写入画像。")}>请穗奈看看我的成果<AgentIcon name="chevron" size={15} /></button>}
  </article>;
}

function LearningSubtitlePanel({ subtitles, loading }: { subtitles: LearningSubtitleResult | null; loading: boolean }) {
  if (loading) return <div className="learning-subtitles" role="status">正在读取字幕…</div>;
  if (!subtitles || subtitles.status !== "available") return <div className="learning-subtitles" role="status">{subtitles?.message ?? "暂未读取字幕。"}</div>;
  return <div className="learning-subtitles" aria-label="视频字幕">{subtitles.tracks.map(track => <section key={track.language}><h5>{track.label}</h5><ol>{track.captions.map((caption, index) => <li key={track.language + "-" + index}><time>{learningCaptionTime(caption.start)}</time><span>{caption.text}</span></li>)}</ol></section>)}</div>;
}

function VideoRow({ resource, onPreview, action }: { resource: LearningResource; onPreview: () => void; action: ReactNode }) {
  const cover = learningCoverUrl(resource);
  const views = typeof resource.views === "number" ? " · 播放 " + new Intl.NumberFormat("zh-CN", { notation: resource.views >= 10000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(resource.views) : "";
  return <article className="learning-video-row"><button type="button" className="learning-video-preview" title="在窗口播放" aria-label={"播放：" + resource.title} onClick={onPreview}>{cover && <img src={cover} alt="" loading="lazy" referrerPolicy="no-referrer" onError={event => { event.currentTarget.hidden = true; }} />}<span className="learning-video-play"><AgentIcon name="play" size={17} /></span>{resource.duration && <small>{resource.duration}</small>}</button><a href={resource.url} target="_blank" rel="noopener noreferrer"><strong>{resource.title}</strong><span>{resource.author || "B站视频"}{views}{!resource.views && resource.duration ? " · " + resource.duration : ""}</span>{resource.description && <small>{resource.description}</small>}</a>{action}</article>;
}
