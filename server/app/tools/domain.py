"""Domain tools: the agent's only way to learn anything.

Every one of these issues a real query and scopes it to the requesting user. v1's
"tools" projected slices of a payload the caller had already assembled, which is
why the agent could never discover that it was missing something.

`compare_candidates` is deterministic on purpose. The model narrates and
challenges a matrix that code computed from stored evidence; it does not get to
invent scores. Coverage and missing cells come back as data so a thin evidence
base cannot be papered over with confident prose.
"""

from __future__ import annotations

from typing import Any, ClassVar

from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.domain import (
    ActionPlan,
    CareerDirection,
    ComparisonCriterion,
    DecisionCandidate,
    DecisionProject,
    DirectionJobLink,
    EvidenceItem,
    Job,
    JobRequirementItem,
    ProfileFact,
    UserProfile,
    WeeklyReview,
)
from app.tools.base import Tool, ToolResult


def _owned_project(session: Session, user_id: int, project_id: int | str) -> DecisionProject | None:
    project = session.get(DecisionProject, str(project_id))
    if project is None or project.user_id != user_id:
        return None
    return project


def _not_found(what: str, ident: Any) -> ToolResult:
    return ToolResult(error=f"{what} not found or not yours: {ident}")


class SearchDirectionsArgs(BaseModel):
    query: str = Field(default="", max_length=80, description="关键词，匹配方向名称/技能/标签")
    category: str | None = Field(default=None, max_length=40)
    limit: int = Field(default=8, ge=1, le=25)


class SearchDirections(Tool):
    name: ClassVar[str] = "search_directions"
    description: ClassVar[str] = "检索职业方向目录。返回方向 id、名称、概述与常见技能，用于找候选，不要用来编造结论。"
    args_model: ClassVar[type[BaseModel]] = SearchDirectionsArgs

    def execute(self, session: Session, *, user_id: int, args: BaseModel) -> ToolResult:
        typed: SearchDirectionsArgs = args  # type: ignore[assignment]
        stmt = select(CareerDirection).where(CareerDirection.status == "active")
        if typed.category:
            stmt = stmt.where(CareerDirection.category == typed.category)
        rows = list(session.scalars(stmt.order_by(CareerDirection.sort_order).limit(200)))
        if typed.query:
            needle = typed.query.strip().lower()
            rows = [row for row in rows if needle in _haystack(row)]
        rows = rows[: typed.limit]
        return ToolResult(
            payload={
                "count": len(rows),
                "directions": [
                    {
                        "direction_id": row.id,
                        "name": row.name,
                        "category": row.category,
                        "summary": row.summary[:240],
                        "common_skills": row.common_skills[:12],
                    }
                    for row in rows
                ],
            },
            source_refs=[{"table": "career_directions", "id": row.id} for row in rows],
        )


def _haystack(direction: CareerDirection) -> str:
    parts = [
        direction.name,
        direction.category or "",
        direction.summary or "",
        *direction.common_skills,
        *direction.major_tags,
        *direction.industry_tags,
        *direction.work_types,
    ]
    return " ".join(parts).lower()


class DirectionDetailArgs(BaseModel):
    direction_id: int = Field(description="career_directions.id")


class GetDirectionDetail(Tool):
    name: ClassVar[str] = "get_direction_detail"
    description: ClassVar[str] = "取一个职业方向的完整认知：典型工作、成长路径、常见误解、所需技能。"
    args_model: ClassVar[type[BaseModel]] = DirectionDetailArgs

    def execute(self, session: Session, *, user_id: int, args: BaseModel) -> ToolResult:
        typed: DirectionDetailArgs = args  # type: ignore[assignment]
        row = session.get(CareerDirection, typed.direction_id)
        if row is None:
            return _not_found("direction", typed.direction_id)
        return ToolResult(
            payload={
                "direction_id": row.id,
                "name": row.name,
                "category": row.category,
                "summary": row.summary,
                "typical_work": row.typical_work,
                "common_skills": row.common_skills,
                "growth_path": row.growth_path,
                "misconceptions": row.misconceptions,
                "work_types": row.work_types,
            },
            source_refs=[{"table": "career_directions", "id": row.id}],
        )


class JobSamplesArgs(BaseModel):
    direction_id: int | None = Field(default=None, description="按职业方向取真实岗位")
    keyword: str = Field(default="", max_length=60, description="按岗位标题关键词取真实岗位")
    city: str | None = Field(default=None, max_length=20)
    limit: int = Field(default=6, ge=1, le=15)


