"""The persistent decision state behind the confirmation gate.

Ported from Compass's ``hitl/state_store.py`` because it solves two races that
look theoretical until they bite:

  * ``claim`` uses an atomic status transition and checks the row count, so the
    expiry sweeper and a human pressing "采纳" cannot both hand the same
    checkpoint to a resumer.
  * ``resolve`` only moves ``pending|resuming`` forward, and distinguishes
    "not found" from "already resolved" so a double-click is not an error.

The final status is taken from the graph's resulting state by the caller, not
from the decision that was submitted — otherwise the audit trail can disagree
with what was actually written.
"""

from __future__ import annotations

from datetime import datetime, timedelta

from sqlalchemy import func, select, update

from app.config import Settings, get_settings
from app.db.models import Approval, Proposal, Run, utcnow


class ApprovalNotFound(LookupError):
    pass


class ApprovalAlreadyResolved(RuntimeError):
    def __init__(self, status: str) -> None:
        super().__init__(f"approval already resolved: {status}")
        self.status = status


class ApprovalRepository:
    def __init__(self, settings: Settings | None = None) -> None:
        self._settings = settings or get_settings()

    def open(self, session, run: Run, proposal: Proposal) -> Approval:
        existing = session.scalar(
            select(Approval).where(Approval.run_id == run.id, Approval.proposal_id == proposal.id)
        )
        if existing is not None:
            return existing
        approval = Approval(
            thread_id=run.thread_id,
            run_id=run.id,
            proposal_id=proposal.id,
            user_id=proposal.user_id,
            status="pending",
            expires_at=utcnow() + timedelta(seconds=self._settings.approval_ttl_seconds),
        )
        session.add(approval)
        session.flush()
        return approval

    def get(self, session, approval_id: str, *, user_id: int) -> Approval:
        approval = session.get(Approval, approval_id)
        if approval is None or approval.user_id != user_id:
            raise ApprovalNotFound(approval_id)
        return approval

    def claim(self, session, approval_id: str, *, run_id: str) -> bool:
        """Atomic pending -> resuming. True only for the single winning caller.

        The expiry test belongs inside this UPDATE, not in a read that happens
        before it: otherwise two things can both be true — the card still says
        `pending` while its `expires_at` has passed, and a person clicking at that
        moment gets a write that 目标三 says an expired approval may not produce. The
        sweeper only makes the state visible; this is what makes it enforced.

        `run_id` belongs in the same statement for the same reason. Resuming runs the
        graph against one `thread_id`, so two cards on one run claimed together start two
        graphs on one checkpoint and two writers on one event sequence. "nothing else on
        this run is being executed" is part of winning the claim, not a check made
        beforehand.
        """
        busy = (
            select(Approval.id)
            .where(Approval.run_id == run_id, Approval.status == "resuming")
            .subquery()
        )
        rowcount = session.execute(
            update(Approval)
            .execution_options(synchronize_session=False)
            .where(
                Approval.id == approval_id,
                Approval.status == "pending",
                Approval.expires_at > utcnow(),
                select(func.count()).select_from(busy).scalar_subquery() == 0,
            )
            .values(status="resuming")
        ).rowcount
        session.commit()
        return bool(rowcount)

    def resolve(
        self,
        session,
        approval_id: str,
        *,
        status: str,
        decided_by: int | None = None,
        feedback: str | None = None,
    ) -> Approval:
        if status not in {"approved", "rejected", "timed_out", "error"}:
            raise ValueError(f"not a terminal status: {status}")
        approval = session.get(Approval, approval_id)
        if approval is None:
            raise ApprovalNotFound(approval_id)
        if approval.status not in {"pending", "resuming"}:
            raise ApprovalAlreadyResolved(approval.status)
        rowcount = session.execute(
            update(Approval)
            .execution_options(synchronize_session=False)
            .where(Approval.id == approval_id, Approval.status.in_({"pending", "resuming"}))
            .values(status=status, decided_by=decided_by, feedback=feedback, resolved_at=utcnow())
        ).rowcount
        session.commit()
        if not rowcount:
            session.refresh(approval)
            raise ApprovalAlreadyResolved(approval.status)
        session.refresh(approval)
        return approval

    def expire_stale(self, session, *, now: datetime | None = None) -> list[tuple[str, str]]:
        """Return `(id, run_id)` for the cards this call actually flipped, not for the
        ones a pre-read hoped would be here.

        The caller closes the run behind each expired card, and closing the run of a card
        that got claimed in the meantime would cancel a write that is happening right now.
        Re-reading after the UPDATE is what makes "I timed this one out" a fact rather
        than an intention.
        """
        moment = now or utcnow()
        ids = [
            approval.id
            for approval in session.scalars(
                select(Approval).where(Approval.status == "pending", Approval.expires_at < moment)
            )
        ]
        if not ids:
            return []
        session.execute(
            update(Approval)
            .execution_options(synchronize_session=False)
            .where(Approval.id.in_(ids), Approval.status == "pending")
            .values(status="timed_out", resolved_at=moment)
        )
        flipped = [
            (approval.id, approval.run_id)
            for approval in session.scalars(
                select(Approval).where(Approval.id.in_(ids), Approval.status == "timed_out")
            )
        ]
        session.commit()
        return flipped

    def pending_for_run(self, session, run_id: str) -> list[Approval]:
        return list(
            session.scalars(
                select(Approval).where(Approval.run_id == run_id, Approval.status == "pending")
            )
        )
