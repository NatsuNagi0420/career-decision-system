"""Domain tables: what the agent knows and what the user decides.

Modelled fresh, but carrying v1's hard-won lessons rather than rediscovering them:

  * one evidence table, one provenance encoding (v1 had personal_evidence vs
    decision_evidence kept in sync by hand, and three different source_ref shapes)
  * one confidence mechanism (v1 tracked it in both weekly_reviews and
    target_confidence_feedback)
  * every optimistic lock here is a real lock; v1's path_plans.version incremented
    without a WHERE clause and so guarded nothing
  * no unique key on (source_platform, source_job_code): the imported snapshot had
    800 rows with 799 distinct codes, and adding one would have broken the import
  * aggregate versioning: editing a candidate bumps its project's version, so two
    devices editing one decision project collide instead of merging silently
"""

from __future__ import annotations

from datetime import date, datetime
from typing import ClassVar

from sqlalchemy import (
    JSON,
    BigInteger,
    Boolean,
    Date,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.models import Base, Timestamp, new_id, utcnow

PROFILE_DIMENSIONS = ("values", "interests", "skills", "constraints", "context")
EVIDENCE_SOURCES = ("user", "assessment", "resume", "task_result", "agent", "catalog")
PROJECT_STATUSES = ("framing", "exploring", "comparing", "decided", "acting", "reviewing", "archived")
CANDIDATE_STATUSES = ("active", "shortlisted", "target", "dropped")
TASK_STATUSES = ("todo", "doing", "blocked", "done", "skipped")


class CareerDirection(Base):
    """Platform catalogue rows have owner_user_id NULL; a user's own addition is scoped."""

    __tablename__ = "career_directions"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    owner_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    code: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    category: Mapped[str | None] = mapped_column(String(64), nullable=True)
    summary: Mapped[str] = mapped_column(Text, nullable=False, default="")
    typical_work: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    common_skills: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    growth_path: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    misconceptions: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    major_tags: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    industry_tags: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    work_types: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="active")
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(Timestamp, nullable=False, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(Timestamp, nullable=False, default=utcnow, onupdate=utcnow)

    jobs: Mapped[list[DirectionJobLink]] = relationship(back_populates="direction", cascade="all, delete-orphan")


class Job(Base):
    __tablename__ = "jobs"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    source_platform: Mapped[str] = mapped_column(String(32), nullable=False, default="manual")
    source_job_code: Mapped[str | None] = mapped_column(String(96), nullable=True, index=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    normalized_title: Mapped[str | None] = mapped_column(String(200), nullable=True, index=True)
    company: Mapped[str | None] = mapped_column(String(200), nullable=True)
    city: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    salary_min: Mapped[int | None] = mapped_column(Integer, nullable=True)
    salary_max: Mapped[int | None] = mapped_column(Integer, nullable=True)
    salary_text: Mapped[str | None] = mapped_column(String(96), nullable=True)
    salary_period: Mapped[str | None] = mapped_column(String(16), nullable=True)
    experience_level: Mapped[str | None] = mapped_column(String(64), nullable=True)
    education: Mapped[str | None] = mapped_column(String(64), nullable=True)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    source_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    quality_score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="active")
    requirement_items: Mapped[list[JobRequirementItem]] = relationship(
        back_populates="job", cascade="all, delete-orphan", order_by="JobRequirementItem.sort_order"
    )

    __table_args__: ClassVar[tuple] = (
        Index("ix_job_title_city", "normalized_title", "city"),
    )


class JobRequirementItem(Base):
    """`original_text` stays verbatim: it is the quotable evidence the agent must
    cite, and the number-fabrication guard compares against it."""

    __tablename__ = "job_requirement_items"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    job_id: Mapped[int] = mapped_column(ForeignKey("jobs.id", ondelete="CASCADE"), nullable=False, index=True)
    item_type: Mapped[str] = mapped_column(String(32), nullable=False, default="requirement")
    original_text: Mapped[str] = mapped_column(Text, nullable=False)
    normalized_key: Mapped[str | None] = mapped_column(String(120), nullable=True, index=True)
    confidence: Mapped[float] = mapped_column(Numeric(4, 3), nullable=False, default=1)
    extractor_name: Mapped[str] = mapped_column(String(64), nullable=False, default="import")
    extractor_version: Mapped[str] = mapped_column(String(32), nullable=False, default="v1")
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    job: Mapped[Job] = relationship(back_populates="requirement_items")


class DirectionJobLink(Base):
    __tablename__ = "career_direction_job_rel"
    __table_args__: ClassVar[tuple] = (UniqueConstraint("direction_id", "job_id", name="uq_direction_job"),)

    direction_id: Mapped[int] = mapped_column(ForeignKey("career_directions.id", ondelete="CASCADE"), primary_key=True)
    job_id: Mapped[int] = mapped_column(ForeignKey("jobs.id", ondelete="CASCADE"), primary_key=True)
    match_source: Mapped[str] = mapped_column(String(24), nullable=False, default="import")
    rule_version: Mapped[str] = mapped_column(String(32), nullable=False, default="v1")
    review_status: Mapped[str] = mapped_column(String(16), nullable=False, default="unreviewed")

    direction: Mapped[CareerDirection] = relationship(back_populates="jobs")
    job: Mapped[Job] = relationship(foreign_keys=[job_id])


class UserProfile(Base):
    __tablename__ = "user_profiles"

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), primary_key=True)
    school: Mapped[str | None] = mapped_column(String(120), nullable=True)
    major: Mapped[str | None] = mapped_column(String(120), nullable=True)
    graduation_year: Mapped[int | None] = mapped_column(Integer, nullable=True)
    city_targets: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    summary: Mapped[str] = mapped_column(Text, nullable=False, default="")
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    __mapper_args__: ClassVar[dict] = {"version_id_col": version}

    updated_at: Mapped[datetime] = mapped_column(Timestamp, nullable=False, default=utcnow, onupdate=utcnow)

    def touch(self) -> None:
        """Advance the profile version by really modifying the row."""
        self.updated_at = utcnow()


