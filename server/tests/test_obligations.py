"""Obligations: the promises that make the agent the one carrying the thread.

These tests are the executable version of §11.4. The interesting cases are not "does
the row get written" but "what is *not* allowed to happen": a model inventing a
capability, two tabs claiming one promise, a reload restarting an auto-run over and
over, and a project-scoped promise being started without a project to work in.
"""

from __future__ import annotations

from datetime import timedelta
from typing import Any

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker

from app.agent.approvals import ApprovalRepository
from app.agent.events import EventLog
from app.agent.obligations import ObligationNotClaimable, ObligationNotFound, ObligationRepository
from app.agent.service import NotOwner, RunService
from app.capabilities.registry import get_capability
from app.config import Settings
from app.db.models import Event, Obligation, Run, User, new_id, utcnow
from tests.test_run_lifecycle import build_service, digest_payload, text_payload

PROMISE = "去取两个方向的真实岗位样本与要求条目原句，逐字抄回来"


@pytest.fixture
def owner(session_factory: sessionmaker[Session]) -> User:
    with session_factory() as session:
        row = User(username="promise-keeper", password_hash="x")
        session.add(row)
        session.commit()
        session.refresh(row)
        return row


def make_run(session_factory: sessionmaker[Session], owner: User) -> Run:
    """A real row, because `claimed_run_id` is a foreign key and a fake id would fail
    for the wrong reason."""
    with session_factory() as session:
        run = Run(thread_id=new_id(), user_id=owner.id, goal="g", status="running")
        session.add(run)
        session.commit()
        session.refresh(run)
        return run


def _script(target: str, *, intent: str = PROMISE, wait_hours: int = 0) -> list[dict[str, Any]]:
    return [
        text_payload("先看已有的记录"),
        digest_payload(
            "现在还不能给倾向，先把岗位要求取回来。",
            actions=["把两份岗位要求逐条对齐现有记录"],
            next_step={"capability_id": target, "intent": intent, "wait_hours": wait_hours},
        ),
    ]


def _kinds(session_factory: sessionmaker[Session], run_id: str) -> list[str]:
    with session_factory() as session:
        return [
            event.kind
            for event in session.scalars(select(Event).where(Event.run_id == run_id).order_by(Event.seq))
        ]


def _promises(session_factory: sessionmaker[Session]) -> list[Obligation]:
    with session_factory() as session:
        return list(session.scalars(select(Obligation).order_by(Obligation.created_at)))


def _service(session_factory: sessionmaker[Session], settings: Settings) -> RunService:
    """A service with no graphs: enough to exercise the object layer, which never runs
    anything."""
    return RunService(
        session_factory=session_factory,
        graphs=None,  # type: ignore[arg-type]
        events=EventLog(session_factory),
        approvals=ApprovalRepository(settings),
    )


async def test_a_finished_run_leaves_a_durable_promise(session_factory, settings, tmp_path, owner) -> None:
    async with build_service(
        settings, session_factory, _script("direction_explore"), tmp_path / "cp.sqlite",
        capability_ids=("profile_diagnose", "direction_explore"),
    ) as (service, _provider):
        run = service.create_run(owner, "我在两个方向之间犹豫", capability_id="profile_diagnose")
        result = await service.start(run, allow_external_ai=True)

        assert result["status"] == "completed"
        [obligation] = _promises(session_factory)
        assert obligation.capability_id == "direction_explore"
        assert obligation.intent == PROMISE, "the promise is shown verbatim, never paraphrased"
        assert obligation.status == "open"
        assert obligation.trigger_kind == "on_return"
        assert obligation.not_before is None
        assert "obligation_created" in _kinds(session_factory, run.id)

        feed = service.feed(owner)
        assert [entry["id"] for entry in feed["obligations"]] == [obligation.id]
        assert feed["obligations"][0]["capability_name"] == get_capability("direction_explore").name
        assert feed["runs"][0]["id"] == run.id


