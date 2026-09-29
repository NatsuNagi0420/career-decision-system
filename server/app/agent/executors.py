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
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.capabilities.spec import CapabilitySpec
from app.db.domain import (
    ActionPlan,
    ComparisonCriterion,
    ComparisonResult,
    DecisionCandidate,
    DecisionProject,
    EvidenceItem,
    PlanTask,
    ProfileFact,
    TaskResult,
    UserProfile,
)
from app.db.models import Artifact, Note, Proposal, Run
from app.tools.domain import _build_matrix  # one scoring rule, shared with the tool the model read


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


class ComparisonCellPayload(BaseModel):
    """What the model says about one cell. It names the cell and the counter-evidence;
    the score and verdict are computed from stored evidence, never proposed.

    The keys are `compare_candidates`' own vocabulary (`candidate_id` + `criterion`),
    measured: the model echoes the shape the tool handed it, and a prettier name only
    made the whole proposal `unsupported`. `note` is deliberately short — a long prose
    field per cell is what pushed the synthesis JSON past the output ceiling.
    """

    criterion: str = Field(min_length=1, max_length=80)
    candidate_id: str = Field(min_length=8, max_length=32)
    #: evidence_items ids the person should see as speaking *against* this cell. Pointers
    #: only — the row behind each one must exist in this project.
    opposes: list[str] = Field(default_factory=list, max_length=8)
    note: str = Field(default="", max_length=200)


class RecordComparisonPayload(BaseModel):
    criteria: list[str] = Field(default_factory=list, max_length=8)
    #: Optional on purpose. The matrix itself is computed by code from stored evidence,
    #: so a run with nothing to say against any cell still records an honest round.
    cells: list[ComparisonCellPayload] = Field(default_factory=list, max_length=60)

    @model_validator(mode="after")
    def _needs_dimensions(self) -> RecordComparisonPayload:
        """A comparison without named standards is unjudgeable later: there is nothing
        for a new round to be compared against, and no way to see what moved."""
        if not [name for name in self.criteria if name.strip()]:
            raise ValueError("落表前必须先给出比较标准")
        return self


class CreateDecisionProjectPayload(BaseModel):
    title: str = Field(min_length=2, max_length=200)
    question: str = Field(default="", max_length=2000)


class PlanTaskItem(BaseModel):
    title: str = Field(min_length=2, max_length=300)
    expected_output: str = Field(default="", max_length=1000)
    week_no: int = Field(default=1, ge=1, le=12)
    kind: str = Field(default="evidence", max_length=24)


class CreateJobSearchTaskPayload(BaseModel):
    """The thing a person nods at is the week's plan, so the write takes a plan.

    Measured live on 2026-09-20 closing the loop's last link: `action_plan` drafts
    `plan_tasks`, this payload asked for one top-level `title`, so every next-cycle plan
    was flagged `unsupported` ("Field required: title") *after* the person had approved
    it. That mismatch is why 第 13 环节 had never once put a task in the database.
    """

    plan_tasks: list[PlanTaskItem] = Field(min_length=1, max_length=12)
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
    "record_comparison": RecordComparisonPayload,
}

PROPOSAL_LABELS = {
    "create_note": "记录一条行动笔记",
    "add_candidate": "加入候选职业",
    "collect_evidence": "归档一条证据",
    "create_decision_project": "新建决策项目",
    "create_job_search_task": "排下一周期的行动任务",
    "record_profile_fact": "补充一条画像事实",
    "record_comparison": "落一版多标准比较",
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

    written: list[str] = []
    already: list[str] = []
    for item in payload.plan_tasks:
        clash = session.scalar(select(PlanTask).where(PlanTask.plan_id == plan.id, PlanTask.title == item.title))
        if clash is not None:
            # Same plan, same wording: one approval of the same draft must not schedule
            # the week twice.
            already.append(clash.id)
            continue
        task = PlanTask(
            plan_id=plan.id,
            user_id=proposal.user_id,
            title=item.title,
            expected_output=item.expected_output,
            week_no=item.week_no,
            kind=item.kind,
            ordinal=len(plan.tasks),
        )
        session.add(task)
        session.flush()
        written.append(task.id)

    if written:
        plan.touch()
        session.flush()
    return {
        "task_ids": written,
        "already_present": already,
        "plan_id": plan.id,
        "plan_version": plan.version,
    }


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
        # This executor only runs from `_apply_proposal`, which only runs after a human
        # clicked 确认 on the card that displayed this exact statement. So the fact is
        # confirmed here — and it has to be, because nothing else ever flips the column:
        # there is no confirm route or UI, so `False` meant every downstream consumer
        # that asks for confirmed facts (the resume) was silently starved.
        confirmed=True,
    )
    session.add(fact)
    profile.touch()
    session.flush()
    return {"fact_id": fact.id}


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


