from __future__ import annotations

from datetime import timedelta

import pytest
from sqlalchemy.orm import Session, sessionmaker

from app.agent.approvals import ApprovalAlreadyResolved, ApprovalNotFound, ApprovalRepository
from app.agent.events import EventLog, RunStarted
from app.config import Settings
from app.db.models import Approval, Proposal, Run, User, utcnow


@pytest.fixture
def user(session_factory: sessionmaker[Session]) -> User:
    with session_factory() as session:
        row = User(username="approver", password_hash="x")
        session.add(row)
        session.commit()
        session.refresh(row)
        return row


@pytest.fixture
def run(session_factory: sessionmaker[Session], user: User) -> Run:
    with session_factory() as session:
        row = Run(thread_id="t-approval", user_id=user.id, goal="验证确认门", capability_id="skeleton_probe", status="running")
        session.add(row)
        session.commit()
        session.refresh(row)
        return row


@pytest.fixture
def proposal(session_factory: sessionmaker[Session], run: Run, user: User) -> Proposal:
    with session_factory() as session:
        row = Proposal(run_id=run.id, user_id=user.id, proposal_type="create_note", title="t", request_id="req-1")
        session.add(row)
        session.commit()
        session.refresh(row)
        return row


def _repo(settings: Settings) -> ApprovalRepository:
    return ApprovalRepository(settings)


def _open(session_factory, repo: ApprovalRepository, run: Run, proposal: Proposal) -> str:
    """Repository.open is flush-only on purpose — it has to join the caller's
    transaction so artifact, proposal and approval commit together. Tests that
    cross session boundaries therefore commit here."""
    with session_factory() as session:
        approval = repo.open(session, session.get(Run, run.id), session.get(Proposal, proposal.id))
        approval_id = approval.id
        session.commit()
    return approval_id


def test_open_is_idempotent_per_run_and_proposal(session_factory, settings, run, proposal) -> None:
    repo = _repo(settings)
    first = _open(session_factory, repo, run, proposal)
    second = _open(session_factory, repo, run, proposal)
    assert first == second


def test_only_one_claimer_wins(session_factory, settings, run, proposal) -> None:
    """The expiry sweeper and a human double-click must not both resume a checkpoint."""
    repo = _repo(settings)
    approval_id = _open(session_factory, repo, run, proposal)

    with session_factory() as first, session_factory() as second:
        assert repo.claim(first, approval_id) is True
        assert repo.claim(second, approval_id) is False


def test_resolve_rejects_double_resolution(session_factory, settings, run, proposal) -> None:
    repo = _repo(settings)
    approval_id = _open(session_factory, repo, run, proposal)
    with session_factory() as session:
        repo.resolve(session, approval_id, status="approved", decided_by=proposal.user_id)
    with session_factory() as session, pytest.raises(ApprovalAlreadyResolved) as caught:
        repo.resolve(session, approval_id, status="rejected")
    assert caught.value.status == "approved"


def test_resolve_distinguishes_missing_from_resolved(session_factory, settings) -> None:
    repo = _repo(settings)
    with session_factory() as session, pytest.raises(ApprovalNotFound):
        repo.resolve(session, "does-not-exist", status="approved")


def test_resolve_rejects_non_terminal_status(session_factory, settings, run, proposal) -> None:
    repo = _repo(settings)
    approval_id = _open(session_factory, repo, run, proposal)
    with session_factory() as session, pytest.raises(ValueError):
        repo.resolve(session, approval_id, status="pending")


def test_expire_stale_only_touches_pending_expired(session_factory, settings, run, proposal) -> None:
    repo = _repo(settings)
    doomed_id = _open(session_factory, repo, run, proposal)
    with session_factory() as session:
        other = Proposal(run_id=run.id, user_id=proposal.user_id, proposal_type="create_note", title="t2", request_id="req-2")
        session.add(other)
        session.commit()
    with session_factory() as session:
        fresh_id = repo.open(session, session.get(Run, run.id), other).id
        session.commit()

    with session_factory() as session:
        session.get(Approval, doomed_id).expires_at = utcnow() - timedelta(seconds=1)
        session.commit()

    with session_factory() as session:
        assert repo.expire_stale(session) == [doomed_id]
    with session_factory() as session:
        assert session.get(Approval, doomed_id).status == "timed_out"
        assert session.get(Approval, fresh_id).status == "pending"


