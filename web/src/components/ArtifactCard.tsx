import { useState, type CSSProperties } from "react";
import type { ArtifactEntry } from "../api/client";
import { Ms } from "./Ms";
import { WeeklyReviewCard } from "./WeeklyReviewCard";
import { readableQuote } from "../state/readable";

/** Stagger index for the answer's cards, so the sheet assembles top-down. */
const rise = (index: number): CSSProperties => ({ "--i": String(index) }) as CSSProperties;

interface EvidenceLine {
  claim: string;
  quote?: string;
  source?: string;
}

export interface Usage {
  prompt: number;
  completion: number;
  reasoning: number;
  cached: number;
}

const STATUS_LABEL: Record<string, string> = {
  draft: "草稿",
  pending_approval: "等你确认",
  approved: "已确认",
  committed: "已写入",
  rejected: "已拒绝",
  superseded: "已被取代",
};

function strings(body: Record<string, unknown>, key: string): string[] {
  const value = body[key];
  return Array.isArray(value) ? value.map(String).filter((entry) => entry.trim().length > 0) : [];
}

/**
 * Our actions are hand-written sentences that often already carry their own shape:
 * "做X。带回来的东西：Y". Splitting on that marker gives a real title and a real
 * body instead of a card whose heading is the whole paragraph.
 */
function splitAction(text: string): { title: string; body: string } {
  const marker = text.search(/带回来的东西\s*[:：]/);
  if (marker > 0) {
    return { title: text.slice(0, marker).replace(/[:：，,。]\s*$/, ""), body: text.slice(marker) };
  }
  const stop = text.indexOf("。");
  if (stop > 6 && stop < 48) {
    return { title: text.slice(0, stop), body: text.slice(stop + 1).trim() };
  }
  return { title: "", body: text };
}

const ROW_GLYPHS = ["route", "hub", "groups_3", "explore", "task_alt"];

interface Props {
  artifact: ArtifactEntry;
  usage: Usage | null;
  steps: number;
  model: string | null;
  onRunAction?: (goal: string) => void;
  /** A weekly review draft is the one artifact that is not an answer but a form, and
   *  only the person can file it — so the write needs the project and a way to say
   *  "the feed changed". Every other artifact type ignores both. */
  projectId: string | null;
  onFiled: () => void;
}

/**
 * An Artifact as the prototype renders an agent answer: a tinted insight card holding
 * the strongest verbatim quote, a data panel whose ring and bars are computed by code,
 * then the evidence stream — one claim per row, its quote one click away.
 *
 * Coverage, provisional and the fabrication list come from code, never the model, so
 * they are shown as data rather than folded into prose.
 */