class GetJobSamples(Tool):
    name: ClassVar[str] = "get_job_samples"
    description: ClassVar[str] = "取真实岗位样本（薪资/城市/经验要求）。这是唯一能证明市场现状的工具，结论必须引用它。"
    args_model: ClassVar[type[BaseModel]] = JobSamplesArgs

    def execute(self, session: Session, *, user_id: int, args: BaseModel) -> ToolResult:
        typed: JobSamplesArgs = args  # type: ignore[assignment]
        if typed.direction_id is None and not typed.keyword.strip():
            return ToolResult(error="需要 direction_id 或 keyword 至少一个")

        if typed.direction_id is not None:
            stmt = (
                select(Job)
                .join(DirectionJobLink, DirectionJobLink.job_id == Job.id)
                .where(DirectionJobLink.direction_id == typed.direction_id, Job.status == "active")
            )
        else:
            stmt = select(Job).where(Job.status == "active", Job.title.like(f"%{typed.keyword.strip()}%"))
        if typed.city:
            stmt = stmt.where(Job.city.like(f"%{typed.city}%"))
        jobs = list(session.scalars(stmt.order_by(Job.quality_score.desc(), Job.id).limit(typed.limit)))

        return ToolResult(
            payload={
                "count": len(jobs),
                "samples": [
                    {
                        "job_id": job.id,
                        "title": job.title,
                        "company": job.company,
                        "city": job.city,
                        "salary_text": job.salary_text,
                        "salary_min": job.salary_min,
                        "salary_max": job.salary_max,
                        "experience": job.experience_level,
                        "education": job.education,
                    }
                    for job in jobs
                ],
            },
            source_refs=[{"table": "jobs", "id": job.id} for job in jobs],
        )


class RequirementItemsArgs(BaseModel):
    job_id: int | None = Field(default=None)
    direction_id: int | None = Field(default=None, description="取该方向下若干岗位的要求条目汇总")
    item_type: str | None = Field(default=None, max_length=24)
    limit: int = Field(default=12, ge=1, le=40)


class GetRequirementItems(Tool):
    name: ClassVar[str] = "get_requirement_items"
    description: ClassVar[str] = "取岗位 JD 拆出的逐字要求条目。引用时必须原样使用 original_text，不得改写数字或措辞。"
    args_model: ClassVar[type[BaseModel]] = RequirementItemsArgs

    def execute(self, session: Session, *, user_id: int, args: BaseModel) -> ToolResult:
        typed: RequirementItemsArgs = args  # type: ignore[assignment]
        stmt = select(JobRequirementItem, Job).join(Job, Job.id == JobRequirementItem.job_id)
        if typed.job_id is not None:
            stmt = stmt.where(JobRequirementItem.job_id == typed.job_id)
        elif typed.direction_id is not None:
            stmt = stmt.join(DirectionJobLink, DirectionJobLink.job_id == Job.id).where(
                DirectionJobLink.direction_id == typed.direction_id
            )
        else:
            return ToolResult(error="需要 job_id 或 direction_id")
        if typed.item_type:
            stmt = stmt.where(JobRequirementItem.item_type == typed.item_type)

        rows = list(session.execute(stmt.order_by(JobRequirementItem.job_id, JobRequirementItem.sort_order).limit(typed.limit)))
        return ToolResult(
            payload={
                "count": len(rows),
                "items": [
                    {
                        "job_id": job.id,
                        "job_title": job.title,
                        "item_type": item.item_type,
                        "original_text": item.original_text,
                        "extractor": f"{item.extractor_name}@{item.extractor_version}",
                    }
                    for item, job in rows
                ],
            },
            source_refs=[{"table": "job_requirement_items", "job_id": job.id, "text": item.original_text[:60]} for item, job in rows],
        )


class GetProfileArgs(BaseModel):
    dimensions: list[str] = Field(
        default_factory=lambda: ["values", "interests", "skills", "constraints"],
        description="要读取的画像维度",
    )


