"""P1-3: the week is closed by the person, and read back by the agent.

`weekly_review` was declared with an artifact type and no writer, so the loop had no
review step at all. Turning it on raises the two questions this file answers: who may
make a terminal write (a human, through the REST endpoint — a Proposal would be the
agent applying an R3, which is the one thing R3 exists to forbid), and what happens to
the review afterwards (a later run must be able to read it, or the dead end has only
moved one stage along, which is exactly the mistake P1-2 measured).
"""

from __future__ import annotations

from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session, sessionmaker

from app.capabilities.registry import get_capability
from app.config import Settings
from app.db.domain import ActionPlan, DecisionProject, PlanTask, TaskResult, WeeklyReview
from app.db.models import Proposal, User
from app.main import create_app
from app.tools.domain import GetReviews
from tests.support import call_tool

WEEK = "2026-09-14"
REVIEW = "本周按 JD 补了 5 份，2 个已读不回、1 次一面；SQL 练习题做完了 3 道"


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


@pytest.fixture
def week(client: TestClient, session_factory: sessionmaker[Session]) -> dict:
    """A student with a project and one account handed back in that week."""
    headers = register(client, "reviewer")
    with session_factory() as session:
        user = session.scalar(select(User).where(User.username == "reviewer"))
        project = DecisionProject(user_id=user.id, title="分析还是后端", question="我更适合哪个方向")
        session.add(project)
        session.flush()
        plan = ActionPlan(
            project_id=project.id, user_id=user.id, title="四周验证", generation_request_id="plan-reviewer"
        )
        session.add(plan)
        session.flush()
        task = PlanTask(plan_id=plan.id, user_id=user.id, title="投 5 份并记录回复", week_no=1)
        session.add(task)
        session.flush()
        session.add(
            TaskResult(
                task_id=task.id, user_id=user.id, body="投了 5 份，2 个已读不回", request_id="review-week-result"
            )
        )
        session.commit()
        return {"headers": headers, "user_id": user.id, "project_id": project.id}


def confirm(client: TestClient, week: dict, *, project_id: str | None = None, **over):
    body = {
        "week_start": WEEK,
        "body": REVIEW,
        "confidence_trend": "up",
        "confidence_reason": "已读不回之外真约到了面试",
        "next_focus": "再投 5 份后端岗，看是否也约得到面试",
        "request_id": "review-0001",
        **over,
    }
    return client.post(
        f"/api/v1/projects/{project_id or week['project_id']}/weekly-review", json=body, headers=week["headers"]
    )


def test_a_confirmed_week_lands_verbatim_and_without_any_proposal(client, week, session_factory) -> None:
    """The stored text is the person's, and no approval record is involved.

    A terminal write reached through a Proposal would mean the agent applied an R3 —
    the graph fails that on purpose, so this endpoint is the only path in.
    """
    response = confirm(client, week)
    assert response.status_code == 201, response.text
    with session_factory() as session:
        review = session.scalar(select(WeeklyReview).where(WeeklyReview.request_id == "review-0001"))
        assert review is not None
        assert (review.body, review.confidence_trend, review.project_id) == (REVIEW, "up", week["project_id"])
        assert review.week_start == date.fromisoformat(WEEK)
        assert session.scalar(select(func.count(Proposal.id))) == 0


def test_confirming_the_same_week_twice_stays_one_review(client, week, session_factory) -> None:
    assert confirm(client, week).json().get("duplicate") is None
    assert confirm(client, week).json()["duplicate"] is True
    with session_factory() as session:
        assert session.scalar(select(func.count(WeeklyReview.id))) == 1


def test_one_week_may_not_be_closed_twice_under_another_project(client, week, session_factory) -> None:
    """`uq_review_user_week` is a person-level promise, so a second project gets a
    conflict rather than a parallel week nobody asked for."""
    with session_factory() as session:
        user = session.get(User, week["user_id"])
        other = DecisionProject(user_id=user.id, title="考研还是就业", question="要不要先工作")
        session.add(other)
        session.commit()
        other_id = other.id

    assert confirm(client, week).status_code == 201
    response = confirm(client, week, project_id=other_id, request_id="review-0002")
    assert response.status_code == 409
    assert "这一周" in response.json()["detail"]
    with session_factory() as session:
        assert session.scalar(select(func.count(WeeklyReview.id))) == 1


def test_another_students_project_cannot_be_closed(client, week, session_factory) -> None:
    intruder = register(client, "intruder")
    response = client.post(
        f"/api/v1/projects/{week['project_id']}/weekly-review",
        json={"week_start": WEEK, "body": REVIEW, "confidence_trend": "flat", "request_id": "review-0003"},
        headers=intruder,
    )
    assert response.status_code == 404
    with session_factory() as session:
        assert session.scalar(select(func.count(WeeklyReview.id))) == 0


def test_a_malformed_week_start_is_rejected_at_the_boundary(client, week) -> None:
    response = confirm(client, week, week_start="本周", request_id="review-0004")
    assert response.status_code == 422


def test_the_next_run_reads_back_what_the_review_wrote(client, week, session_factory) -> None:
    """A review nobody can read would only relocate the P1-2 blind spot."""
    review_id = confirm(client, week).json()["review_id"]
    result = call_tool(
        GetReviews(), session_factory, user_id=week["user_id"], arguments={"project_id": week["project_id"]}
    )
    assert result.ok
    assert result.payload["reviews"][0]["review_id"] == review_id
    assert result.payload["reviews"][0]["body"] == REVIEW
    assert {"table": "weekly_reviews", "id": review_id} in result.source_refs


def test_the_capabilities_after_a_review_are_given_the_tool_to_read_it() -> None:
    """Writing the review is only half of "行动结果能够改变后续判断"."""
    for capability_id in ("weekly_review", "compare_decide", "action_plan"):
        assert "get_reviews" in get_capability(capability_id).tools, capability_id


def test_weekly_review_is_live_but_still_not_agent_executable() -> None:
    """The tripwire for turning it on: implemented, yet R3 keeps it writeless."""
    capability = get_capability("weekly_review")
    assert capability.status == "implemented"
    assert capability.risk_tier == "R3"
    assert capability.proposal_types == []
    # And the loop continues from here rather than ending at a report.
    assert set(capability.next_capabilities) == {"compare_decide", "action_plan"}
