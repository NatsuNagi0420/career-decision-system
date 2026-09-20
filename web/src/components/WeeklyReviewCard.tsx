import { useState } from "react";
import {
  api,
  newRequestId,
  type ApiError,
  type ArtifactEntry,
  type ConfidenceTrend,
  type WeeklyReviewInput,
} from "../api/client";
import { Ms } from "./Ms";
import { readableQuote } from "../state/readable";

interface EvidenceLine {
  claim: string;
  quote?: string;
  source?: string;
}

/** The five editable fields, named exactly like the request body they turn into. */
export interface ReviewForm {
  week_start: string;
  body: string;
  confidence_trend: ConfidenceTrend;
  confidence_reason: string;
  next_focus: string;
}

export const TRENDS: Array<{ value: ConfidenceTrend; label: string }> = [
  { value: "up", label: "更清晰" },
  { value: "flat", label: "持平" },
  { value: "down", label: "更不确定" },
];

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** Monday of the week `day` falls in. Sunday closes the week it started, not the next
 *  one, so the shift wraps rather than going negative. */
export function mondayOf(day: Date): string {
  const monday = new Date(day.getFullYear(), day.getMonth(), day.getDate());
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  return `${monday.getFullYear()}-${pad(monday.getMonth() + 1)}-${pad(monday.getDate())}`;
}

function strings(content: Record<string, unknown>, key: string): string[] {
  const value = content[key];
  return Array.isArray(value) ? value.map(String).filter((entry) => entry.trim().length > 0) : [];
}

function text(content: Record<string, unknown>, key: string): string {
  const value = content[key];
  return typeof value === "string" ? value : "";
}

function evidenceOf(content: Record<string, unknown>): EvidenceLine[] {
  return Array.isArray(content.evidence_basis) ? (content.evidence_basis as EvidenceLine[]) : [];
}

/**
 * The draft, turned into what the person sees in the boxes. The gaps the draft admits
 * are appended to the body rather than hidden under a fold: a review that quietly drops
 * "我还没确认" would read as a record of something settled.
 */
export function prefill(content: Record<string, unknown>, today = new Date()): ReviewForm {
  const gaps = strings(content, "uncertainties");
  const trend = text(content, "confidence_trend");
  return {
    week_start: mondayOf(today),
    body: [text(content, "conclusion"), gaps.length ? `还没确认：${gaps.join("；")}` : ""].filter(Boolean).join("\n"),
    confidence_trend: TRENDS.some((entry) => entry.value === trend) ? (trend as ConfidenceTrend) : "flat",
    confidence_reason: text(content, "confidence_reason"),
    next_focus: text(content, "next_focus"),
  };
}

/** The request body, assembled in one place so the keys can be read off the contract. */
export function toPayload(form: ReviewForm, requestId: string, sourceRunId: string): WeeklyReviewInput {
  return {
    week_start: form.week_start,
    body: form.body.trim(),
    confidence_trend: form.confidence_trend,
    confidence_reason: form.confidence_reason.trim(),
    next_focus: form.next_focus.trim(),
    ...(sourceRunId ? { source_run_id: sourceRunId } : {}),
    request_id: requestId,
  };
}

interface Props {
  artifact: ArtifactEntry;
  /** A week closes under one project; without a project there is nothing to file into. */
  projectId: string | null;
  onFiled: () => void;
}

/**
 * The draft of a week review as it should arrive: a proposal addressed to the person,
 * not a record. `weekly_review` is R3, so nothing here exists in the database until they
 * press the button — which is why the button says whose write it is.
 *
 * Every field is prefilled from her draft and editable. She chose the words, they choose
 * what becomes this week's account of it.
 */