class GetProfile(Tool):
    name: ClassVar[str] = "get_profile"
    description: ClassVar[str] = "读取当前用户的职业画像事实与数据覆盖率。只读自己的。"
    args_model: ClassVar[type[BaseModel]] = GetProfileArgs

    def execute(self, session: Session, *, user_id: int, args: BaseModel) -> ToolResult:
        typed: GetProfileArgs = args  # type: ignore[assignment]
        profile = session.get(UserProfile, user_id)
        facts = list(
            session.scalars(select(ProfileFact).where(ProfileFact.user_id == user_id, ProfileFact.dimension.in_(typed.dimensions)))
        )
        by_dimension: dict[str, list[str]] = {dimension: [] for dimension in typed.dimensions}
        for fact in facts:
            by_dimension.setdefault(fact.dimension, []).append(fact.statement)
        filled = sum(1 for dimension in typed.dimensions if by_dimension.get(dimension))
        return ToolResult(
            payload={
                "has_profile": profile is not None,
                "school": profile.school if profile else None,
                "major": profile.major if profile else None,
                "graduation_year": profile.graduation_year if profile else None,
                "city_targets": profile.city_targets if profile else [],
                "facts": by_dimension,
                "data_coverage": round(100 * filled / max(1, len(typed.dimensions))),
            },
            source_refs=[{"table": "profile_facts", "id": fact.id} for fact in facts],
        )


class ListCandidatesArgs(BaseModel):
    project_id: str = Field(max_length=32)


class ListCandidates(Tool):
    name: ClassVar[str] = "list_candidates"
    description: ClassVar[str] = "列出某决策项目的候选职业及其状态。"
    args_model: ClassVar[type[BaseModel]] = ListCandidatesArgs

    def execute(self, session: Session, *, user_id: int, args: BaseModel) -> ToolResult:
        typed: ListCandidatesArgs = args  # type: ignore[assignment]
        if _owned_project(session, user_id, typed.project_id) is None:
            return _not_found("project", typed.project_id)
        rows = list(
            session.scalars(
                select(DecisionCandidate)
                .where(DecisionCandidate.project_id == str(typed.project_id))
                .order_by(DecisionCandidate.sort_order)
            )
        )
        return ToolResult(
            payload={
                "count": len(rows),
                "candidates": [
                    {
                        "candidate_id": row.id,
                        "name": row.name,
                        "status": row.status,
                        "source": row.source_type,
                        "rationale": row.rationale[:200],
                    }
                    for row in rows
                ],
            },
            source_refs=[{"table": "decision_candidates", "id": row.id} for row in rows],
        )


class GetEvidenceArgs(BaseModel):
    project_id: str = Field(max_length=32)
    candidate_id: str | None = Field(default=None, max_length=32)
    limit: int = Field(default=20, ge=1, le=50)


class GetEvidence(Tool):
    name: ClassVar[str] = "get_evidence"
    description: ClassVar[str] = "读取项目已收集的证据条目（含逐字引文）。用于判断结论有没有依据。"
    args_model: ClassVar[type[BaseModel]] = GetEvidenceArgs

    def execute(self, session: Session, *, user_id: int, args: BaseModel) -> ToolResult:
        typed: GetEvidenceArgs = args  # type: ignore[assignment]
        if _owned_project(session, user_id, typed.project_id) is None:
            return _not_found("project", typed.project_id)
        stmt = select(EvidenceItem).where(EvidenceItem.project_id == str(typed.project_id))
        if typed.candidate_id:
            stmt = stmt.where(EvidenceItem.candidate_id == typed.candidate_id)
        rows = list(session.scalars(stmt.order_by(EvidenceItem.created_at.desc()).limit(typed.limit)))
        return ToolResult(
            payload={
                "count": len(rows),
                "items": [
                    {
                        "evidence_id": row.id,
                        "candidate_id": row.candidate_id,
                        "kind": row.kind,
                        "statement": row.statement,
                        "quote": row.quote,
                        "source": row.source,
                    }
                    for row in rows
                ],
            },
            source_refs=[{"table": "evidence_items", "id": row.id} for row in rows],
        )


class CompareCandidatesArgs(BaseModel):
    project_id: str = Field(max_length=32)
    criteria: list[str] = Field(default_factory=list, description="对比标准；留空则用项目已保存的标准")


