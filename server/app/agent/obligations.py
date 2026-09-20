"""Cross-run commitments: the part of axiom one that makes the agent the one who
carries the thread.

An obligation is written by the graph when a run finishes thinking (see
`app.agent.graph._record_obligation`) and consumed here when a later run is let in
to discharge it. The split matters: the model words the promise, code decides
whether it may exist and whether it may start anything by itself.

Two boundaries, both enforced here rather than in a prompt:

* **Claim is single-writer.** `claim()` moves open→claimed on rowcount, the same
  trick `ApprovalRepository.claim` uses, because two browser tabs asking to continue
  the same promise must not both get a run.
* **Auto-start is rate-limited, human-start is not.** The cooldown returned by
  `continuation()` exists to stop an agent from repeatedly spending a student's
  token budget unprompted. A person choosing "接着做" from the feed bypasses it on
  purpose — veto power is the human's, and a rate limit aimed at their click would
  be the guardrail pointing the wrong way.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.capabilities.registry import get_capability, is_valid_obligation_target
from app.db.models import Obligation, utcnow


class ObligationNotFound(LookupError):
    pass


class ObligationNotClaimable(RuntimeError):
    """Raised when the row exists but is not open — already claimed, fulfilled, or
    belonging to someone else. Kept distinct from `ObligationNotFound` so the API can
    answer 409 instead of leaking existence-as-404."""


@dataclass(frozen=True)
class ObligationRepository:
    def claim(self, session: Session, obligation_id: str, *, user_id: int, run_id: str) -> Obligation:
        """open → claimed, atomically. Returns the refreshed row."""
        found = session.scalar(select(Obligation).where(Obligation.id == obligation_id))
        if found is None or found.user_id != user_id:
            raise ObligationNotFound(obligation_id)
        result = session.execute(
            update(Obligation)
            .where(
                Obligation.id == obligation_id,
                Obligation.user_id == user_id,
                Obligation.status == "open",
            )
            .values(status="claimed", claimed_at=utcnow(), claimed_run_id=run_id)
        )
        if result.rowcount != 1:
            raise ObligationNotClaimable(f"{obligation_id} is no longer open")
        session.flush()
        session.expire(found)
        return found

    def due(self, session: Session, *, user_id: int, now: datetime | None = None) -> list[Obligation]:
        """Promises this user is allowed to act on right now, oldest first.

        A promise that is not eligible stays in the feed rather than disappearing:
        "需要先有一个决策项目" is information, whereas silence reads as forgetfulness.
        """
        moment = now or utcnow()
        rows = list(
            session.scalars(
                select(Obligation)
                .where(Obligation.user_id == user_id, Obligation.status == "open")
                .order_by(Obligation.created_at)
            )
        )
        return [row for row in rows if self.fireable(row, moment)]

    def actionable(self, session: Session, *, user_id: int, now: datetime | None = None) -> list[Obligation]:
        """Due promises that a run could actually carry out — the stricter filter used
        by `continuation()`, which is the only path allowed to start something on its
        own."""
        return [row for row in self.due(session, user_id=user_id, now=now) if self.startable(row)]

    def continuation(
        self,
        session: Session,
        *,
        user_id: int,
        last_autorun_at: datetime | None,
        cooldown: timedelta,
        now: datetime | None = None,
    ) -> tuple[Obligation | None, str | None]:
        """The one promise to pick up on the user's behalf, plus why there isn't one.

        The reason is returned rather than swallowed because the shell has to say
        something honest in the gap ("今天已经自己跑过一轮") instead of looking idle.
        """
        moment = now or utcnow()
        candidates = self.actionable(session, user_id=user_id, now=moment)
        if not candidates:
            return None, "no_due_obligation"
        if last_autorun_at is not None and moment - last_autorun_at < cooldown:
            return None, "cooling_down"
        return candidates[0], None

    @staticmethod
    def fireable(row: Obligation, now: datetime) -> bool:
        if not is_valid_obligation_target(row.capability_id):
            return False
        if row.trigger_kind == "scheduled":
            return row.not_before is not None and row.not_before <= now
        return True

    @staticmethod
    def startable(row: Obligation) -> bool:
        """A run can't do project-scoped work without a project to do it in. It stays
        visible so the user can attach one; it just never auto-starts."""
        try:
            capability = get_capability(row.capability_id)
        except KeyError:
            return False
        return "project" not in capability.required_context or bool(row.project_id)
