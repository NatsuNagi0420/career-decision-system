"""Append-only run timeline.

Events are committed to MySQL *before* being announced, which is what lets a
late SSE subscriber replay from ``seq=0`` without an in-memory ring buffer
having to cover the gap. The frame contract (event_id / per-run monotonic seq
starting at 0 / thread_id / run_id) is fixed in
docs/v2/AI_NATIVE_ARCHITECTURE.md §11.2 so a LangGraph-protocol adapter stays a
future add-on rather than a re-architecture.
"""

from __future__ import annotations

import asyncio
import contextlib
from collections.abc import AsyncIterator, Callable
from datetime import datetime
from typing import Annotated, Any, Literal, Union, get_args

from pydantic import BaseModel, Field, TypeAdapter
from sqlalchemy import func, select
from sqlalchemy.orm import Session, sessionmaker

from app.db.models import Event, Run, new_id


class _Frame(BaseModel):
    run_id: str
    thread_id: str
    seq: int
    event_id: str
    kind: str
    occurred_at: datetime


class RunStarted(_Frame):
    kind: Literal["run_started"]
    goal: str
    capability_id: str | None = None
    entry_point: str = "shell"


class StepStarted(_Frame):
    kind: Literal["step_started"]
    step_id: str
    step_kind: str
    name: str


class StepCompleted(_Frame):
    kind: Literal["step_completed"]
    step_id: str
    summary: str = ""


class ToolCallFinished(_Frame):
    kind: Literal["tool_call"]
    step_id: str
    name: str
    arguments: dict[str, Any] = Field(default_factory=dict)
    result_summary: str = ""
    truncated: bool = False
    source_refs: list[dict[str, Any]] = Field(default_factory=list)


class ArtifactCreated(_Frame):
    kind: Literal["artifact_created"]
    artifact_id: str
    artifact_type: str
    title: str
    version: int
    data_coverage: int | None = None
    is_provisional: bool = False
    generation_mode: str = "llm"


class ProposalCreated(_Frame):
    kind: Literal["proposal_created"]
    proposal_id: str
    proposal_type: str
    title: str
    rationale: str = ""
    risk_tier: str = "R2"
    acceptance_criteria: list[str] = Field(default_factory=list)
    source_refs: list[dict[str, Any]] = Field(default_factory=list)


class WriteWithheld(_Frame):
    """Emitted when a provisional artifact is deliberately not given a write."""

    kind: Literal["write_withheld"]
    artifact_id: str
    capability_id: str
    wanted_proposal: str = ""
    reason: str = ""


class ApprovalRequired(_Frame):
    kind: Literal["approval_required"]
    approval_id: str
    proposal_id: str
    expires_at: datetime


class ApprovalResolved(_Frame):
    kind: Literal["approval_resolved"]
    approval_id: str
    status: str
    decided_by: int | None = None


class UsageRecorded(_Frame):
    kind: Literal["usage_recorded"]
    model: str
    thinking: str
    prompt: int
    completion: int
    reasoning: int
    cached: int
    #: Without this the shell cannot file the spend under the step that caused it,
    #: and the numbers end up floating at the bottom of the timeline.
    step_id: str = ""


class ObligationCreated(_Frame):
    """The agent committing to a next step. Distinct from a proposal: nobody is being
    asked to approve it, and it outlives the run that wrote it."""

    kind: Literal["obligation_created"]
    obligation_id: str
    capability_id: str
    intent: str
    project_id: str | None = None
    trigger_kind: str = "on_return"
    not_before: datetime | None = None


class RunCompleted(_Frame):
    kind: Literal["run_completed"]
    status: str
    summary: str = ""


class RunFailed(_Frame):
    kind: Literal["run_failed"]
    error: str


FRAME_MODELS: tuple[type[_Frame], ...] = (
    RunStarted,
    StepStarted,
    StepCompleted,
    ToolCallFinished,
    ArtifactCreated,
    ProposalCreated,
    WriteWithheld,
    ApprovalRequired,
    ApprovalResolved,
    UsageRecorded,
    ObligationCreated,
    RunCompleted,
    RunFailed,
)

#: Declared once and read twice: the wire union and the kind vocabulary both come
#: from ``FRAME_MODELS``, so a frame type can no longer exist in one and not the
#: other. (The previous comprehension over ``model_fields["kind"].default`` yielded
#: ``(PydanticUndefined,)`` — a `Literal` with no default has no default.)
AnyFrame = Annotated[Union[FRAME_MODELS], Field(discriminator="kind")]  # noqa: UP007  # splatting a tuple of models; `|` cannot express it

