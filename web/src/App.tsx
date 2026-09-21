import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  api,
  readRunStream,
  tokenStore,
  type ArtifactEntry,
  type Capability,
  type Continuation,
  type Feed,
  type ObligationEntry,
  type RunEntry,
  type SessionUser,
  type Snapshot,
} from "./api/client";
import { evidencePill } from "./state/readable";
import { BrandMark, SuinaiFace } from "./components/Brand";
import { ComparisonBoard } from "./components/ComparisonBoard";
import { DecisionCard } from "./components/DecisionCard";
import { EvidenceDrawer } from "./components/EvidenceDrawer";
import { Login } from "./components/Login";
import { Ms } from "./components/Ms";
import { formatFailure } from "./state/failure";
import { Swap } from "./components/Swap";
import { TaskDeck } from "./components/TaskDeck";
import { Timeline } from "./components/Timeline";
import { emptyState, groupTrace, reduceFrame, type Frame, type ShellState, type TraceGroup } from "./state/frames";

export function App() {
  const [signedIn, setSignedIn] = useState<boolean>(() => Boolean(tokenStore.get()));

  if (!signedIn) {
    return <Login onSuccess={() => setSignedIn(true)} />;
  }
  return <WorkbenchShell onSignedOut={() => setSignedIn(false)} />;
}

interface Props {
  onSignedOut: () => void;
}

const LAST_RUN_KEY = "career.lastRun";
const RUN_QUERY_KEY = "run";

const EXAMPLES: Array<{ goal: string; capability: string; glyph: string }> = [
  {
    goal: "我在数据分析师和后端工程师之间犹豫，想先看看真实岗位到底要什么",
    capability: "direction_explore",
    glyph: "travel_explore",
  },
  { goal: "帮我把这个纠结整理成一个能比较、能行动的决策问题", capability: "decision_frame", glyph: "flag" },
  { goal: "看看我的画像里还缺哪条线索，以致于现在没法判断", capability: "profile_diagnose", glyph: "person_search" },
];

const RUN_LABEL: Record<string, string> = {
  created: "排队中",
  running: "进行中",
  awaiting_approval: "等你确认",
  paused: "已暂停",
  completed: "已完成",
  failed: "失败",
  cancelled: "已取消",
};

/** The graph's own three phases, in the order they run. The segmented control in the
 *  dock reads this out — it is where the run actually is, not a knob to pretend with. */
const PHASES = ["决定下一步", "查资料", "整理结论"];