export function WeeklyReviewCard({ artifact, projectId, onFiled }: Props) {
  const content = (artifact.content ?? {}) as Record<string, unknown>;
  const [form, setForm] = useState<ReviewForm>(() => prefill(content));
  // One id for the life of this card: a second press is the same confirmation, so the
  // server answers `duplicate` instead of closing the week twice.
  const [requestId] = useState(newRequestId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filed, setFiled] = useState<"filed" | "duplicate" | null>(null);

  const evidence = evidenceOf(content).filter((line) => readableQuote(line.quote ?? "").text);
  const writable = form.body.trim().length >= 2 && form.body.trim().length <= 4000;

  const submit = async () => {
    if (!projectId || busy || filed || !writable) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const outcome = await api.confirmWeeklyReview(projectId, toPayload(form, requestId, artifact.run_id));
      setFiled(outcome.duplicate ? "duplicate" : "filed");
      onFiled();
    } catch (cause) {
      const failure = cause as ApiError;
      // A week already closed elsewhere, or a project that is gone, already says so in
      // Chinese: that sentence is the useful one, so it goes up as written.
      setError(
        failure.status === 409 || failure.status === 404
          ? failure.message
          : `这一周没有写入（${failure.message}），改完再按一次。`,
      );
    } finally {
      setBusy(false);
    }
  };

  const set = (patch: Partial<ReviewForm>) => setForm((current) => ({ ...current, ...patch }));

  return (
    <section className={`wreview${filed ? " wreview--done" : ""}`}>
      <div className="wreview__head">
        <span className="agenthead__logo wreview__icon">
          <Ms g={filed ? "task_alt" : "event_note"} size={18} />
        </span>
        <div>
          <h3 className="t-title-sm">{filed ? "本周复盘已写入" : "穗奈起草了本周复盘"}</h3>
          <p className="t-label-sm faint">
            {filed === "duplicate"
              ? "这一周已经记上了，同一件事没有写第二遍。"
              : filed
                ? "库里已经有了，改主意就重写下一周。"
                : "草稿只是草稿：库里还没有这一周，下面每一栏都能改。"}
          </p>
        </div>
      </div>

      <label className="wreview__field">
        <span className="wreview__label">本周复盘正文</span>
        <textarea
          disabled={busy || Boolean(filed)}
          maxLength={4000}
          value={form.body}
          onChange={(event) => set({ body: event.target.value })}
        />
      </label>

      <div className="wreview__field">
        <span className="wreview__label">信心趋势</span>
        <div className="seg">
          {TRENDS.map((entry) => (
            <button
              className="seg__btn"
              data-on={form.confidence_trend === entry.value}
              disabled={busy || Boolean(filed)}
              key={entry.value}
              type="button"
              onClick={() => set({ confidence_trend: entry.value })}
            >
              <span>{entry.label}</span>
            </button>
          ))}
        </div>
      </div>

      <label className="wreview__field">
        <span className="wreview__label">为什么这么判断</span>
        <input
          disabled={busy || Boolean(filed)}
          maxLength={2000}
          placeholder="哪一件事让这一周的判断变了"
          value={form.confidence_reason}
          onChange={(event) => set({ confidence_reason: event.target.value })}
        />
      </label>

      <label className="wreview__field">
        <span className="wreview__label">下周最该验证的一件事</span>
        <input
          disabled={busy || Boolean(filed)}
          maxLength={2000}
          placeholder="下周带回来的那个东西"
          value={form.next_focus}
          onChange={(event) => set({ next_focus: event.target.value })}
        />
      </label>

      <label className="wreview__field">
        <span className="wreview__label">本周起始日</span>
        <input
          className="wreview__date"
          disabled={busy || Boolean(filed)}
          type="date"
          value={form.week_start}
          onChange={(event) => set({ week_start: event.target.value })}
        />
      </label>

      {evidence.length ? (
        <details className="wreview__cites">
          <summary>
            <Ms g="format_quote" size={14} />
            <span>{`草稿引了 ${evidence.length} 句原话`}</span>
          </summary>
          <ul>
            {evidence.map((line, index) => {
              const quote = readableQuote(line.quote ?? "");
              return (
                <li key={`${artifact.id}-w${index}`}>
                  <span className="wreview__cite">“{quote.text}”</span>
                  <span className="faint t-label-sm">{`${line.claim}${line.source ? ` · ${line.source}` : ""}`}</span>
                </li>
              );
            })}
          </ul>
        </details>
      ) : null}

      {error ? <p className="tasks__error">{error}</p> : null}

      {filed ? null : (
        <p className="wreview__claim">
          <Ms g="person" size={14} />
          <span>{projectId ? "这一步穗奈做不了：写入本周复盘的只能是你。" : "先在左边选一个决策项目，这一周才有地方落。"}</span>
        </p>
      )}

      <div className="actions">
        <button
          className="btn btn--primary"
          disabled={busy || Boolean(filed) || !writable || !projectId}
          onClick={() => void submit()}
        >
          <Ms g={filed ? "check" : "edit_calendar"} size={18} />
          <span>{filed ? "已写入本周复盘" : busy ? "写入中…" : "确认并写入本周复盘"}</span>
        </button>
      </div>
    </section>
  );
}