@pytest.mark.parametrize("target", ["skeleton_probe", "no_such_capability", "weekly_review"])
async def test_a_promise_pointing_at_the_wrong_thing_is_dropped_not_fatal(
    session_factory, settings, tmp_path, owner, target
) -> None:
    """Internal plumbing, an invented id and an unimplemented capability are all
    equally unpromisable. None of them may destroy an answer that was already good."""
    async with build_service(
        settings, session_factory, _script(target), tmp_path / "cp.sqlite", capability_ids=("profile_diagnose",)
    ) as (service, _provider):
        run = service.create_run(owner, "我在两个方向之间犹豫", capability_id="profile_diagnose")
        result = await service.start(run, allow_external_ai=True)

    assert result["status"] == "completed"
    assert _promises(session_factory) == []
    assert "obligation_created" not in _kinds(session_factory, run.id)


async def test_a_scheduled_promise_waits_and_a_short_one_is_not_a_promise(
    session_factory, settings, tmp_path, owner
) -> None:
    async with build_service(
        settings, session_factory, _script("direction_explore", wait_hours=48), tmp_path / "cp.sqlite",
        capability_ids=("profile_diagnose",),
    ) as (service, _provider):
        await service.start(service.create_run(owner, "等招聘方回复之后再比较", capability_id="profile_diagnose"),
                            allow_external_ai=True)
    [row] = _promises(session_factory)
    assert row.trigger_kind == "scheduled"
    assert row.not_before is not None and row.not_before > utcnow()

    async with build_service(
        settings, session_factory, _script("direction_explore", intent="看看"), tmp_path / "cp2.sqlite",
        capability_ids=("profile_diagnose",),
    ) as (service, _provider):
        await service.start(service.create_run(owner, "再来一次", capability_id="profile_diagnose"),
                            allow_external_ai=True)

    assert [p.id for p in _promises(session_factory)] == [row.id], "a two-character promise is not a commitment"


def test_claim_is_single_writer(session_factory, owner) -> None:
    repo = ObligationRepository()
    run = make_run(session_factory, owner)
    with session_factory() as session:
        obligation = Obligation(user_id=owner.id, capability_id="direction_explore", intent=PROMISE)
        session.add(obligation)
        session.commit()
        obligation_id = obligation.id

    with session_factory() as session:
        claimed = repo.claim(session, obligation_id, user_id=owner.id, run_id=run.id)
        session.commit()
        assert claimed.status == "claimed"
    with session_factory() as session, pytest.raises(ObligationNotClaimable):
        repo.claim(session, obligation_id, user_id=owner.id, run_id=run.id)
    with session_factory() as session, pytest.raises(ObligationNotFound):
        repo.claim(session, "does-not-exist", user_id=owner.id, run_id=run.id)


async def test_claiming_through_create_run_binds_the_project_and_rejects_a_double(
    session_factory, settings, tmp_path, owner
) -> None:
    async with build_service(
        settings, session_factory, _script("direction_explore"), tmp_path / "cp.sqlite",
        capability_ids=("profile_diagnose", "direction_explore"),
    ) as (service, _provider):
        run = service.create_run(owner, "我在两个方向之间犹豫", capability_id="profile_diagnose")
        await service.start(run, allow_external_ai=True)
        promise = _promises(session_factory)[0]

        started = service.create_run(
            owner, promise.intent, capability_id="direction_explore", obligation_id=promise.id
        )
        with session_factory() as session:
            claimed = session.get(Obligation, promise.id)
            assert claimed.status == "claimed" and claimed.claimed_run_id == started.id
        assert started.entry_point == "obligation"

        before = len(service.feed(owner)["runs"])
        with pytest.raises(ObligationNotClaimable):
            service.create_run(owner, promise.intent, capability_id="direction_explore", obligation_id=promise.id)
        assert len(service.feed(owner)["runs"]) == before, "a rejected claim leaves no orphan run behind"


