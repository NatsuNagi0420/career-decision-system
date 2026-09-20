"""Proposal payloads and their executors.

The rule this file exists to enforce: the model may propose any JSON it likes,
but nothing writes unless the payload validates against a schema registered here,
and every proposal type a capability declares must have an executor here.
`scripts/validate.py` fails the build on a declared type with no executor, which
is exactly the gap that let v1 advertise eight proposal types while shipping two.

Idempotency uses natural keys (project-scoped candidate name, plan
generation_request_id) plus the unique `request_id` on note/evidence rows, not a
lookup of the proposal that is already the row being applied.
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from pydantic import BaseModel, Field, ValidationError, model_validator
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.capabilities.spec import CapabilitySpec
from app.db.domain import (
    ActionPlan,
    DecisionCandidate,
    DecisionProject,
    EvidenceItem,
    PlanTask,
    ProfileFact,
    TaskResult,
    UserProfile,
)
from app.db.models import Artifact, Note, Proposal, Run


class CreateNotePayload(BaseModel):
    body: str = Field(min_length=2, max_length=1800)


class AddCandidatePayload(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    rationale: str = Field(default="", max_length=2000)
    direction_id: int | None = None


class CollectEvidencePayload(BaseModel):
    statement: str = Field(min_length=2, max_length=1000)
    quote: str = Field(default="", max_length=2000)
    kind: str = Field(default="job_signal", max_length=32)
    candidate_id: str | None = Field(default=None, max_length=32)
    candidate_name: str | None = Field(default=None, max_length=120)
    #: Cites the row the person's own account came from. Without it an archived
    #: "they did X" claim is only as good as the model's memory of the tool output.
    result_id: str | None = Field(default=None, max_length=32)
    source_ref: dict[str, Any] = Field(default_factory=dict)

    @model_validator(mode="after")
    def _must_be_citable(self) -> CollectEvidencePayload:
        """An archived "evidence" with nothing to open is the worst possible outcome:
        it gives an unbacked claim a legitimate-looking paper trail. Refusing it here
        means the proposal is flagged unsupported instead of becoming a card that asks
        the person to approve junk.

        `result_id` counts as the trail, and is stronger than the other two: the
        executor re-reads the quote off that row rather than trusting this one.
        """
        if not self.quote.strip() and not self.source_ref and not self.result_id:
            raise ValueError("证据必须有原句 quote、来源 source_ref 或 result_id，否则无法回溯")
        return self


class CreateDecisionProjectPayload(BaseModel):
    title: str = Field(min_length=2, max_length=200)
    question: str = Field(default="", max_length=2000)


class CreateJobSearchTaskPayload(BaseModel):
    title: str = Field(min_length=2, max_length=300)
    expected_output: str = Field(default="", max_length=1000)
    week_no: int = Field(default=1, ge=1, le=12)
    kind: str = Field(default="evidence", max_length=24)
    plan_id: str | None = Field(default=None, max_length=32)


class RecordProfileFactPayload(BaseModel):
    dimension: str = Field(default="context", max_length=24)
    statement: str = Field(min_length=2, max_length=500)


PAYLOAD_SCHEMAS: dict[str, type[BaseModel]] = {
    "create_note": CreateNotePayload,
    "add_candidate": AddCandidatePayload,
    "collect_evidence": CollectEvidencePayload,
    "create_decision_project": CreateDecisionProjectPayload,
    "create_job_search_task": CreateJobSearchTaskPayload,
    "record_profile_fact": RecordProfileFactPayload,
}

PROPOSAL_LABELS = {
    "create_note": "记录一条行动笔记",
    "add_candidate": "加入候选职业",
    "collect_evidence": "归档一条证据",
    "create_decision_project": "新建决策项目",
    "create_job_search_task": "新增一个行动任务",
    "record_profile_fact": "补充一条画像事实",
}


def payload_error(proposal_type: str, payload: dict[str, Any]) -> str | None:
    """None means the payload is appliable; a string is the human-readable reason it is not."""
    schema = PAYLOAD_SCHEMAS.get(proposal_type)
    if schema is None:
        return f"no payload schema registered for {proposal_type}"
    try:
        schema.model_validate(payload)
    except ValidationError as exc:
        return str(exc)
    return None


# ------------------------------- executors ----------------------------------

Executor = Callable[[Session, Run, Proposal], dict[str, Any]]


def _create_note(session: Session, run: Run, proposal: Proposal) -> dict[str, Any]:
    payload = CreateNotePayload.model_validate(proposal.payload)
    note = Note(
        user_id=proposal.user_id,
        run_id=run.id,
        proposal_id=proposal.id,
        body=payload.body,
        source_refs=list(proposal.source_refs or []),
        request_id=proposal.request_id,
    )
    session.add(note)
    return _insert_by_request_id(session, note, Note, "note_id")


def _add_candidate(session: Session, run: Run, proposal: Proposal) -> dict[str, Any]:
    payload = AddCandidatePayload.model_validate(proposal.payload)
    project = _project_for(session, run, proposal)
    clash = session.scalar(
        select(DecisionCandidate).where(DecisionCandidate.project_id == project.id, DecisionCandidate.name == payload.name)
    )
    if clash is not None:
        clash.rationale = clash.rationale or payload.rationale
        if clash.status == "dropped":
            clash.status = "active"
        return {"candidate_id": clash.id, "already_present": True}

    candidate = DecisionCandidate(
        project_id=project.id,
        direction_id=payload.direction_id,
        name=payload.name,
        source_type="agent",
        created_by_run_id=run.id,
        rationale=payload.rationale,
        sort_order=len(project.candidates),
    )
    session.add(candidate)
    project.touch()
    session.flush()
    return {"candidate_id": candidate.id, "project_version": project.version}


def _collect_evidence(session: Session, run: Run, proposal: Proposal) -> dict[str, Any]:
    payload = CollectEvidencePayload.model_validate(proposal.payload)
    project = _project_for(session, run, proposal)
    candidate_id = payload.candidate_id
    if candidate_id is None and payload.candidate_name:
        match = session.scalar(
            select(DecisionCandidate).where(DecisionCandidate.project_id == project.id, DecisionCandidate.name == payload.candidate_name)
        )
        candidate_id = match.id if match else None

    kind = payload.kind
    quote = payload.quote
    source_ref = dict(payload.source_ref or {})
    if payload.result_id:
        # The person's account counts as evidence only if the row behind it is theirs
        # and belongs to this project — and the quote is taken from that row, not from
        # what the model recalls of it. It may choose which account to cite, never
        # rewrite one.
        result = session.get(TaskResult, payload.result_id)
        task = session.get(PlanTask, result.task_id) if result is not None else None
        plan = session.get(ActionPlan, task.plan_id) if task is not None else None
        if result is None or result.user_id != proposal.user_id or task is None or task.user_id != proposal.user_id:
            raise LookupError("task result not visible to this user")
        if plan is None or plan.project_id != project.id:
            raise LookupError("task result belongs to another project")
        quote = result.body
        source_ref = {"table": "task_results", "id": result.id}
        # `kind` records where a row came from, so a citation of the person's own account
        # is an action result whatever label the model put on it. Measured live: it filed
        # one as kind="evidence", which inventories as a third source type.
        kind = "action_result"

    item = EvidenceItem(
        user_id=proposal.user_id,
        project_id=project.id,
        candidate_id=candidate_id,
        kind=kind,
        statement=payload.statement,
        quote=quote,
        source_ref=source_ref,
        source="agent",
        created_by_run_id=run.id,
        request_id=proposal.request_id,
    )
    session.add(item)
    project.touch()
    result = _insert_by_request_id(session, item, EvidenceItem, "evidence_id")
    if not result.get("idempotent"):
        result["project_version"] = project.version
    return result


def _create_decision_project(session: Session, run: Run, proposal: Proposal) -> dict[str, Any]:
    payload = CreateDecisionProjectPayload.model_validate(proposal.payload)
    existing = session.scalar(
        select(DecisionProject).where(DecisionProject.user_id == proposal.user_id, DecisionProject.title == payload.title)
    )
    if existing is not None:
        return {"project_id": existing.id, "already_present": True}
    project = DecisionProject(user_id=proposal.user_id, title=payload.title, question=payload.question, status="framing")
    session.add(project)
    session.flush()
    return {"project_id": project.id}


def _create_job_search_task(session: Session, run: Run, proposal: Proposal) -> dict[str, Any]:
    payload = CreateJobSearchTaskPayload.model_validate(proposal.payload)
    project = _project_for(session, run, proposal)

    plan: ActionPlan | None = None
    if payload.plan_id:
        plan = session.get(ActionPlan, payload.plan_id)
        if plan is not None and plan.project_id != project.id:
            raise ValueError("plan_id does not belong to this project")
    if plan is None:
        plan = session.scalar(select(ActionPlan).where(ActionPlan.project_id == project.id).order_by(ActionPlan.created_at))
    if plan is None:
        plan = ActionPlan(
            project_id=project.id,
            user_id=proposal.user_id,
            title=f"{project.title} 行动计划",
            weeks=4,
            generation_request_id=f"plan-{project.id}",
        )
        session.add(plan)
        session.flush()

    clash = session.scalar(select(PlanTask).where(PlanTask.plan_id == plan.id, PlanTask.title == payload.title))
    if clash is not None:
        return {"task_id": clash.id, "plan_id": plan.id, "already_present": True}

    task = PlanTask(
        plan_id=plan.id,
        user_id=proposal.user_id,
        title=payload.title,
        expected_output=payload.expected_output,
        week_no=payload.week_no,
        kind=payload.kind,
        ordinal=len(plan.tasks),
    )
    session.add(task)
    plan.touch()
    session.flush()
    return {"task_id": task.id, "plan_id": plan.id, "plan_version": plan.version}


def _record_profile_fact(session: Session, run: Run, proposal: Proposal) -> dict[str, Any]:
    payload = RecordProfileFactPayload.model_validate(proposal.payload)
    profile = session.get(UserProfile, proposal.user_id)
    if profile is None:
        profile = UserProfile(user_id=proposal.user_id)
        session.add(profile)
        session.flush()
    duplicate = session.scalar(
        select(ProfileFact).where(
            ProfileFact.user_id == proposal.user_id,
            ProfileFact.dimension == payload.dimension,
            ProfileFact.statement == payload.statement,
        )
    )
    if duplicate is not None:
        return {"fact_id": duplicate.id, "already_present": True}
    fact = ProfileFact(
        user_id=proposal.user_id,
        dimension=payload.dimension,
        statement=payload.statement,
        source="agent",
        source_ref={"run_id": run.id},
        # An agent-supplied fact is a claim until the user confirms it.
        confirmed=False,
    )
    session.add(fact)
    profile.touch()
    session.flush()
    return {"fact_id": fact.id, "needs_confirmation": True}


def _project_for(session: Session, run: Run, proposal: Proposal) -> DecisionProject:
    project = None
    for candidate_id in (proposal.payload.get("project_id"), run.project_id):
        if candidate_id:
            project = session.get(DecisionProject, str(candidate_id))
            break
    if project is None:
        for ref in proposal.source_refs or []:
            if ref.get("table") == "decision_projects":
                project = session.get(DecisionProject, str(ref.get("id")))
                break
    if project is None:
        raise ValueError("这条写入需要先有一个决策项目；先创建或指定项目")
    if project.user_id != proposal.user_id:
        raise PermissionError("project is not yours")
    return project


def _insert_by_request_id(session: Session, entity: Any, model: type[Any], key: str) -> dict[str, Any]:
    try:
        session.flush()
    except IntegrityError:
        session.rollback()
        raced = session.scalar(select(model).where(model.request_id == entity.request_id))
        if raced is None:
            raise
        return {key: raced.id, "idempotent": True}
    return {key: entity.id}


EXECUTORS: dict[str, Executor] = {
    "create_note": _create_note,
    "add_candidate": _add_candidate,
    "collect_evidence": _collect_evidence,
    "create_decision_project": _create_decision_project,
    "create_job_search_task": _create_job_search_task,
    "record_profile_fact": _record_profile_fact,
}


def has_executor(proposal_type: str) -> bool:
    return proposal_type in EXECUTORS


def apply_executor(session: Session, run: Run, proposal: Proposal) -> dict[str, Any]:
    executor = EXECUTORS.get(proposal.proposal_type)
    if executor is None:
        raise LookupError(f"no executor registered for proposal_type={proposal.proposal_type}")
    return executor(session, run, proposal)


def build_proposal(capability: CapabilitySpec, run: Run, artifact: Artifact, synthesis: dict[str, Any]) -> Proposal | None:
    """Turn a model proposal into a typed write intent.

    An invalid payload still produces a Proposal row, flagged unsupported, so the
    human sees what the agent tried to do instead of discovering later that
    nothing happened.
    """
    if not capability.proposal_types or capability.risk_tier != "R2":
        return None
    proposal_type = capability.proposal_types[0]
    actions = [str(action) for action in synthesis.get("next_actions") or []]
    payload = dict(synthesis.get("proposed") or {})
    payload.setdefault("project_id", run.project_id)

    if proposal_type == "create_note" and "body" not in payload:
        payload["body"] = (actions[0] if actions else str(synthesis.get("conclusion") or ""))[:1800]
    if proposal_type == "create_decision_project" and "title" not in payload:
        payload["title"] = run.goal[:120]

    # Anything else the model left out stays missing: payload_error() below flags the
    # proposal as unsupported rather than inventing a candidate name or an evidence
    # statement the model never justified.
    error = payload_error(proposal_type, payload)
    subject = str(
        payload.get("name") or payload.get("title") or payload.get("statement") or payload.get("body")
        or (actions[0] if actions else "")
    )
    return Proposal(
        run_id=run.id,
        artifact_id=artifact.id,
        user_id=run.user_id,
        proposal_type=proposal_type,
        title=f"{PROPOSAL_LABELS.get(proposal_type, '写入')}：{subject[:70]}",
        rationale=str(synthesis.get("conclusion") or "")[:2000],
        payload=payload,
        source_refs=list(artifact.source_refs or []),
        acceptance_criteria=list(synthesis.get("uncertainties") or []) or ["无待验证项"],
        request_id=f"run-{run.id}-{proposal_type}",
        status="pending" if error is None else "unsupported",
        error=error,
    )
