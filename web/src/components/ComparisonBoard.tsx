import { useEffect, useState, type CSSProperties } from "react";
import { api, type ComparisonCell, type ComparisonRound } from "../api/client";
import { Ms } from "./Ms";

const rise = (index: number): CSSProperties => ({ "--i": String(index) }) as CSSProperties;

const VERDICT: Record<string, { label: string; cls: string; glyph: string }> = {
  supported: { label: "有证据支持", cls: "tag tag--primary", glyph: "verified_user" },
  partial: { label: "只对上一点", cls: "tag tag--secondary", glyph: "contrast" },
  missing: { label: "还缺证据", cls: "tag tag--missing", glyph: "help" },
  contradicted: { label: "有证据反对", cls: "tag tag--bad", glyph: "report" },
};

export interface CellShift {
  cell: string;
  from: string;
  to: string;
}

/** What actually moved between two stored rounds.
 *
 * Only verdict changes are listed: a score that shifted because one more JD quote
 * matched the same yardstick is noise next to "this cell went from 缺证据 to 支持", and
 * the person needs the second one to trust (or reject) the new conclusion. */
export function verdictShifts(previous: ComparisonRound | null, current: ComparisonRound): CellShift[] {
  if (!previous) {
    return [];
  }
  const before = new Map(previous.cells.map((cell) => [`${cell.candidate}|${cell.criterion}`, cell.verdict]));
  return current.cells
    .map((cell) => ({
      cell: `${cell.candidate} · ${cell.criterion}`,
      from: before.get(`${cell.candidate}|${cell.criterion}`) ?? null,
      to: cell.verdict,
    }))
    .filter((shift): shift is CellShift & { from: string } => shift.from !== null && shift.from !== shift.to)
    .map((shift) => ({ cell: shift.cell, from: verdictOf(shift.from).label, to: verdictOf(shift.to).label }));
}

export function verdictOf(verdict: string | null) {
  return VERDICT[verdict ?? ""] ?? { label: verdict ?? "未判定", cls: "tag", glyph: "help" };
}

interface Props {
  projectId: string | null;
  /** Bumped whenever the feed reloads, which is how a round the person just approved
   *  appears here without a second click. */
  revision: number;
}

/**
 * The comparison as it is stored, not as the run described it: one row per cell with
 * what spoke for it, what spoke against it, and what is still missing — and the
 * previous version left in place underneath so "why did the answer move" has an answer.
 */
export function ComparisonBoard({ projectId, revision }: Props) {
  const [rounds, setRounds] = useState<ComparisonRound[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [openRound, setOpenRound] = useState<number | null>(null);

  useEffect(() => {
    if (!projectId) {
      setRounds([]);
      return;
    }
    let alive = true;
    api
      .comparison(projectId)
      .then((board) => {
        if (alive) {
          setRounds(board);
        }
      })
      .catch(() => {
        if (alive) {
          setRounds([]);
        }
      });
    return () => {
      alive = false;
    };
  }, [projectId, revision]);

  if (!rounds.length) {
    return null;
  }

  return (
    <section className="stack">
      {rounds.map((round, index) => {
        // `rounds` is newest first, so the round this one replaced sits at index + 1.
        const changes = verdictShifts(rounds[index + 1] ?? null, round);
        // Only the current version is unfolded. The older ones stay one line each —
        // present, comparable, but not competing with the answer in force.
        const visible = index === 0 || openRound === round.round_no;
        return (
          <div className="stream" key={round.round_no} style={rise(index)}>
            <div className="panel__head">
              <div className="panel__title">
                <Ms g="compare_arrows" size={20} />
                <span>{`多标准比较 · 第 ${round.round_no} 版${index === 0 ? "（当前）" : "（已被取代）"}`}</span>
              </div>
              <span className={round.is_provisional ? "pill pill--warn" : "pill pill--quiet"}>
                {round.is_provisional ? "依据不足，临时结论" : "已写入"}
              </span>
            </div>

            {round.conclusion ? <p className="ev__body">{round.conclusion}</p> : null}
            {round.supersedes_id ? (
              <p className="faint t-label-sm">
                {changes.length
                  ? `这一版相对上一版有 ${changes.length} 格的判定变了：${changes.map((shift) => `${shift.cell} ${shift.from} → ${shift.to}`).join("；")}`
                  : "这一版相对上一版没有格的判定发生变化"}
              </p>
            ) : null}

            {visible ? (
              round.cells.map((cell, position) => (
                <CellRow
                  key={`${round.round_no}-${cell.candidate}-${cell.criterion}`}
                  cell={cell}
                  index={position}
                  open={open === `${round.round_no}-${cell.candidate}-${cell.criterion}`}
                  roundNo={round.round_no}
                  onToggle={(id) => setOpen((current) => (current === id ? null : id))}
                />
              ))
            ) : (
              <button className="ev" type="button" onClick={() => setOpenRound(round.round_no)}>
                <div className="ev__lead">
                  <span className="ev__index">{`${round.cells.length} 格`}</span>
                  <div className="ev__main">
                    <span className="ev__title">看这一版当时怎么判的</span>
                  </div>
                </div>
                <span className="ev__link">
                  <span>展开</span>
                  <Ms g="expand_more" size={16} />
                </span>
              </button>
            )}
          </div>
        );
      })}
    </section>
  );
}

interface RowProps {
  cell: ComparisonCell;
  index: number;
  open: boolean;
  roundNo: number;
  onToggle: (id: string) => void;
}

/**
 * The row is a button because its job is to reveal the sentences behind the verdict.
 * Nothing is fetched: the quotes travel with the cell, and they are the stored verbatim
 * text rather than a restatement of it.
 */
function CellRow({ cell, index, open, roundNo, onToggle }: RowProps) {
  const id = `${roundNo}-${cell.candidate}-${cell.criterion}`;
  const verdict = verdictOf(cell.verdict);
  const cites = [...cell.for_it.map((cite) => ({ cite, against: false })), ...cell.against.map((cite) => ({ cite, against: true }))];

  return (
    <button className="ev" data-on={open} type="button" onClick={() => onToggle(id)}>
      <div className="ev__top">
        <div className="ev__lead">
          <span className="ev__index">{`格 ${String(index + 1).padStart(2, "0")}`}</span>
          <div className="ev__main">
            <div className="ev__titles">
              <span className="ev__title">{`${cell.candidate} · ${cell.criterion}`}</span>
              <span className={verdict.cls}>
                <Ms g={verdict.glyph} size={12} />
                <span>{verdict.label}</span>
              </span>
              <span className="tag">{`${cell.score ?? 0}/5 条对上`}</span>
            </div>
            {cell.note ? <p className="ev__body">{cell.note}</p> : null}
            {open ? (
              cites.length ? (
                cites.map(({ cite, against }, position) => (
                  <p className="ev__quote" key={`${id}-c${position}`}>
                    {`${against ? "反对：" : "支持："}「${cite.quote}」`}
                    {/* The sentence alone is only half of 目标二: a quote whose origin is
                        not stated cannot be checked, which is the difference between a
                        source and a confident-sounding line. */}
                    {cite.origin ? <span className="ev__origin">{`— ${cite.origin}`}</span> : null}
                  </p>
                ))
              ) : (
                <p className="ev__quote">这一格既没有支持也没有反对的引文</p>
              )
            ) : null}
          </div>
        </div>
        <span className="ev__link">
          <span>{open ? "收起引文" : `看引文（${cites.length}）`}</span>
          <Ms g={open ? "expand_less" : "expand_more"} size={16} />
        </span>
      </div>
    </button>
  );
}
