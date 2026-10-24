"""Nobody may be left holding a task that no process is running.

The status column has no `running` value in this schema — `created` *is* the in-flight
marker, set when the row is born and changed only when the graph finishes or parks.
So a process that dies mid-run leaves a row that reads "still working" to every reader
forever, which is the one thing 目标四 refuses to allow.
"""

from __future__ import annotations

from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker

from app.agent.events import EventLog
from app.agent.service import STALE_RUN_AFTER, reconcile_stale_runs
from app.db.models import Event, Run, User, utcnow


def _run(
    session_factory: sessionmaker[Session],
    *,
    thread: str,
    status: str = "created",
    touched: datetime | None = None,
) -> str:
    with session_factory() as session:
        user = session.scalars(select(User)).first()
        if user is None:
            user = User(username="sweep-owner", password_hash="x")
            session.add(user)
            session.flush()
        run = Run(
            thread_id=thread,
            user_id=user.id,
            goal="被中断的那一次",
            capability_id="skeleton_probe",
            status=status,
        )
        session.add(run)
        session.flush()
        # Set explicitly, or `onupdate` would overwrite it on the same commit.
        run.updated_at = touched or utcnow()
        session.commit()
        return run.id


def _row(session_factory: sessionmaker[Session], run_id: str) -> Run:
    with session_factory() as session:
        return session.get(Run, run_id)


def test_a_run_left_by_a_dead_process_is_closed_and_names_the_stage(session_factory) -> None:
    run_id = _run(session_factory, thread="sweep-crashed", touched=utcnow() - STALE_RUN_AFTER - timedelta(minutes=1))
    closed = reconcile_stale_runs(session_factory, EventLog(session_factory))

    assert closed == [run_id]
    failed = _row(session_factory, run_id)
    assert (failed.status, failed.finished_at is not None) == ("failed", True)
    assert failed.error and failed.error.startswith("restart:")
    # The stage has to reach the durable timeline, not just the row: this is what a
    # person watching an open tab sees instead of a spinner that never stops.
    with session_factory() as session:
        kinds = [event.kind for event in session.scalars(select(Event).where(Event.run_id == run_id))]
    assert kinds == ["run_failed"]


def test_a_run_held_by_a_person_is_not_swept(session_factory) -> None:
    """`awaiting_approval` is a state a human holds, and letting it lapse is the
    approval sweep's job — closing it here would erase what they were asked to decide."""
    run_id = _run(
        session_factory,
        thread="sweep-awaiting",
        status="awaiting_approval",
        touched=utcnow() - timedelta(days=3),
    )

    assert reconcile_stale_runs(session_factory, EventLog(session_factory)) == []
    held = _row(session_factory, run_id)
    assert (held.status, held.finished_at, held.error) == ("awaiting_approval", None, None)


def test_a_run_that_is_making_progress_is_not_swept(session_factory) -> None:
    run_id = _run(session_factory, thread="sweep-alive", touched=utcnow() - timedelta(seconds=5))

    assert reconcile_stale_runs(session_factory, EventLog(session_factory)) == []
    assert _row(session_factory, run_id).status == "created"


def test_startup_leaves_nothing_behind_even_when_it_just_stopped(session_factory) -> None:
    """A fresh process has nothing of its own in flight, so at startup the window is
    zero: a run interrupted two seconds ago is still an orphan of the last process."""
    run_id = _run(session_factory, thread="sweep-startup")

    closed = reconcile_stale_runs(
        session_factory,
        EventLog(session_factory),
        stale_after=timedelta(0),
        reason="上次进程退出时它还停在这一步",
    )

    assert closed == [run_id]
    assert "上次进程退出" in (_row(session_factory, run_id).error or "")
