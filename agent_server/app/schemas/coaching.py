from typing import Literal

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class CamelModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="ignore")


class CandidateContext(CamelModel):
    id: int | None = None
    direction_id: int | None = None
    name: str
    recommendation_reason: str | None = None
    opposing_factors: str | None = None
    uncertainties: str | None = None
    validation_actions: list[str] = Field(default_factory=list, max_length=12)


class EvidenceContext(CamelModel):
    id: int | None = None
    candidate_id: int | None = None
    title: str
    detail: str | None = None
    source_type: str | None = None
    source_ref: str | None = None
    credibility: str | None = None
    stance: str | None = None


class JobSampleContext(CamelModel):
    id: int | None = None
    candidate_id: int | None = None
    job_id: int | None = None
    title: str
    company: str | None = None
    city: str | None = None
    salary_text: str | None = None
    note: str | None = None


class ComparisonResultContext(CamelModel):
    candidate_id: int
    score: int | None = Field(default=None, ge=1, le=5)
    assessment: str | None = None
    evidence_ids: list[int] = Field(default_factory=list, max_length=20)
    uncertainty: str | None = None
    validation_action: str | None = None


class CriterionContext(CamelModel):
    id: int
    name: str
    importance: int = Field(default=3, ge=1, le=5)
    results: list[ComparisonResultContext] = Field(default_factory=list, max_length=10)


class ProjectContext(CamelModel):
    id: int
    title: str
    question: str
    background: str | None = None
    trigger_reason: str | None = None
    priorities: list[str] = Field(default_factory=list, max_length=12)
    must_haves: list[str] = Field(default_factory=list, max_length=12)
    deal_breakers: list[str] = Field(default_factory=list, max_length=12)
    current_stage: str | None = None
    candidates: list[CandidateContext] = Field(default_factory=list, max_length=5)
    evidence: list[EvidenceContext] = Field(default_factory=list, max_length=100)
    job_samples: list[JobSampleContext] = Field(default_factory=list, max_length=100)
    criteria: list[CriterionContext] = Field(default_factory=list, max_length=20)


class DecisionCoachRequest(CamelModel):
    request_id: str = Field(min_length=1, max_length=80)
    user_id: str | None = Field(default=None, max_length=64)
    focus: str | None = Field(default=None, max_length=1000)
    allow_external_model: bool = False
    project: ProjectContext
    available_directions: list[str] = Field(default_factory=list, max_length=40)


class JobComparisonRequest(CamelModel):
    request_id: str = Field(min_length=1, max_length=80)
    user_id: str | None = Field(default=None, max_length=64)
    focus: str | None = Field(default=None, max_length=1000)
    allow_external_model: bool = False
    project: ProjectContext


class TaskContext(CamelModel):
    id: int
    week_no: int = Field(ge=1, le=12)
    title: str
    task_type: str | None = None
    content: str | None = None
    status: str
    due_at: str | None = None
    estimated_minutes: int | None = Field(default=None, ge=0, le=10080)
    acceptance_criteria: str | None = None
    deferred_to: str | None = None
    results: list[dict[str, object]] = Field(default_factory=list, max_length=20)


class WeekContext(CamelModel):
    week_no: int = Field(ge=1, le=12)
    title: str | None = None
    goal: str | None = None
    tasks: list[TaskContext] = Field(default_factory=list, max_length=100)


class ActionPlanContext(CamelModel):
    id: int
    project_id: int
    target_role: str
    overview: str | None = None
    status: str | None = None
    duration_weeks: int = Field(ge=2, le=12)
    start_date: str | None = None
    end_date: str | None = None
    weeks: list[WeekContext] = Field(default_factory=list, max_length=12)


class ActionCoachRequest(CamelModel):
    request_id: str = Field(min_length=1, max_length=80)
    user_id: str | None = Field(default=None, max_length=64)
    focus: str | None = Field(default=None, max_length=1000)
    allow_external_model: bool = False
    plan: ActionPlanContext


class ReviewContext(CamelModel):
    id: int
    plan_id: int
    project_id: int
    week_no: int = Field(ge=1, le=12)
    completed_summary: str | None = None
    evidence_summary: str | None = None
    difficulties: str | None = None
    next_week_minutes: int | None = Field(default=None, ge=0, le=10080)
    confidence_trend: str | None = None
    confidence_reason: str | None = None
    adjustment_proposal: str | None = None
    status: str | None = None


