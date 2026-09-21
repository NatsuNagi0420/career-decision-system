import { useState, type CSSProperties } from "react";
import type { ArtifactEntry, ObligationEntry } from "../api/client";
import { ArtifactCard, type Usage } from "./ArtifactCard";
import { Ms } from "./Ms";
import { SuinaiFace, type Face } from "./Brand";
import { Swap } from "./Swap";
import { groupTrace, type ThreadBlock, type TraceGroup, type TimelineItem } from "../state/frames";

interface Props {
  items: TimelineItem[];
  /** True while the run is still producing frames; only then is an unfinished step
   *  presented as live. A replay of a finished run must not animate. */
  live: boolean;
  artifacts: Record<string, ArtifactEntry>;
  obligations: Record<string, ObligationEntry>;
  capabilityNames: Record<string, string>;
  /** Whose session this is, so their own turn is attributed like the agent's. */
  userName: string | null;
  /** What the person actually typed this turn, quoted back in the follow-up. */
  goal: string | null;
  /** `obligation` means nobody typed this turn — 穗奈 picked up her own promise. */
  entryPoint: string | null;
  usage: Usage | null;
  model: string | null;
  /** The digest as it is being written, before the artifact exists. */
  streaming: { answer: string; reasoning: string } | null;
  busy: boolean;
  hasProjectTarget: boolean;
  /** The week a review would close under. Only the weekly review card uses it. */
  projectId: string | null;
  onContinue: (obligation: ObligationEntry) => void;
  onAbandon: (obligation: ObligationEntry) => void;
  onRunAction: (goal: string) => void;
  /** The person filed this week's review: the record exists now, so the feed is stale. */
  onReviewFiled: () => void;
  /** Puts a follow-up into the composer without sending it — the person still words it. */
  onAsk: (text: string) => void;
}

type Unit =
  | { kind: "user"; item: TimelineItem }
  | { kind: "agent"; item: TimelineItem; groups: TraceGroup[] }
  | { kind: "process"; groups: TraceGroup[] }
  | { kind: "note"; item: TimelineItem };

const AGENT_KINDS = new Set(["artifact_created", "obligation_created", "write_withheld", "approval_required"]);

/**
 * The prototype groups a turn as 头像 → 思考胶囊 → 回答. The process blocks are emitted
 * before the artifact they produced, so they are pulled into the same unit rather than
 * rendered as a floating row of their own.
 */
function planTurns(blocks: Folded[]): Unit[] {
  const units: Unit[] = [];
  let pending: TraceGroup[] = [];

  for (const block of blocks) {
    if (block.type === "process") {
      pending = [...pending, ...block.groups];
      continue;
    }
    const item = block.item;
    if (item.kind === "run_started") {
      units.push({ kind: "user", item });
      pending = [];
      continue;
    }
    if (AGENT_KINDS.has(item.kind)) {
      units.push({ kind: "agent", item, groups: pending });
      pending = [];
      continue;
    }
    units.push({ kind: "note", item });
  }
  if (pending.length) {
    units.push({ kind: "process", groups: pending });
  }
  return units;
}

/** The server stamps naive UTC, hence the "Z" before reading it back as local time. */
function clockOf(at?: string): string {
  if (!at) {
    return "";
  }
  const moment = new Date(`${at.replace(" ", "T")}${at.endsWith("Z") ? "" : "Z"}`);
  return Number.isNaN(moment.getTime())
    ? ""
    : moment.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}

function dayOf(at?: string): string {
  if (!at) {
    return "";
  }
  const moment = new Date(`${at.replace(" ", "T")}${at.endsWith("Z") ? "" : "Z"}`);
  return Number.isNaN(moment.getTime()) ? "" : moment.toLocaleDateString("zh-CN");
}

function initialsOf(name: string | null): string {
  const trimmed = (name ?? "你").trim();
  return trimmed.slice(0, 2).toUpperCase();
}