async def test_a_continuation_discharges_the_promise_and_makes_a_narrower_one(
    session_factory, settings, tmp_path, owner
) -> None:
    script = [
        *_script("direction_explore"),
        text_payload("去取岗位要求"),
        digest_payload(
            "两个方向的样本都拿到了，先落进项目。",
            actions=["补候选"],
            next_step={"capability_id": "candidate_source", "intent": "给这个项目补两个有依据的候选，各带回岗位原句"},
        ),
    ]
    async with build_service(
        settings, session_factory, script, tmp_path / "cp.sqlite",
        capability_ids=("profile_diagnose", "direction_explore", "candidate_source"),
    ) as (service, _provider):
        first = service.create_run(owner, "我在两个方向之间犹豫", capability_id="profile_diagnose")
        await service.start(first, allow_external_ai=True)
        promise = _promises(session_factory)[0]

        second = service.create_run(
            owner, promise.intent, capability_id="direction_explore", obligation_id=promise.id
        )
        result = await service.start(second, allow_external_ai=True)

    assert result["status"] == "completed"
    with session_factory() as session:
        assert session.get(Obligation, promise.id).status == "fulfilled"
    follow_ups = [p for p in _promises(session_factory) if p.capability_id == "candidate_source"]
    assert [p.status for p in follow_ups] == ["open"]
    assert follow_ups[0].run_id == second.id, "the new promise belongs to the continuation, not the original"


def test_continuation_rate_limits_itself(session_factory, owner) -> None:
    repo = ObligationRepository()
    now = utcnow()
    with session_factory() as session:
        session.add(Obligation(user_id=owner.id, capability_id="direction_explore", intent=PROMISE))
        session.commit()

        due, blocked = repo.continuation(
            session, user_id=owner.id, last_autorun_at=now - timedelta(minutes=5),
            cooldown=timedelta(minutes=30), now=now,
        )
        assert due is None and blocked == "cooling_down"

        due, blocked = repo.continuation(
            session, user_id=owner.id, last_autorun_at=now - timedelta(hours=3),
            cooldown=timedelta(minutes=30), now=now,
        )
        assert blocked is None and due is not None and due.intent == PROMISE

        due, blocked = repo.continuation(
            session, user_id=owner.id + 7, last_autorun_at=None, cooldown=timedelta(minutes=30), now=now
        )
        assert due is None and blocked == "no_due_obligation"


def test_a_project_scoped_promise_is_visible_but_never_autostarted(session_factory, owner) -> None:
    repo = ObligationRepository()
    with session_factory() as session:
        session.add_all(
            [
                Obligation(user_id=owner.id, capability_id="candidate_source", intent=PROMISE),
                Obligation(user_id=owner.id, capability_id="candidate_source", intent=PROMISE, project_id=new_id()),
            ]
        )
        session.commit()
        due = repo.due(session, user_id=owner.id)

    assert len(due) == 2, "both are due; only one of them is doable"
    assert [repo.startable(row) for row in due] == [False, True]


def test_scheduled_promises_stay_quiet_until_their_hour(session_factory, owner) -> None:
    repo = ObligationRepository()
    now = utcnow()
    with session_factory() as session:
        session.add(
            Obligation(
                user_id=owner.id,
                capability_id="direction_explore",
                intent=PROMISE,
                trigger_kind="scheduled",
                not_before=now + timedelta(hours=6),
            )
        )
        session.commit()
        assert repo.due(session, user_id=owner.id, now=now) == []
        assert len(repo.due(session, user_id=owner.id, now=now + timedelta(hours=7))) == 1


def test_abandoning_is_a_veto_that_survives(session_factory, settings, owner) -> None:
    repo = ObligationRepository()
    with session_factory() as session:
        obligation = Obligation(user_id=owner.id, capability_id="direction_explore", intent=PROMISE)
        session.add(obligation)
        session.commit()
        obligation_id = obligation.id

    service = _service(session_factory, settings)
    assert service.abandon_obligation(owner, obligation_id)["status"] == "abandoned"

    with session_factory() as session:
        assert repo.due(session, user_id=owner.id) == []
        assert session.get(Obligation, obligation_id).status == "abandoned"

    stranger = User(username="other", password_hash="x")
    stranger.id = owner.id + 500
    with pytest.raises(NotOwner):
        service.abandon_obligation(stranger, obligation_id)