class WeeklyReviewCoachRequest(CamelModel):
    request_id: str = Field(min_length=1, max_length=80)
    user_id: str | None = Field(default=None, max_length=64)
    focus: str | None = Field(default=None, max_length=1000)
    allow_external_model: bool = False
    review: ReviewContext
    plan: ActionPlanContext


class EvidenceBasis(CamelModel):
    statement: str = Field(min_length=1, max_length=1000)
    source_refs: list[str] = Field(default_factory=list, max_length=12)


class SuggestedAction(CamelModel):
    action_type: Literal[
        "clarify_question",
        "add_candidate",
        "collect_evidence",
        "compare_candidate",
        "validate_assumption",
        "create_task",
        "adjust_task",
        "review_target",
    ]
    title: str = Field(min_length=1, max_length=300)
    rationale: str = Field(min_length=1, max_length=1000)
    acceptance_criteria: str | None = Field(default=None, max_length=1000)


class CandidateSuggestion(CamelModel):
    direction_id: int | None = None
    name: str = Field(min_length=1, max_length=120)
    recommendation_reason: str = Field(min_length=1, max_length=1500)
    opposing_factors: str = Field(min_length=1, max_length=1500)
    uncertainties: str = Field(min_length=1, max_length=1500)
    validation_actions: list[str] = Field(min_length=1, max_length=8)


class CandidateAssessment(CamelModel):
    candidate_id: int
    candidate_name: str = Field(min_length=1, max_length=120)
    score: int | None = Field(default=None, ge=1, le=5)
    assessment: str = Field(min_length=1, max_length=2000)
    evidence_refs: list[str] = Field(default_factory=list, max_length=20)
    opposing_factors: list[str] = Field(min_length=1, max_length=8)
    uncertainty: str = Field(min_length=1, max_length=1200)
    validation_action: str = Field(min_length=1, max_length=1200)


class TaskSuggestion(CamelModel):
    week_no: int = Field(ge=1, le=12)
    title: str = Field(min_length=1, max_length=200)
    task_type: Literal[
        "career_research",
        "skill_learning",
        "project",
        "resume",
        "networking",
        "interview",
        "application",
        "custom",
    ]
    content: str = Field(min_length=1, max_length=1000)
    estimated_minutes: int = Field(ge=5, le=10080)
    acceptance_criteria: str = Field(min_length=1, max_length=1000)
    rationale: str = Field(min_length=1, max_length=1000)


class TaskAdjustmentSuggestion(CamelModel):
    task_id: int
    task_title: str = Field(min_length=1, max_length=200)
    status: Literal["todo", "in_progress", "deferred", "skipped"]
    reason: str = Field(min_length=1, max_length=1000)
    deferred_days: int | None = Field(default=None, ge=1, le=30)


class CoachingResponse(CamelModel):
    generation_mode: Literal["llm", "fallback"] = "fallback"
    model_name: str | None = Field(default=None, max_length=120)
    confidence: float = Field(ge=0, le=1)
    conclusion: str = Field(min_length=1, max_length=3000)
    evidence_basis: list[EvidenceBasis] = Field(min_length=1, max_length=20)
    counter_arguments: list[str] = Field(min_length=1, max_length=12)
    uncertainties: list[str] = Field(min_length=1, max_length=12)
    next_actions: list[SuggestedAction] = Field(min_length=1, max_length=12)


class DecisionCoachResponse(CoachingResponse):
    candidate_suggestions: list[CandidateSuggestion] = Field(default_factory=list, max_length=3)


class JobComparisonResponse(CoachingResponse):
    candidate_assessments: list[CandidateAssessment] = Field(min_length=1, max_length=5)


class ActionCoachResponse(CoachingResponse):
    task_suggestions: list[TaskSuggestion] = Field(min_length=1, max_length=8)


class WeeklyReviewCoachResponse(CoachingResponse):
    review_summary: str = Field(min_length=1, max_length=3000)
    adjustment_suggestions: list[TaskAdjustmentSuggestion] = Field(default_factory=list, max_length=12)
