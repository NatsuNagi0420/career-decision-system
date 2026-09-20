"""An expired confirmation must not be able to write, and must not stay pending either.

目标三 asks the first half ("已过期审批不能继续执行"), 目标四 the second ("审批超时能够被
实际执行，而不只是存在代码"). Before §25 both were unmet in the same way: `claim()` only
looked at `status`, and `expire_stale()` was written and unit-tested but had no production
caller — so the sweeper that would have made the state visible never ran, and a person
clicking "采纳" after the TTL got their write.
"""

from __future__ import annotations

from datetime import timedelta

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker

from app.agent.approvals import ApprovalRepository
from app.agent.events import EventLog
from app.agent.service import expire_stale_approvals
from app.config import Settings
from app.db.models import Approval, Event, Proposal, Run, User, utcnow


@pytest.fixture
def user(session_factory: sessionmaker[Session]) -> User:
    with session_factory() as session:
        row = User(username="expiry-owner", password_hash="x")
        session.add(row)
        session.commit()
        session.refresh(row)
        return row


def _parked_run(
    session_factory: sessionmaker[Session],
    user: User,
    *,
    thread: str,
    status: str = "awaiting_approval",
) -> tuple[str, str]:
    """A run parked at the gate, plus the one proposal it is waiting on."""
    with session_factory() as session:
        run = Run(thread_id=thread, user_id=user.id, goal="要不要归档这条证据", capability_id="evidence_collect", status=status)
        session.add(run)
        session.flush()
        proposal = Proposal(
            run_id=run.id, user_id=user.id, proposal_type="collect_evidence", title="归档一条证据", request_id=f"req-{thread}"
        )
        session.add(proposal)
        session.commit()
        return run.id, proposal.id


def _card(
    session_factory: sessionmaker[Session],
    repo: ApprovalRepository,
    run_id: str,
    proposal_id: str,
    *,
    expired: bool,
) -> str:
    with session_factory() as session:
        approval = repo.open(session, session.get(Run, run_id), session.get(Proposal, proposal_id))
        approval_id = approval.id
        if expired:
            approval.expires_at = utcnow() - timedelta(seconds=1)
        session.commit()
    return approval_id


def _approval(session_factory: sessionmaker[Session], approval_id: str) -> Approval:
    with session_factory() as session:
        return session.get(Approval, approval_id)


def test_an_expired_card_cannot_be_claimed_while_it_still_says_pending(session_factory, settings: Settings, user) -> None:
    """The guarantee cannot depend on the sweeper having already run.

    `status` alone reads "still decidable" after the deadline, so a click at TTL+1h
    would write. The expiry predicate lives inside the claim's own UPDATE.
    """
    repo = ApprovalRepository(settings)
    run_id, proposal_id = _parked_run(session_factory, user, thread="exp-claim")
    approval_id = _card(session_factory, repo, run_id, proposal_id, expired=True)

    with session_factory() as session:
        claimed = repo.claim(session, approval_id)

    assert claimed is False, "过期的确认不能被抢占，也就不会被执行"
    assert _approval(session_factory, approval_id).status == "pending"  # the sweeper has not run yet


def test_an_alive_card_is_still_claimable(session_factory, settings: Settings, user) -> None:
    repo = ApprovalRepository(settings)
    run_id, proposal_id = _parked_run(session_factory, user, thread="exp-alive")
    approval_id = _card(session_factory, repo, run_id, proposal_id, expired=False)

    with session_factory() as session:
        assert repo.claim(session, approval_id) is True


def test_the_sweep_makes_expiry_a_state_and_unparks_the_run(session_factory, settings: Settings, user) -> None:
    repo = ApprovalRepository(settings)
    run_id, proposal_id = _parked_run(session_factory, user, thread="exp-sweep")
    approval_id = _card(session_factory, repo, run_id, proposal_id, expired=True)

    expired = expire_stale_approvals(session_factory, repo, EventLog(session_factory))

    assert expired == [approval_id]
    assert _approval(session_factory, approval_id).status == "timed_out"
    with session_factory() as session:
        run = session.get(Run, run_id)
        # Nothing was ever written for it, so this is a cancellation, not a failure —
        # and the stage says which gate it died at.
        assert (run.status, run.error) == ("cancelled", "approval: 确认在有效期内没有被点，这次写入没有发生。可以再发起一次同样的判断。")
        assert run.finished_at is not None
        # Nobody rejected the proposal, so it must not be recorded as if someone had.
        assert session.get(Proposal, proposal_id).status == "pending"
        kinds = [
            (event.kind, event.payload.get("status"))
            for event in session.scalars(select(Event).where(Event.run_id == run_id).order_by(Event.seq))
        ]
    assert kinds == [("run_completed", "cancelled")]


def test_a_run_with_a_second_live_card_stays_parked(session_factory, settings: Settings, user) -> None:
    """Expiry is per card. Closing the run because one of two cards lapsed would throw
    away the decision the person still has time to make."""
    repo = ApprovalRepository(settings)
    run_id, first = _parked_run(session_factory, user, thread="exp-two-cards")
    with session_factory() as session:
        second_proposal = Proposal(
            run_id=run_id, user_id=user.id, proposal_type="create_note", title="第二条", request_id="req-second-card"
        )
        session.add(second_proposal)
        session.flush()  # the id is generated at flush time, not at construction
        second_id = second_proposal.id
        session.commit()

    lapsed = _card(session_factory, repo, run_id, first, expired=True)
    alive = _card(session_factory, repo, run_id, second_id, expired=False)

    assert expire_stale_approvals(session_factory, repo, EventLog(session_factory)) == [lapsed]
    with session_factory() as session:
        assert session.get(Run, run_id).status == "awaiting_approval"
        assert session.get(Approval, alive).status == "pending"
