from __future__ import annotations

import asyncio
import json
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session, sessionmaker

from app.agent.approvals import ApprovalRepository
from app.agent.checkpointer import open_checkpointer
from app.agent.events import EventLog
from app.agent.provenance import capability_fingerprint
from app.agent.service import GraphRegistry, RunService
from app.api import routes
from app.capabilities.registry import get_capability
from app.config import Settings
from app.db.domain import ActionPlan, DecisionProject, PlanTask, TaskResult, WeeklyReview
from app.db.models import Approval, Artifact, Event, Note, Proposal, Run, User
from app.llm.gateway import Gateway, ScriptedProvider
from app.tools.base import ToolRegistry
from app.tools.domain import DOMAIN_TOOLS
from app.tools.readonly import READ_ONLY_TOOLS

GOAL = "我在数据分析和后端工程师之间犹豫，想先看看有没有可比的证据"


async def test_auto_capability_routes_a_resume_request(session_factory, settings, tmp_path, owner) -> None:
    async with build_service(settings, session_factory, [], tmp_path / "cp-auto.sqlite") as (service, _):
        run = service.create_run(owner, "帮我根据现在的情况写一份简历", capability_id="auto")
        assert run.capability_id == "resume_build"


def tool_payload(name: str, arguments: dict[str, Any], call_id: str = "call-1") -> dict[str, Any]:
    return {
        "choices": [
            {
                "message": {
                    "content": None,
                    "tool_calls": [{"id": call_id, "type": "function", "function": {"name": name, "arguments": json.dumps(arguments)}}],
                },
                "finish_reason": "tool_calls",
            }
        ],
        "model": "scripted",
        "usage": {"prompt_tokens": 100, "completion_tokens": 20},
    }


def text_payload(text: str) -> dict[str, Any]:
    return {
        "choices": [{"message": {"content": text}, "finish_reason": "stop"}],
        "model": "scripted",
        "usage": {"prompt_tokens": 120, "completion_tokens": 30},
    }


def digest_payload(
    conclusion: str,
    *,
    actions: list[str],
    quote: str = "",
    proposed: dict[str, Any] | None = None,
    next_step: dict[str, Any] | None = None,
) -> dict[str, Any]:
    body: dict[str, Any] = {
        "conclusion": conclusion,
        "evidence_basis": [{"claim": actions[0] if actions else "结论", "quote": quote, "source": "agent_runs"}],
        "uncertainties": ["还缺一条真实岗位证据"],
        "next_actions": actions,
    }
    if proposed is not None:
        body["proposed"] = proposed
    if next_step is not None:
        body["next_step"] = next_step
    return text_payload(json.dumps(body, ensure_ascii=False))


@pytest.fixture
def owner(session_factory: sessionmaker[Session]) -> User:
    with session_factory() as session:
        row = User(username="owner", password_hash="x")
        session.add(row)
        session.commit()
        session.refresh(row)
        return row


@asynccontextmanager
async def build_service(
    settings: Settings,
    session_factory: sessionmaker[Session],
    script: list[dict[str, Any]],
    checkpoint: Path,
    *,
    capability_ids: tuple[str, ...] = ("skeleton_probe",),
) -> AsyncIterator[tuple[RunService, ScriptedProvider]]:
    events = EventLog(session_factory)
    approvals = ApprovalRepository(settings)
    provider = ScriptedProvider(script)
    gateway = Gateway(settings=settings, provider=provider)
    async with open_checkpointer(settings.model_copy(update={"checkpoint_path": str(checkpoint)})) as checkpointer:
        graphs = GraphRegistry.build(
            capabilities=[get_capability(cid) for cid in capability_ids],
            tools=ToolRegistry([*READ_ONLY_TOOLS, *DOMAIN_TOOLS]),
            session_factory=session_factory,
            gateway=gateway,
            events=events,
            approvals=approvals,
            settings=settings,
            checkpointer=checkpointer,
        )
        yield RunService(session_factory=session_factory, graphs=graphs, events=events, approvals=approvals), provider


def _kinds(session_factory: sessionmaker[Session], run_id: str) -> list[str]:
    with session_factory() as session:
        return [
            event.kind
            for event in session.scalars(select(Event).where(Event.run_id == run_id).order_by(Event.seq))
        ]