class CompareCandidates(Tool):
    name: ClassVar[str] = "compare_candidates"
    description: ClassVar[str] = "按标准对候选做确定性打分，返回矩阵、覆盖度与缺证据的格子。分数由证据算出，不是模型给的。"
    args_model: ClassVar[type[BaseModel]] = CompareCandidatesArgs
    max_output_chars: ClassVar[int] = 9000

    def execute(self, session: Session, *, user_id: int, args: BaseModel) -> ToolResult:
        typed: CompareCandidatesArgs = args  # type: ignore[assignment]
        project = _owned_project(session, user_id, typed.project_id)
        if project is None:
            return _not_found("project", typed.project_id)

        candidates = list(session.scalars(select(DecisionCandidate).where(DecisionCandidate.project_id == project.id)))
        if len(candidates) < 2:
            return ToolResult(payload={"error": "至少需要两个候选才能比较", "candidate_count": len(candidates)})

        criteria = _resolve_criteria(session, project, typed.criteria)
        evidence = list(session.scalars(select(EvidenceItem).where(EvidenceItem.project_id == project.id)))
        profile_facts = list(session.scalars(select(ProfileFact).where(ProfileFact.user_id == user_id)))

        matrix, missing = _build_matrix(candidates, criteria, evidence, profile_facts)
        cells = len(candidates) * len(criteria)
        supported = sum(1 for row in matrix for cell in row["cells"] if cell["quotes"])
        return ToolResult(
            payload={
                "criteria": [criterion.name for criterion in criteria],
                "matrix": matrix,
                "data_coverage": round(100 * supported / max(1, cells)),
                "missing_cells": missing,
                "rule": "score = 命中的逐字证据条数，上限 5；无证据即 verdict=missing",
            },
            source_refs=[{"table": "evidence_items", "id": item.id} for item in evidence],
        )


def _resolve_criteria(session: Session, project: DecisionProject, requested: list[str]) -> list[ComparisonCriterion]:
    if requested:
        return [ComparisonCriterion(project_id=project.id, name=name.strip()[:80], weight=1) for name in requested if name.strip()]
    stmt = (
        select(ComparisonCriterion)
        .where(ComparisonCriterion.project_id == project.id)
        .order_by(ComparisonCriterion.sort_order)
    )
    return list(session.scalars(stmt))


def _build_matrix(
    candidates: list[DecisionCandidate],
    criteria: list[ComparisonCriterion],
    evidence: list[EvidenceItem],
    profile_facts: list[ProfileFact],
) -> tuple[list[dict[str, Any]], list[dict[str, str]]]:
    if not criteria:
        return [], [{"candidate": candidate.name, "criterion": "(未定义标准)"} for candidate in candidates]

    matrix: list[dict[str, Any]] = []
    missing: list[dict[str, str]] = []
    for candidate in candidates:
        row: dict[str, Any] = {"candidate_id": candidate.id, "name": candidate.name, "cells": []}
        candidate_evidence = [item for item in evidence if item.candidate_id in {None, candidate.id}]
        for criterion in criteria:
            keywords = _keywords(criterion.name)
            hits = [item for item in candidate_evidence if _matches(keywords, item.statement, item.quote)]
            personal = [fact for fact in profile_facts if _matches(keywords, fact.statement, "")]
            score = min(5, len(hits) + (1 if personal else 0))
            verdict = "supported" if score >= 2 else "partial" if score == 1 else "missing"
            if verdict == "missing":
                missing.append({"candidate": candidate.name, "criterion": criterion.name})
            row["cells"].append(
                {
                    "criterion": criterion.name,
                    "score": score,
                    "verdict": verdict,
                    "quotes": [item.quote or item.statement for item in hits[:3]],
                    "evidence_ids": [item.id for item in hits[:3]],
                }
            )
        matrix.append(row)
    return matrix, missing


def _keywords(criterion: str) -> list[str]:
    parts = [part for part in criterion.replace("、", ",").replace("/", ",").split(",") if part.strip()]
    return [part.strip().lower() for part in parts] or [criterion.strip().lower()]


def _matches(keywords: list[str], *texts: str) -> bool:
    joined = " ".join(texts).lower()
    return any(keyword and keyword in joined for keyword in keywords)


class EstimateLoadArgs(BaseModel):
    project_id: str = Field(max_length=32)
    weeks: int = Field(default=4, ge=1, le=12)
    hours_per_week: int = Field(default=8, ge=1, le=40)