function WorkbenchShell({ onSignedOut }: Props) {
  const [capabilities, setCapabilities] = useState<Capability[]>([]);
  const [chosen, setChosen] = useState<string>("direction_explore");
  const [goal, setGoal] = useState("");
  const [state, setState] = useState<ShellState>(emptyState);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [feed, setFeed] = useState<Feed | null>(null);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [continuation, setContinuation] = useState<Continuation | null>(null);
  const [project, setProject] = useState<string | null>(null);
  const [runId, setRunId] = useState<string | null>(() => sharedRun() ?? localStorage.getItem(LAST_RUN_KEY));
  const [notice, setNotice] = useState<string | null>(null);
  /** The answer as it is being written. Transient: it is replaced by the artifact. */
  const [stream, setStream] = useState<{ answer: string; reasoning: string } | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  /** Bumped with every feed reload so the stored comparison board re-reads the table
   *  right after the approval that wrote a round. */
  const [boardTick, setBoardTick] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const bootRef = useRef(false);

  const refreshFeed = useCallback(async () => {
    try {
      setFeed(await api.feed());
      setBoardTick((tick) => tick + 1);
    } catch (error) {
      setNotice((error as Error).message);
    }
  }, []);

  const refresh = useCallback(
    async (id: string) => {
      try {
        setSnapshot(await api.snapshot(id));
      } catch (error) {
        setNotice((error as Error).message);
      }
      void refreshFeed();
    },
    [refreshFeed],
  );

  const consume = useCallback(
    async (id: string, afterSeq: number) => {
      const controller = new AbortController();
      abortRef.current = controller;
      let last = afterSeq;
      try {
        for await (const frame of readRunStream(id, {
          afterSeq,
          signal: controller.signal,
          onDelta: (delta) => setStream({ answer: delta.answer, reasoning: delta.reasoning }),
        })) {
          last = frame.seq;
          setState((current) => reduceFrame(current, frame as Frame));
          // The real answer has landed; the half-written one must not linger under it.
          if (frame.kind === "artifact_created") {
            setStream(null);
          }
          // Only the frames that change what the object layer holds trigger a refetch;
          // refreshing per frame would put a request on every token of the timeline.
          if (["approval_required", "artifact_created", "obligation_created", "run_completed", "run_failed"].includes(frame.kind)) {
            void refresh(id);
          }
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setNotice((error as Error).message);
        }
      } finally {
        void refresh(id);
      }
      return last;
    },
    [refresh],
  );

  const launch = useCallback(
    async (input: { goal: string; capability_id: string | null; obligation_id?: string; project_id?: string | null }) => {
      if (input.goal.trim().length < 4) {
        return;
      }
      abortRef.current?.abort();
      setState(emptyState);
      setSnapshot(null);
      setNotice(null);
      setStream(null);
      try {
        const created = await api.createRun(input);
        // The words are now the agent's input, not a draft. Leaving them in the box
        // reads as "nothing happened yet".
        setGoal("");
        localStorage.setItem(LAST_RUN_KEY, created.run_id);
        setRunId(created.run_id);
        await consume(created.run_id, -1);
      } catch (error) {
        // A 409 here means the promise was already claimed elsewhere — the other tab
        // is showing it, so saying so beats an error toast.
        setNotice((error as Error).message);
        void refreshFeed();
      }
    },
    [consume, refreshFeed],
  );

  const start = useCallback(() => {
    void launch({ goal: goal.trim(), capability_id: chosen, project_id: project });
  }, [chosen, goal, launch, project]);

  useEffect(() => {
    api
      .capabilities()
      .then(setCapabilities)
      .catch((error: Error) => setNotice(error.message));
    // Consent is a server fact, not a client memory: the card says "已授权" only while
    // the database still says so.
    api.me().then(setUser).catch(() => setUser(null));
    void refreshFeed();
    return () => abortRef.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openRun = useCallback(
    (id: string) => {
      abortRef.current?.abort();
      setState(emptyState);
      setSnapshot(null);
      setNotice(null);
      // Switching conversations switches the draft too: a half-typed question left in
      // the box belongs to the conversation you came from.
      setStream(null);
      setGoal("");
      setRunId(id);
      localStorage.setItem(LAST_RUN_KEY, id);
      void consume(id, -1);
    },
    [consume],
  );

  // Opening the app: what the agent has, what it owes, and whether it should already
  // be moving. A1 says the system is doing something before the person asks — this is
  // the only place that starts a run without a click, and the backend cooldown is what
  // keeps it from being every reload.
  useEffect(() => {
    if (runId) {
      void consume(runId, -1);
      return;
    }
    if (bootRef.current) {
      return;
    }
    // StrictMode mounts twice in dev. `bootRef` makes this single-flight, which also
    // means the in-flight boot must not be cancelled by the first mount's cleanup —
    // the second mount would inherit a boot that nobody finished, and nothing would
    // ever start. A failed probe clears the guard so a later mount can retry.
    bootRef.current = true;
    void (async () => {
      let next: Continuation;
      try {
        next = await api.continuation();
      } catch {
        bootRef.current = false;
        return;
      }
      setContinuation(next);
      if (next.obligation) {
        await launch({
          goal: next.obligation.intent,
          capability_id: next.obligation.capability_id,
          obligation_id: next.obligation.id,
          project_id: next.obligation.project_id,
        });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const decide = useCallback(
    async (approved: boolean, feedback: string) => {
      if (!runId || !state.proposals.length) {
        return;
      }
      const approvalId = state.proposals.find((proposal) => proposal.approvalId)?.approvalId;
      if (!approvalId) {
        return;
      }
      setState((current) => ({ ...current, status: "running" }));
      try {
        await api.decide(runId, approvalId, approved, feedback);
        await consume(runId, state.lastSeq);
      } catch (error) {
        setNotice((error as Error).message);
      }
    },
    [consume, runId, state.lastSeq, state.proposals],
  );

  const abandon = useCallback(
    async (obligation: ObligationEntry) => {
      try {
        await api.abandonObligation(obligation.id);
        await refreshFeed();
        setContinuation((current) => (current?.obligation?.id === obligation.id ? null : current));
      } catch (error) {
        setNotice((error as Error).message);
      }
    },
    [refreshFeed],
  );

  const continueObligation = useCallback(
    (obligation: ObligationEntry) => {
      void launch({
        goal: obligation.intent,
        capability_id: obligation.capability_id,
        obligation_id: obligation.id,
        project_id: obligation.project_id ?? project,
      });
    },
    [launch, project],
  );

  const setConsent = useCallback(
    async (granted: boolean) => {
      try {
        await api.setConsent(granted);
        setUser(await api.me());
      } catch (error) {
        setNotice((error as Error).message);
      }
    },
    [],
  );

  const running = state.status === "running" || state.status === "awaiting_approval";
  /* A run is selected but its snapshot has not landed yet — the whole switch window.
     Derived rather than flagged, so it cannot be left set after the data arrives. */
  const waitingForRun = Boolean(runId) && !snapshot;
  const awaiting = state.proposals.find((proposal) => proposal.state === "awaiting");
  const artifactsById: Record<string, ArtifactEntry> = {};
  for (const entry of [...(feed?.artifacts ?? []), ...(snapshot?.artifacts ?? [])]) {
    artifactsById[entry.id] = entry;
  }
  const obligationsById: Record<string, ObligationEntry> = {};
  for (const entry of feed?.obligations ?? []) {
    obligationsById[entry.id] = entry;
  }
  const capabilityNames: Record<string, string> = {};
  for (const entry of capabilities) {
    capabilityNames[entry.id] = entry.name;
  }
  const openObligations = (feed?.obligations ?? []).filter((entry) => entry.status === "open");
  const pendingApprovals = feed?.pending_approvals ?? [];
  const groups = useMemo(() => traceGroups(state.items), [state.items]);
  const phase = groups.at(-1)?.label ?? null;
  const latest = useMemo(() => {
    const ids = Object.keys(artifactsById);
    return ids.length ? artifactsById[ids[ids.length - 1]] : null;
  }, [artifactsById]);
  const evidenceCount = evidenceLines(latest).length;
  // Tasks are scoped to one project: a 4-week plan from a finished question would
  // otherwise sit in the deck asking to be discharged again.
  const focusProject = project ?? feed?.projects[0]?.id ?? null;
  const focusTasks = (feed?.tasks ?? []).filter((entry) => entry.project_id === focusProject);

  const taskSubmitted = useCallback(
    (woken: string | null) => {
      // The deck has to show the words the person just typed, immediately: their own
      // submission is an object, not a line in a transcript that may not have streamed
      // yet. Following the woken run is a separate question from refreshing.
      void refreshFeed();
      if (woken && woken !== runId) {
        openRun(woken);
      }
    },
    [openRun, refreshFeed, runId],
  );

  const signOut = () => {
    tokenStore.clear();
    localStorage.removeItem(LAST_RUN_KEY);
    onSignedOut();
  };

  const share = async () => {
    if (!snapshot) {
      return;
    }
    const url = `${location.origin}${location.pathname}?${RUN_QUERY_KEY}=${snapshot.run.id}`;
    try {
      await navigator.clipboard.writeText(url);
      setNotice("这一轮的链接已复制，粘给别人就能看到同样的证据。");
    } catch {
      setNotice(`浏览器不肯给剪贴板权限，链接是 ${url}`);
    }
  };

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sidebar__scroll">
          <div className="brand">
            <BrandMark />
            <span className="pill">Agent</span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-sm)" }}>
            <button
              className="cta"
              onClick={() => {
                abortRef.current?.abort();
                setRunId(null);
                localStorage.removeItem(LAST_RUN_KEY);
                setState(emptyState);
                setSnapshot(null);
                setGoal("");
              }}
            >
              <Ms g="add" size={20} />
              <span>新建规划会话</span>
            </button>
            <div className="navgrid">
              <button
                className="navpill"
                disabled={!openObligations.length}
                onClick={() => openObligations[0] && continueObligation(openObligations[0])}
              >
                <Ms g="bolt" size={16} />
                <span>接着做</span>
              </button>
              <button
                className="navpill navpill--spread"
                disabled={!pendingApprovals.length}
                onClick={() => pendingApprovals[0] && openRun(pendingApprovals[0].run_id)}
              >
                <span style={{ display: "inline-flex", alignItems: "center", gap: "var(--sp-xs)" }}>
                  <Ms g="check_circle" size={16} />
                  <span>等你确认</span>
                </span>
                <span className="count">{pendingApprovals.length}</span>
              </button>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column" }}>
            <div className="treehead">
              <div className="treehead__lead">
                <Ms g="account_tree" size={16} />
                <span>目标赛道与对话</span>
              </div>
            </div>
            <nav className="history">
              {trackOf(feed?.runs ?? [], runId).map((track) => (
                <TrackCard
                  key={track.capability}
                  open={track.capability === (trackOf(feed?.runs ?? [], runId)[0]?.capability ?? "")}
                  runs={track.runs}
                  capabilityName={capabilityNames[track.capability] ?? "自由目标"}
                  runId={runId}
                  obligations={(feed?.obligations ?? []).filter((entry) => entry.status === "open")}
                  onOpen={openRun}
                />
              ))}
              {!feed?.runs.length ? (
                <p className="muted t-body-sm" style={{ padding: "4px 16px" }}>
                  还没有对话。写下第一个目标，穗奈就会开始查。
                </p>
              ) : null}
            </nav>
          </div>

          <div style={{ display: "flex", flexDirection: "column" }}>
            <div className="group">
              <span>决策项目（写入目标）</span>
              <Ms g="folder_open" size={16} />
            </div>
            {feed?.projects.length ? (
              feed.projects.slice(0, 6).map((entry) => (
                <button
                  className="item"
                  key={entry.id}
                  data-on={project === entry.id}
                  onClick={() => setProject((current) => (current === entry.id ? null : entry.id))}
                >
                  <Ms g="flag" size={16} />
                  <span className="item__text">
                    {entry.title}
                    <span className="item__sub">
                      {entry.candidate_count} 个候选 · v{entry.version}
                    </span>
                  </span>
                </button>
              ))
            ) : (
              <p className="muted t-body-sm" style={{ padding: "4px 16px" }}>
                还没有决策项目。让穗奈帮你把纠结的问题框成一个。
              </p>
            )}
          </div>
        </div>

        <div className="usercard">
          <span className="usercard__avatar">{initials(user?.username)}</span>
          <div className="usercard__body">
            <div className="t-title-sm">{user?.username ?? "未登录"}</div>
            <div className="muted t-label-sm">
              {openObligations.length
                ? `穗奈答应过要接着做 ${openObligations.length} 件事`
                : "穗奈手上没有欠着的下一步"}
            </div>
          </div>
          <button className="fieldbtn" title="退出登录" onClick={signOut}>
            <Ms g="logout" size={20} />
          </button>
        </div>
      </aside>

      <div className="frame">
        <header className="topbar">
          <div className="search">
            <Ms g="search" size={20} />
            <input
              name="search"
              id="global-search"
              placeholder="搜索成果物、对话或岗位关键词..."
              disabled
              title="检索尚未实现"
            />
          </div>
          <div className="topbar__end">
            <span className={`status ${user?.external_ai_consent ? "status--on" : "status--quiet"}`} title="云端模型授权状态">
              <span className={`dot${running ? " dot--live" : ""}`} />
              <Swap when={user?.external_ai_consent ? "on" : "off"}>
                {user?.external_ai_consent ? "云端模型已连接" : "未授权 · 走确定性路径"}
              </Swap>
            </span>
            <div className="topbar__own">
              <button className="iconbtn" title="账号与授权" aria-expanded={menuOpen} onClick={() => setMenuOpen((current) => !current)}>
                <Ms g="tune" size={22} />
              </button>
              {menuOpen ? (
                <div className="menu menu--drop">
                  <div className="menu__head">云端模型授权</div>
                  <button
                    className="menu__row"
                    onClick={() => {
                      void setConsent(!user?.external_ai_consent);
                      setMenuOpen(false);
                    }}
                  >
                    <Ms g={user?.external_ai_consent ? "check_circle" : "radio_button_unchecked"} size={18} />
                    <span>{user?.external_ai_consent ? "已连接 · 点击撤销" : "未授权 · 点击同意"}</span>
                  </button>
                  <div className="menu__head">这一轮</div>
                  <button className="menu__row" onClick={() => runId && void refresh(runId)}>
                    <Ms g="query_stats" size={18} />
                    <span>
                      {snapshot?.run.usage
                        ? `刷新用量 · ${(snapshot.run.usage.prompt + snapshot.run.usage.completion).toLocaleString()} tokens`
                        : "还没有用量记录"}
                    </span>
                  </button>
                  <button className="menu__row" onClick={signOut}>
                    <Ms g="logout" size={18} />
                    <span>退出登录</span>
                  </button>
                </div>
              ) : null}
            </div>
            <button
              className="iconbtn"
              disabled={!pendingApprovals.length}
              title={pendingApprovals.length ? "有待确认的写入" : "没有等你确认的事"}
              onClick={() => pendingApprovals[0] && openRun(pendingApprovals[0].run_id)}
            >
              <Ms g="notifications" size={22} />
              {pendingApprovals.length ? <span className="iconbtn__badge">{pendingApprovals.length}</span> : null}
            </button>
            <button className="iconbtn" disabled={!snapshot} title="复制这一轮的链接" onClick={() => void share()}>
              <Ms g="ios_share" size={22} />
            </button>
          </div>
        </header>

        <main className="main">
          {/* Keyed by the run: switching conversations remounts the thread, so the
              entrance animations replay instead of content silently mutating. */}
          <div className="feed" data-swap="" key={runId ?? "none"}>
            {snapshot ? null : waitingForRun ? (
              <div className="ribbon">
                <div className="ribbon__lead">
                  <span className="ribbon__cap">
                    <Ms g="hourglass_top" size={20} />
                    <span>正在取回这一轮</span>
                  </span>
                </div>
              </div>
            ) : null}

            {snapshot ? (
              <div className="ribbon">
                <div className="ribbon__lead">
                  <div className="ribbon__cap">
                    <Ms g="grain" size={20} />
                    <span>{capabilityNames[snapshot.run.capability_id ?? ""] ?? "自由目标"}</span>
                  </div>
                  <span className="ribbon__sep">/</span>
                  <span className="ribbon__id">{`ID: ${snapshot.run.id.slice(0, 8)}`}</span>
                  <span className="ribbon__sep">/</span>
                  <div className="ribbon__state">
                    <span className={`dot${running ? " dot--live" : snapshot.run.status === "failed" ? " dot--bad" : ""}`} />
                    <Swap when={snapshot.run.status + String(running)}>{ribbonState(snapshot, groups, running)}</Swap>
                  </div>
                </div>
                <div className="ribbon__end">
                  <span className={`pill ${evidenceCount ? "pill--primary" : "pill--quiet"}`}>
                    <Ms g="verified" size={14} />
                    <span>{evidencePill({ coverage: latest?.data_coverage ?? null, quotes: evidenceCount, provisional: Boolean(latest?.is_provisional) })}</span>
                  </span>
                  <button className="minibtn" title="复制这一轮的链接" onClick={() => void share()}>
                    <Ms g="share" size={20} />
                  </button>
                  <button className="minibtn" title="重放这一轮" onClick={() => openRun(snapshot.run.id)}>
                    <Ms g="replay" size={20} />
                  </button>
                </div>
              </div>
            ) : null}

            {notice ? (
              <div className="notice">
                <Ms g="error" size={16} />
                <span>{notice}</span>
              </div>
            ) : null}

            {waitingForRun && !state.items.length ? (
              <div className="anchor">
                <span>正在取回这一轮…</span>
              </div>
            ) : null}

            {state.items.length === 0 && !running && !waitingForRun ? (
              <>
                <div className="anchor">
                  <span>还没有开始的任务</span>
                </div>
                <section className="stream">
                  <div className="panel__head">
                    <div className="panel__title">
                      <SuinaiFace face="listen" size={28} />
                      <span>把你在纠结的职业问题交给穗奈</span>
                    </div>
                    <span className="faint t-label-sm">她先去查真实岗位与要求原句</span>
                  </div>
                  <p className="ev__body">
                    {continuation?.reason === "cooling_down"
                      ? "穗奈今天已经自己跑过一轮了，不再自动打扰你。想让她现在开始，写个目标，或者在左边点「接着做」。"
                      : "她会把结果落成能点回原文的成果物，要写进业务库的动作会停下来等你确认。"}
                  </p>
                  {EXAMPLES.map((example) => (
                    <button className="ev" key={example.capability} onClick={() => {
                      setGoal(example.goal);
                      setChosen(example.capability);
                    }}>
                      <div className="ev__lead">
                        <span className="ev__index">
                          <Ms g={example.glyph} size={16} />
                        </span>
                        <div className="ev__main">
                          <span className="ev__title">{example.goal}</span>
                          <div className="ev__chips">
                            <span className="srcchip">
                              <Ms g="bolt" size={14} />
                              <span>{capabilityNames[example.capability] ?? example.capability}</span>
                            </span>
                          </div>
                        </div>
                        <span className="ev__link">
                          <span>用这个</span>
                          <Ms g="arrow_outward" size={16} />
                        </span>
                      </div>
                    </button>
                  ))}
                </section>
              </>
            ) : null}

            <Timeline
              artifacts={artifactsById}
              busy={running}
              capabilityNames={capabilityNames}
              entryPoint={snapshot?.run.entry_point ?? null}
              goal={snapshot?.run.goal ?? null}
              hasProjectTarget={Boolean(project)}
              items={state.items}
              live={running}
              model={snapshot?.run.model_used ?? null}
              streaming={stream}
              obligations={obligationsById}
              projectId={focusProject}
              usage={snapshot?.run.usage ?? null}
              userName={user?.username ?? null}
              onAbandon={(obligation) => void abandon(obligation)}
              onAsk={(text) => {
                setGoal(text);
                document.getElementById("composer")?.focus();
              }}
              onContinue={continueObligation}
              onReviewFiled={() => void refreshFeed()}
              onRunAction={(text) => void launch({ goal: text, capability_id: chosen, project_id: project })}
            />

            <TaskDeck tasks={focusTasks} onSubmitted={taskSubmitted} />

            <ComparisonBoard projectId={focusProject} revision={boardTick} />

            {awaiting ? (
              <DecisionCard
                criteria={awaiting.acceptanceCriteria}
                key={awaiting.id}
                payload={snapshot?.proposals.find((proposal) => proposal.id === awaiting.id)?.payload ?? {}}
                rationale={awaiting.rationale}
                riskTier={awaiting.riskTier}
                title={awaiting.title}
                onDecide={decide}
              />
            ) : null}
          </div>
        </main>

        {evidenceCount ? (
          <div className="inspector">
            <button className="inspector__btn" onClick={() => setDrawerOpen(true)} title="展开核验原文">
              <span className="inspector__icon">
                <Ms g="fact_check" size={16} />
              </span>
              <span className="inspector__text">
                <span className="t-title-sm">{`${evidenceCount} 份证据原文核验`}</span>
                <span className="faint t-label-sm">(可点击展开)</span>
              </span>
              <Ms g="chevron_left" size={18} />
            </button>
          </div>
        ) : null}

        <EvidenceDrawer artifact={latest} open={drawerOpen} onClose={() => setDrawerOpen(false)} />

        <Dock
          busy={running}
          capabilities={capabilities}
          chosen={chosen}
          consented={Boolean(user?.external_ai_consent)}
          evidenceCount={evidenceCount}
          goal={goal}
          phase={phase}
          projectName={project ? (feed?.projects.find((entry) => entry.id === project)?.title ?? null) : null}
          onChangeGoal={setGoal}
          onPick={setChosen}
          onSend={start}
        />
      </div>
    </div>
  );
}

interface Track {
  capability: string;
  runs: RunEntry[];
}

/**
 * The prototype's "赛道" is our capability: the runs a person kept coming back to under
 * the same kind of question. Grouping by it means the tree is made of things that
 * happened, not folders someone has to maintain.
 */
function trackOf(runs: RunEntry[], current: string | null): Track[] {
  const byCapability = new Map<string, RunEntry[]>();
  for (const run of runs) {
    const key = run.capability_id ?? "";
    const list = byCapability.get(key) ?? [];
    list.push(run);
    byCapability.set(key, list);
  }
  const tracks = [...byCapability.entries()].map(([capability, list]) => ({ capability, runs: list }));
  tracks.sort((left, right) => stamp(right.runs) - stamp(left.runs));
  const active = tracks.findIndex((track) => track.runs.some((run) => run.id === current));
  if (active > 0) {
    tracks.unshift(tracks.splice(active, 1)[0]);
  }
  return tracks;
}

function stamp(runs: RunEntry[]): number {
  const at = runs[0]?.created_at;
  return at ? new Date(`${at.replace(" ", "T")}${at.endsWith("Z") ? "" : "Z"}`).getTime() : 0;
}

function evidenceLines(artifact: ArtifactEntry | null): Array<{ claim: string; quote?: string; source?: string }> {
  const basis = (artifact?.content as Record<string, unknown> | undefined)?.evidence_basis;
  return Array.isArray(basis) ? (basis as Array<{ claim: string; quote?: string; source?: string }>) : [];
}

function traceGroups(items: ShellState["items"]): TraceGroup[] {
  const out: TraceGroup[] = [];
  for (const block of groupTrace(items)) {
    if (block.type === "group") {
      out.push(block.group);
    }
  }
  return out;
}

function ribbonState(snapshot: Snapshot, groups: TraceGroup[], running: boolean): string {
  const calls = groups.reduce((total, group) => total + group.items.filter((entry) => entry.kind === "tool_call").length, 0);
  if (running) {
    return `思考推演中 · 已查 ${calls} 次资料`;
  }
  if (snapshot.run.status === "failed") {
    return formatFailure(snapshot.run.error, "这一轮失败了");
  }
  return `思考推演完成 · ${groups.length} 步 · 深度查调 ${calls} 次资料`;
}

function initials(name: string | undefined): string {
  return (name ?? "穗").trim().slice(0, 2).toUpperCase();
}

function TrackCard({
  open,
  runs,
  capabilityName,
  runId,
  obligations,
  onOpen,
}: {
  open: boolean;
  runs: RunEntry[];
  capabilityName: string;
  runId: string | null;
  obligations: ObligationEntry[];
  onOpen: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(open);
  const waiting = runs.filter((run) => obligations.some((entry) => entry.run_id === run.id));

  return (
    <div className={`track${expanded ? " track--open" : ""}`}>
      <button className="track__head" onClick={() => setExpanded((value) => !value)}>
        <span className="track__name">
          <Ms g={expanded ? "arrow_drop_down" : "arrow_right"} size={16} />
          <span>{capabilityName}</span>
        </span>
        <span className="track__badge">{`${runs.length} 个对话${waiting.length ? " · 有待办" : ""}`}</span>
      </button>

      {expanded ? (
        <div className="track__list">
          {runs.slice(0, 4).map((run) => {
            const promises = obligations.filter((entry) => entry.run_id === run.id);
            const isCurrent = run.id === runId;
            return (
              <div key={run.id}>
                <button className={`session${isCurrent ? " session--on" : ""}`} onClick={() => onOpen(run.id)}>
                  <Ms className="session__icon" g={isCurrent ? "chat_bubble" : "chat_bubble_outline"} size={16} />
                  <span className="session__body">
                    <span className="session__title">
                      <span>{run.goal.slice(0, 20) || run.id.slice(0, 8)}</span>
                      {isCurrent && run.status === "running" ? <span className="session__dot" /> : null}
                    </span>
                    <span className={`session__sub${isCurrent ? "" : " session__sub--quiet"}`}>
                      {isCurrent ? `当前主会话 · ${RUN_LABEL[run.status] ?? run.status}` : RUN_LABEL[run.status] ?? run.status}
                    </span>
                  </span>
                </button>
                {promises.length ? (
                  <div className="branch">
                    {promises.map((entry) => (
                      <button className="branch__item" key={entry.id} onClick={() => onOpen(run.id)}>
                        <span className="branch__row">
                          <span className="branch__name">
                            <span>💡</span>
                            <span>{entry.intent.slice(0, 18)}</span>
                          </span>
                        </span>
                        <span className="branch__tags">
                          <span className={entry.startable ? "tag tag--primary" : "tag tag--tertiary"}>
                            {entry.startable ? "可以自己去做 ↗" : "要先有项目 ↗"}
                          </span>
                          <span className="tag">{entry.trigger_kind === "scheduled" ? "到点再动" : "你回来就做"}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
          {runs.length > 4 ? <div className="track__foot">{`还有 ${runs.length - 4} 个更早的对话`}</div> : null}
        </div>
      ) : null}
    </div>
  );
}

function Dock({
  capabilities,
  chosen,
  goal,
  busy,
  consented,
  evidenceCount,
  phase,
  projectName,
  onPick,
  onChangeGoal,
  onSend,
}: {
  capabilities: Capability[];
  chosen: string;
  goal: string;
  busy: boolean;
  consented: boolean;
  evidenceCount: number;
  phase: string | null;
  projectName: string | null;
  onPick: (id: string) => void;
  onChangeGoal: (value: string) => void;
  onSend: () => void;
}) {
  return (
    <div className="dock">
      <div className="dock__inner">
        <div className="dock__rigor">
          <span className="dock__readout">
            <Ms g="verified" size={16} />
            <Swap when={`${consented}-${evidenceCount}`}>{`${consented ? "严谨溯源模式" : "确定性路径"} · ${evidenceCount} 条全文比对`}</Swap>
          </span>
          <div className="seg" title="穗奈这一轮实际走到的阶段">
            {PHASES.map((entry) => (
              <span className="seg__btn" data-on={entry === phase} key={entry}>
                {entry}
              </span>
            ))}
          </div>
        </div>

        <div className="dock__field">
          <CapabilityPicker capabilities={capabilities} chosen={chosen} onPick={onPick} />
          {projectName ? <span className="pill pill--primary">{`写入：${projectName}`}</span> : null}
          <textarea
            id="composer"
            name="goal"
            value={goal}
            onChange={(event) => onChangeGoal(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                onSend();
              }
            }}
            placeholder="向穗奈提问，或要求对特定职位做原句证据核验…"
            rows={1}
          />
          <button
            className={`send${goal.trim().length >= 4 && !busy ? " send--ready" : ""}`}
            disabled={busy || goal.trim().length < 4}
            onClick={onSend}
            title="交给穗奈"
          >
            <Ms g="arrow_upward" size={20} />
          </button>
        </div>
        <p className="dock__hint">Shift+Enter 换行 · 穗奈会先去找真实岗位与要求原句，不会凭行业印象下结论</p>
      </div>
    </div>
  );
}

/**
 * The ten capabilities do not fit beside the composer, and a strip you have to scroll
 * to read is a strip you scroll past. They collapse into one button that names the
 * current workflow and opens them grouped by the stage they belong to.
 */
const GROUPS: Array<{ label: string; domains: string[] }> = [
  { label: "认识自己", domains: ["profile"] },
  { label: "看清方向", domains: ["explore", "evidence"] },
  { label: "做出决定", domains: ["decide"] },
  { label: "落地行动", domains: ["act", "resume", "interview"] },
];

const GLYPH: Record<string, string> = {
  profile_diagnose: "person_search",
  direction_explore: "travel_explore",
  evidence_collect: "fact_check",
  decision_frame: "flag",
  candidate_source: "splitscreen",
  compare_decide: "balance",
  action_plan: "route",
  weekly_review: "calendar_month",
  resume_build: "article",
  interview_prep: "record_voice_over",
};

function CapabilityPicker({
  capabilities,
  chosen,
  onPick,
}: {
  capabilities: Capability[];
  chosen: string;
  onPick: (id: string) => void;
}) {
  const [phase, setPhase] = useState<"closed" | "open" | "closing">("closed");
  const wrap = useRef<HTMLDivElement>(null);
  const active = capabilities.find((entry) => entry.id === chosen);
  const open = phase === "open";

  // The panel stays mounted for the length of its exit animation, otherwise closing it
  // just deletes a node and the eye sees a jump instead of a retract.
  useEffect(() => {
    if (phase !== "closing") {
      return;
    }
    const done = setTimeout(() => setPhase("closed"), 190);
    return () => clearTimeout(done);
  }, [phase]);

  useEffect(() => {
    if (phase === "closed") {
      return;
    }
    const dismiss = (event: PointerEvent) => {
      if (!wrap.current?.contains(event.target as Node)) {
        setPhase("closing");
      }
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPhase("closing");
      }
    };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", key);
    };
  }, [phase]);

  const pick = (id: string) => {
    onPick(id);
    setPhase("closing");
  };

  return (
    <div className="picker" data-open={open} ref={wrap}>
      <button
        className="picker__btn"
        aria-expanded={open}
        onClick={() => setPhase((current) => (current === "open" ? "closing" : "open"))}
      >
        <Ms g={active ? (GLYPH[active.id] ?? "bolt") : "bolt"} size={16} />
        <Swap when={chosen}>{active?.name ?? "选择工作流"}</Swap>
        <Ms className="picker__chev" g="expand_more" size={18} />
      </button>

      {phase !== "closed" ? (
        <div className="picker__panel" data-closing={phase === "closing"}>
          {GROUPS.map((group) => {
            const entries = capabilities.filter((capability) => group.domains.includes(capability.domain));
            if (!entries.length) {
              return null;
            }
            return (
              <div key={group.label}>
                <div className="picker__group">
                  <span>{group.label}</span>
                </div>
                {entries.map((capability) => (
                  <button
                    className="picker__item"
                    style={{ "--i": String(capabilities.indexOf(capability)) } as CSSProperties}
                    aria-pressed={capability.id === chosen}
                    disabled={capability.status !== "implemented"}
                    key={capability.id}
                    onClick={() => pick(capability.id)}
                  >
                    <span className="picker__icon">
                      <Ms g={GLYPH[capability.id] ?? "bolt"} size={16} />
                    </span>
                    <span style={{ minWidth: 0 }}>
                      <span className="picker__name">{capability.name}</span>
                      <span className="picker__desc">{capability.description}</span>
                    </span>
                    {capability.status === "planned" ? (
                      <span className="picker__soon">未实现</span>
                    ) : (
                      <Ms className="picker__tick" g="check_circle" size={20} />
                    )}
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

/** A shared link opens the same run: `?run=` wins over whatever this browser last saw. */
function sharedRun(): string | null {
  return new URLSearchParams(location.search).get(RUN_QUERY_KEY);
}