export function ArtifactCard({ artifact, usage, steps, model, projectId, onFiled, onRunAction }: Props) {
  if (artifact.artifact_type === "WeeklyReviewDraft") {
    return <WeeklyReviewCard artifact={artifact} projectId={projectId} onFiled={onFiled} />;
  }

  const body = (artifact.content ?? {}) as Record<string, unknown>;
  const conclusion = typeof body.conclusion === "string" ? body.conclusion : "";
  const evidence = Array.isArray(body.evidence_basis) ? (body.evidence_basis as EvidenceLine[]) : [];
  const uncertainties = strings(body, "uncertainties");
  const actions = strings(body, "next_actions");
  const fabricated = strings((body.fact_check ?? {}) as Record<string, unknown>, "numbers_not_in_tool_facts");
  const coverage = artifact.data_coverage;
  // `evidence_quotes` is written by code, not by the model: a claim that appears in it
  // really was matched back to a verbatim quote. That is the only badge worth showing.
  const verified = new Set(Object.keys(artifact.evidence_quotes ?? {}));
  const strongest = evidence.find((line) => (line.quote ?? "").trim().length > 8);
  const quote = readableQuote(strongest?.quote ?? "");

  return (
    <div className="stack">
      <div className="insight card-in" style={rise(0)}>
        <div className="insight__row">
          <Ms g="verified_user" size={20} />
          <div className="insight__col">
            <span className="insight__label">{artifact.title || STATUS_LABEL[artifact.status] || "穗奈的整理"}</span>
            {quote.text ? <p className="insight__quote">“{quote.text}”</p> : null}
            {conclusion ? <p className="insight__body">{conclusion}</p> : null}
          </div>
        </div>
      </div>

      {coverage !== null ? (
        <section className="panel card-in" style={rise(1)}>
          <div className="panel__head">
            <div className="panel__title">
              <Ms g="query_stats" size={20} />
              <span>依据覆盖度与本轮推理开销</span>
            </div>
            <div className="legend">
              <span>
                <i className="dot" />
                <span>{`${steps} 步推演`}</span>
              </span>
              <span>
                <i className="dot dot--quiet" />
                <span>{model ?? "未调用模型"}</span>
              </span>
            </div>
          </div>

          <div className="panel__grid">
            <div className="gauge">
              <Ring pct={coverage} warn={artifact.is_provisional} />
              <div className="gauge__side">
                <span className="gauge__count">{`${evidence.length} 条源句引证`}</span>
                <span className="gauge__note">{`${uncertainties.length} 项仍不确定`}</span>
                {fabricated.length ? (
                  <span className="gauge__flag gauge__flag--bad">{`${fabricated.length} 项数字缺依据，整份待补证`}</span>
                ) : artifact.is_provisional ? (
                  <span className="gauge__flag">依据不足，写入已暂缓</span>
                ) : (
                  <span className="gauge__flag">引文与结论逐条对得上</span>
                )}
              </div>
            </div>

            {usage && usage.prompt > 0 ? (
              <div className="bars">
                <Bar label="输入上下文" value={`${usage.prompt.toLocaleString()} tokens`} pct={100} />
                <Bar
                  label="其中命中缓存"
                  value={`${Math.round((usage.cached / usage.prompt) * 100)}% · ${usage.cached.toLocaleString()}`}
                  pct={(usage.cached / usage.prompt) * 100}
                  tone="container"
                />
                <Bar
                  label="思考推理"
                  value={`${usage.reasoning.toLocaleString()} tokens`}
                  pct={(usage.reasoning / usage.prompt) * 100}
                  tone="secondary"
                />
                <Bar
                  label="输出正文"
                  value={`${usage.completion.toLocaleString()} tokens`}
                  pct={(usage.completion / usage.prompt) * 100}
                  tone="tertiary"
                />
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {evidence.length ? (
        <section className="stream card-in" style={rise(2)}>
          <div className="panel__head">
            <div className="panel__title">
              <Ms g="menu_book" size={20} />
              <span>逐条提取的决策依据流</span>
            </div>
            <span className="faint t-label-sm">{`共 ${evidence.length} 条核心提炼 · 点开卡片看对应原句`}</span>
          </div>

          {evidence.map((line, index) => (
            <EvidenceRow key={`${artifact.id}-e${index}`} line={line} ordinal={index + 1} verified={verified.has(line.claim)} />
          ))}
        </section>
      ) : null}

      {uncertainties.length ? (
        <section className="stream card-in" style={rise(3)}>
          <div className="panel__head">
            <div className="panel__title">
              <Ms g="help" size={20} />
              <span>还不确定</span>
            </div>
            <span className="pill pill--warn">{`${uncertainties.length} 项`}</span>
          </div>
          {uncertainties.map((entry, index) => (
            <div className="ev" key={`${artifact.id}-u${index}`}>
              <div className="ev__lead">
                <span className="ev__index">{`疑 ${String(index + 1).padStart(2, "0")}`}</span>
                <div className="ev__main">
                  <p className="ev__body">{entry}</p>
                </div>
              </div>
            </div>
          ))}
        </section>
      ) : null}

      {actions.length ? (
        <section className="stream card-in" style={rise(4)}>
          <div className="panel__head">
            <div className="panel__title">
              <Ms g="route" size={20} />
              <span>下一步要做的</span>
            </div>
            <span className="pill pill--primary">{`共 ${actions.length} 项`}</span>
          </div>
          {actions.map((entry, index) => {
            const { title, body: detail } = splitAction(entry);
            return (
              <div className="ev" key={`${artifact.id}-a${index}`}>
                <div className="ev__top">
                  <div className="ev__lead">
                    <span className="ev__index">{`行动 ${String(index + 1).padStart(2, "0")}`}</span>
                    <div className="ev__main">
                      <div className="ev__titles">
                        <span className="ev__title">{title || entry}</span>
                        <span className="tag tag--secondary">
                          <Ms g={ROW_GLYPHS[index % ROW_GLYPHS.length]} size={12} />
                          <span>穗奈可以自己去做</span>
                        </span>
                      </div>
                      {title && detail ? <p className="ev__body">{detail}</p> : null}
                    </div>
                  </div>
                  {onRunAction ? (
                    <button className="ev__link" onClick={() => onRunAction(entry)}>
                      <span>现在就去</span>
                      <Ms g="arrow_outward" size={16} />
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </section>
      ) : null}
    </div>
  );
}

/**
 * The row is a button because its only job is to reveal the sentence behind the claim.
 * Nothing is fetched: the quote already travels with the artifact.
 */
function EvidenceRow({ line, ordinal, verified }: { line: EvidenceLine; ordinal: number; verified: boolean }) {
  const [open, setOpen] = useState(false);
  const quote = readableQuote(line.quote ?? "");

  return (
    <button className="ev" data-on={open} type="button" onClick={() => setOpen((current) => !current)}>
      <div className="ev__top">
        <div className="ev__lead">
          <span className="ev__index">{`依据 ${String(ordinal).padStart(2, "0")}`}</span>
          <div className="ev__main">
            <div className="ev__titles">
              <span className="ev__title">{line.claim}</span>
              {quote.text ? (
                <span className={verified ? "tag tag--primary" : "tag"}>{verified ? "已核验逐字引文" : "引文已附"}</span>
              ) : (
                <span className="tag tag--bad">没有原句可引</span>
              )}
            </div>
            <div className="ev__chips">
              <span className="srcchip">
                <Ms g="source" size={14} />
                <span>{line.source || "工具返回"}</span>
              </span>
            </div>
            {open && quote.text ? <p className="ev__quote">「{quote.text}」</p> : null}
            {open && quote.raw ? (
              <pre className="mono" style={{ whiteSpace: "pre-wrap", wordBreak: "break-all", margin: "4px 0 0" }}>
                {quote.raw}
              </pre>
            ) : null}
          </div>
        </div>
        <span className="ev__link">
          <span>{open ? "收起原文" : "查看原文"}</span>
          <Ms g={open ? "open_in_new" : "arrow_outward"} size={16} />
        </span>
      </div>
    </button>
  );
}

function Bar({ label, value, pct, tone }: { label: string; value: string; pct: number; tone?: string }) {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div className="bar">
      <div className="bar__head">
        <span className="bar__label">{label}</span>
        <span className="bar__value">{value}</span>
      </div>
      <div className="bar__track">
        <div className={`bar__fill${tone ? ` bar__fill--${tone}` : ""}`} style={{ width: `${clamped}%` }} />
      </div>
    </div>
  );
}

function Ring({ pct, warn }: { pct: number; warn: boolean }) {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div className="ring" data-tone={warn ? "warn" : "ok"}>
      <svg viewBox="0 0 36 36">
        <circle className="ring__track" cx="18" cy="18" fill="none" r="15.9155" strokeWidth="3.5" />
        <circle
          className="ring__arc"
          cx="18"
          cy="18"
          fill="none"
          r="15.9155"
          strokeDasharray={`${clamped}, 100`}
          strokeWidth="3.5"
        />
      </svg>
      <span className="ring__text">{clamped}%</span>
    </div>
  );
}