async def test_run_started_frame_says_which_prompt_generation_answered(
    session_factory, settings, tmp_path, owner
) -> None:
    """目标五 asks for Prompt/Capability 版本管理. A stamp that is only recomputed from
    today's code cannot answer that question about last week's run, so the value has to
    be carried by the durable frame the run wrote at the time."""
    script = [
        tool_payload("get_run_history", {"limit": 3}),
        text_payload("已经看过历史"),
        digest_payload("先补两条真实岗位证据再比较", actions=["记录：找两条广州数据分析JD逐字对照"]),
    ]
    async with build_service(settings, session_factory, script, tmp_path / "cp-stamp.sqlite") as (service, _provider):
        run = service.create_run(owner, GOAL)
        await service.start(run, allow_external_ai=True)

        with session_factory() as session:
            started = session.scalars(
                select(Event).where(Event.run_id == run.id, Event.kind == "run_started")
            ).one()
        assert started.payload["prompt_fingerprint"] == capability_fingerprint(get_capability(run.capability_id))


async def test_run_interrupts_waits_and_then_writes_the_row(session_factory, settings, tmp_path, owner) -> None:
    script = [
        tool_payload("get_run_history", {"limit": 3}),
        text_payload("已经看过历史，没有可比结论"),
        digest_payload("先补两条真实岗位证据再比较", actions=["记录：找两条广州数据分析JD逐字对照"]),
    ]
    async with build_service(settings, session_factory, script, tmp_path / "cp.sqlite") as (service, provider):
        run = service.create_run(owner, GOAL)
        first = await service.start(run, allow_external_ai=True)

        assert first["interrupted"] is True, "graph must pause on the confirmation gate, not run to the end"
        with session_factory() as session:
            assert session.get(Run, run.id).status == "awaiting_approval"
            pending = session.scalars(select(Proposal).where(Proposal.run_id == run.id)).one()
        assert provider.seen_payloads[0]["tools"][0]["function"]["name"] == "get_run_history"

        service.mark_approval_decided(run.id, owner, _approval_id(session_factory, run.id))
        final = await service.resume(run, decision={"approved": True, "feedback": "可以"}, allow_external_ai=True)

        assert final["status"] == "completed"
        with session_factory() as session:
            note = session.scalars(select(Note).where(Note.run_id == run.id)).one()
            artifact = session.get(Artifact, pending.artifact_id)
            stored = session.get(Proposal, pending.id)
            assert note.body.startswith("记录：")
            assert note.request_id == stored.request_id
            assert artifact.status == "committed"
            assert stored.status == "applied"


async def test_a_run_reads_the_project_it_belongs_to(session_factory, settings, tmp_path, owner) -> None:
    """Measured live, and the reason this is code's job: the model called
    `get_plan(project_id="default")`, every scoped tool answered "no data", and the run
    concluded — honestly, and wrongly — that the project held no evidence at all. A run
    is already bound to one decision project, so it answers for that one."""
    with session_factory() as session:
        project = DecisionProject(user_id=owner.id, title="分析还是后端", question="我更适合哪个方向")
        session.add(project)
        session.flush()
        plan = ActionPlan(
            project_id=project.id, user_id=owner.id, title="四周验证", generation_request_id="bind-plan"
        )
        session.add(plan)
        session.flush()
        task = PlanTask(plan_id=plan.id, user_id=owner.id, title="投 5 份并记录回复", week_no=1)
        session.add(task)
        session.flush()  # ids exist only after a flush, and task_results points at one
        session.add(
            TaskResult(
                task_id=task.id, user_id=owner.id, body="投了 5 份，2 个已读不回", request_id="bind-result"
            )
        )
        session.commit()
        project_id, task_id = project.id, task.id

    script = [
        tool_payload("get_plan", {"project_id": "default"}),
        text_payload("读到了他交回的账"),
        digest_payload("先看他交回的回复率", actions=["记录：再补两份 JD"], quote="投了 5 份，2 个已读不回"),
    ]
    async with build_service(
        settings, session_factory, script, tmp_path / "cp.sqlite", capability_ids=("evidence_collect",)
    ) as (service, _):
        run = service.create_run(
            owner, "把这条结果整理成证据", capability_id="evidence_collect", project_id=project_id
        )
        await service.start(run, allow_external_ai=True)

    with session_factory() as session:
        call = next(
            event
            for event in session.scalars(select(Event).where(Event.run_id == run.id).order_by(Event.seq))
            if event.kind == "tool_call" and event.payload.get("name") == "get_plan"
        )
    assert call.payload["arguments"]["project_id"] == project_id
    # The read that matters: the person's own task row came back, so the account in it
    # can reach the conclusion instead of being remembered by the model.
    assert {"table": "plan_tasks", "id": task_id} in call.payload["source_refs"]