def _persist_criteria(session: Session, project: DecisionProject, names: list[str]) -> list[ComparisonCriterion]:
    """Standards are stored, not kept alive only inside one tool call.

    `compare_candidates` used to build requested criteria as throwaway objects, so the
    yardstick a conclusion was judged by existed only in that run's memory — a later
    round could quietly measure the candidates with different standards and nobody
    could tell the answer moved because the evidence changed or because the ruler did.
    """
    rows: list[ComparisonCriterion] = []
    for order, name in enumerate(dict.fromkeys(item.strip()[:80] for item in names if item.strip())):
        row = session.scalar(
            select(ComparisonCriterion).where(
                ComparisonCriterion.project_id == project.id, ComparisonCriterion.name == name
            )
        )
        if row is None:
            row = ComparisonCriterion(project_id=project.id, name=name, sort_order=order)
            session.add(row)
            session.flush()
        rows.append(row)
    return rows


def _counter_refs(session: Session, project: DecisionProject, ids: list[str], candidate: DecisionCandidate) -> list[dict]:
    """The model picks which evidence speaks against a cell; it does not decide which
    evidence exists. Each pointer is resolved against this project, or the write fails."""
    refs: list[dict] = []
    for evidence_id in dict.fromkeys(ids):
        item = session.get(EvidenceItem, evidence_id)
        if item is None or item.project_id != project.id:
            raise LookupError("反方证据必须来自本项目的证据")
        if item.candidate_id is not None and item.candidate_id != candidate.id:
            raise LookupError("反方证据挂在另一个候选上")
        refs.append({"table": "evidence_items", "id": item.id})
    return refs


def _supersede_matrix(session: Session, proposal: Proposal, project: DecisionProject) -> dict[str, Any]:
    """Link this run's matrix to the one it replaces, and mark that one superseded.

    `Artifact.version` is an optimistic lock, so it cannot answer "what did the system
    say before this". Without the chain, a corrected conclusion looks exactly like a
    first conclusion — and "用户能看懂当前结论为什么发生变化" has nothing to point at.

    Only a *committed* matrix counts as "what the user saw before": `_apply_proposal`
    (graph.py:950-971) sets `committed` right after the executor returns, and sets
    `rejected` (graph.py:944) when the user said no. Without the filter, a draft nobody
    approved — or a conclusion the user rejected — becomes the predecessor and gets its
    status overwritten by `superseded`, erasing the rejection as a fact.
    `Artifact.id` breaks the tie because `created_at` alone is not a total order.
    """
    current = session.get(Artifact, proposal.artifact_id) if proposal.artifact_id else None
    if current is None:
        return {}
    previous = session.scalar(
        select(Artifact)
        .join(Run, Artifact.run_id == Run.id)
        .where(
            Run.project_id == project.id,
            Artifact.artifact_type == "ComparisonMatrix",
            Artifact.status == "committed",
            Artifact.id != current.id,
        )
        .order_by(Artifact.created_at.desc(), Artifact.id.desc())
        .limit(1)
    )
    if previous is None:
        return {}
    current.supersedes_id = previous.id
    previous.status = "superseded"
    session.flush()
    return {"supersedes": previous.id, "previous_conclusion": str((previous.content or {}).get("conclusion") or "")[:400]}


