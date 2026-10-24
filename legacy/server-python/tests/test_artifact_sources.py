"""The artifact must name the rows its quotes came from, not just the tools it called.

目标二's first acceptance line is "所有要求证据的 Artifact 都包含来源引用". Measured before this
test existed, `artifact.source_refs` held exactly two kinds of entry — the run id and the
tool names (`graph.py:628`) — so a quoted job requirement was only traceable by replaying
the run's durable events. §34 counted that gap: 44 of 70 quotes in one rerun lived in the
payload text (`only_in_payload`) rather than in the artifact's own references.

Attribution is code's job here on purpose: if the model named the row, a row it never read
could be cited.
"""

from __future__ import annotations

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker

from app.agent.graph import _attribute_quotes
from app.db.domain import Job
from app.db.models import Artifact, User
from tests.test_run_lifecycle import build_service, digest_payload, text_payload, tool_payload


@pytest.fixture
def owner(session_factory: sessionmaker[Session]) -> User:
    with session_factory() as session:
        row = User(username="source-owner", password_hash="x")
        session.add(row)
        session.commit()
        session.refresh(row)
        return row


def test_a_quote_binds_the_rows_the_tool_that_answered_it_read() -> None:
    row = {"job_id": "7", "title": "数据分析师", "line": "数据分析师｜B 公司｜广州｜10-15k"}
    facts = {"get_job_samples": {"count": 1, "samples": [row]}}
    traced = {"get_job_samples": [{"table": "jobs", "id": "7"}]}
    quotes = {"要看市场": "数据分析师｜B 公司｜广州｜10-15k"}
    claims, refs = _attribute_quotes(quotes, facts, traced)

    assert claims == {"要看市场": ["get_job_samples"]}, "出处由代码从模型看到过的回执里认出来"
    assert refs == [{"table": "jobs", "id": "7"}], "成果物自己就带着被引过的那一行"


def test_punctuation_and_width_do_not_break_a_bind() -> None:
    """The model may copy a sentence with its own separators; that is 换标点, not a lie."""
    facts = {"get_requirement_items": {"count": 1, "items": [{"item_id": "3", "original_text": "熟悉 SQL、Python"}]}}
    traced = {"get_requirement_items": [{"table": "job_requirement_items", "id": "3"}]}
    _, refs = _attribute_quotes({"要求": "熟悉 SQL, Ｐｙｔｈｏｎ"}, facts, traced)

    assert refs == [{"table": "job_requirement_items", "id": "3"}]


def test_a_quote_no_tool_answered_with_binds_nothing() -> None:
    """The honest answer to "where did this come from" is silence, not a plausible table."""
    facts = {"get_job_samples": {"count": 1, "samples": [{"title": "数据分析师"}]}}
    traced = {"get_job_samples": [{"table": "jobs", "id": "7"}]}
    claims, refs = _attribute_quotes({"编的": "深圳 数据分析 应届可投"}, facts, traced)

    assert claims == {} and refs == []


def test_a_failed_tool_call_never_lends_its_rows_to_a_quote() -> None:
    """`traced` is built from `tool_trace` rows where `ok` is true, so an errored call's
    refs are already absent — this pins the shape the caller relies on."""
    facts = {"get_job_samples": {"count": 1, "samples": [{"title": "数据分析师"}]}}
    claims, refs = _attribute_quotes({"要看": "数据分析师"}, facts, traced={"get_job_samples": []})

    assert claims == {"要看": ["get_job_samples"]}, "答过内容的工具仍然算出处，只是它没给行指针"
    assert refs == []


async def test_a_run_leaves_the_quoted_row_on_its_own_artifact(session_factory, settings, tmp_path, owner) -> None:
    """The wiring, not the helper: `tool_trace` has to arrive at `persist_draft` carrying refs.

    Without this the guarantee lives only in a unit test over a pure function plus the
    claim that `run_tools` returns `tool_trace` — exactly the "列在、值在、没人读" shape
    this repo keeps tripping over.
    """

    with session_factory() as session:
        job = Job(
            title="初级数据分析师",
            company="A 公司",
            city="广州",
            salary_text="9-13k",
            salary_min=9,
            salary_max=13,
            description="负责取数与看板",
            quality_score=90,
        )
        session.add(job)
        session.commit()
        job_id = str(job.id)

    script = [
        tool_payload("get_job_samples", {"keyword": "数据分析师", "city": "广州", "limit": 3}),
        text_payload("看过广州的岗位样本"),
        digest_payload("广州有可比岗位", actions=["记录：先抄原句"], quote="初级数据分析师"),
    ]
    async with build_service(
        settings, session_factory, script, tmp_path / "cp.sqlite", capability_ids=("direction_explore",)
    ) as (service, _provider):
        run = service.create_run(owner, "看看广州的数据岗", capability_id="direction_explore")
        final = await service.start(run, allow_external_ai=True)

    assert final["status"] == "completed"
    with session_factory() as session:
        artifact = session.scalars(select(Artifact).where(Artifact.run_id == run.id)).one()
        refs = artifact.source_refs

    assert {"table": "jobs", "id": job_id} in refs, "成果物自己就写着：这句话来自 jobs 表的哪一行"
    assert artifact.content["evidence_basis"][0]["source_tools"] == ["get_job_samples"]