export function Timeline({
  items,
  live,
  artifacts,
  obligations,
  capabilityNames,
  userName,
  goal,
  entryPoint,
  usage,
  model,
  streaming,
  busy,
  hasProjectTarget,
  projectId,
  onContinue,
  onAbandon,
  onRunAction,
  onReviewFiled,
  onAsk,
}: Props) {
  const units = planTurns(coalesce(groupTrace(items)));
  const first = items[0];
  const steps = units.reduce((total, unit) => total + (unit.kind === "agent" || unit.kind === "process" ? unit.groups.length : 0), 0);

  return (
    <>
      {first ? (
        <div className="anchor">
          <span>{`${dayOf(first.at)} ${clockOf(first.at)} · 这一轮`}</span>
        </div>
      ) : null}

      {units.map((unit, index) => {
        if (unit.kind === "process") {
          return <Thought key={`t-${index}`} groups={unit.groups} live={live} standalone />;
        }
        if (unit.kind === "user") {
          return (
            <div className="turn--user" key={unit.item.eventId}>
              <div className="turn__main">
                <div className="bubble">{unit.item.detail}</div>
                <div className="turn__who">
                  <span>{clockOf(unit.item.at)}</span>
                  <span>·</span>
                  <em>{entryPoint === "obligation" ? "穗奈自己接上的下一步" : "你发起的这一轮"}</em>
                </div>
              </div>
              <span className="usercard__avatar">{initialsOf(userName)}</span>
            </div>
          );
        }
        if (unit.kind === "note") {
          return (
            <article className="note note--alone" data-tone={unit.item.tone} key={unit.item.eventId}>
              <Ms g={unit.item.tone === "neutral" ? "info" : "error"} size={20} />
              <div>
                <strong>{unit.item.title}</strong>
                {unit.item.detail ? <p>{unit.item.detail}</p> : null}
              </div>
            </article>
          );
        }
        return (
          <AgentTurn
            artifact={unit.item.artifactId ? artifacts[unit.item.artifactId] : undefined}
            busy={busy}
            goal={goal}
            groups={unit.groups}
            hasProjectTarget={hasProjectTarget}
            item={unit.item}
            key={unit.item.eventId}
            live={live}
            model={model}
            obligation={unit.item.obligationId ? obligations[unit.item.obligationId] : undefined}
            projectId={projectId}
            steps={steps}
            tag={capabilityNames[unit.item.capabilityId ?? ""] ?? null}
            usage={usage}
            onAbandon={onAbandon}
            onAsk={onAsk}
            onContinue={onContinue}
            onReviewFiled={onReviewFiled}
            onRunAction={onRunAction}
          />
        );
      })}

      {live && streaming ? <LiveAnswer answer={streaming.answer} reasoning={streaming.reasoning} /> : null}
    </>
  );
}

/**
 * What she is writing right now, before it becomes an artifact. Reasoning is shown
 * as reasoning — visibly smaller, capped, and never inside the answer card — so a
 * half-formed thought can't be mistaken for a finding.
 */
function LiveAnswer({ answer, reasoning }: { answer: string; reasoning: string }) {
  return (
    <div className="turn--agent">
      <SuinaiFace face="think" />
      <div className="turn__body">
        <div className="agenthead">
          <div className="agenthead__lead">
            <span className="agenthead__name">穗奈 · 正在写</span>
            <span className="pill pill--primary">
              <span className="dot dot--live" />
              <span>逐字生成中</span>
            </span>
          </div>
        </div>

        {reasoning ? (
          <details className="live__reason" open>
            <summary>
              <Ms g="bolt" size={14} />
              <span>她在想什么（模型草稿，不是结论）</span>
            </summary>
            <p>{reasoning}</p>
          </details>
        ) : null}

        <div className="live">
          {answer ? <p className="live__text">{answer}</p> : <p className="live__text faint">正在组织语言…</p>}
          <span className="live__caret" />
        </div>
      </div>
    </div>
  );
}

function faceOf(kind: string, provisional: boolean, live: boolean): Face {
  if (kind === "obligation_created") {
    return "encourage";
  }
  if (kind === "write_withheld" || kind === "approval_required") {
    return "warn";
  }
  if (kind === "artifact_created") {
    // Still writing it out, pleased with what she found, or flagging thin ice — the
    // face is the run's own state, not decoration.
    return live ? "explain" : provisional ? "worry" : "happy";
  }
  return live ? "think" : "smile";
}