async def test_a_week_is_reviewed_by_the_run_but_closed_by_a_human(
    session_factory, settings, tmp_path, owner
) -> None:
    """P1-3: `weekly_review` is live and still not agent-executable.

    The run reads the week, drafts a `WeeklyReviewDraft` and stops there — no Proposal,
    no approval, nothing in `weekly_reviews`. The terminal write belongs to the
    confirmation endpoint (tests/test_weekly_reviews.py), which is the whole point of
    the R3 tier: a model draft may end a period only after a person says it did.
    """
    with session_factory() as session:
        project = DecisionProject(user_id=owner.id, title="分析还是后端", question="我更适合哪个方向")
        session.add(project)
        session.flush()
        session.add(
            ActionPlan(project_id=project.id, user_id=owner.id, title="四周验证", generation_request_id="review-plan")
        )
        session.commit()
        project_id = project.id

    review = {
        "conclusion": "本周按计划投出 5 份数据分析岗，2 个已读不回、1 次一面",
        "evidence_basis": [],
        "uncertainties": ["还没在后端岗上做过同样的验证"],
        "next_actions": ["下周投 5 份后端岗并记录回复"],
        "confidence_trend": "up",
        "confidence_reason": "数据分析方向真约到了面试",
        "next_focus": "后端岗的回复率",
    }
    script = [
        tool_payload("get_plan", {"project_id": project_id}),
        text_payload("读到了本周的账"),
        text_payload(json.dumps(review, ensure_ascii=False)),
    ]
    async with build_service(
        settings, session_factory, script, tmp_path / "cp.sqlite", capability_ids=("weekly_review",)
    ) as (service, _):
        run = service.create_run(owner, "复盘这一周", capability_id="weekly_review", project_id=project_id)
        await service.start(run, allow_external_ai=True)

    with session_factory() as session:
        artifact = session.scalar(select(Artifact).where(Artifact.run_id == run.id))
        assert artifact is not None
        assert artifact.artifact_type == "WeeklyReviewDraft"
        # Structured, so the card can show the trend as a value and carry it into the table.
        assert artifact.content["confidence_trend"] == "up"
        assert session.scalar(select(func.count(Proposal.id)).where(Proposal.run_id == run.id)) == 0
        assert session.scalar(select(func.count(WeeklyReview.id))) == 0
        assert session.get(Run, run.id).status == "completed"


async def test_rejection_writes_nothing_but_still_records_the_decision(session_factory, settings, tmp_path, owner) -> None:
    script = [
        tool_payload("get_run_history", {"limit": 3}),
        text_payload("没有可比结论"),
        digest_payload("先补证据", actions=["记录：补证据"]),
    ]
    async with build_service(settings, session_factory, script, tmp_path / "cp.sqlite") as (service, _):
        run = service.create_run(owner, GOAL)
        await service.start(run, allow_external_ai=True)
        service.mark_approval_decided(run.id, owner, _approval_id(session_factory, run.id))
        final = await service.resume(run, decision={"approved": False, "feedback": "先不写"}, allow_external_ai=True)

        assert final["status"] == "cancelled"
        with session_factory() as session:
            assert session.scalars(select(Note).where(Note.run_id == run.id)).first() is None
            assert session.scalars(select(Proposal).where(Proposal.run_id == run.id)).one().status == "rejected"


