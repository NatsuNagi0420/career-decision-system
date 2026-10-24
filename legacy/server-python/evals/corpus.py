"""Can a cited quote actually be found in the text this run read?

目标二 asks for conclusions traceable to source text, but nothing in the codebase
checked it: `Artifact.evidence_quotes` is a `{claim: quote}` map written by the
model, and the only place that refused to trust a payload was `CollectEvidence`
re-reading the `TaskResult` row. This is that check, lifted out of one executor and
made a scorer.

Three decisions here come from the first 38-case baseline, which scored 6/129 and so
reported "the model invents its citations". It did not, and the difference matters
more than the number:

* **Scope.** A quote was looked for only among the rows *the artifact itself* cited,
  while the claim being measured is about rows *the run read*. A direction brief
  cites 3 jobs and quotes a skill list it read from the direction row — a real quote
  scored as a fabrication. Searching every `source_ref` in the run's own tool frames
  moved 6 findable quotes to 108 of 173. The artifact-only answer is still recorded
  separately (`only_in_run`), because "the citation doesn't name its own row" is a
  real gap; it just isn't the same gap as "this text was made up".
* **Whole row, not a whitelist.** The first version read two hand-picked columns per
  table, so a quote of a job's company or salary band could never be found. The
  tools hand the model the row, so the corpus is the row.
* **Tiers, not a verdict.** `verbatim` / `insensitive` / `recomposed` stay separate:
  a report that says "traceable" has to be able to say how many quotes needed the
  punctuation thrown away, or the fields re-joined, to land.
"""

from __future__ import annotations

import json
import re
import unicodedata
from dataclasses import dataclass, field
from typing import Any, Literal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import domain  # noqa: F401  — registers the business tables on Base
from app.db.models import Artifact, Base

Tier = Literal["verbatim", "insensitive", "recomposed", "too_short", "unmatched", "unresolvable"]

# Punctuation and spacing differ between how a JD is written and how a model copies
# it. Dropping them is a looser read, so it gets its own tier instead of being
# folded into "verbatim" — a report that says 95% valid must be able to say how many
# of those only matched after the punctuation was thrown away.
_INSENSITIVE = re.compile(r"[\s，,。.、；;：:！!？?“”\"'‘’（）()《》〈〉【】\[\]{}\-—–_·+*/\\|~`@#$%^&=<>]+")

#: A one-or-two-character "quote" matches a row by accident. It is counted, not
#: credited — `0` and `missing` prove nobody read anything.
MIN_QUOTE_CHARS = 4

#: Cached per `CellIndex`, and a `CellIndex` lives for exactly one case (or one run when
#: re-scoring). A module-global cache keyed by `(table, id)` served a stale row the moment
#: an id was reused after a truncate — which is how the first version made two genuine
#: quotes read as fabricated inside the test session.
class CellIndex:
    def __init__(self, session: Session) -> None:
        self.session = session
        self._rows: dict[tuple[str, str, str], dict[str, str] | None] = {}

    def cells(self, ref: dict[str, Any]) -> dict[str, str] | None:
        """Every text-bearing cell of the referenced row, keyed by column name.

        None means "we cannot look this up" (unknown table, no id in the ref). That stays
        a separate outcome from "the model invented this" — the two are different findings
        and must not share a bucket.
        """
        table_name = str(ref.get("table") or "")
        table = Base.metadata.tables.get(table_name)
        key = _key(ref)
        if table is None or key is None:
            return None
        if key in self._rows:
            return self._rows[key]

        primary = next(iter(table.primary_key.columns), None)
        if primary is None:
            return None
        column = table.c.job_id if key[1] == "job_id" and "job_id" in table.c else primary
        rows = self.session.execute(select(table).where(column == key[2])).all()

        cells: dict[str, str] = {}
        for row in rows:
            for field_column in table.columns:
                item = getattr(row, field_column.name, None)
                if item is None or (isinstance(item, str) and not item.strip()):
                    continue
                text = json.dumps(item, ensure_ascii=False, default=str) if isinstance(item, (list, dict)) else str(item)
                cells[field_column.name] = f"{cells.get(field_column.name, '')}\n{text}".strip()
        self._rows[key] = cells or None
        return self._rows[key]


@dataclass(frozen=True)
class QuoteCheck:
    tier: Tier
    detail: str = ""
    #: "artifact": a row this artifact cites; "run": a row another tool call of the same
    #: run returned; "payload": only in the text a tool handed the model (its envelope —
    #: counts, statuses, the scoring rule), which is real reading but not a business row.
    found_in: str = ""

    @property
    def cited(self) -> bool:
        return self.tier in {"verbatim", "insensitive", "recomposed"}


@dataclass
class EvidenceScore:
    total: int = 0
    verbatim: int = 0
    insensitive: int = 0
    recomposed: int = 0
    too_short: int = 0
    unmatched: int = 0
    unresolvable: int = 0
    #: Traceable, but not to a row this artifact's own `source_refs` name.
    only_in_run: int = 0
    #: Traceable only to a tool's envelope — a count, a status, the tool's own rule text.
    only_in_payload: int = 0
    #: The first few failures, so a report can show what went wrong instead of only
    #: how many things did.
    samples: list[str] = field(default_factory=list)

    @property
    def valid(self) -> int:
        return self.verbatim + self.insensitive + self.recomposed

    @property
    def strict_ratio(self) -> float:
        """Only quotes copied without even a punctuation difference."""
        return self.verbatim / self.total if self.total else 1.0

    @property
    def ratio(self) -> float:
        return self.valid / self.total if self.total else 1.0

    @property
    def verifiable(self) -> int:
        """Quotes long enough to mean something. The denominator every ratio here uses."""
        return self.total - self.too_short


