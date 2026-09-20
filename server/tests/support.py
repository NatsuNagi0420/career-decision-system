from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session, sessionmaker

from app.agent.events import (
    ApprovalRequired,
    ApprovalResolved,
    ArtifactCreated,
    ObligationCreated,
    ProposalCreated,
    RunCompleted,
    RunFailed,
    RunStarted,
    StepCompleted,
    StepStarted,
    ToolCallFinished,
    UsageRecorded,
    WriteWithheld,
)
from app.db.models import utcnow
from app.tools.base import Tool, ToolResult


def call_tool(
    tool: Tool,
    session_factory: sessionmaker[Session],
    *,
    user_id: int,
    arguments: dict[str, Any],
) -> ToolResult:
    """Run a tool with a session that is guaranteed to close.

    Passing `session_factory()` straight in leaks an open transaction, and on
    MySQL a leaked read view is enough to block the next test's TRUNCATE forever.
    """
    session = session_factory()
    try:
        return tool.call(session, user_id=user_id, arguments=arguments)
    finally:
        session.close()


ENVELOPE = {
    "run_id": "run" + "0" * 24,
    "thread_id": "thread-1",
    "seq": 0,
    "event_id": "evt" + "0" * 24,
    "occurred_at": datetime(2026, 9, 19, 12, 0, 0),
}


def _frame(cls: type, kind: str, **extra: Any):
    return cls(kind=kind, **ENVELOPE, **extra)


def sample_frames() -> dict[str, Any]:
    """One instance per event kind, used both by validate.py's round-trip check and
    by the SSE tests, so a frame that cannot serialise fails the gate offline."""
    moment = utcnow()
    return {
        "run_started": _frame(RunStarted, "run_started", goal="在数据分析和后端之间做选择", capability_id="skeleton_probe"),
        "step_started": _frame(StepStarted, "step_started", step_id="s1", step_kind="plan", name="select_action"),
        "step_completed": _frame(StepCompleted, "step_completed", step_id="s1", summary="1 tool call(s)"),
        "tool_call": _frame(
            ToolCallFinished, "tool_call", step_id="s2", name="get_run_history",
            arguments={"limit": 3}, truncated=False, source_refs=[{"table": "agent_runs", "id": "r1"}],
        ),
        "artifact_created": _frame(
            ArtifactCreated, "artifact_created", artifact_id="a1", artifact_type="RunDigest",
            title="骨架自检", version=0, data_coverage=50, is_provisional=True, generation_mode="llm",
        ),
        "proposal_created": _frame(
            ProposalCreated, "proposal_created", proposal_id="p1", proposal_type="create_note",
            title="记录一条行动笔记", rationale="依据不足", risk_tier="R2",
            acceptance_criteria=["补一条真实岗位证据"], source_refs=[{"table": "agent_runs", "id": "r1"}],
        ),
        "write_withheld": _frame(
            WriteWithheld, "write_withheld", artifact_id="a1", capability_id="candidate_source",
            wanted_proposal="add_candidate", reason="覆盖度 0%，缺少逐字引文",
        ),
        "approval_required": _frame(ApprovalRequired, "approval_required", approval_id="ap1", proposal_id="p1", expires_at=moment),
        "approval_resolved": _frame(ApprovalResolved, "approval_resolved", approval_id="ap1", status="approved", decided_by=1),
        "usage_recorded": _frame(
            UsageRecorded, "usage_recorded", model="mock", thinking="on", step_id="s1",
            prompt=10, completion=5, reasoning=0, cached=0,
        ),
        "obligation_created": _frame(
            ObligationCreated, "obligation_created", obligation_id="ob1", capability_id="direction_explore",
            intent="去取两个方向的岗位原句", project_id=None, trigger_kind="scheduled", not_before=moment,
        ),
        "run_completed": _frame(RunCompleted, "run_completed", status="completed", summary="{}"),
        "run_failed": _frame(RunFailed, "run_failed", error="synthesize: boom"),
    }
