/** 青穗集 · 个人主页：本人查看与维护真实资料，连接成果和下一步，保留修改失败时的输入。 */
import { useEffect, useRef, useState, type FormEvent } from "react";
import { api, type ArtifactEntry, type Feed, type PersonalProfile, type ProfileFact, type SessionUser } from "../api/client";
import { availableArtifacts, categoryLabel, FACT_CATEGORIES, nextProfileStep } from "../state/profile";
import type { DesktopApp } from "../state/desktop";
import { PixelIcon } from "./PixelIcon";
import { ArtifactCard } from "./ArtifactCard";
import "../personal-home.css";

interface Props {
  user: SessionUser | null;
  feed: Feed | null;
  artifacts: ArtifactEntry[];
  motion: boolean;
  onPrepare: (goal: string) => void;
  onSelect: (app: DesktopApp) => void;
  onConsent: (value: boolean) => Promise<void>;
  onMotion: () => void;
  onSignOut: () => void;
  onSaved: () => void;
}
interface BasicDraft { school: string; major: string; year: string; cities: string; summary: string }
const emptyDraft: BasicDraft = { school: "", major: "", year: "", cities: "", summary: "" };
const tabs = [["overview", "主页概览"], ["facts", "经历与技能"], ["files", "成果文件"], ["settings", "账号设置"]] as const;
const FILE_KINDS = [
  ["ProfileGapReport", "profile", "画像分析"], ["JobMatchReport", "jobs", "岗位对照"],
  ["LearningPathDraft", "growth", "学习路线"], ["ResumeDraft", "resume", "简历草稿"],
] as const;
function basicDraft(profile: PersonalProfile): BasicDraft {
  return { school: profile.school, major: profile.major, year: profile.graduation_year?.toString() ?? "",
    cities: profile.city_targets.join("、"), summary: profile.summary };
}

