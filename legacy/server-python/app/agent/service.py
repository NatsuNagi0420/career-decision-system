"""青穗集 · Run 生命周期：创建、启动、审批续跑、快照。"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Any

from langgraph.checkpoint.base import BaseCheckpointSaver
from langgraph.graph.state import CompiledStateGraph
from langgraph.types import Command
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload, selectinload, sessionmaker

from app.agent.approvals import ApprovalRepository
from app.agent.events import EventLog, RunCompleted, RunFailed, RunStarted
from app.agent.graph import AgentDeps, build_agent_graph
from app.agent.intent import route_intent
from app.agent.obligations import ObligationRepository
from app.agent.provenance import fingerprint_for
from app.agent.state import RunState
from app.capabilities.registry import get_capability
from app.capabilities.spec import CapabilitySpec
from app.config import Settings
from app.db.domain import (
    ActionPlan,
    ComparisonCriterion,
    ComparisonResult,
    DecisionCandidate,
    DecisionProject,
    EvidenceItem,
    Job,
    JobRequirementItem,
    PlanTask,
    TaskResult,
    WeeklyReview,
)
from app.db.models import Approval, Artifact, Obligation, Proposal, Run, User, new_id, utcnow
from app.llm.gateway import Gateway
from app.tools.base import ToolRegistry


class NotOwner(LookupError):
    pass


class TaskResultExists(Exception):
    """This task already has an account on file; a second row would read as two efforts."""

    def __init__(self, result_id: str) -> None:
        self.result_id = result_id
        super().__init__(result_id)


#: How long a run may sit without any progress before we call it dead. One model call
#: times out at `llm_timeout_seconds` (60s) and the step ceiling bounds how many there
#: can be, so a row untouched for this long is not slow — nobody is driving it.
STALE_RUN_AFTER = timedelta(minutes=15)


def reconcile_stale_runs(
    session_factory: sessionmaker[Session],
    events: EventLog,
    *,
    stale_after: timedelta = STALE_RUN_AFTER,
    reason: str = "这一步之后再没有往下走",
    run_ids: Sequence[str] | None = None,
    stage: str = "restart",
) -> list[str]:
    """Close runs that still claim to be working while nothing is working on them.

    A process that dies mid-run leaves `status="created"` with `finished_at` null
    forever, and the feed then keeps showing a task "in progress" that nobody will
    ever finish — 目标四's "不允许永久停留" case. There is no `running` status in this
    schema: `created` *is* the in-flight marker, which is why the sweep keys off it.

    `awaiting_approval` is excluded on purpose: that state is held by a person, and
    letting it lapse is the approval expiry's job, not this one's.

    At startup the window is zero, because a fresh process has nothing of its own in
    flight — every `created` row it finds belongs to the one that just died.

    `run_ids` narrows the same closing logic to one run: a background task that raised
    knows exactly which row is now orphaned and should not wait for the next sweep.
    `stage` names what closed it, since a crashed coroutine and a dead process are two
    different things to read in the error line.
    """
    cutoff = utcnow() - stale_after
    closed: list[str] = []
    wanted = None if run_ids is None else set(run_ids)
    with session_factory() as session:
        stalled = session.scalars(
            select(Run).where(Run.status == "created", Run.updated_at < cutoff).order_by(Run.created_at)
        ).all()
        for run in stalled:
            if wanted is not None and run.id not in wanted:
                continue
            run.status = "failed"
            run.error = f"{stage}: {reason}，已按失败收尾。可以从头再发起一次；已经确认过的写入不会重复。"
            run.finished_at = utcnow()
            events.append(
                session,
                run,
                RunFailed(
                    run_id=run.id,
                    thread_id=run.thread_id,
                    seq=0,
                    event_id="",
                    occurred_at=utcnow(),
                    kind="run_failed",
                    error=run.error,
                ),
            )
            closed.append(run.id)
        session.commit()
    for run_id in closed:
        events.announce(run_id)
    return closed


def expire_stale_approvals(
    session_factory: sessionmaker[Session],
    approvals: ApprovalRepository,
    events: EventLog,
    *,
    now: datetime | None = None,
) -> list[str]:
    """Make an expired confirmation a piece of state, not just a message.

    `claim()` refuses an expired approval, so a run parked at `awaiting_approval`
    whose only card has lapsed can never be resumed — leaving it parked is the same
    "stuck forever" failure 目标四 forbids. So the run is closed here too. Nothing was
    ever written for it, which is why it reads `cancelled` with an `approval:` stage
    rather than `failed`; and the Proposal stays `pending`, because nobody rejected it
    — letting the card say "已过期，不能再生效" is the honest version of that.
    """
    moment = now or utcnow()
    announced: set[str] = set()
    with session_factory() as session:
        expired = approvals.expire_stale(session, now=moment)
        if not expired:
            return []
        for _, run_id in expired:
            announced.add(run_id)
            run = session.get(Run, run_id, with_for_update=True)
            if run is None or run.finished_at is not None:
                continue
            # `resuming` counts as alive: a card claimed a moment before this sweep read
            # the table is being executed right now, and cancelling the run under it would
            # file a write nobody approved while pretending nothing happened.
            still_alive = session.scalar(
                select(Approval.id).where(
                    Approval.run_id == run_id, Approval.status.in_({"pending", "resuming"})
                )
            )
            if still_alive is not None:
                continue  # another card on the same run is still decidable or in flight
            run.status = "cancelled"
            run.error = "approval: 确认在有效期内没有被点，这次写入没有发生。可以再发起一次同样的判断。"
            run.finished_at = moment
            events.append(
                session,
                run,
                RunCompleted(
                    run_id=run.id,
                    thread_id=run.thread_id,
                    seq=0,
                    event_id="",
                    occurred_at=moment,
                    kind="run_completed",
                    status="cancelled",
                    summary="确认超时，未写入",
                ),
            )
        session.commit()
    for run_id in announced:
        events.announce(run_id)
    return [approval_id for approval_id, _ in expired]


@dataclass
class GraphRegistry:
    """One compiled graph per capability, built once at startup.

    Building lazily per request would recreate the node closures on every run and
    hide wiring mistakes until runtime; validate.py checks the same registry
    offline.
    """

    compiled: dict[str, CompiledStateGraph]

    @classmethod
    def build(
        cls,
        *,
        capabilities: list[CapabilitySpec],
        tools: ToolRegistry,
        session_factory: sessionmaker[Session],
        gateway: Gateway,
        events: EventLog,
        approvals: ApprovalRepository,
        settings: Settings,
        checkpointer: BaseCheckpointSaver,
    ) -> GraphRegistry:
        compiled: dict[str, CompiledStateGraph] = {}
        for capability in capabilities:
            if capability.status != "implemented":
                continue
            deps = AgentDeps(
                capability=capability,
                tools=tools,
                session_factory=session_factory,
                gateway=gateway,
                events=events,
                approvals=approvals,
                settings=settings,
            )
            compiled[capability.id] = build_agent_graph(deps).compile(checkpointer=checkpointer)
        return cls(compiled=compiled)

    def get(self, capability_id: str) -> CompiledStateGraph:
        try:
            return self.compiled[capability_id]
        except KeyError as exc:
            raise KeyError(f"capability is not implemented: {capability_id}") from exc


class RunService:
    def __init__(
        self,
        *,
        session_factory: sessionmaker[Session],
        graphs: GraphRegistry,
        events: EventLog,
        approvals: ApprovalRepository,
        obligations: ObligationRepository | None = None,
        default_capability: str = "skeleton_probe",
        autorun_cooldown: timedelta = timedelta(minutes=30),
    ) -> None:
        self._factory = session_factory
        self._graphs = graphs
        self._events = events
        self._approvals = approvals
        self._obligations = obligations or ObligationRepository()
        self._default = default_capability
        self._cooldown = autorun_cooldown

    def create_run(
        self,
        user: User,
        goal: str,
        *,
        capability_id: str | None = None,
        entry_point: str = "shell",
        project_id: str | None = None,
        obligation_id: str | None = None,
    ) -> Run:
        """Create a run, and — when it answers a promise — claim that promise in the
        same transaction. A failed claim rolls the run back with it, so there is no
        such thing as an orphan run pretending to discharge something."""
        capability = get_capability(route_intent(goal) if capability_id == "auto" else (capability_id or self._default))
        with self._factory() as session:
            run = Run(
                thread_id=new_id(),
                user_id=user.id,
                goal=goal.strip(),
                capability_id=capability.id,
                risk_tier=capability.risk_tier,
                entry_point="obligation" if obligation_id else entry_point,
                project_id=project_id,
                status="created",
            )
            session.add(run)
            session.flush()
            if obligation_id:
                claimed = self._obligations.claim(session, obligation_id, user_id=user.id, run_id=run.id)
                # A project-scoped promise carries its project forward; otherwise the
                # continuation would start blind and fail the domain gate for nothing.
                run.project_id = run.project_id or claimed.project_id
            session.commit()
            session.refresh(run)
            return run

    def owned_run(self, run_id: str, user: User) -> Run:
        """Public ownership check; callers never pass a run id they were not given."""
        return self._owned_run(run_id, user)

    def _owned_run(self, run_id: str, user: User) -> Run:
        with self._factory() as session:
            run = session.get(Run, run_id)
            if run is None or run.user_id != user.id:
                raise NotOwner(run_id)
            return run

    async def start(self, run: Run, *, allow_external_ai: bool) -> dict[str, Any]:
        graph = self._graphs.get(str(run.capability_id))
        # The opening frame is emitted here, not inside `intake`: the thread must show
        # whose goal this is even when intake rejects it in the first node.
        self._emit_run_started(run)
        with self._factory() as session:
            source = session.scalar(select(Obligation.id).where(Obligation.claimed_run_id == run.id))
        state: RunState = {
            "run_id": run.id,
            "thread_id": run.thread_id,
            "user_id": run.user_id,
            "goal": run.goal,
            "project_id": run.project_id,
            "capability_id": str(run.capability_id),
            "allow_external_ai": allow_external_ai,
            "source_obligation_id": source or "",
            "errors": [],
        }
        return self._outcome(run.id, await graph.ainvoke(state, self._config(run)))

    async def resume(self, run: Run, *, decision: dict[str, Any], allow_external_ai: bool) -> dict[str, Any]:
        graph = self._graphs.get(str(run.capability_id))
        result = await graph.ainvoke(Command(resume=decision), self._config(run))
        return self._outcome(run.id, result)

    def abandon_crashed(self, run_id: str, reason: str) -> None:
        """Close a run whose background coroutine died on the way through.

        The graph catches the failures it understands (`select_action: …`, tool
        errors) and calls `fail()` itself. Anything else — a checkpointer hiccup, a
        bug in a node — escaped the task unheard, leaving the row `created` while
        nothing worked on it: the person watched a spinner until the 15-minute sweep.
        Same closing logic as the sweep, narrowed to this run and labelled by what
        actually happened.
        """
        reconcile_stale_runs(
            self._factory,
            self._events,
            stale_after=timedelta(0),
            reason=f"后台任务在跑完之前中断（{reason}）",
            run_ids=[run_id],
            stage="background",
        )

    def _emit_run_started(self, run: Run) -> None:
        session = self._factory()
        try:
            fresh = session.get(Run, run.id)
            if fresh is None:
                return
            self._events.append(
                session,
                fresh,
                RunStarted(
                    kind="run_started",
                    run_id=fresh.id,
                    thread_id=fresh.thread_id,
                    seq=0,
                    event_id="",
                    occurred_at=utcnow(),
                    goal=fresh.goal,
                    capability_id=fresh.capability_id,
                    entry_point=fresh.entry_point,
                    prompt_fingerprint=fingerprint_for(fresh.capability_id),
                ),
            )
            session.commit()
        finally:
            session.close()
        self._events.announce(run.id)

    def _outcome(self, run_id: str, result: dict[str, Any]) -> dict[str, Any]:
        """Status is read back from the row, not echoed from graph state: the run's
        own rows are the record of what happened, and a caller should never have to
        trust a returned dict to learn whether a write took place."""
        interrupted = "__interrupt__" in result
        with self._factory() as session:
            run = session.get(Run, run_id)
            status = run.status if run else "unknown"
        values = {key: value for key, value in result.items() if key != "__interrupt__"}
        return {"status": status, "interrupted": interrupted, "values": values}

    def snapshot(self, run_id: str, user: User) -> dict[str, Any]:
        run = self._owned_run(run_id, user)
        with self._factory() as session:
            artifacts = list(session.scalars(select(Artifact).where(Artifact.run_id == run.id).order_by(Artifact.created_at)))
            proposals = list(session.scalars(select(Proposal).where(Proposal.run_id == run.id)))
            approvals = list(session.scalars(select(Approval).where(Approval.run_id == run.id)))
            pending = next((a.id for a in approvals if a.status == "pending"), None)
            return {
                "run": _run_json(run),
                "pending_approval_id": pending,
                "artifacts": [_artifact_json(a) for a in artifacts],
                "proposals": [_proposal_json(p) for p in proposals],
                "approvals": [_approval_json(a) for a in approvals],
            }

    def artifacts(self, run_id: str, user: User) -> list[dict[str, Any]]:
        run = self._owned_run(run_id, user)
        with self._factory() as session:
            return [_artifact_json(a) for a in session.scalars(select(Artifact).where(Artifact.run_id == run.id))]

    def comparison_board(self, user: User, project_id: str, *, rounds: int = 3) -> list[dict[str, Any]]:
        """The stored matrix, newest round first, with each cell's evidence resolved.

        A score is exactly what the acceptance criteria forbid handing a student alone;
        they need what spoke *for* a cell, what spoke *against* it, and what is still
        missing. Those three are columns of `comparison_results`, so this reads them
        back instead of re-narrating a run — and it keeps the earlier rounds, because
        "why did the answer move" is only answerable while the previous answer exists.
        """
        with self._factory() as session:
            project = session.get(DecisionProject, project_id)
            if project is None or project.user_id != user.id:
                raise NotOwner(project_id)
            cells = list(
                session.scalars(
                    select(ComparisonResult)
                    .where(ComparisonResult.project_id == project.id)
                    .order_by(ComparisonResult.round_no.desc(), ComparisonResult.created_at)
                )
            )
            if not cells:
                return []
            newest = set(sorted({cell.round_no for cell in cells}, reverse=True)[:rounds])
            cells = [cell for cell in cells if cell.round_no in newest]

            criteria = {
                row.id: row.name
                for row in session.scalars(select(ComparisonCriterion).where(ComparisonCriterion.project_id == project.id))
            }
            candidates = {
                row.id: row.name
                for row in session.scalars(select(DecisionCandidate).where(DecisionCandidate.project_id == project.id))
            }
            wanted = {
                ref["id"]
                for cell in cells
                for ref in [*cell.evidence_refs, *cell.counter_refs]
                if ref.get("table") == "evidence_items" and isinstance(ref.get("id"), str)
            }
            sources = {
                row.id: row
                for row in session.scalars(
                    select(EvidenceItem).where(EvidenceItem.id.in_(wanted), EvidenceItem.user_id == user.id)
                )
            } if wanted else {}
            run_ids = {cell.run_id for cell in cells if cell.run_id}
            matrices: dict[str, Artifact] = {}
            if run_ids:
                for artifact in session.scalars(
                    select(Artifact)
                    .where(Artifact.run_id.in_(run_ids), Artifact.artifact_type == "ComparisonMatrix")
                    .order_by(Artifact.created_at)
                ):
                    matrices[artifact.run_id] = artifact

            board: list[dict[str, Any]] = []
            for round_no in sorted({cell.round_no for cell in cells}, reverse=True):
                mine = [cell for cell in cells if cell.round_no == round_no]
                artifact = next((matrices[cell.run_id] for cell in mine if cell.run_id in matrices), None)
                board.append(
                    {
                        "round_no": round_no,
                        "artifact_id": artifact.id if artifact else None,
                        "supersedes_id": artifact.supersedes_id if artifact else None,
                        "conclusion": str((artifact.content or {}).get("conclusion") or "") if artifact else "",
                        "is_provisional": bool(artifact.is_provisional) if artifact else False,
                        "created_at": min(cell.created_at for cell in mine).isoformat(),
                        "cells": [
                            {
                                "criterion": criteria.get(cell.criterion_id, "（标准已不在本项目）"),
                                "candidate": candidates.get(cell.candidate_id, "（候选已不在本项目）"),
                                "verdict": cell.verdict,
                                "score": cell.score,
                                "note": cell.note,
                                "for_it": [_cite(session, sources[ref["id"]]) for ref in cell.evidence_refs if ref.get("id") in sources],
                                "against": [_cite(session, sources[ref["id"]]) for ref in cell.counter_refs if ref.get("id") in sources],
                            }
                            for cell in mine
                        ],
                    }
                )
            return board

    def confirm_weekly_review(
        self,
        user: User,
        project_id: str,
        *,
        week_start: str,
        body: str,
        confidence_trend: str,
        confidence_reason: str,
        next_focus: str,
        request_id: str,
        source_run_id: str | None = None,
    ) -> dict[str, Any]:
        """Close a week, once, because the person said so.

        Not a Proposal. `weekly_review` is R3 and the graph fails an applied R3 on
        purpose, so a terminal record of a period that has already passed reaches the
        table through here — a draft the model wrote becomes a stored review only when
        a human confirms it, and `source_run_id` keeps that draft's run on the record
        so a later comparison can be read back against the account that moved it.

        `uq_review_user_week` is the schema's promise that a person has one review per
        week, so a second project cannot open a parallel week; that is reported as a
        conflict rather than quietly overwritten or duplicated.
        """
        week = date.fromisoformat(week_start)
        with self._factory() as session:
            project = session.get(DecisionProject, project_id)
            if project is None or project.user_id != user.id:
                raise NotOwner(project_id)
            repeated = session.scalar(select(WeeklyReview).where(WeeklyReview.request_id == request_id))
            if repeated is not None:
                # A second click is the same confirmation of the same week; recording
                # it twice would let one week count as two trends.
                return {"review_id": repeated.id, "project_id": repeated.project_id, "duplicate": True}
            existing = session.scalar(
                select(WeeklyReview).where(WeeklyReview.user_id == user.id, WeeklyReview.week_start == week)
            )
            if existing is not None:
                return {"review_id": existing.id, "project_id": existing.project_id, "week_conflict": True}
            source = session.get(Run, source_run_id) if source_run_id else None
            review = WeeklyReview(
                project_id=project.id,
                user_id=user.id,
                week_start=week,
                body=body.strip(),
                confidence_trend=confidence_trend,
                confidence_reason=confidence_reason.strip() or None,
                next_focus=next_focus.strip(),
                # Only the person's own run can be cited as where the draft came from.
                run_id=source.id if source is not None and source.user_id == user.id else None,
                request_id=request_id,
            )
            session.add(review)
            try:
                session.flush()
            except IntegrityError:
                # Two tabs on the same week: the constraint decides, this reads it back.
                session.rollback()
                raced = session.scalar(select(WeeklyReview).where(WeeklyReview.request_id == request_id))
                if raced is not None:
                    return {"review_id": raced.id, "project_id": raced.project_id, "duplicate": True}
                other = session.scalar(
                    select(WeeklyReview).where(WeeklyReview.user_id == user.id, WeeklyReview.week_start == week)
                )
                if other is not None:
                    return {"review_id": other.id, "project_id": other.project_id, "week_conflict": True}
                raise
            session.commit()
            return {"review_id": review.id, "project_id": project.id, "week_start": week_start}

    def submit_task_result(
        self,
        user: User,
        task_id: str,
        *,
        body: str,
        link: str | None,
        request_id: str,
    ) -> tuple[dict[str, Any], Run | None]:
        """Record what the person actually did, and wake the agent to fold it in.

        Deliberately not a Proposal: this is the user's own account of their life, and
        asking them to approve their own words would be the confirmation gate pointed at
        the wrong party. What does need a human is the write that follows — the agent
        proposes archiving it as evidence, and the approval gate lives there.

        The run comes back unstarted so the caller can spawn it the same way /runs does.
        """
        with self._factory() as session:
            # The task row is the mutex. Two browser tabs carry two *different*
            # request_ids, so deduplicating on that id only covers a retry within one
            # tab; locking the row the result is about makes the second tab wait, and
            # its locking read then sees what the first one committed. A unique index on
            # task_id would say the same thing in the schema, but rows already in the
            # database may violate it, and deleting someone's submitted account to add an
            # index is not a migration I get to run silently.
            task = session.get(PlanTask, task_id, with_for_update=True)
            if task is None or task.user_id != user.id:
                raise NotOwner(task_id)
            repeated = session.scalar(select(TaskResult).where(TaskResult.request_id == request_id))
            if repeated is not None:
                # A second click is the same statement about the same week. Recording it
                # twice would let one effort count as two pieces of evidence.
                return {"result_id": repeated.id, "task_id": task.id, "duplicate": True}, None
            already = session.scalar(
                select(TaskResult).where(TaskResult.task_id == task.id).with_for_update().limit(1)
            )
            if already is not None:
                raise TaskResultExists(already.id)
            result = TaskResult(
                task_id=task.id,
                user_id=user.id,
                body=body.strip(),
                link=link.strip() if link else None,
                request_id=request_id,
            )
            session.add(result)
            if task.status != "done":
                task.status = "done"
                task.completed_at = utcnow()
                task.plan.touch()
            project_id = task.plan.project_id
            title = task.title
            session.commit()
            session.refresh(result)
            busy = session.scalar(
                select(Run.id).where(Run.project_id == project_id, Run.finished_at.is_(None)).limit(1)
            )
        if busy is not None:
            # One open run per project; a second would only duplicate the same proposal
            # for the user to decide twice. Deferring is not dropping though — that run
            # may already be past the step where it reads the plan, so the new account is
            # promised forward as an obligation and stays visible until it is read.
            with self._factory() as session:
                session.add(
                    Obligation(
                        user_id=user.id,
                        run_id=busy,
                        project_id=project_id,
                        capability_id="evidence_collect",
                        intent=f"读回任务「{title}」新交回的结果，整理成证据并说明它改变了哪个判断。",
                    )
                )
                session.commit()
            return {"result_id": result.id, "task_id": task.id, "deferred_to_run": busy}, None
        run = self.create_run(
            user,
            goal=f"任务「{task.title}」有了新结果。把它整理成证据，并说明它改变了哪个判断、为什么。",
            capability_id="evidence_collect",
            entry_point="task_result",
            project_id=project_id,
        )
        return {"result_id": result.id, "task_id": task.id}, run

    def feed(self, user: User) -> dict[str, Any]:
        """The object layer: what the agent has promised, produced, and is waiting on,
        read independently of any single run.

        Axiom four says an Artifact outranks the transcript that made it. That is only
        a claim while the transcript is the only place it can be seen — this endpoint
        is what makes the claim checkable, and it is also the only surface where an
        obligation means anything to the person.
        """
        with self._factory() as session:
            runs = list(
                session.scalars(
                    select(Run).where(Run.user_id == user.id).order_by(Run.created_at.desc()).limit(20)
                )
            )
            projects = list(
                session.scalars(
                    select(DecisionProject)
                    .where(DecisionProject.user_id == user.id)
                    .order_by(DecisionProject.updated_at.desc())
                    .limit(20)
                )
            )
            counts = dict(
                session.execute(
                    select(DecisionCandidate.project_id, func.count(DecisionCandidate.id)).group_by(
                        DecisionCandidate.project_id
                    )
                ).all()
            )
            artifacts = list(
                session.scalars(
                    select(Artifact)
                    .where(Artifact.user_id == user.id)
                    .order_by(Artifact.created_at.desc())
                    .limit(30)
                )
            )
            obligations = list(
                session.scalars(
                    select(Obligation)
                    .where(Obligation.user_id == user.id)
                    .order_by(Obligation.created_at.desc())
                    .limit(30)
                )
            )
            approvals = list(
                session.scalars(
                    select(Approval)
                    .where(Approval.user_id == user.id, Approval.status == "pending")
                    .order_by(Approval.created_at.desc())
                )
            )
            # Tasks belong to the object layer, not to the transcript that wrote them:
            # this is the only place a person can see what they were asked to go do, and
            # the only source of the task id they submit a result against.
            tasks = list(
                session.scalars(
                    select(PlanTask)
                    .join(ActionPlan, PlanTask.plan_id == ActionPlan.id)
                    .where(ActionPlan.project_id.in_([project.id for project in projects]))
                    .options(joinedload(PlanTask.plan), selectinload(PlanTask.results))
                    .order_by(PlanTask.week_no, PlanTask.ordinal)
                )
            )
            return {
                "runs": [_run_json(run) for run in runs],
                "projects": [_project_json(project, counts.get(project.id, 0)) for project in projects],
                "artifacts": [_artifact_json(artifact) for artifact in artifacts],
                "obligations": [_obligation_json(obligation) for obligation in obligations],
                "tasks": [_task_json(task) for task in tasks],
                "pending_approvals": [
                    {"id": approval.id, "run_id": approval.run_id, "proposal_id": approval.proposal_id,
                     "expires_at": approval.expires_at.isoformat() if approval.expires_at else None}
                    for approval in approvals
                ],
            }

    def continuation(self, user: User) -> dict[str, Any]:
        """The one promise the agent may pick up without being asked, or why it is not.

        This is the only path where the system starts something on its own, so it is
        the only path the cooldown applies to. The reason is returned rather than
        swallowed: the shell has to say something honest while idle.
        """
        with self._factory() as session:
            last = session.scalar(
                select(func.max(Run.created_at)).where(Run.user_id == user.id, Run.entry_point == "obligation")
            )
            obligation, blocked = self._obligations.continuation(
                session, user_id=user.id, last_autorun_at=last, cooldown=self._cooldown
            )
            if obligation is None:
                return {"obligation": None, "reason": blocked or "no_due_obligation"}
            return {"obligation": _obligation_json(obligation), "reason": None}

    def abandon_obligation(self, user: User, obligation_id: str) -> dict[str, Any]:
        """A person saying "not this one" has to stick. Without this, a promise the
        agent made can only ever be spent, never vetoed."""
        with self._factory() as session:
            obligation = session.get(Obligation, obligation_id)
            if obligation is None or obligation.user_id != user.id:
                raise NotOwner(obligation_id)
            if obligation.status not in {"open", "claimed"}:
                return _obligation_json(obligation)
            obligation.status = "abandoned"
            obligation.resolved_at = utcnow()
            session.commit()
            return _obligation_json(obligation)

    def mark_approval_decided(self, run_id: str, user: User, approval_id: str) -> Approval:
        run = self._owned_run(run_id, user)
        with self._factory() as session:
            approval = self._approvals.get(session, approval_id, user_id=user.id)
            if approval.run_id != run.id:
                raise NotOwner(approval_id)
            if not self._approvals.claim(session, approval_id, run_id=run.id):
                raise RuntimeError("这条确认已经不可再执行（审批已结束或已过期）")
            return approval

    @staticmethod
    def _config(run: Run) -> dict[str, Any]:
        return {"configurable": {"thread_id": run.thread_id}}


def _run_json(run: Run) -> dict[str, Any]:
    return {
        "id": run.id,
        "thread_id": run.thread_id,
        "goal": run.goal,
        "status": run.status,
        "capability_id": run.capability_id,
        "risk_tier": run.risk_tier,
        "entry_point": run.entry_point,
        "model_used": run.model_used,
        "thinking_mode": run.thinking_mode,
        "usage": {
            "prompt": run.prompt_tokens,
            "completion": run.completion_tokens,
            "reasoning": run.reasoning_tokens,
            "cached": run.cached_tokens,
        },
        "steps_used": run.steps_used,
        "error": run.error,
        "created_at": run.created_at.isoformat() if run.created_at else None,
        "finished_at": run.finished_at.isoformat() if run.finished_at else None,
    }


def _cite(session: Session, item: EvidenceItem) -> dict[str, str]:
    """A cell's pointer resolved into the sentence a person can actually read. The quote
    is the stored verbatim text, so a cell never shows more than a row really says.

    `origin` exists because 目标二 asks for where the sentence came from, not just the
    sentence: a quote with no stated source is the score-without-provenance case this
    product exists to avoid, and the comparison board was showing exactly that.
    """
    return {
        "id": item.id,
        "kind": item.kind,
        "statement": item.statement,
        "quote": item.quote or item.statement,
        "origin": _origin(session, item),
    }


#: The channel an evidence row came from, in the words a student reads. `EvidenceItem.source`
#: is a 16-char code, so translating it is the only way it can be shown at all.
_SOURCE_CHANNEL = {"user": "你给的画像事实", "job": "岗位样本", "requirement": "岗位要求", "task": "你交回的任务结果"}


def _origin(session: Session, item: EvidenceItem) -> str:
    ref = item.source_ref or {}
    table = str(ref.get("table") or "")
    raw = ref.get("id")
    if table == "jobs" and raw is not None:
        job = session.get(Job, int(raw))
        if job is not None:
            return "｜".join(part for part in (job.title, job.company, job.city, job.salary_text) if part)
    if table == "job_requirement_items" and raw is not None:
        row = session.get(JobRequirementItem, int(raw))
        if row is not None:
            job = session.get(Job, row.job_id) if row.job_id else None
            label = f"{_SOURCE_CHANNEL.get('requirement', '岗位要求')}第 {row.sort_order} 条"
            return f"{job.title}｜{label}" if job is not None else label
    if table == "task_results" and raw is not None:
        return _SOURCE_CHANNEL["task"]
    channel = _SOURCE_CHANNEL.get(item.source, item.source)
    if not table:
        # Say the gap out loud: the alternative is a quote that looks sourced and isn't.
        return f"未挂来源行（只记了渠道：{channel}）"
    return f"{channel}（{table} #{raw}）"


def _artifact_json(artifact: Artifact) -> dict[str, Any]:
    return {
        "id": artifact.id,
        "run_id": artifact.run_id,
        "artifact_type": artifact.artifact_type,
        "title": artifact.title,
        "status": artifact.status,
        "version": artifact.version,
        "data_coverage": artifact.data_coverage,
        "is_provisional": artifact.is_provisional,
        "generation_mode": artifact.generation_mode,
        "content": artifact.content,
        "evidence_quotes": artifact.evidence_quotes,
        "source_refs": artifact.source_refs,
        # The chain, not the lock: the shell needs this to show "取代上一版" instead of
        # presenting a corrected conclusion as if it were the first one.
        "supersedes_id": artifact.supersedes_id,
        "created_at": artifact.created_at.isoformat(),
    }


def _proposal_json(proposal: Proposal) -> dict[str, Any]:
    return {
        "id": proposal.id,
        "proposal_type": proposal.proposal_type,
        "title": proposal.title,
        "rationale": proposal.rationale,
        "status": proposal.status,
        "risk_tier": None,
        "payload": proposal.payload,
        "acceptance_criteria": proposal.acceptance_criteria,
        "source_refs": proposal.source_refs,
        "result": proposal.result_json,
        "error": proposal.error,
    }


def _approval_json(approval: Approval) -> dict[str, Any]:
    return {
        "id": approval.id,
        "proposal_id": approval.proposal_id,
        "status": approval.status,
        "created_at": approval.created_at.isoformat() if approval.created_at else None,
        "expires_at": approval.expires_at.isoformat() if approval.expires_at else None,
        "resolved_at": approval.resolved_at.isoformat() if approval.resolved_at else None,
    }


def _obligation_json(obligation: Obligation) -> dict[str, Any]:
    try:
        capability = get_capability(obligation.capability_id)
        name = capability.name
    except KeyError:
        name = obligation.capability_id
    return {
        "id": obligation.id,
        "run_id": obligation.run_id,
        "project_id": obligation.project_id,
        "capability_id": obligation.capability_id,
        "capability_name": name,
        "intent": obligation.intent,
        "status": obligation.status,
        "trigger_kind": obligation.trigger_kind,
        "not_before": obligation.not_before.isoformat() if obligation.not_before else None,
        "created_at": obligation.created_at.isoformat() if obligation.created_at else None,
        # The shell needs this to explain why a listed promise will not start itself.
        "startable": ObligationRepository.startable(obligation),
    }


def _task_json(task: PlanTask) -> dict[str, Any]:
    return {
        "id": task.id,
        "project_id": task.plan.project_id,
        "plan_id": task.plan_id,
        "title": task.title,
        "expected_output": task.expected_output,
        "week_no": task.week_no,
        "kind": task.kind,
        "status": task.status,
        "due_date": task.due_date.isoformat() if task.due_date else None,
        # The person's own words, kept verbatim so a later conclusion can point at them.
        "results": [
            {"id": item.id, "body": item.body, "link": item.link, "at": item.created_at.isoformat()}
            for item in task.results
        ],
    }


def _project_json(project: DecisionProject, candidate_count: int) -> dict[str, Any]:
    return {
        "id": project.id,
        "title": project.title,
        "question": project.question,
        "status": project.status,
        "primary_target": project.primary_target,
        "candidate_count": candidate_count,
        "version": project.version,
        "created_at": project.created_at.isoformat() if project.created_at else None,
        "updated_at": project.updated_at.isoformat() if project.updated_at else None,
    }
