from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import ClassVar

from sqlalchemy import (
    JSON,
    BigInteger,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.mysql import DATETIME
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

#: MySQL's bare DATETIME truncates to whole seconds, which flattens an event
#: timeline that is supposed to show the agent working. 6 digits keeps microseconds.
Timestamp = DateTime().with_variant(DATETIME(fsp=6), "mysql")

RUN_STATUSES = ("created", "running", "awaiting_approval", "paused", "completed", "failed", "cancelled")
STEP_KINDS = ("plan", "tool", "ask", "propose", "synthesize", "approve", "finalize")
ARTIFACT_STATUSES = ("draft", "pending_approval", "approved", "rejected", "committed", "superseded")
PROPOSAL_STATUSES = ("pending", "applied", "rejected", "failed", "unsupported")
APPROVAL_STATUSES = ("pending", "resuming", "approved", "rejected", "timed_out", "error")
RISK_TIERS = ("R0", "R1", "R2", "R3")
#: `on_return` fires the next time the person is here; `scheduled` additionally waits
#: for `not_before`. Those two are the whole vocabulary — see §11.4 below.
OBLIGATION_STATUSES = ("open", "claimed", "fulfilled", "abandoned")
OBLIGATION_TRIGGERS = ("on_return", "scheduled")


def new_id() -> str:
    return uuid.uuid4().hex


def utcnow() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    username: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    # NULL means no consent. Revocation sets it back to NULL rather than deleting the row.
    external_ai_consent_at: Mapped[datetime | None] = mapped_column(Timestamp, nullable=True)
    created_at: Mapped[datetime] = mapped_column(Timestamp, nullable=False, default=utcnow)

    @property
    def allows_external_ai(self) -> bool:
        return self.external_ai_consent_at is not None


class Run(Base):
    __tablename__ = "agent_runs"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    thread_id: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)

    goal: Mapped[str] = mapped_column(Text, nullable=False)
    project_id: Mapped[str | None] = mapped_column(String(32), nullable=True, index=True)
    entry_point: Mapped[str] = mapped_column(String(32), nullable=False, default="shell")
    capability_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    risk_tier: Mapped[str | None] = mapped_column(String(2), nullable=True)
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="created")

    model_used: Mapped[str | None] = mapped_column(String(96), nullable=True)
    thinking_mode: Mapped[str | None] = mapped_column(String(8), nullable=True)
    prompt_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    completion_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    reasoning_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    cached_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    max_steps: Mapped[int] = mapped_column(Integer, nullable=False, default=8)
    steps_used: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    token_budget: Mapped[int] = mapped_column(Integer, nullable=False, default=40_000)

    # Real optimistic lock: SQLAlchemy appends WHERE version = <loaded> on every
    # UPDATE and raises StaleDataError instead of silently overwriting.
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(Timestamp, nullable=False, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(Timestamp, nullable=False, default=utcnow, onupdate=utcnow)
    finished_at: Mapped[datetime | None] = mapped_column(Timestamp, nullable=True)

    __mapper_args__: ClassVar[dict] = {"version_id_col": version}

    steps: Mapped[list[Step]] = relationship(back_populates="run", cascade="all, delete-orphan")
    events: Mapped[list[Event]] = relationship(back_populates="run", cascade="all, delete-orphan")


class Step(Base):
    __tablename__ = "agent_steps"
    __table_args__: ClassVar[tuple] = (UniqueConstraint("run_id", "seq", name="uq_step_run_seq"),)

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    run_id: Mapped[str] = mapped_column(ForeignKey("agent_runs.id", ondelete="CASCADE"), nullable=False)
    seq: Mapped[int] = mapped_column(Integer, nullable=False)
    kind: Mapped[str] = mapped_column(String(16), nullable=False)
    name: Mapped[str] = mapped_column(String(96), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="running")
    input_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    output_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    started_at: Mapped[datetime] = mapped_column(Timestamp, nullable=False, default=utcnow)
    finished_at: Mapped[datetime | None] = mapped_column(Timestamp, nullable=True)

    run: Mapped[Run] = relationship(back_populates="steps")


class Event(Base):
    """Append-only process timeline. Never updated, never overwritten."""

    __tablename__ = "agent_events"
    __table_args__: ClassVar[tuple] = (
        UniqueConstraint("run_id", "seq", name="uq_event_run_seq"),
        Index("ix_event_run_seq", "run_id", "seq"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    event_id: Mapped[str] = mapped_column(String(32), unique=True, nullable=False, default=new_id)
    run_id: Mapped[str] = mapped_column(ForeignKey("agent_runs.id", ondelete="CASCADE"), nullable=False)
    seq: Mapped[int] = mapped_column(Integer, nullable=False)
    thread_id: Mapped[str] = mapped_column(String(64), nullable=False)
    kind: Mapped[str] = mapped_column(String(32), nullable=False)
    payload: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    occurred_at: Mapped[datetime] = mapped_column(Timestamp, nullable=False, default=utcnow, index=True)

    run: Mapped[Run] = relationship(back_populates="events")


class Artifact(Base):
    __tablename__ = "artifacts"
    __table_args__: ClassVar[tuple] = (Index("ix_artifact_user_type", "user_id", "artifact_type"),)

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    run_id: Mapped[str] = mapped_column(ForeignKey("agent_runs.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)

    artifact_type: Mapped[str] = mapped_column(String(48), nullable=False)
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="draft")
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    content: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    source_refs: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    evidence_quotes: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    data_coverage: Mapped[int | None] = mapped_column(Integer, nullable=True)
    is_provisional: Mapped[bool] = mapped_column(nullable=False, default=False)
    generation_mode: Mapped[str] = mapped_column(String(8), nullable=False, default="llm")

    version: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    __mapper_args__: ClassVar[dict] = {"version_id_col": version}

    created_at: Mapped[datetime] = mapped_column(Timestamp, nullable=False, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(Timestamp, nullable=False, default=utcnow, onupdate=utcnow)
    approved_at: Mapped[datetime | None] = mapped_column(Timestamp, nullable=True)
    committed_at: Mapped[datetime | None] = mapped_column(Timestamp, nullable=True)


class Proposal(Base):
    """A write intent referencing an Artifact. Applying goes through an allowlisted executor only."""

    __tablename__ = "proposals"
    __table_args__: ClassVar[tuple] = (Index("ix_proposal_run_status", "run_id", "status"),)

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    run_id: Mapped[str] = mapped_column(ForeignKey("agent_runs.id", ondelete="CASCADE"), nullable=False)
    artifact_id: Mapped[str | None] = mapped_column(ForeignKey("artifacts.id", ondelete="SET NULL"), nullable=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)

    proposal_type: Mapped[str] = mapped_column(String(48), nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    rationale: Mapped[str] = mapped_column(Text, nullable=False, default="")
    payload: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    source_refs: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    acceptance_criteria: Mapped[list] = mapped_column(JSON, nullable=False, default=list)

    status: Mapped[str] = mapped_column(String(16), nullable=False, default="pending")
    request_id: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    result_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(Timestamp, nullable=False, default=utcnow)
    decided_at: Mapped[datetime | None] = mapped_column(Timestamp, nullable=True)
    applied_at: Mapped[datetime | None] = mapped_column(Timestamp, nullable=True)


class Approval(Base):
    """Persistent, claimable decision state. This is what makes 'model proposes, human commits' real."""

    __tablename__ = "approvals"
    __table_args__: ClassVar[tuple] = (
        UniqueConstraint("run_id", "proposal_id", name="uq_approval_run_proposal"),
        Index("ix_approval_status_created", "status", "created_at"),
    )

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    thread_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    run_id: Mapped[str] = mapped_column(ForeignKey("agent_runs.id", ondelete="CASCADE"), nullable=False)
    proposal_id: Mapped[str] = mapped_column(String(32), nullable=False)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)

    status: Mapped[str] = mapped_column(String(16), nullable=False, default="pending")
    decided_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    feedback: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(Timestamp, nullable=False, default=utcnow)
    expires_at: Mapped[datetime] = mapped_column(Timestamp, nullable=False)
    resolved_at: Mapped[datetime | None] = mapped_column(Timestamp, nullable=True)


class Obligation(Base):
    """A commitment the agent made about what to do next, kept outside the run that
    made it. Axiom one ("the agent owns progression") is only literally true if the
    plan survives its own execution — otherwise every session restarts from a blank
    box and the person is the one carrying the thread.

    The trigger boundary settled in docs/v2/AI_NATIVE_ARCHITECTURE.md §11.4:
    an obligation may fire *on return*, or after `not_before` while the person is
    already here. This table has no push channel, and there is deliberately no
    `notified_at` column — proactivity with no off switch is harassment. Whether a
    due obligation is allowed to start a run by itself is decided by code and a
    cooldown, never by the model that wrote the promise.
    """

    __tablename__ = "agent_obligations"
    __table_args__: ClassVar[tuple] = (
        Index("ix_obligation_user_status", "user_id", "status"),
        Index("ix_obligation_due", "status", "not_before"),
    )

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    #: The run that made the promise. Kept when that run is deleted: a commitment the
    #: agent walked back by clearing history is still a commitment the user can see.
    run_id: Mapped[str | None] = mapped_column(ForeignKey("agent_runs.id", ondelete="SET NULL"), nullable=True)
    project_id: Mapped[str | None] = mapped_column(String(32), nullable=True, index=True)

    capability_id: Mapped[str] = mapped_column(String(64), nullable=False)
    #: 穗奈's own words about what she will go get. Shown verbatim in the UI, so a
    #: promise cannot be silently reworded into something the model never said.
    intent: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="open")
    trigger_kind: Mapped[str] = mapped_column(String(16), nullable=False, default="on_return")
    not_before: Mapped[datetime | None] = mapped_column(Timestamp, nullable=True)
    #: Which run was let in to discharge this promise. Kept on the obligation rather
    #: than on the run so the link survives a reload, a resume, or a lost state dict.
    claimed_run_id: Mapped[str | None] = mapped_column(ForeignKey("agent_runs.id", ondelete="SET NULL"), nullable=True)

    created_at: Mapped[datetime] = mapped_column(Timestamp, nullable=False, default=utcnow)
    claimed_at: Mapped[datetime | None] = mapped_column(Timestamp, nullable=True)
    resolved_at: Mapped[datetime | None] = mapped_column(Timestamp, nullable=True)


class Note(Base):
    """The first real business write target. Deliberately dull: M0 needs a row a
    proposal can actually create, so 'approved -> written' is provable end to end
    instead of being asserted."""

    __tablename__ = "notes"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    run_id: Mapped[str | None] = mapped_column(ForeignKey("agent_runs.id", ondelete="SET NULL"), nullable=True)
    proposal_id: Mapped[str | None] = mapped_column(ForeignKey("proposals.id", ondelete="SET NULL"), nullable=True)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    source_refs: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    request_id: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(Timestamp, nullable=False, default=utcnow)


class SessionToken(Base):
    """Bearer sessions. Only the SHA-256 of the presented token is stored, so a
    database leak does not hand over usable credentials."""

    __tablename__ = "session_tokens"

    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(Timestamp, nullable=False, default=utcnow)
    expires_at: Mapped[datetime] = mapped_column(Timestamp, nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(Timestamp, nullable=True)
