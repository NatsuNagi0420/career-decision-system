"""A citation must name where it came from, in words a student reads (目标二).

Measured during the shell audit: the comparison board printed the verbatim quote and
nothing about which posting it came from, and the run header printed "100% 证据可溯源"
for any completed run. Both are the same defect — a provenance claim with no provenance.
"""

from __future__ import annotations

from typing import Any

from app.agent.service import _cite
from app.db.domain import EvidenceItem, Job, JobRequirementItem


class _Rows:
    """Stands in for the session: `_cite` resolves one pointer at a time and reads nothing else."""

    def __init__(self, rows: dict[tuple[str, Any], Any]) -> None:
        self._rows = rows

    def get(self, model: type, pk: Any) -> Any:
        return self._rows.get((model.__name__, pk))


def _evidence(**overrides: Any) -> EvidenceItem:
    base: dict[str, Any] = {
        "user_id": 7,
        "project_id": "p1",
        "kind": "job_signal",
        "statement": "这条岗位要 SQL",
        "quote": "熟练使用 SQL 完成多表关联取数",
        "source_ref": {},
        "source": "requirement",
    }
    base.update(overrides)
    return EvidenceItem(**base)


def test_a_requirement_line_names_the_posting_it_was_written_on() -> None:
    job = Job(title="初级数据分析师", company="A 公司", city="广州", salary_text="9-13k")
    row = JobRequirementItem(job_id=1, original_text="熟练使用 SQL 完成多表关联取数", sort_order=2)
    session = _Rows({("Job", 1): job, ("JobRequirementItem", 11): row})
    cite = _cite(
        session,  # type: ignore[arg-type]
        _evidence(source_ref={"table": "job_requirement_items", "id": 11}, source="requirement"),
    )
    assert cite["origin"] == "初级数据分析师｜岗位要求第 2 条", cite["origin"]
    assert cite["quote"] == "熟练使用 SQL 完成多表关联取数"


def test_a_job_row_cite_reads_like_the_job_it_points_at() -> None:
    job = Job(title="后端开发工程师", company="C 公司", city="广州", salary_text="12-18k")
    session = _Rows({("Job", 5): job})
    cite = _cite(session, _evidence(source_ref={"table": "jobs", "id": 5}, source="job"))  # type: ignore[arg-type]
    assert cite["origin"] == "后端开发工程师｜C 公司｜广州｜12-18k"


def test_a_quote_with_no_row_behind_it_says_so_instead_of_looking_sourced() -> None:
    """The honest branch. A blank origin would render as a quote that appears to have a
    source; the whole point of the field is that absence is visible."""
    session = _Rows({})
    cite = _cite(session, _evidence(source_ref={}, source="user", quote=""))  # type: ignore[arg-type]
    assert cite["origin"].startswith("未挂来源行")
    assert "你给的画像事实" in cite["origin"]
    # With no verbatim text, the quote degrades to the statement — never to empty.
    assert cite["quote"] == "这条岗位要 SQL"