async def test_resume_after_losing_the_process_does_not_redo_work(session_factory, settings, tmp_path, owner) -> None:
    """A5 at service level: crash between interrupt and decision, rebuild from the
    checkpoint file, and the pre-gate nodes must not run a second time."""
    checkpoint = tmp_path / "cp.sqlite"
    script_a = [
        tool_payload("get_run_history", {"limit": 3}),
        text_payload("看过了"),
        digest_payload("先补证据", actions=["记录：一条就够"]),
    ]
    async with build_service(settings, session_factory, script_a, checkpoint) as (service, provider):
        run = service.create_run(owner, GOAL)
        await service.start(run, allow_external_ai=True)
        tool_calls_before = sum(len(p["messages"]) for p in provider.seen_payloads)

    script_b = [digest_payload("先补证据", actions=["记录：一条就够"])]
    async with build_service(settings, session_factory, script_b, checkpoint) as (service, _):
        with session_factory() as session:
            stored = session.get(Run, run.id)
        service.mark_approval_decided(run.id, owner, _approval_id(session_factory, run.id))
        final = await service.resume(stored, decision={"approved": True, "feedback": ""}, allow_external_ai=True)

        assert final["status"] == "completed"
        with session_factory() as session:
            notes = list(session.scalars(select(Note).where(Note.run_id == run.id)))
            assert len(notes) == 1, f"expected exactly one write, got {len(notes)}"
        assert tool_calls_before > 0


async def test_llm_failure_marks_the_run_failed_without_a_draft(session_factory, settings, tmp_path, owner) -> None:
    """Structured output that never satisfies the schema must fail loudly. The old
    shape of this bug was a silent fallback to a rule template."""
    script = [
        text_payload("不查工具，直接给结论"),
        text_payload("{ not json at all"),
        text_payload("{}"),
    ]
    async with build_service(settings, session_factory, script, tmp_path / "cp.sqlite") as (service, _):
        run = service.create_run(owner, GOAL)
        final = await service.start(run, allow_external_ai=True)
        assert final["status"] == "failed"
        with session_factory() as session:
            stored = session.get(Run, run.id)
            assert stored.error is not None and "schema" in stored.error
            assert session.scalars(select(Artifact).where(Artifact.run_id == run.id)).first() is None


async def test_out_of_scope_goal_never_reaches_the_model(session_factory, settings, tmp_path, owner) -> None:
    async with build_service(settings, session_factory, [], tmp_path / "cp.sqlite") as (service, provider):
        run = service.create_run(owner, "嗯")
        final = await service.start(run, allow_external_ai=True)
        assert final["status"] in {"failed", "cancelled"}
        assert provider.seen_payloads == [], "a rejected goal must not cost a model call"


async def test_fabricated_numbers_force_the_artifact_provisional(session_factory, settings, tmp_path, owner) -> None:
    script = [
        tool_payload("get_run_history", {"limit": 3}),
        text_payload("看过了"),
        digest_payload("后端工程师起薪 25000 更划算", actions=["记录：核实薪资"]),
    ]
    async with build_service(settings, session_factory, script, tmp_path / "cp.sqlite") as (service, _):
        run = service.create_run(owner, GOAL)
        await service.start(run, allow_external_ai=True)
        with session_factory() as session:
            artifact = session.scalars(select(Artifact).where(Artifact.run_id == run.id)).one()
        assert artifact.is_provisional is True
        assert "25000" in artifact.content["fact_check"]["numbers_not_in_tool_facts"]


async def test_events_are_appended_in_order_and_terminate(session_factory, settings, tmp_path, owner) -> None:
    script = [
        tool_payload("get_run_history", {"limit": 3}),
        text_payload("看过了"),
        digest_payload("先补证据", actions=["记录：补证据"], quote="广州 初级数据分析 9-13k"),
    ]
    async with build_service(settings, session_factory, script, tmp_path / "cp.sqlite") as (service, _):
        run = service.create_run(owner, GOAL)
        await service.start(run, allow_external_ai=True)
        service.mark_approval_decided(run.id, owner, _approval_id(session_factory, run.id))
        await service.resume(run, decision={"approved": True, "feedback": ""}, allow_external_ai=True)

        kinds = _kinds(session_factory, run.id)
        assert kinds[0] == "run_started", "the person's own turn opens the thread"
        assert kinds[1] == "step_started"
        assert "tool_call" in kinds and "artifact_created" in kinds
        assert "approval_required" in kinds and "approval_resolved" in kinds
        assert kinds[-1] == "run_completed"
        assert kinds.count("run_completed") == 1
        seqs = _seqs(session_factory, run.id)
        assert seqs == list(range(len(seqs))), "seq must be dense and monotonic for replay"