class ProfileFact(Base):
    __tablename__ = "profile_facts"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    dimension: Mapped[str] = mapped_column(String(24), nullable=False)
    statement: Mapped[str] = mapped_column(String(500), nullable=False)
    source: Mapped[str] = mapped_column(String(16), nullable=False, default="user")
    source_ref: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    confirmed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(Timestamp, nullable=False, default=utcnow)

    __table_args__: ClassVar[tuple] = (Index("ix_fact_user_dimension", "user_id", "dimension"),)


class DecisionProject(Base):
    """The aggregate root. `touch` mutates the row so the ORM's version_id_col
    advances; a child insert on its own would not, and two devices editing one
    project must collide rather than merge silently."""

    __tablename__ = "decision_projects"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    question: Mapped[str] = mapped_column(Text, nullable=False, default="")
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="framing")
    primary_target: Mapped[str | None] = mapped_column(String(200), nullable=True)
    target_candidate_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    confirmed_at: Mapped[datetime | None] = mapped_column(Timestamp, nullable=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    __mapper_args__: ClassVar[dict] = {"version_id_col": version}

    candidates: Mapped[list[DecisionCandidate]] = relationship(back_populates="project", cascade="all, delete-orphan")
    criteria: Mapped[list[ComparisonCriterion]] = relationship(
        back_populates="project", cascade="all, delete-orphan", order_by="ComparisonCriterion.sort_order"
    )
    evidence: Mapped[list[EvidenceItem]] = relationship(back_populates="project", cascade="all, delete-orphan")
    created_at: Mapped[datetime] = mapped_column(Timestamp, nullable=False, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(Timestamp, nullable=False, default=utcnow, onupdate=utcnow)

    def touch(self) -> None:
        """Advance the aggregate version by really modifying the row."""
        self.updated_at = utcnow()


class DecisionCandidate(Base):
    __tablename__ = "decision_candidates"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    project_id: Mapped[str] = mapped_column(ForeignKey("decision_projects.id", ondelete="CASCADE"), nullable=False, index=True)
    direction_id: Mapped[int | None] = mapped_column(ForeignKey("career_directions.id", ondelete="SET NULL"), nullable=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    source_type: Mapped[str] = mapped_column(String(16), nullable=False, default="user")
    created_by_run_id: Mapped[str | None] = mapped_column(ForeignKey("agent_runs.id", ondelete="SET NULL"), nullable=True)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="active")
    rationale: Mapped[str] = mapped_column(Text, nullable=False, default="")
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(Timestamp, nullable=False, default=utcnow)

    project: Mapped[DecisionProject] = relationship(back_populates="candidates")

    __table_args__: ClassVar[tuple] = (UniqueConstraint("project_id", "name", name="uq_candidate_project_name"),)


class EvidenceItem(Base):
    """One table, one provenance shape. `quote` is verbatim source text, not a paraphrase."""

    __tablename__ = "evidence_items"
    __table_args__: ClassVar[tuple] = (Index("ix_evidence_user_project", "user_id", "project_id"),)

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    project_id: Mapped[str | None] = mapped_column(ForeignKey("decision_projects.id", ondelete="CASCADE"), nullable=True)
    candidate_id: Mapped[str | None] = mapped_column(ForeignKey("decision_candidates.id", ondelete="CASCADE"), nullable=True)
    kind: Mapped[str] = mapped_column(String(32), nullable=False, default="job_signal")
    statement: Mapped[str] = mapped_column(Text, nullable=False)
    quote: Mapped[str] = mapped_column(Text, nullable=False, default="")
    source_ref: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    source: Mapped[str] = mapped_column(String(16), nullable=False, default="user")
    created_by_run_id: Mapped[str | None] = mapped_column(ForeignKey("agent_runs.id", ondelete="SET NULL"), nullable=True)
    request_id: Mapped[str | None] = mapped_column(String(80), unique=True, nullable=True)
    created_at: Mapped[datetime] = mapped_column(Timestamp, nullable=False, default=utcnow)

    project: Mapped[DecisionProject] = relationship(back_populates="evidence")


class ComparisonCriterion(Base):
    __tablename__ = "comparison_criteria"
    __table_args__: ClassVar[tuple] = (UniqueConstraint("project_id", "name", name="uq_criterion_project_name"),)

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    project_id: Mapped[str] = mapped_column(ForeignKey("decision_projects.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    weight: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    source: Mapped[str] = mapped_column(String(16), nullable=False, default="user")
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    project: Mapped[DecisionProject] = relationship(back_populates="criteria")


class ComparisonResult(Base):
    __tablename__ = "comparison_results"
    __table_args__: ClassVar[tuple] = (UniqueConstraint("project_id", "criterion_id", "candidate_id", name="uq_comparison_cell"),)

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    project_id: Mapped[str] = mapped_column(ForeignKey("decision_projects.id", ondelete="CASCADE"), nullable=False, index=True)
    criterion_id: Mapped[str] = mapped_column(ForeignKey("comparison_criteria.id", ondelete="CASCADE"), nullable=False)
    candidate_id: Mapped[str] = mapped_column(ForeignKey("decision_candidates.id", ondelete="CASCADE"), nullable=False)
    score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    verdict: Mapped[str | None] = mapped_column(String(24), nullable=True)
    note: Mapped[str] = mapped_column(Text, nullable=False, default="")
    evidence_refs: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    run_id: Mapped[str | None] = mapped_column(ForeignKey("agent_runs.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(Timestamp, nullable=False, default=utcnow)


class ActionPlan(Base):
    __tablename__ = "action_plans"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    project_id: Mapped[str] = mapped_column(ForeignKey("decision_projects.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    weeks: Mapped[int] = mapped_column(Integer, nullable=False, default=4)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="active")
    generation_request_id: Mapped[str] = mapped_column(String(80), unique=True, nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    __mapper_args__: ClassVar[dict] = {"version_id_col": version}

    tasks: Mapped[list[PlanTask]] = relationship(back_populates="plan", cascade="all, delete-orphan", order_by="PlanTask.ordinal")
    created_at: Mapped[datetime] = mapped_column(Timestamp, nullable=False, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(Timestamp, nullable=False, default=utcnow, onupdate=utcnow)

    def touch(self) -> None:
        """Advance the aggregate version by really modifying the row."""
        self.updated_at = utcnow()


class PlanTask(Base):
    __tablename__ = "plan_tasks"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    plan_id: Mapped[str] = mapped_column(ForeignKey("action_plans.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    expected_output: Mapped[str] = mapped_column(Text, nullable=False, default="")
    week_no: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    kind: Mapped[str] = mapped_column(String(24), nullable=False, default="evidence")
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="todo")
    ordinal: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    completed_at: Mapped[datetime | None] = mapped_column(Timestamp, nullable=True)

    __mapper_args__: ClassVar[dict] = {"version_id_col": version}

    plan: Mapped[ActionPlan] = relationship(back_populates="tasks")
    results: Mapped[list[TaskResult]] = relationship(back_populates="task", cascade="all, delete-orphan")

    __table_args__: ClassVar[tuple] = (Index("ix_task_plan_week", "plan_id", "week_no"),)


class TaskResult(Base):
    __tablename__ = "task_results"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    task_id: Mapped[str] = mapped_column(ForeignKey("plan_tasks.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    link: Mapped[str | None] = mapped_column(String(500), nullable=True)
    request_id: Mapped[str] = mapped_column(String(80), unique=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(Timestamp, nullable=False, default=utcnow)

    task: Mapped[PlanTask] = relationship(back_populates="results")


class WeeklyReview(Base):
    """The single place confidence trend is recorded (v1 had two)."""

    __tablename__ = "weekly_reviews"
    __table_args__: ClassVar[tuple] = (UniqueConstraint("user_id", "week_start", name="uq_review_user_week"),)

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    project_id: Mapped[str] = mapped_column(ForeignKey("decision_projects.id", ondelete="CASCADE"), nullable=False, index=True)
    plan_id: Mapped[str | None] = mapped_column(ForeignKey("action_plans.id", ondelete="CASCADE"), nullable=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    week_start: Mapped[date] = mapped_column(Date, nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False, default="")
    confidence_trend: Mapped[str | None] = mapped_column(String(16), nullable=True)
    confidence_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    next_focus: Mapped[str] = mapped_column(Text, nullable=False, default="")
    run_id: Mapped[str | None] = mapped_column(ForeignKey("agent_runs.id", ondelete="SET NULL"), nullable=True)
    request_id: Mapped[str] = mapped_column(String(80), unique=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(Timestamp, nullable=False, default=utcnow)