function AgentTurn({
  item,
  groups,
  artifact,
  obligation,
  tag,
  live,
  busy,
  goal,
  model,
  steps,
  usage,
  hasProjectTarget,
  projectId,
  onContinue,
  onAbandon,
  onRunAction,
  onReviewFiled,
  onAsk,
}: {
  item: TimelineItem;
  groups: TraceGroup[];
  artifact: ArtifactEntry | undefined;
  obligation: ObligationEntry | undefined;
  tag: string | null;
  live: boolean;
  busy: boolean;
  goal: string | null;
  model: string | null;
  steps: number;
  usage: Usage | null;
  hasProjectTarget: boolean;
  projectId: string | null;
  onContinue: (obligation: ObligationEntry) => void;
  onAbandon: (obligation: ObligationEntry) => void;
  onRunAction: (goal: string) => void;
  onReviewFiled: () => void;
  onAsk: (text: string) => void;
}) {
  const promise = item.kind === "obligation_created";
  const provisional = artifact ? artifact.is_provisional : item.tone === "warn";
  const quotes = artifact ? Object.keys(artifact.evidence_quotes ?? {}).length : 0;
  const headMode = artifact
    ? artifact.generation_mode === "llm"
      ? "强依据模式"
      : "确定性路径"
    : promise
      ? "答应下来"
      : "整理中";

  return (
    <div className="turn--agent">
      <SuinaiFace face={faceOf(item.kind, provisional, live && groups.length > 0)} />

      <div className="turn__body">
        <div className="agenthead">
          <div className="agenthead__lead">
            <Swap when={headMode}>
              <span className="agenthead__name">{`穗奈 · ${headMode}`}</span>
            </Swap>
            {artifact ? (
              <span className={`pill ${provisional ? "pill--warn" : "pill--primary"}`}>
                <span className={provisional ? "" : "dot"} />
                {provisional ? "依据不足，写入已暂缓" : `${quotes} 条原句已核验`}
              </span>
            ) : promise && tag ? (
              <span className="pill">{tag}</span>
            ) : null}
          </div>
          <div className="agenthead__model">
            <Ms g="model_training" size={16} />
            <span>{`${model ?? "未调用模型"} · ${groups.length || steps} 步`}</span>
          </div>
        </div>

        {groups.length ? <Thought groups={groups} live={live} /> : null}

        {item.kind === "artifact_created" ? (
          artifact ? (
            <>
              <ArtifactCard
                artifact={artifact}
                model={model}
                projectId={projectId}
                steps={steps}
                usage={usage}
                onFiled={onReviewFiled}
                onRunAction={onRunAction}
              />
              <FollowUps artifact={artifact} goal={goal} onAsk={onAsk} />
            </>
          ) : (
            <p className="muted">成果物已经写下，正文还在取。</p>
          )
        ) : null}

        {promise ? (
          <PromiseBlock
            busy={busy}
            hasProjectTarget={hasProjectTarget}
            intent={item.detail ?? ""}
            obligation={obligation}
            onAbandon={onAbandon}
            onContinue={onContinue}
          />
        ) : null}

        {item.kind === "write_withheld" || item.kind === "approval_required" ? (
          <div className="note" data-tone="warn">
            <Ms g={item.kind === "write_withheld" ? "block" : "hourglass_top"} size={20} />
            <div>
              <strong>{item.title}</strong>
              {item.detail ? <p>{item.detail}</p> : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * The end of an answer should hand the conversation back. Everything here is already
 * in the artifact — the goal the person typed and the gaps code recorded — so the
 * follow-up reads as a question she is actually asking, not a generated filler.
 */
function FollowUps({ artifact, goal, onAsk }: { artifact: ArtifactEntry | null; goal: string | null; onAsk: (text: string) => void }) {
  const hints = ((artifact?.content as Record<string, unknown> | undefined)?.uncertainties ?? []) as unknown[];
  const picks = hints.filter((entry): entry is string => typeof entry === "string" && entry.length > 6).slice(0, 3);
  if (!picks.length) {
    return null;
  }
  const asked = (goal ?? "").trim();

  return (
    <section className="probe card-in" style={{ "--i": "1" } as CSSProperties}>
      <div className="probe__say">
        <span className="probe__head">
          <Ms g="forum" size={16} />
          <span>穗奈想追一句</span>
        </span>
        <p>
          {asked ? `你这次问的是「${asked.length > 46 ? `${asked.slice(0, 46)}…` : asked}」。` : ""}
          <span>
            {`这 ${picks.length} 处我手里没有依据，先摊开给你看。挑一条让我接着查，或者直接改问法。`}
          </span>
        </p>
      </div>
      <div className="probe__ask">
        <span className="probe__label">你可以接着对穗奈说：</span>
        {picks.map((entry, index) => (
          <button
            className="ask"
            key={index}
            style={{ "--i": String(index) } as CSSProperties}
            onClick={() => onAsk(`这条我拿不准，请带着原文回来：${entry}`)}
          >
            <span>{entry.length > 34 ? `${entry.slice(0, 34)}…` : entry}</span>
            <Ms g="arrow_forward" size={16} />
          </button>
        ))}
      </div>
    </section>
  );
}

function Thought({ groups, live, standalone = false }: { groups: TraceGroup[]; live: boolean; standalone?: boolean }) {
  const running = groups.find((group) => !group.done);
  const calls = groups.reduce((total, group) => total + group.items.filter((entry) => entry.kind === "tool_call").length, 0);
  const failed = groups.some((group) => group.failed);
  const spans = groups.map(spanOf);
  const wall = totalWall(spans);
  // Open while she is working, folded once she is done: the point of the rail is to be
  // watched while it moves, not to be a wall of machinery under every answer.
  const [manual, setManual] = useState<boolean | null>(null);
  const open = manual ?? live;
  const slowest = Math.max(1, ...spans.map((span) => span ?? 0));

  return (
    <details
      className="thought"
      open={open}
      onToggle={(event) => setManual((event.currentTarget as HTMLDetailsElement).open)}
      style={standalone ? { width: "100%", maxWidth: "var(--agent-w)" } : undefined}
    >
      <summary className="thought__summary">
        <Ms className="thought__summary-lead" g={failed ? "error" : live ? "psychology_alt" : "psychology"} size={18} />
        <span>{live && running ? `穗奈正在${running.label}…` : `思考过程 · ${groups.length} 步 · 查了 ${calls} 次资料`}</span>
        {wall !== null ? <em className="thought__wall">{`${wall.toFixed(1)}s`}</em> : null}
        <Ms className="thought__chev" g="expand_more" size={18} />
      </summary>
      <div className="thought__body">
        <p className="thought__cap">推理与取数链条 · 每步耗时来自服务端时间戳</p>
        {groups.map((group, step) => {
          const span = spans[step];
          const tools = group.items.filter((entry) => entry.kind === "tool_call");
          const echoes = tools.filter((entry) => entry.toolEcho);
          const notes = group.items.filter((entry) => entry.kind !== "tool_call" && entry.kind !== "step_started");
          return (
            <div className="thought__step" data-state={group.done ? (group.failed ? "failed" : "done") : "running"} key={group.stepId}>
              <span className="thought__node" />
              <div className="thought__main">
                <div className="thought__row">
                  <b>{String(step + 1).padStart(2, "0")}</b>
                  <strong>{group.label}</strong>
                  {span !== null ? (
                    <span className="thought__spans">
                      <span className="thought__bar" style={{ width: `${Math.max(4, (span / slowest) * 100)}%` }} />
                      <em>{`${span.toFixed(1)}s`}</em>
                    </span>
                  ) : (
                    <em className="thought__pending">进行中</em>
                  )}
                </div>
                {tools.length ? (
                  <div className="thought__tools">
                    {tools.map((entry) => (
                      <span className="thought__tool" key={entry.eventId}>
                        <Ms g="manage_search" size={13} />
                        <span>{entry.toolName ?? "资料"}</span>
                        <em>{`${entry.refCount ?? 0} 条`}</em>
                      </span>
                    ))}
                  </div>
                ) : null}
                {echoes.length ? (
                  <details className="thought__echo">
                    <summary>{`模型看到的工具回执（${echoes.length} 次）`}</summary>
                    {echoes.map((entry) => (
                      <div key={entry.eventId}>
                        <b>{entry.toolName ?? "资料"}</b>
                        <code>{entry.toolEcho}</code>
                      </div>
                    ))}
                  </details>
                ) : null}
                {notes.length ? (
                  <div className="thought__notes">
                    {notes.map((entry) => (
                      <span key={entry.eventId}>
                        {entry.title}
                        {entry.detail ? <code>{entry.detail}</code> : null}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </details>
  );
}

/** Wall clock a step took, measured between its own open and close frames. */
function spanOf(group: TraceGroup): number | null {
  const start = atMs(group.startedAt);
  const end = atMs(group.endedAt);
  if (start === null || end === null || !group.done) {
    return null;
  }
  return Math.max(0.1, (end - start) / 1000);
}

function totalWall(spans: Array<number | null>): number | null {
  const known = spans.filter((value): value is number => value !== null);
  return known.length ? known.reduce((total, value) => total + value, 0) : null;
}

function atMs(at?: string): number | null {
  if (!at) {
    return null;
  }
  const moment = new Date(`${at.replace(" ", "T")}${at.endsWith("Z") ? "" : "Z"}`).getTime();
  return Number.isNaN(moment) ? null : moment;
}

function PromiseBlock({
  obligation,
  intent,
  busy,
  hasProjectTarget,
  onContinue,
  onAbandon,
}: {
  obligation: ObligationEntry | undefined;
  intent: string;
  busy: boolean;
  hasProjectTarget: boolean;
  onContinue: (obligation: ObligationEntry) => void;
  onAbandon: (obligation: ObligationEntry) => void;
}) {
  const claimed = obligation?.status === "claimed";
  // `startable` gates the *automatic* continuation only: without a project the run
  // would go in blind. A person who picked a project may start it regardless — the
  // preconditions point at the agent, never at them.
  const blocked = obligation ? !obligation.startable && !hasProjectTarget : true;

  return (
    <>
      <div className="ev">
        <div className="ev__lead">
          <span className="ev__index">
            <Ms g="handshake" size={16} />
          </span>
          <div className="ev__main">
            <span className="ev__title">{intent}</span>
            {obligation && !obligation.startable ? (
              <p className="ev__body">
                {hasProjectTarget
                  ? "它需要挂在决策项目下；左边已经选好了，这一轮会带着项目去做。"
                  : "要先有一个决策项目才能自动接上；它不会自己开始。在左边选一个项目，就能手动开始。"}
              </p>
            ) : null}
          </div>
        </div>
      </div>
      <div className="actions">
        {obligation ? (
          <>
            <button
              className="btn btn--primary"
              disabled={busy || claimed || blocked}
              onClick={() => onContinue(obligation)}
            >
              <Ms g="play_arrow" size={18} />
              <span>{claimed ? "已在进行" : "接着做"}</span>
            </button>
            <button className="btn btn--soft" disabled={claimed} onClick={() => onAbandon(obligation)}>
              <Ms g="close" size={18} />
              <span>不用了</span>
            </button>
          </>
        ) : (
          <span className="muted t-label-sm">这条承诺已经记下，等清单刷新后就能操作。</span>
        )}
      </div>
    </>
  );
}

/** The chronological list with adjacent trace steps folded into one group. */
type Folded = { type: "item"; item: TimelineItem } | { type: "process"; groups: TraceGroup[] };

function coalesce(blocks: ThreadBlock[]): Folded[] {
  const out: Folded[] = [];
  for (const block of blocks) {
    if (block.type === "item") {
      out.push({ type: "item", item: block.item });
      continue;
    }
    const last = out[out.length - 1];
    if (last && last.type === "process") {
      last.groups.push(block.group);
    } else {
      out.push({ type: "process", groups: [block.group] });
    }
  }
  return out;
}
