"""The two ceilings every run already declares but used not to enforce.

`agent_runs` carries `max_steps` and `token_budget` on every row. Before §24 nothing
read them: the loop was bounded only by `max_rounds`, so a model that kept asking for
tools could spend past the budget the run says it has — and the columns, being
populated and reported, looked like they were doing something.
"""

from __future__ import annotations

import json
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker

from app.agent.approvals import ApprovalRepository
from app.agent.checkpointer import open_checkpointer
from app.agent.events import EventLog
from app.agent.service import GraphRegistry, RunService
from app.capabilities.registry import get_capability
from app.config import Settings
from app.db.models import Artifact, Run, User
from app.llm.gateway import Gateway, ScriptedProvider
from app.tools.base import ToolRegistry
from app.tools.domain import DOMAIN_TOOLS
from app.tools.readonly import READ_ONLY_TOOLS

from .test_run_lifecycle import digest_payload, text_payload, tool_payload

GOAL = "我想先看清楚两个方向有没有可比的证据"


@asynccontextmanager
async def build_service(
    settings: Settings,
    session_factory: sessionmaker[Session],
    script: list[dict[str, Any]],
    checkpoint: Path,
) -> AsyncIterator[tuple[RunService, ScriptedProvider]]:
    events = EventLog(session_factory)
    approvals = ApprovalRepository(settings)
    provider = ScriptedProvider(script)
    gateway = Gateway(settings=settings, provider=provider)
    async with open_checkpointer(settings.model_copy(update={"checkpoint_path": str(checkpoint)})) as checkpointer:
        graphs = GraphRegistry.build(
            capabilities=[get_capability("skeleton_probe")],
            tools=ToolRegistry([*READ_ONLY_TOOLS, *DOMAIN_TOOLS]),
            session_factory=session_factory,
            gateway=gateway,
            events=events,
            approvals=approvals,
            settings=settings,
            checkpointer=checkpointer,
        )
        yield RunService(session_factory=session_factory, graphs=graphs, events=events, approvals=approvals), provider


@pytest.fixture
def owner(session_factory: sessionmaker[Session]) -> User:
    with session_factory() as session:
        row = User(username="ceiling-owner", password_hash="x")
        session.add(row)
        session.commit()
        session.refresh(row)
        return row


def _limit(run_id: str, session_factory: sessionmaker[Session], **columns: int) -> None:
    with session_factory() as session:
        run = session.get(Run, run_id)
        for name, value in columns.items():
            setattr(run, name, value)
        session.commit()


def _run(run_id: str, session_factory: sessionmaker[Session]) -> Run:
    with session_factory() as session:
        return session.get(Run, run_id)


async def test_a_model_call_that_failed_is_still_a_paid_call(session_factory, settings, tmp_path, owner) -> None:
    """A rejected call is not a free call, and the run's row is the only ledger.

    §25 measured the endpoint billing a truncated stream like any other
    (`completion_tokens=40, reasoning_tokens=40`). Both ladder rungs here burn
    their budget on thinking and return nothing, so the run must fail *and* carry
    2 × 299 completion tokens — otherwise the per-capability cost P3 wants to
    compare is computed from a total that silently drops the expensive failures.
    And it must fail *naming the planner*: falling through to synthesize asked a
    third question of a run that was already lost, and the second failure rewrote
    the stage the person reads.
    """
    burned = {"prompt_tokens": 10, "completion_tokens": 299, "completion_tokens_details": {"reasoning_tokens": 299}}
    truncated = {"choices": [{"message": {"content": ""}, "finish_reason": "length"}], "usage": burned}
    async with build_service(settings, session_factory, [truncated, truncated], tmp_path / "cp.sqlite") as (service, provider):
        run = service.create_run(owner, GOAL)
        await service.start(run, allow_external_ai=True)
        row = _run(run.id, session_factory)
        assert row.status == "failed"
        assert "select_action" in (row.error or "")
        assert "exhausted max_tokens" in (row.error or "")
        assert (row.prompt_tokens, row.completion_tokens, row.reasoning_tokens) == (20, 598, 598)
        assert len(provider.seen_payloads) == 2


async def test_a_run_out_of_steps_stops_gathering_but_still_answers(session_factory, settings, tmp_path, owner) -> None:
    """Cutting the loop short must not cut off the person.

    Without the ceiling this script spends three model calls (planner, planner,
    synthesize) and would keep going for `max_rounds` rounds; with it the second
    planner call never happens, and synthesize is told in its own prompt that the
    gap it leaves is a stopped-short gap.
    """
    script = [tool_payload("get_run_history", {"limit": 3}), digest_payload("先补证据", actions=["记录一条 JD 原句"])]
    async with build_service(settings, session_factory, script, tmp_path / "cp.sqlite") as (service, provider):
        run = service.create_run(owner, GOAL)
        _limit(run.id, session_factory, max_steps=1)
        await service.start(run, allow_external_ai=True)

        assert len(provider.seen_payloads) == 2, "步数用完后不该再问一次模型"
        synthesis_turn = json.dumps(provider.seen_payloads[1], ensure_ascii=False)
        assert "步数上限" in synthesis_turn and "uncertainties" in synthesis_turn
        assert _run(run.id, session_factory).steps_used == 2

        with session_factory() as session:
            assert session.scalars(select(Artifact).where(Artifact.run_id == run.id)).first() is not None


async def test_a_run_out_of_tokens_fails_at_the_budget_instead_of_answering(session_factory, settings, tmp_path, owner) -> None:
    """The last call is also a call: past the budget the run stops and says so."""
    script = [tool_payload("get_run_history", {"limit": 3}), digest_payload("不该出现", actions=["..."])]
    async with build_service(settings, session_factory, script, tmp_path / "cp.sqlite") as (service, provider):
        run = service.create_run(owner, GOAL)
        _limit(run.id, session_factory, token_budget=50)
        await service.start(run, allow_external_ai=True)

        failed = _run(run.id, session_factory)
        assert (failed.status, failed.finished_at is not None) == ("failed", True)
        assert "token 预算" in (failed.error or "") and "50" in failed.error
        assert len(provider.seen_payloads) == 1, "超预算之后一帧都不许多花"
        with session_factory() as session:
            assert session.scalars(select(Artifact).where(Artifact.run_id == run.id)).first() is None


async def test_a_run_with_room_spends_normally(session_factory, settings, tmp_path, owner) -> None:
    """The guard must not quietly become the reason nothing ever finishes."""
    script = [
        tool_payload("get_run_history", {"limit": 3}),
        text_payload("已经看过历史，不再取工具"),
        digest_payload("先补两条真实岗位证据", actions=["记录：找两条广州 JD 逐字对照"]),
    ]
    async with build_service(settings, session_factory, script, tmp_path / "cp.sqlite") as (service, provider):
        run = service.create_run(owner, GOAL)
        first = await service.start(run, allow_external_ai=True)

        assert first["interrupted"] is True
        assert len(provider.seen_payloads) == 3
        assert _run(run.id, session_factory).steps_used == 3
