from pydantic import BaseModel, Field

from app.schemas.profile import AssessmentSnapshot, UserProfile


class JobCandidate(BaseModel):
    id: int | str | None = None
    title: str
    company: str | None = None
    location: str | None = None
    direction: str | None = None
    salary_range: str | None = None
    industry: str | None = None
    match_score: int = 72
    reasons: list[str] = Field(default_factory=list)
    core_skills: list[str] = Field(default_factory=list)


class CareerReportRequest(BaseModel):
    request_id: str | None = None
    user_id: str | None = None
    profile: UserProfile = Field(default_factory=UserProfile)
    assessment: AssessmentSnapshot = Field(default_factory=AssessmentSnapshot)
    job_candidates: list[JobCandidate] = Field(default_factory=list)


class CareerOption(BaseModel):
    title: str
    match_score: int
    reasons: list[str]
    core_skills: list[str]
    risks: list[str]


class SkillGapItem(BaseModel):
    skill: str
    priority: str
    suggestion: str


class CareerReportResponse(BaseModel):
    summary: str
    profile_tags: list[str]
    strengths: list[str]
    risks: list[str]
    recommended_careers: list[CareerOption]
    skill_gaps: list[SkillGapItem]
    next_actions: list[str]
    confidence: float = 0.72