export function PersonalHome({ user, feed, artifacts, motion, onPrepare, onSelect, onConsent, onMotion, onSignOut, onSaved }: Props) {
  const [profile, setProfile] = useState<PersonalProfile | null>(null);
  const [draft, setDraft] = useState<BasicDraft>(emptyDraft);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [tab, setTab] = useState<typeof tabs[number][0]>("overview");
  const [busy, setBusy] = useState(false);
  const [dimension, setDimension] = useState("experience");
  const [statement, setStatement] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [retracting, setRetracting] = useState<string | null>(null);
  const [reportId, setReportId] = useState<string | null>(null);
  const [filter, setFilter] = useState("all");
  const gate = useRef(false);
  const lifetime = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const load = () => {
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    setLoading(true); setError(null); setNotice(null);
    api.profile(current.signal).then(value => {
      if (current.signal.aborted) return;
      if (!Array.isArray(value.facts) || !Array.isArray(value.city_targets)) throw new Error("资料暂时没有读取完整，请重试。");
      setProfile(value); setDraft(basicDraft(value));
    }).catch((reason: Error) => { if (!current.signal.aborted) setError(reason.message); })
      .finally(() => { if (!current.signal.aborted) setLoading(false); });
  };
  useEffect(() => {
    lifetime.current++;
    load();
    return () => { lifetime.current++; controller.current?.abort(); };
    // 页面重新打开时读取服务端资料，避免展示其他对话之前的缓存。
  }, []);

  const write = async (operation: () => Promise<PersonalProfile>, message: string, after?: (value: PersonalProfile) => void) => {
    if (gate.current) return;
    const current = lifetime.current;
    gate.current = true; setBusy(true); setError(null); setNotice(null);
    try {
      const value = await operation();
      if (current !== lifetime.current) return;
      setProfile(value); setNotice(message); after?.(value); onSaved();
    } catch (reason) {
      if (current === lifetime.current) setError((reason as Error).message);
    } finally {
      gate.current = false;
      if (current === lifetime.current) setBusy(false);
    }
  };
  const saveBasic = (event: FormEvent) => {
    event.preventDefault();
    if (!profile) return;
    const cities = draft.cities.split(/[、，,;；\n]/).map(item => item.trim()).filter(Boolean);
    void write(() => api.updateProfile({ expected_version: profile.version, school: draft.school.trim(), major: draft.major.trim(),
      graduation_year: draft.year ? Number(draft.year) : null, city_targets: cities, summary: draft.summary.trim() }),
      "基本资料已保存。新的岗位分析会使用这些资料。", value => setDraft(basicDraft(value)));
  };
  const saveFact = (event: FormEvent) => {
    event.preventDefault();
    if (!profile) return;
    const input = { expected_version: profile.version, dimension, statement: statement.trim() };
    void write(() => editing ? api.updateProfileFact(editing, input) : api.addProfileFact(input),
      editing ? "经历已更新，后续分析会使用新内容。" : "已将这条经历加入你的档案。",
      () => { setEditing(null); setStatement(""); setRetracting(null); });
  };
  const edit = (fact: ProfileFact) => {
    setEditing(fact.id); setDimension(fact.dimension); setStatement(fact.statement); setRetracting(null);
    requestAnimationFrame(() => { const field = document.getElementById("profile-fact-statement"); field?.scrollIntoView({ block: "center" }); field?.focus(); });
  };
  const files = availableArtifacts(artifacts);
  const reports = files.filter(item => item.artifact_type === "ProfileGapReport");
  const report = reports.find(item => item.id === reportId);
  const next = profile ? nextProfileStep(profile, files) : null;
  const target = feed?.projects.find(item => item.primary_target)?.primary_target;
  const categories = [...new Set(profile?.facts.map(fact => fact.dimension) ?? [])];
  const shownFacts = profile?.facts.filter(fact => filter === "all" || fact.dimension === filter) ?? [];
  const setField = (key: keyof BasicDraft, value: string) => setDraft(current => ({ ...current, [key]: value }));

  return <div className="personal-home">
    <header className="personal-hero">
      <div className="personal-hero__identity">
        <span className="personal-avatar" aria-hidden="true">{(user?.username ?? "我").slice(0, 2)}</span>
        <div><p className="personal-eyebrow">MY CAREER FILE / 私人档案</p><h1>{user?.username ?? "我的"}<span>的成长主页</span></h1>
          <p className="personal-hero__description">把经历留在这里，让每一次选择都有依据。</p></div>
      </div>
      <span className="personal-stamp"><i />只属于你的档案</span>
    </header>
    <nav className="personal-tabs" aria-label="个人主页栏目">
      {tabs.map(([key, title]) => <button type="button" key={key} aria-current={tab === key ? "page" : undefined}
        onClick={() => { setTab(key); setNotice(null); }}>{title}</button>)}
    </nav>
    {error ? <div className="personal-alert" role="alert"><span>{error}</span><button type="button" disabled={busy || loading} onClick={load}>重新读取资料</button></div> : null}
    {notice ? <p className="personal-notice" role="status">✓ {notice}</p> : null}
    {loading ? <div className="personal-loading" role="status">正在打开你的档案…</div> : null}
    {!loading && !profile ? <div className="personal-loading">资料暂时没有打开，请点击上方按钮重新读取。</div> : null}
    {profile && !loading ? <>
      {tab === "overview" ? <div className="personal-grid">
        <section className="personal-panel personal-basic"><div className="personal-sectionhead"><div><p className="personal-eyebrow">ABOUT ME</p><h2>我的基本资料</h2></div><span className="personal-caption">由你填写和确认</span></div>
          <form onSubmit={saveBasic}><fieldset disabled={busy}>
            <div className="personal-fields">
              <label htmlFor="profile-school">学校<input id="profile-school" value={draft.school} maxLength={120} placeholder="例如：某某大学" onChange={event => setField("school", event.target.value)} /></label>
              <label htmlFor="profile-major">专业<input id="profile-major" value={draft.major} maxLength={120} placeholder="你的专业或学习方向" onChange={event => setField("major", event.target.value)} /></label>
              <label htmlFor="profile-year">毕业年份<input id="profile-year" type="number" min={1950} max={2100} step={1} value={draft.year} placeholder="例如：2027" onChange={event => setField("year", event.target.value)} /></label>
              <label htmlFor="profile-cities">意向城市<input id="profile-cities" value={draft.cities} maxLength={500} placeholder="多个城市用顿号分隔" onChange={event => setField("cities", event.target.value)} /></label>
            </div>
            <label className="personal-field" htmlFor="profile-summary">个人简介<textarea id="profile-summary" rows={3} maxLength={2000} value={draft.summary} placeholder="用几句话介绍当前的自己，以及想探索的方向。" onChange={event => setField("summary", event.target.value)} /></label>
            <div className="personal-formfoot"><span>留空的内容会保持未知，不替你猜。</span><button className="btn btn--primary" type="submit" disabled={busy}>{busy ? "保存中…" : "保存基本资料"}</button></div>
          </fieldset></form>
        </section>
        <aside className="personal-aside">
          <section className="personal-panel personal-next"><p className="personal-eyebrow">NEXT SMALL STEP</p><h2>{next?.title}</h2><p>{next?.detail}</p>
            <button type="button" className="btn btn--primary" onClick={() => next && onPrepare(next.goal)}>{next?.label}<span aria-hidden="true">↗</span></button></section>
          <section className="personal-panel"><p className="personal-eyebrow">ON MY DESKTOP</p><h2>已经留下的积累</h2>
            <div className="personal-counts"><button type="button" onClick={() => setTab("facts")}><strong>{profile.facts.length}</strong><span>条已确认经历</span></button>
              <button type="button" onClick={() => setTab("files")}><strong>{files.filter(item => FILE_KINDS.some(([kind]) => item.artifact_type === kind)).length}</strong><span>份成果文件</span></button></div>
            <p className="personal-target">{target ? `当前目标：${target}` : "目标方向还没确定，可以先和穗奈一起探索。"}</p>
          </section>
        </aside>
        <section className="personal-panel personal-summary"><div className="personal-sectionhead"><div><p className="personal-eyebrow">CONFIRMED BY YOU</p><h2>穗奈记住了这些</h2></div><button className="personal-link" type="button" onClick={() => setTab("facts")}>查看与维护全部经历 ↗</button></div>
          {profile.facts.length ? <ul className="personal-recent">{profile.facts.slice(0, 3).map(fact => <li key={fact.id}><span>{categoryLabel(fact.dimension)}</span><p>{fact.statement}</p></li>)}</ul>
            : <p className="personal-muted">还没有已确认的经历。你可以直接添加，也可以让穗奈通过对话帮你整理。</p>}
        </section>
      </div> : null}
      {tab === "facts" ? <div className="personal-facts-layout">
        <section className="personal-panel personal-factform"><p className="personal-eyebrow">YOUR OWN WORDS</p><h2>{editing ? "修改这条经历" : "添加一条真实经历"}</h2><p className="personal-muted">写清你做过什么。点击保存，就表示这段内容已经由你确认。</p>
          <form onSubmit={saveFact}><fieldset disabled={busy}><label className="personal-field" htmlFor="profile-fact-dimension">经历分类<select id="profile-fact-dimension" value={dimension} onChange={event => setDimension(event.target.value)}>
            {FACT_CATEGORIES.map(([key, title]) => <option value={key} key={key}>{title}</option>)}
            {!FACT_CATEGORIES.some(([key]) => key === dimension) ? <option value={dimension}>{categoryLabel(dimension)}</option> : null}
          </select></label>
          <label className="personal-field" htmlFor="profile-fact-statement">经历内容<textarea id="profile-fact-statement" required minLength={2} maxLength={500} rows={5} value={statement}
            placeholder="例如：我在课程项目里负责数据清洗，使用 Python 和 SQL 完成分析。" onChange={event => setStatement(event.target.value)} /></label>
          <div className="personal-formfoot"><span>{statement.length}/500</span><div>{editing ? <button type="button" className="personal-link" disabled={busy} onClick={() => { setEditing(null); setStatement(""); }}>取消修改</button> : null}
            <button className="btn btn--primary" type="submit" disabled={busy || statement.trim().length < 2}>{busy ? "保存中…" : editing ? "保存修改" : "确认并保存"}</button></div></div>
          </fieldset></form>
        </section>
        <section className="personal-panel personal-factlist"><div className="personal-sectionhead"><h2>已确认的经历 <small>{profile.facts.length} 条</small></h2></div>
          <label className="personal-filter" htmlFor="profile-fact-filter">按分类查看<select id="profile-fact-filter" value={filter} onChange={event => setFilter(event.target.value)}><option value="all">全部经历</option>{categories.map(key => <option key={key} value={key}>{categoryLabel(key)}</option>)}</select></label>
          {shownFacts.length ? <ul>{shownFacts.map(fact => <li key={fact.id} className="personal-fact"><div className="personal-fact__meta"><span>{categoryLabel(fact.dimension)}</span><small>{fact.source === "agent" ? "对话整理 · 已由你确认" : "本人填写 · 已确认"}</small></div><p>{fact.statement}</p>
            {retracting === fact.id ? <div className="personal-retract"><p>撤回后，这条经历不再直接参与后续分析。学校等基本资料需在概览中单独修改；已有成果保留原文。</p><button type="button" disabled={busy} onClick={() => void write(() => api.retractProfileFact(fact.id, profile.version), "已撤回这条经历。", () => { setRetracting(null); if (editing === fact.id) { setEditing(null); setStatement(""); } })}>确认撤回</button><button type="button" disabled={busy} onClick={() => setRetracting(null)}>保留</button></div>
              : <div className="personal-fact__actions"><button type="button" disabled={busy} aria-label={`编辑经历：${fact.statement}`} onClick={() => edit(fact)}>编辑</button><button type="button" disabled={busy} aria-label={`撤回经历：${fact.statement}`} onClick={() => setRetracting(fact.id)}>撤回</button></div>}
          </li>)}</ul> : <p className="personal-muted">这个分类还没有经历，可以从左侧添加一条。</p>}
          <p className="personal-footnote">基本资料和经历分别维护，教育信息变更后请检查两处是否一致。历史报告和简历保留原内容，可以让穗奈重新分析。</p>
        </section>
      </div> : null}
      {tab === "files" ? <section className="personal-panel"><div className="personal-sectionhead"><div><p className="personal-eyebrow">MY SAVED FILES</p><h2>每一步，都有留下的成果</h2></div><span className="personal-caption">草稿和已确认成果会分别标明</span></div>
        <div className="personal-files">{FILE_KINDS.map(([kind, app, title]) => {
          const entries = files.filter(item => item.artifact_type === kind);
          return <button key={kind} type="button" onClick={() => app === "profile" ? entries.length ? setReportId(entries[0].id) : onPrepare("根据我最新确认的资料分析个人画像") : onSelect(app)}><PixelIcon kind={app} size={32} /><span><strong>{title}</strong><small>{entries.length ? `${entries.length} 份 · ${entries[0].status === "committed" || entries[0].status === "approved" ? "最近一份已确认" : "含待完善草稿"}` : "还没有文件，和穗奈一起开始"}</small></span><i aria-hidden="true">↗</i></button>;
        })}</div>
        {report ? <div className="personal-report">
          <div className="personal-sectionhead"><h2>已保存的画像分析</h2><button type="button" className="personal-link" onClick={() => setReportId(null)}>收起分析</button></div>
          {reports.length > 1 ? <label className="personal-filter">选择分析版本<select value={report.id} onChange={event => setReportId(event.target.value)}>{reports.map((item, index) => <option key={item.id} value={item.id}>{item.title || `画像分析 ${index + 1}`} · v{item.version}</option>)}</select></label> : null}
          <ArtifactCard artifact={report} usage={null} steps={0} model={null} projectId={feed?.projects[0]?.id ?? null} onFiled={onSaved} onAsk={onPrepare} onRunAction={onPrepare} />
        </div> : null}
        <p className="personal-footnote">画像分析可在这里查看；岗位、路线和简历文件可在各自窗口继续处理。</p>
      </section> : null}
      {tab === "settings" ? <section className="personal-panel personal-settings"><p className="personal-eyebrow">ACCOUNT & PREFERENCES</p><h2>让桌面适合你的习惯</h2>
        <div className="personal-setting"><div><h3>当前账号</h3><p>{user?.username ?? "正在读取账号"}</p></div><span className="personal-caption">私人空间</span></div>
        <div className="personal-setting"><div><h3>云端模型授权</h3><p>允许后，可使用云端模型协助整理资料和分析。你可以随时撤销。</p></div><button type="button" className="personal-toggle" aria-pressed={Boolean(user?.external_ai_consent)} disabled={busy || !user} onClick={async () => {
          if (gate.current || !user) return; gate.current = true; setBusy(true); setError(null); const current = lifetime.current;
          try { await onConsent(!user.external_ai_consent); if (current === lifetime.current) setNotice("云端模型授权已更新。"); }
          catch (reason) { if (current === lifetime.current) setError((reason as Error).message); }
          finally { gate.current = false; if (current === lifetime.current) setBusy(false); }
        }}>{user?.external_ai_consent ? "已允许 · 点击撤销" : "未允许 · 点击授权"}</button></div>
        <div className="personal-setting"><div><h3>界面动画</h3><p>控制桌面动画；角色也会遵循系统减少动态的偏好。</p></div><button type="button" className="personal-toggle" aria-pressed={motion} onClick={onMotion}>{motion ? "播放中 · 点击暂停" : "已暂停 · 点击播放"}</button></div>
        <div className="personal-setting"><div><h3>退出当前账号</h3><p>你的已保存资料会保留在账号中。</p></div><button type="button" className="btn btn--outline" onClick={onSignOut}>退出登录</button></div>
      </section> : null}
    </> : null}
  </div>;
}