def _fold(value: str) -> str:
    """Fullwidth and halfwidth are the same text to a reader.

    `｜` (U+FF5C) is what the job tool actually joins fields with, and it is not in
    `_INSENSITIVE` — without folding, a field-for-field faithful quote of a real row
    fails both the substring check and the fragment check, and gets reported as
    invented. NFKC maps it onto the ASCII bar the class does cover.
    """
    return unicodedata.normalize("NFKC", value)


def _normalise(value: str) -> str:
    return _INSENSITIVE.sub("", _fold(value)).lower()


def _key(ref: dict[str, Any]) -> tuple[str, str, str] | None:
    """How one `source_ref` names a row, or None if it doesn't name one."""
    table_name = str(ref.get("table") or "")
    # `job_requirement_items` refs are keyed by the owning job plus a text prefix, not
    # by the item's own id (`domain.py:225`), so they join on `job_id` instead.
    if table_name == "job_requirement_items" and ref.get("job_id") is not None:
        return table_name, "job_id", str(ref["job_id"])
    if ref.get("id") is not None:
        return table_name, "id", str(ref["id"])
    return None


def _tier_of(quote: str, needle: str, cells: dict[str, str]) -> Tier | None:
    """Best tier for one row: the whole string, then punctuation, then re-joined fields.

    The first two tiers are decided **per cell**. Matching against the row's cells glued
    together lets a quote that spans several columns pass as merely punctuation-shifted,
    and then `recomposed` — the tier that says "the model restated this row rather than
    copying it" — can never be reached. That distinction is the whole point of tiers.
    """
    quote = _fold(quote)
    folded = [_fold(text) for text in cells.values()]
    if any(quote in text for text in folded):
        return "verbatim"
    if any(needle in _normalise(text) for text in folded):
        return "insensitive"
    normalised = _normalise("\n".join(folded))
    # `前端开发｜成都｜2-3万` quoted a real row field by field. Every piece still has to be
    # there, so invented content keeps failing; this forgives only the separators and
    # labels the tool's own rendering put between them.
    fragments = [bit for bit in (_normalise(part) for part in _INSENSITIVE.split(quote)) if len(bit) >= 2]
    if len(fragments) > 1 and all(bit in normalised for bit in fragments):
        return "recomposed"
    return None


def check_quote(
    session: Session,
    refs: list[dict[str, Any]],
    quote: str,
    *,
    run_refs: list[dict[str, Any]] = (),
    read_texts: list[str] = (),
    index: CellIndex | None = None,
) -> QuoteCheck:
    """Where does this quote live: the artifact's rows, the run's rows, the tool's own
    reply text, or nowhere?"""
    needle = _normalise(quote or "")
    if not needle:
        return QuoteCheck("unmatched", "引用为空")
    if len(needle) < MIN_QUOTE_CHARS:
        return QuoteCheck("too_short", f"引用去掉标点只剩 {len(needle)} 个字符，核对不了")

    looked_any = False
    scopes: list[tuple[str, dict[str, str]]] = []
    cells_index = index or CellIndex(session)
    for scope, scope_refs in (("artifact", refs), ("run", run_refs)):
        for ref in scope_refs:
            cells = cells_index.cells(ref)
            if cells is None:
                continue
            looked_any = True
            if cells:
                scopes.append((scope, cells))
    scopes.extend(("payload", {"tool_result": text}) for text in read_texts if text.strip())

    for scope, cells in scopes:
        tier = _tier_of(str(quote or "").strip(), needle, cells)
        if tier is not None:
            return QuoteCheck(tier, found_in=scope)
    if not looked_any:
        return QuoteCheck("unresolvable", f"引用指向查不到的表：{[r.get('table') for r in refs]}")
    return QuoteCheck("unmatched", "这句话不在这一轮读过的任何一行或任何一份工具回执里")


def score_artifact(
    session: Session,
    artifact: Artifact,
    run_refs: list[dict[str, Any]] = (),
    read_texts: list[str] = (),
    index: CellIndex | None = None,
) -> EvidenceScore:
    """Score every quote the synthesis attached to this artifact."""
    score = EvidenceScore()
    refs = list(artifact.source_refs or [])
    cells_index = index or CellIndex(session)
    for claim, quote in (artifact.evidence_quotes or {}).items():
        score.total += 1
        check = check_quote(session, refs, str(quote or ""), run_refs=run_refs, read_texts=read_texts, index=cells_index)
        setattr(score, check.tier, getattr(score, check.tier) + 1)
        if check.cited and check.found_in == "run":
            score.only_in_run += 1
        if check.cited and check.found_in == "payload":
            score.only_in_payload += 1
        if not check.cited and check.tier != "too_short" and len(score.samples) < 3:
            score.samples.append(f"{str(claim)[:40]} → “{str(quote)[:60]}”（{check.detail or check.tier}）")
    return score
