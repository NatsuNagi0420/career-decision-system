"""P1-4: a comparison that is stored, versioned, and readable by the next round.

Two failures this closes. `comparison_results` had one row per cell forever, so a new
conclusion could only overwrite the old one — and nothing at all read the table, so
even that was invisible. The scoring rule stays in code (`_build_matrix`, the same one
the model read through `compare_candidates`); what the model may choose is which
evidence it thinks speaks *against* a cell, and those are pointers that must resolve.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker

from app.agent.executors import apply_executor, build_proposal, payload_error
from app.capabilities.registry import get_capability
from app.config import Settings
from app.db.domain import (
    ComparisonCriterion,
    ComparisonResult,
    DecisionCandidate,
    DecisionProject,
    EvidenceItem,
)
from app.db.models import Artifact, Proposal, Run, User
from app.main import create_app
from app.security import hash_password
from app.tools.domain import CompareCandidates, _keywords
from tests.support import call_tool

CRITERIA = ["SQL 与统计", "真实项目经验"]


@pytest.fixture
def client(settings: Settings, engine) -> TestClient:
    with TestClient(create_app(settings)) as test_client:
        yield test_client


def register(client: TestClient, username: str) -> dict[str, str]:
    response = client.post(
        "/api/v1/auth/register",
        json={"username": username, "password": "long-enough-1", "external_ai_consent": False},
    )
    assert response.status_code == 201, response.text
    return {"Authorization": f"Bearer {response.json()['token']}"}


def _proposed(analyst_id: str, *, opposes: list[str] | None = None, score: int | None = None, wrong_target: bool = False) -> dict:
    """A `proposed` block shaped the way `compare_candidates` speaks: candidate_id + criterion."""
    cell: dict = {
        "criterion": "SQL 与统计",
        "candidate_id": "0000000000000000000000000000" if wrong_target else analyst_id,
        "note": "只有 JD 要求",
    }
    if opposes:
        cell["opposes"] = opposes
    if score is not None:
        # The model is not allowed to score. Extra keys are dropped by the schema, so
        # this must not reach the table.
        cell["score"] = score
    return {"criteria": CRITERIA, "cells": [cell]}


def _round(session: Session, matrix: dict, proposed: dict, *, thread: str, title: str) -> tuple[Run, Proposal]:
    """A synthesis answer turned into the proposal a person would be shown, then applied."""
    run = Run(
        thread_id=thread,
        user_id=matrix["user_id"],
        goal="比较两个方向",
        capability_id="compare_decide",
        project_id=matrix["project_id"],
    )
    session.add(run)
    session.flush()
    artifact = Artifact(
        run_id=run.id, user_id=matrix["user_id"], artifact_type="ComparisonMatrix", title=title, source_refs=[]
    )
    session.add(artifact)
    session.flush()
    proposal = build_proposal(
        get_capability("compare_decide"), run, artifact, {"conclusion": "先看证据", "proposed": proposed}
    )
    assert proposal is not None, "compare_decide 现在必须能提出落表提案"
    session.add(proposal)
    session.flush()
    return run, proposal


@pytest.fixture
def matrix(session_factory: sessionmaker[Session]) -> dict:
    """One project, two candidates, and evidence that only reaches one of them."""
    with session_factory() as session:
        user = User(username="decider", password_hash=hash_password("long-enough-1"))
        session.add(user)
        session.flush()
        project = DecisionProject(user_id=user.id, title="分析还是后端", question="我更适合哪个方向")
        session.add(project)
        session.flush()
        analyst = DecisionCandidate(project_id=project.id, name="数据分析师")
        backend = DecisionCandidate(project_id=project.id, name="后端工程师")
        session.add_all([analyst, backend])
        session.flush()
        evidence = EvidenceItem(
            user_id=user.id,
            project_id=project.id,
            candidate_id=analyst.id,
            kind="job_signal",
            # Deliberately does not repeat the standard's name: a fixture that quoted the
            # criterion back to itself would pass even when nothing could match in real
            # JD prose, which is how the compound-standard defect stayed hidden.
            statement="入门岗 JD 的硬性门槛",
            quote="熟练使用 SQL 完成数据清洗，并具备基本的统计能力",
            source_ref={},
            source="agent",
            request_id="cmp-ev",
        )
        session.add(evidence)
        session.commit()
        return {
            "user_id": user.id,
            "project_id": project.id,
            "analyst_id": analyst.id,
            "backend_id": backend.id,
            "evidence_id": evidence.id,
        }


def rows(session_factory, project_id: str) -> list[ComparisonResult]:
    with session_factory() as session:
        return list(
            session.scalars(
                select(ComparisonResult).where(ComparisonResult.project_id == project_id).order_by(
                    ComparisonResult.round_no, ComparisonResult.criterion_id, ComparisonResult.candidate_id
                )
            )
        )


def test_one_approval_lands_one_round_of_every_cell(matrix, session_factory) -> None:
    with session_factory() as session:
        run, proposal = _round(session, matrix, _proposed(matrix["analyst_id"]), thread="cmp-r1", title="第一版比较")
        outcome = apply_executor(session, run, proposal)
        session.commit()

    assert outcome["round_no"] == 1
    assert outcome["cells"] == 4, "两个候选 × 两条标准，一格都不能少"
    assert len(rows(session_factory, matrix["project_id"])) == 4
    with session_factory() as session:
        criteria = {item.name: item.id for item in session.scalars(
            select(ComparisonCriterion).where(ComparisonCriterion.project_id == matrix["project_id"])
        )}
        assert set(criteria) == set(CRITERIA), "标准必须落表，否则下一轮无从对齐"
        hit = session.scalar(
            select(ComparisonResult).where(
                ComparisonResult.criterion_id == criteria["SQL 与统计"],
                ComparisonResult.candidate_id == matrix["analyst_id"],
            )
        )
        empty = session.scalar(
            select(ComparisonResult).where(
                ComparisonResult.criterion_id == criteria["真实项目经验"],
                ComparisonResult.candidate_id == matrix["backend_id"],
            )
        )
        assert hit.verdict in {"partial", "supported"} and hit.note == "只有 JD 要求"
        # A cell with nothing behind it is stated as missing, not left blank.
        assert empty.verdict == "missing" and empty.evidence_refs == [] and "还没有" in empty.note


def test_the_model_cannot_score_its_own_cells(matrix, session_factory) -> None:
    """The proposal may carry a score; the stored cell must not."""
    with session_factory() as session:
        run, proposal = _round(
            session, matrix, _proposed(matrix["analyst_id"], score=5), thread="cmp-score", title="带分提案"
        )
        apply_executor(session, run, proposal)
        session.commit()
    with session_factory() as session:
        criterion_id = session.scalar(
            select(ComparisonCriterion.id).where(
                ComparisonCriterion.project_id == matrix["project_id"], ComparisonCriterion.name == "SQL 与统计"
            )
        )
        stored = session.scalar(
            select(ComparisonResult).where(
                ComparisonResult.criterion_id == criterion_id,
                ComparisonResult.candidate_id == matrix["analyst_id"],
            )
        )
    assert stored.score < 5, "分数来自存量证据，不是提案里报的那个数"


def test_a_claim_about_a_candidate_this_project_lacks_is_not_silently_dropped(matrix, session_factory) -> None:
    """The person approved *this* payload; writing a different one is a substitution."""
    with session_factory() as session:
        run, proposal = _round(session, matrix, _proposed("", wrong_target=True), thread="cmp-ghost", title="假候选")
        with pytest.raises(LookupError):
            apply_executor(session, run, proposal)


def test_counter_evidence_has_to_be_a_real_row_of_this_project(matrix, session_factory) -> None:
    with session_factory() as session:
        run, proposal = _round(
            session,
            matrix,
            _proposed(matrix["analyst_id"], opposes=["deadbeef0000000000000000000000"]),
            thread="cmp-bad",
            title="假引用",
        )
        with pytest.raises(LookupError):
            apply_executor(session, run, proposal)
        session.rollback()
        assert session.scalars(
            select(ComparisonResult).where(ComparisonResult.project_id == matrix["project_id"])
        ).first() is None


def test_counter_evidence_is_kept_as_a_pointer_not_as_prose(matrix, session_factory) -> None:
    with session_factory() as session:
        run, proposal = _round(
            session, matrix, _proposed(matrix["analyst_id"], opposes=[matrix["evidence_id"]]), thread="cmp-ok", title="真引用"
        )
        apply_executor(session, run, proposal)
        session.commit()
    with session_factory() as session:
        criterion_id = session.scalar(
            select(ComparisonCriterion.id).where(
                ComparisonCriterion.project_id == matrix["project_id"], ComparisonCriterion.name == "SQL 与统计"
            )
        )
        stored = session.scalar(
            select(ComparisonResult).where(
                ComparisonResult.criterion_id == criterion_id,
                ComparisonResult.candidate_id == matrix["analyst_id"],
            )
        )
    assert stored.counter_refs == [{"table": "evidence_items", "id": matrix["evidence_id"]}]


def test_a_second_round_appends_and_points_back_at_the_first(matrix, session_factory) -> None:
    """目标一"新证据能影响后续比较"与目标二"能看懂为什么变了"共用这一条：旧答案必须还在。"""
    with session_factory() as session:
        first_run, first = _round(session, matrix, _proposed(matrix["analyst_id"]), thread="cmp-a", title="第一版")
        apply_executor(session, first_run, first)
        session.commit()
    with session_factory() as session:
        second_run, second = _round(session, matrix, _proposed(matrix["analyst_id"]), thread="cmp-b", title="第二版")
        outcome = apply_executor(session, second_run, second)
        session.commit()
        previous = session.get(Artifact, first.artifact_id)
        current = session.get(Artifact, second.artifact_id)

    assert outcome["round_no"] == 2
    assert outcome["supersedes"] == first.artifact_id
    assert previous.status == "superseded"
    assert current.supersedes_id == first.artifact_id
    assert {row.round_no for row in rows(session_factory, matrix["project_id"])} == {1, 2}


def test_the_next_run_can_read_the_last_round_back(matrix, session_factory) -> None:
    """Without this the write is a dead end again — the exact seam P1-2 measured."""
    with session_factory() as session:
        run, proposal = _round(
            session,
            matrix,
            _proposed(matrix["analyst_id"], opposes=[matrix["evidence_id"]]),
            thread="cmp-read",
            title="待读回",
        )
        apply_executor(session, run, proposal)
        session.commit()

    result = call_tool(
        CompareCandidates(), session_factory, user_id=matrix["user_id"], arguments={"project_id": matrix["project_id"]}
    )
    assert result.ok
    last = result.payload["last_round"]
    assert last["round_no"] == 1 and len(last["cells"]) == 4
    assert any(cell["counter_evidence_ids"] == [matrix["evidence_id"]] for cell in last["cells"])
    assert any(ref["table"] == "comparison_results" for ref in result.source_refs)


def test_a_comparison_without_criteria_is_refused_before_it_becomes_a_card() -> None:
    error = payload_error("record_comparison", {"criteria": [], "cells": []})
    assert error is not None and "标准" in error


def test_cells_may_be_empty_because_the_matrix_is_not_the_models_job(matrix, session_factory) -> None:
    """A round with nothing to say against any cell is still an honest round."""
    with session_factory() as session:
        run, proposal = _round(session, matrix, {"criteria": CRITERIA, "cells": []}, thread="cmp-nocells", title="无反方证据")
        outcome = apply_executor(session, run, proposal)
        session.commit()
    assert outcome["round_no"] == 1 and outcome["cells"] == 4


def test_a_compound_standard_is_measured_by_its_parts() -> None:
    """"SQL 与统计" asks about two things. Left as one string it can never appear inside
    JD prose, so every cell comes back 缺证据 next to evidence that is plainly there —
    which is what the first two live rounds did on 2026-09-20."""
    assert _keywords("SQL 与统计") == ["sql", "统计"]
    assert _keywords("沟通、抗压/学习") == ["沟通", "抗压", "学习"]
    assert _keywords("数据分析") == ["数据分析"], "a single idea stays one yardstick"


def test_the_board_endpoint_hands_the_person_the_quotes_behind_a_verdict(matrix, session_factory, client: TestClient) -> None:
    """A score on its own is what the acceptance criteria forbid. The cells come back with
    the stored verbatim text, and another student's project is not readable at all."""
    with session_factory() as session:
        run, proposal = _round(
            session, matrix, _proposed(matrix["analyst_id"], opposes=[matrix["evidence_id"]]), thread="cmp-api", title="接口读回"
        )
        apply_executor(session, run, proposal)
        session.commit()

    login = client.post("/api/v1/auth/login", json={"username": "decider", "password": "long-enough-1"})
    headers = {"Authorization": f"Bearer {login.json()['token']}"}
    board = client.get(f"/api/v1/projects/{matrix['project_id']}/comparison", headers=headers)
    assert board.status_code == 200, board.text
    round_one = board.json()[0]
    assert round_one["round_no"] == 1 and round_one["supersedes_id"] is None

    cell = next(item for item in round_one["cells"] if item["candidate"] == "数据分析师" and item["criterion"] == "SQL 与统计")
    assert [cite["id"] for cite in cell["for_it"]] == [matrix["evidence_id"]]
    assert cell["for_it"][0]["quote"].startswith("熟练使用 SQL")
    assert [cite["id"] for cite in cell["against"]] == [matrix["evidence_id"]]

    assert (
        client.get(f"/api/v1/projects/{matrix['project_id']}/comparison", headers=register(client, "nosy")).status_code == 404
    )