async def test_event_seq_is_monotonic_and_replay_honours_after_seq(session_factory, settings, run) -> None:
    log = EventLog(session_factory)
    with session_factory() as session:
        stored = session.get(Run, run.id)
        for index in range(3):
            log.append(
                session,
                stored,
                RunStarted(
                    run_id=stored.id, thread_id=stored.thread_id, seq=0, event_id="", occurred_at=utcnow(),
                    kind="run_started", goal=f"g{index}",
                ),
            )
        session.commit()

    # An open run's stream never ends on its own, so read a fixed count and close it.
    live = log.stream(stored.id, after_seq=-1)
    collected = [await live.__anext__() for _ in range(3)]
    await live.aclose()
    assert [EventLog.to_frame(event).goal for event in collected] == ["g0", "g1", "g2"]
    assert [event.seq for event in collected] == [0, 1, 2]

    tail_rows = log.stream(stored.id, after_seq=0)
    tail = [event.seq for event in [await tail_rows.__anext__() for _ in range(2)]]
    await tail_rows.aclose()
    assert tail == [1, 2]


async def test_terminal_event_closes_the_stream(session_factory, settings, run) -> None:
    """A run that has already finished must let a late subscriber drain and finish,
    otherwise a reconnecting browser tab would hang open forever."""
    from app.agent.events import RunCompleted

    log = EventLog(session_factory)
    with session_factory() as session:
        stored = session.get(Run, run.id)
        log.append(session, stored, RunStarted(
            run_id=stored.id, thread_id=stored.thread_id, seq=0, event_id="", occurred_at=utcnow(),
            kind="run_started", goal="g",
        ))
        log.append(session, stored, RunCompleted(
            run_id=stored.id, thread_id=stored.thread_id, seq=0, event_id="", occurred_at=utcnow(),
            kind="run_completed", status="completed",
        ))
        session.commit()

    kinds = [event.kind async for event in log.stream(stored.id)]
    assert kinds == ["run_started", "run_completed"]


async def test_late_subscriber_sees_earlier_events(session_factory, settings, run) -> None:
    """The replay contract: events emitted before a client attaches must still arrive."""
    log = EventLog(session_factory)
    with session_factory() as session:
        stored = session.get(Run, run.id)
        log.append(session, stored, RunStarted(
            run_id=stored.id, thread_id=stored.thread_id, seq=0, event_id="", occurred_at=utcnow(),
            kind="run_started", goal="written before anyone listened",
        ))
        session.commit()

    live = log.stream(stored.id)
    first = await live.__anext__()
    await live.aclose()
    assert EventLog.to_frame(first).goal == "written before anyone listened"


def test_frame_round_trip_preserves_payload(session_factory, settings, run) -> None:
    log = EventLog(session_factory)
    frame = RunStarted(
        run_id=run.id, thread_id=run.thread_id, seq=7, event_id="abc", occurred_at=utcnow(),
        kind="run_started", goal="目标", capability_id="skeleton_probe",
    )
    with session_factory() as session:
        stored = session.get(Run, run.id)
        event = log.append(session, stored, frame)
        session.commit()
    restored = EventLog.to_frame(event)
    assert restored == frame.model_copy(update={"seq": event.seq, "event_id": event.event_id})


def test_unknown_event_kind_is_rejected() -> None:
    from pydantic import ValidationError

    from app.agent.events import FRAME_ADAPTER

    with pytest.raises(ValidationError):
        FRAME_ADAPTER.validate_python(
            {"run_id": "r", "thread_id": "t", "seq": 0, "event_id": "e", "kind": "nonsense", "occurred_at": utcnow(), "goal": "g"}
        )


async def test_delta_channel_keeps_only_the_newest_snapshot(tmp_path, session_factory: sessionmaker[Session]) -> None:
    """Answer text is transient by design: it never enters the durable log, and a slow
    reader gets the latest snapshot rather than a backlog it will never catch up on."""
    log = EventLog(session_factory)
    queue, detach = log.subscribe_delta("run-x")

    log.publish_delta("run-x", {"answer": "第一", "reasoning": ""})
    log.publish_delta("run-x", {"answer": "第一句", "reasoning": "在想"})

    assert queue.qsize() == 1
    assert await queue.get() == {"answer": "第一句", "reasoning": "在想"}

    detach()
    log.publish_delta("run-x", {"answer": "不该有人收到", "reasoning": ""})
    assert queue.qsize() == 0