def _record_comparison(session: Session, run: Run, proposal: Proposal) -> dict[str, Any]:
    """Append one round of the matrix: scores from stored evidence, verdicts from the
    same rule the tool showed, and the model's citations kept as pointers.

    Nothing here edits an older round. The previous answer stays readable so the new
    one can be compared with it rather than replacing it in memory.
    """
    payload = RecordComparisonPayload.model_validate(proposal.payload)
    project = _project_for(session, run, proposal)
    criteria = _persist_criteria(session, project, payload.criteria)
    candidates = list(session.scalars(select(DecisionCandidate).where(DecisionCandidate.project_id == project.id)))
    if len(candidates) < 2:
        raise ValueError("至少需要两个候选，比较才落表")
    evidence = list(session.scalars(select(EvidenceItem).where(EvidenceItem.project_id == project.id)))
    facts = list(session.scalars(select(ProfileFact).where(ProfileFact.user_id == proposal.user_id)))
    matrix, missing = _build_matrix(candidates, criteria, evidence, facts)

    round_no = (
        session.scalar(select(func.max(ComparisonResult.round_no)).where(ComparisonResult.project_id == project.id)) or 0
    ) + 1
    claims = {(claim.candidate_id, claim.criterion): claim for claim in payload.cells}
    criterion_by_name = {criterion.name: criterion for criterion in criteria}
    candidate_by_id = {candidate.id: candidate for candidate in candidates}
    # A claim about a candidate or a standard this project does not have is not a
    # detail to drop: the person approved exactly this payload, so writing a
    # different one than was shown would be a silent substitution.
    unknown = [key for key in claims if key[0] not in candidate_by_id or key[1] not in criterion_by_name]
    if unknown:
        raise LookupError(f"提案里有本项目没有的候选或标准：{unknown[0]}")
    cells_written = 0
    for row in matrix:
        candidate = candidate_by_id[row["candidate_id"]]
        for cell in row["cells"]:
            criterion = criterion_by_name[cell["criterion"]]
            claim = claims.get((candidate.id, cell["criterion"]))
            note = (claim.note.strip() if claim and claim.note.strip() else "") or (
                "还没有能对上这条标准的证据" if cell["verdict"] == "missing" else ""
            )
            result = ComparisonResult(
                project_id=project.id,
                criterion_id=criterion.id,
                candidate_id=candidate.id,
                round_no=round_no,
                request_id=f"{proposal.request_id}#{criterion.id}#{candidate.id}",
                score=cell["score"],
                verdict=cell["verdict"],
                note=note,
                evidence_refs=[{"table": "evidence_items", "id": item_id} for item_id in cell["evidence_ids"]],
                counter_refs=_counter_refs(session, project, claim.opposes if claim else [], candidate),
                run_id=run.id,
            )
            session.add(result)
            cells_written += 1
    project.touch()
    session.flush()
    chain = _supersede_matrix(session, proposal, project)
    return {
        "round_no": round_no,
        "cells": cells_written,
        "missing_cells": len(missing),
        "project_version": project.version,
        **chain,
    }


EXECUTORS: dict[str, Executor] = {
    "create_note": _create_note,
    "add_candidate": _add_candidate,
    "collect_evidence": _collect_evidence,
    "create_decision_project": _create_decision_project,
    "create_job_search_task": _create_job_search_task,
    "record_profile_fact": _record_profile_fact,
    "record_comparison": _record_comparison,
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
    tasks = [item for item in payload.get("plan_tasks") or [] if isinstance(item, dict)]
    subject = str(
        payload.get("name") or payload.get("title") or payload.get("statement") or payload.get("body")
        or (tasks[0].get("title") if tasks else "")
        or (actions[0] if actions else "")
    )
    # One card writes the whole plan, so the card has to say how much it writes.
    if len(tasks) > 1:
        subject = f"{subject} 等 {len(tasks)} 条"
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