FRAME_ADAPTER: TypeAdapter[AnyFrame] = TypeAdapter(AnyFrame)
FRAME_KINDS: tuple[str, ...] = tuple(
    sorted(str(get_args(model.model_fields["kind"].annotation)[0]) for model in FRAME_MODELS)
)


def to_payload(frame: BaseModel) -> dict[str, Any]:
    """Everything except the envelope columns; that split keeps the DB indexable."""
    return frame.model_dump(
        mode="json",
        exclude={"run_id", "thread_id", "seq", "event_id", "kind", "occurred_at"},
    )


class EventLog:
    def __init__(self, session_factory: sessionmaker[Session]) -> None:
        self._factory = session_factory
        self._waiters: dict[str, list[asyncio.Queue[None]]] = {}
        #: Answer text while it is still being written. Deliberately *not* in the
        #: durable log: a half-finished sentence is not a fact, and letting it take
        #: `seq` numbers would make replay mean something it does not.
        self._deltas: dict[str, list[asyncio.Queue[dict[str, Any]]]] = {}

    def next_seq(self, session: Session, run_id: str) -> int:
        current = session.scalar(select(func.max(Event.seq)).where(Event.run_id == run_id))
        return 0 if current is None else int(current) + 1

    def append(self, session: Session, run: Run, frame: BaseModel) -> Event:
        kind = str(frame.kind)
        event = Event(
            event_id=new_id(),
            run_id=run.id,
            thread_id=run.thread_id,
            seq=self.next_seq(session, run.id),
            kind=kind,
            # The frame's own timestamp, not re-read at insert time: the moment a
            # client was told about must be the moment on record.
            occurred_at=frame.occurred_at,
            payload=to_payload(frame),
        )
        session.add(event)
        session.flush()
        return event

    def announce(self, run_id: str) -> None:
        """Call after the committing transaction, never before."""
        for queue in self._waiters.get(run_id, []):
            queue.put_nowait(None)

    # ---------------- transient answer text, never persisted ----------------

    def publish_delta(self, run_id: str, snapshot: dict[str, Any]) -> None:
        """Push the whole answer-so-far. Each subscriber keeps only the newest
        snapshot, so a slow reader misses intermediate frames rather than
        falling behind forever."""
        for queue in self._deltas.get(run_id, []):
            while not queue.empty():
                queue.get_nowait()
            queue.put_nowait(snapshot)

    def subscribe_delta(self, run_id: str) -> tuple[asyncio.Queue[dict[str, Any]], Callable[[], None]]:
        queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue(maxsize=1)
        subscribers = self._deltas.setdefault(run_id, [])
        subscribers.append(queue)

        def detach() -> None:
            with contextlib.suppress(ValueError):
                subscribers.remove(queue)

        return queue, detach

    @staticmethod
    def to_frame(event: Event) -> AnyFrame:
        data: dict[str, Any] = {
            "run_id": event.run_id,
            "thread_id": event.thread_id,
            "seq": event.seq,
            "event_id": event.event_id,
            "kind": event.kind,
            "occurred_at": event.occurred_at,
            **(event.payload or {}),
        }
        return FRAME_ADAPTER.validate_python(data)

    def _register(self, run_id: str) -> tuple[asyncio.Queue[None], Callable[[], None]]:
        queue: asyncio.Queue[None] = asyncio.Queue()
        waiters = self._waiters.setdefault(run_id, [])
        waiters.append(queue)

        def detach() -> None:
            with contextlib.suppress(ValueError):
                waiters.remove(queue)

        return queue, detach

    async def stream(self, run_id: str, *, after_seq: int = -1) -> AsyncIterator[Event]:
        """Replay committed history, then follow live, with no gap and no dupes."""
        queue, detach = self._register(run_id)
        cursor = after_seq
        try:
            while True:
                with self._factory() as session:
                    rows = list(
                        session.scalars(
                            select(Event)
                            .where(Event.run_id == run_id, Event.seq > cursor)
                            .order_by(Event.seq)
                        )
                    )
                for row in rows:
                    cursor = row.seq
                    yield row
                if rows and rows[-1].kind in {"run_completed", "run_failed"}:
                    return
                if not rows:
                    try:
                        await asyncio.wait_for(queue.get(), timeout=30.0)
                    except TimeoutError:
                        continue
        finally:
            detach()
