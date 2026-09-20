"""P1-1: the person reports what they actually did.

`task_results` had zero readers and zero writers anywhere in `app/` — the closed loop
stopped at the report. Two things make it a loop, and both are pinned here: the write
belongs to the user (no approval gate pointed at their own words), and it wakes the run
that turns those words into evidence.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session, sessionmaker

from app.agent.executors import apply_executor, build_proposal
from app.capabilities.registry import get_capability
from app.config import Settings
from app.db.domain import ActionPlan, DecisionProject, EvidenceItem, PlanTask, TaskResult
from app.db.models import Artifact, Obligation, Proposal, Run, User
from app.main import create_app
from app.tools.domain import GetPlan
from tests.support import call_tool


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


WORDS = "投了 5 份数据分析岗，2 个已读不回，约到 1 次一面"


@pytest.fixture
def assignment(client: TestClient, session_factory: sessionmaker[Session]) -> dict:
    """One real task on one real plan, owned by the signed-in student."""
    headers = register(client, "doer")
    with session_factory() as session:
        user = session.scalar(select(User).where(User.username == "doer"))
        project = DecisionProject(user_id=user.id, title="分析还是后端", question="我更适合哪个方向")
        session.add(project)
        session.flush()  # ids are generated on flush, and these tables chain by id
        plan = ActionPlan(
            project_id=project.id,
            user_id=user.id,
            title="四周验证",
            generation_request_id="plan-doer",
        )
        session.add(plan)
        session.flush()
        task = PlanTask(plan_id=plan.id, user_id=user.id, title="投 5 份并记录回复", week_no=1)
        session.add(task)
        session.commit()
        return {
            "headers": headers,
            "user_id": user.id,
            "project_id": project.id,
            "plan_id": plan.id,
            "task_id": task.id,
            # Adding the task already moved the plan's optimistic-lock version, so the
            # assertion below is about the step this endpoint takes, not an absolute.
            "plan_version": plan.version,
        }


def submit(client: TestClient, assignment: dict, *, request_id: str, body: str = WORDS, link: str | None = None):
    return client.post(
        f"/api/v1/tasks/{assignment['task_id']}/results",
        json={"body": body, "link": link, "request_id": request_id},
        headers=assignment["headers"],
    )


def test_submitting_keeps_their_words_and_closes_the_task(client, assignment, session_factory) -> None:
    """The body is stored verbatim: it becomes the quote an evidence row can point at."""
    response = submit(client, assignment, request_id="req-0001")
    assert response.status_code == 201, response.text
    with session_factory() as session:
        result = session.scalar(select(TaskResult).where(TaskResult.request_id == "req-0001"))
        assert result is not None and result.body == WORDS
        task = session.get(PlanTask, assignment["task_id"])
        assert (task.status, task.completed_at is not None) == ("done", True)
        # The plan is the aggregate the person reads back, so its version must move.
        assert session.get(ActionPlan, assignment["plan_id"]).version == assignment["plan_version"] + 1


def test_a_submission_wakes_the_agent_that_turns_it_into_evidence(client, assignment, session_factory) -> None:
    body = submit(client, assignment, request_id="req-0002").json()
    assert body["run_id"]
    with session_factory() as session:
        run = session.get(Run, body["run_id"])
        assert run.capability_id == "evidence_collect"
        assert run.entry_point == "task_result"
        assert run.project_id == assignment["project_id"]


def _collect_proposal(session: Session, run: Run, proposed: dict) -> Proposal | None:
    """The proposal a synthesis answer would leave behind, before anyone approves it."""
    artifact = Artifact(
        run_id=run.id,
        user_id=run.user_id,
        artifact_type="EvidenceDigest",
        title="证据整理",
        source_refs=[],
    )
    session.add(artifact)
    session.flush()
    return build_proposal(
        get_capability("evidence_collect"),
        run,
        artifact,
        {"conclusion": "先看回覆率", "next_actions": [], "proposed": proposed},
    )


def test_the_woken_capability_can_read_what_woke_it() -> None:
    """Seen live: the run a submission starts called every tool it was given — and none
    of them returns the submission. It found nothing to cite, proposed nothing, and the
    loop died at the person's own report. A capability must be handed the tool that
    surfaces whatever it was woken for."""
    capability = get_capability("evidence_collect")
    assert "get_plan" in capability.tools


def archive(session_factory: sessionmaker[Session], run_id: str, proposed: dict) -> tuple[dict, str]:
    """Run the write the approval card would run: build the proposal from what the
    model synthesised, then apply its executor."""
    with session_factory() as session:
        run = session.get(Run, run_id)
        proposal = _collect_proposal(session, run, proposed)
        assert proposal is not None and proposal.status == "pending"
        session.add(proposal)
        session.flush()
        outcome = apply_executor(session, run, session.get(Proposal, proposal.id))
        # Commit, or the row disappears when this session closes and the assertion in
        # the test reads an empty table.
        session.commit()
        return outcome, proposal.id


def test_archiving_a_result_keeps_their_words_and_points_at_their_row(client, assignment, session_factory) -> None:
    """P1-2: the model chooses which account is worth archiving; it does not get to
    restate it. The quote is read back off the row, so a conclusion citing this evidence
    opens onto what the person actually typed."""
    body = submit(client, assignment, request_id="req-arch-1").json()
    outcome, _ = archive(
        session_factory,
        body["run_id"],
        {
            "statement": "数据分析岗投出去的回覆很少",
            "quote": "他投了五份，几乎都没回（这是模型的转述）",
            "kind": "evidence",
            "result_id": body["result_id"],
        },
    )
    with session_factory() as session:
        item = session.get(EvidenceItem, outcome["evidence_id"])
        assert item.quote == WORDS
        # The model filed this as kind="evidence"; what a row came from is code's call.
        assert item.kind == "action_result"
        assert item.source_ref == {"table": "task_results", "id": body["result_id"]}


def test_archiving_a_fabricated_or_borrowed_result_id_is_refused(client, assignment, session_factory) -> None:
    """A citation that cannot be opened is worse than none: it makes an unbacked claim
    look sourced. So an id that is missing, or belongs to someone else, fails the write."""
    body = submit(client, assignment, request_id="req-arch-2").json()
    register(client, "peeker")

    with session_factory() as session:
        stranger = session.scalar(select(User).where(User.username == "peeker"))
        stolen = TaskResult(
            task_id=assignment["task_id"],
            user_id=stranger.id,
            body="别人交回的经历",
            request_id="req-stranger",
        )
        session.add(stolen)
        session.commit()
        stolen_id = stolen.id

    synthesis = {"statement": "想引用一条记录", "result_id": "0" * 32}
    with pytest.raises(LookupError):
        archive(session_factory, body["run_id"], synthesis)

    with pytest.raises(LookupError):
        archive(session_factory, body["run_id"], {"statement": "想引用一条记录", "result_id": stolen_id})

    with session_factory() as session:
        # Neither attempt left a row behind: a failed write must not look like a source.
        assert session.scalar(
            select(func.count()).select_from(EvidenceItem).where(EvidenceItem.project_id == assignment["project_id"])
        ) == 0


def test_reapproving_the_same_archive_writes_one_row(client, assignment, session_factory) -> None:
    body = submit(client, assignment, request_id="req-arch-3").json()
    first, proposal_id = archive(
        session_factory,
        body["run_id"],
        {"statement": "回覆率低是共同信号", "result_id": body["result_id"]},
    )
    with session_factory() as session:
        run = session.get(Run, body["run_id"])
        again = apply_executor(session, run, session.get(Proposal, proposal_id))
        assert again["evidence_id"] == first["evidence_id"]
        rows = session.scalar(
            select(func.count())
            .select_from(EvidenceItem)
            .where(EvidenceItem.project_id == assignment["project_id"])
        )
        assert rows == 1


def test_an_archive_with_nothing_to_open_is_flagged_not_offered(client, assignment, session_factory) -> None:
    """Seen live: with the tools returning no sources the model still proposed an
    evidence row, and the one row the earlier version had written carried an empty
    quote and an empty source_ref. A card asking someone to approve a blank paper
    trail is worse than no card, so the schema refuses it before the feed renders."""
    body = submit(client, assignment, request_id="req-arch-4").json()
    with session_factory() as session:
        run = session.get(Run, body["run_id"])
        proposal = _collect_proposal(session, run, {"statement": "他觉得自己不适合频繁沟通"})
        assert proposal is not None and proposal.status == "unsupported"
        assert "无法回溯" in proposal.error


def test_the_wake_up_coalesces_into_the_run_already_open(client, assignment, session_factory) -> None:
    """Two submissions, one waiting agent. A second run would only ask the same
    question twice on the approval card."""
    with session_factory() as session:
        session.add(
            Run(
                thread_id="already-open",
                user_id=assignment["user_id"],
                goal="已在整理证据",
                capability_id="evidence_collect",
                project_id=assignment["project_id"],
            )
        )
        session.commit()

    body = submit(client, assignment, request_id="req-0003").json()
    assert body["run_id"] is None and body["deferred_to_run"]
    # Deferring must not be dropping: that run may already be past the step where it
    # reads the plan, so the account is promised forward or it leaves the loop silently.
    with session_factory() as session:
        owed = session.scalar(
            select(Obligation).where(
                Obligation.run_id == body["deferred_to_run"], Obligation.capability_id == "evidence_collect"
            )
        )
        assert owed is not None and owed.status == "open" and "投 5 份" in owed.intent


def test_a_second_click_states_the_same_fact_once(client, assignment, session_factory) -> None:
    """`request_id` is the client's dedupe key; two rows would let one effort count
    as two pieces of evidence."""
    submit(client, assignment, request_id="req-0004")
    again = submit(client, assignment, request_id="req-0004")
    assert again.status_code == 201 and again.json()["duplicate"] is True
    with session_factory() as session:
        assert session.scalar(select(func.count()).select_from(TaskResult)) == 1


def test_someone_elses_task_reads_as_absent(client, assignment, session_factory) -> None:
    headers = register(client, "nosy")
    response = client.post(
        f"/api/v1/tasks/{assignment['task_id']}/results",
        json={"body": "替别人交作业", "request_id": "req-0005"},
        headers=headers,
    )
    assert response.status_code == 404
    with session_factory() as session:
        assert session.get(PlanTask, assignment["task_id"]).status == "todo"


def test_an_empty_account_is_rejected_before_it_is_stored(client, assignment) -> None:
    assert submit(client, assignment, request_id="req-0006", body=" ").status_code == 422


def test_the_object_layer_exposes_the_task_and_its_account(client, assignment) -> None:
    """Without this the shell has no task id to submit against, and the loop stays
    reachable only from the transcript that created it."""
    submit(client, assignment, request_id="req-0008", link="https://example.com/一面记录")

    entry = next(item for item in client.get("/api/v1/feed", headers=assignment["headers"]).json()["tasks"]
                 if item["id"] == assignment["task_id"])
    assert entry["project_id"] == assignment["project_id"]
    assert entry["status"] == "done"
    assert entry["results"][0]["body"] == WORDS
    assert entry["results"][0]["link"] == "https://example.com/一面记录"


def test_get_plan_shows_the_submission_verbatim(client, assignment, session_factory) -> None:
    """A run woken by a submission must be able to read what it was woken for, or the
    next paragraph is invented rather than reported."""
    submit(client, assignment, request_id="req-0007")

    result = call_tool(
        GetPlan(),
        session_factory,
        user_id=assignment["user_id"],
        arguments={"project_id": assignment["project_id"]},
    )
    task = result.payload["plans"][0]["tasks"][0]
    assert task["status"] == "done"
    assert len(task["results"]) == 1
    assert task["results"][0]["body"] == WORDS and task["results"][0]["link"] is None
    assert {"table": "plan_tasks", "id": assignment["task_id"]} in result.source_refs