async def test_the_thread_opens_with_the_persons_own_turn(session_factory, settings, tmp_path, owner) -> None:
    """`run_started` was declared, round-trip sampled, and handled by the shell — but
    nothing ever emitted it, so the conversation had no user turn in it at all."""
    script = [
        text_payload("已经看过历史，没有可比结论"),
        digest_payload("先补两条真实岗位证据再比较", actions=["记录：找两条广州数据分析JD逐字对照"]),
    ]
    async with build_service(settings, session_factory, script, tmp_path / "cp.sqlite") as (service, _provider):
        run = service.create_run(owner, GOAL)
        await service.start(run, allow_external_ai=True)

        with session_factory() as session:
            first = session.scalars(select(Event).where(Event.run_id == run.id).order_by(Event.seq)).first()
        assert first is not None and first.kind == "run_started", _kinds(session_factory, run.id)
        assert first.seq == 0
        assert first.payload["goal"] == GOAL
        assert first.payload["capability_id"] == "skeleton_probe"


def _approval_id(session_factory: sessionmaker[Session], run_id: str) -> str:
    with session_factory() as session:
        return session.scalars(select(Approval).where(Approval.run_id == run_id)).one().id


def _seqs(session_factory: sessionmaker[Session], run_id: str) -> list[int]:
    with session_factory() as session:
        return [event.seq for event in session.scalars(select(Event).where(Event.run_id == run_id).order_by(Event.seq))]


def test_streamed_conclusion_reads_only_what_is_legible_yet() -> None:
    """The digest is JSON, so a raw delta is not something to show a person. Only the
    `conclusion` string is surfaced, and only up to a point that can be decoded."""
    from app.agent.graph import streamed_conclusion

    backslash = chr(92)
    head = '{"conclusion": "'

    assert streamed_conclusion('{"comp') == ""
    assert streamed_conclusion(head + "广州") == "广州"
    assert streamed_conclusion(head + "广州样本" + '", "uncertainties"') == "广州样本"
    assert streamed_conclusion(head + "带" + backslash + "n换行") == "带\n换行"
    assert streamed_conclusion(head + "带" + backslash + "u96c6") == "带集"
    # A half-written escape must not guess: the tail is what the reader is watching.
    assert streamed_conclusion(head + "带" + backslash) == "带"
    assert streamed_conclusion(head + "带" + backslash + "u96") == "带"


async def test_a_crashed_background_run_stops_claiming_to_work(
    session_factory: sessionmaker[Session],
    settings: Settings,
    tmp_path: Path,
    owner: User,
    caplog: pytest.LogCaptureFixture,
) -> None:
    """Whatever the graph did not catch itself must still reach a person and a log.

    `_spawn` used to drop its reference and nothing else: an exception raised outside
    the graph's own failure paths — a checkpointer hiccup, a bug in a node — vanished,
    and the row stayed `created` so the feed kept saying "进行中" until the 15-minute
    sweep happened to look. That is 目标四's "要么能恢复，要么明确失败" failing quietly.
    """
    caplog.set_level("ERROR", logger="career.routes")
    async with build_service(settings, session_factory, [], tmp_path / "cp.sqlite") as (service, _):
        run = service.create_run(owner, GOAL)
        request = SimpleNamespace(
            app=SimpleNamespace(state=SimpleNamespace(background_tasks=set(), runs=service))
        )

        async def crash() -> None:
            raise RuntimeError("checkpointer 在写入前掉线")

        routes._spawn(request, crash(), run_id=run.id)
        await asyncio.sleep(0.2)

        with session_factory() as session:
            row = session.get(Run, run.id)
            kinds = list(session.scalars(select(Event.kind).where(Event.run_id == run.id)))
        assert row.status == "failed"
        assert row.error is not None and row.error.startswith("background:")
        assert "checkpointer 在写入前掉线" in row.error
        assert row.finished_at is not None
        assert "run_failed" in kinds, "开着页面的人也要看到它死了，而不只是刷新后才对"
        assert "后台任务中断" in caplog.text
        assert request.app.state.background_tasks == set()
