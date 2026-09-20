from __future__ import annotations

import operator
from typing import Annotated, Any, TypedDict


class RunState(TypedDict, total=False):
    """JSON-only graph state, so any checkpointer backend can serialise it.

    Fields are slotted per node rather than sharing one bag, and `errors`
    accumulates instead of last-write-winning — v1 overwrote a whole JSON column
    on every resume, which silently discarded earlier node failures.
    `tool_facts` and `synthesis` are kept apart on purpose: mixing "what the data
    says" with "what the model thinks about it" is what makes fabrication
    uncheckable.
    """

    run_id: str
    thread_id: str
    user_id: int
    goal: str
    project_id: str | None
    capability_id: str
    allow_external_ai: bool

    out_of_scope: bool
    scope_reason: str

    messages: list[dict[str, Any]]
    tool_trace: list[dict[str, Any]]
    tool_facts: dict[str, Any]
    rounds_used: int

    synthesis: dict[str, Any] | None
    pending_tool_calls: list[dict[str, Any]]
    artifact_id: str
    proposal_id: str
    approval_id: str
    decision: dict[str, Any] | None
    applied: dict[str, Any] | None
    #: The promise this run was started to discharge, and the new promise this run
    #: makes on its way out. Two different slots on purpose: a continuation both
    #: settles a debt and incurs a new one.
    source_obligation_id: str
    obligation_id: str

    usage: dict[str, int]
    status: str
    errors: Annotated[list[str], operator.add]