class EstimateLoad(Tool):
    name: ClassVar[str] = "estimate_load"
    description: ClassVar[str] = "按项目当前证据缺口给出每周可安排的任务额度上限，供行动计划能力使用。只读。"
    args_model: ClassVar[type[BaseModel]] = EstimateLoadArgs

    def execute(self, session: Session, *, user_id: int, args: BaseModel) -> ToolResult:
        typed: EstimateLoadArgs = args  # type: ignore[assignment]
        project = _owned_project(session, user_id, typed.project_id)
        if project is None:
            return _not_found("project", typed.project_id)
        evidence_count = session.scalar(select(func.count()).select_from(EvidenceItem).where(EvidenceItem.project_id == project.id)) or 0
        per_week = max(2, min(6, typed.hours_per_week // 2))
        return ToolResult(
            payload={
                "weeks": typed.weeks,
                "tasks_per_week_max": per_week,
                "total_task_budget": per_week * typed.weeks,
                "existing_evidence": evidence_count,
            },
            source_refs=[{"table": "decision_projects", "id": project.id}],
        )


class GetPlanArgs(BaseModel):
    project_id: str = Field(max_length=32)


class GetPlan(Tool):
    name: ClassVar[str] = "get_plan"
    description: ClassVar[str] = "读取项目的目标、行动计划与任务状态。只读自己的。"
    args_model: ClassVar[type[BaseModel]] = GetPlanArgs

    def execute(self, session: Session, *, user_id: int, args: BaseModel) -> ToolResult:
        typed: GetPlanArgs = args  # type: ignore[assignment]
        project = _owned_project(session, user_id, typed.project_id)
        if project is None:
            return _not_found("project", typed.project_id)
        plans = list(session.scalars(select(ActionPlan).where(ActionPlan.project_id == project.id)))
        return ToolResult(
            payload={
                "project_id": project.id,
                "status": project.status,
                "primary_target": project.primary_target,
                "question": project.question,
                "plans": [
                    {
                        "plan_id": plan.id,
                        "title": plan.title,
                        "weeks": plan.weeks,
                        "status": plan.status,
                        "tasks": [
                            {
                                "task_id": task.id,
                                "title": task.title,
                                "week_no": task.week_no,
                                "kind": task.kind,
                                "status": task.status,
                                "expected_output": task.expected_output,
                                # Verbatim, because a run woken by a submission must be
                                # able to read what it was woken for. A task marked done
                                # with no account under it is a claim, not evidence.
                                "results": [
                                    {"id": item.id, "body": item.body, "link": item.link, "at": item.created_at.isoformat()}
                                    for item in task.results
                                ],
                            }
                            for task in plan.tasks
                        ],
                    }
                    for plan in plans
                ],
            },
            source_refs=[{"table": "action_plans", "id": plan.id} for plan in plans]
            + [
                {"table": "plan_tasks", "id": task.id}
                for plan in plans
                for task in plan.tasks
                if task.results
            ],
        )


class GetReviewsArgs(BaseModel):
    project_id: str = Field(max_length=32)


class GetReviews(Tool):
    name: ClassVar[str] = "get_reviews"
    description: ClassVar[str] = "读取本项目已确认的周复盘（逐周趋势）。只读自己的。"
    args_model: ClassVar[type[BaseModel]] = GetReviewsArgs

    def execute(self, session: Session, *, user_id: int, args: BaseModel) -> ToolResult:
        typed: GetReviewsArgs = args  # type: ignore[assignment]
        project = _owned_project(session, user_id, typed.project_id)
        if project is None:
            return _not_found("project", typed.project_id)
        reviews = list(
            session.scalars(
                select(WeeklyReview).where(WeeklyReview.project_id == project.id).order_by(WeeklyReview.week_start)
            )
        )
        return ToolResult(
            payload={
                "project_id": project.id,
                "reviews": [
                    {
                        "review_id": review.id,
                        "week_start": review.week_start.isoformat(),
                        "body": review.body,
                        "confidence_trend": review.confidence_trend,
                        "confidence_reason": review.confidence_reason,
                        "next_focus": review.next_focus,
                    }
                    for review in reviews
                ],
            },
            source_refs=[{"table": "weekly_reviews", "id": review.id} for review in reviews],
        )


DOMAIN_TOOLS: tuple[Tool, ...] = (
    SearchDirections(),
    GetDirectionDetail(),
    GetJobSamples(),
    GetRequirementItems(),
    GetProfile(),
    ListCandidates(),
    GetEvidence(),
    CompareCandidates(),
    EstimateLoad(),
    GetPlan(),
    GetReviews(),
)
