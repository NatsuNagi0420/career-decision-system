from pydantic import BaseModel, Field


class UserProfile(BaseModel):
    user_id: str | None = None
    name: str | None = None
    identity: str | None = Field(default=None, description="student, graduate, worker, career_changer")
    school: str | None = None
    major: str | None = None
    degree: str | None = None
    target_role: str | None = None
    target_cities: list[str] = Field(default_factory=list)
    expected_salary: str | None = None
    skills: list[str] = Field(default_factory=list)
    certificates: list[str] = Field(default_factory=list)
    experiences: list[str] = Field(default_factory=list)
    values: list[str] = Field(default_factory=list)


class AssessmentSnapshot(BaseModel):
    mbti_type: str | None = None
    interests: list[str] = Field(default_factory=list)
    strengths: list[str] = Field(default_factory=list)
    weaknesses: list[str] = Field(default_factory=list)


class CapabilityProfileRequest(BaseModel):
    request_id: str | None = None
    user_id: str | None = None
    profile: UserProfile = Field(default_factory=UserProfile)
    assessment: AssessmentSnapshot = Field(default_factory=AssessmentSnapshot)


class RadarPoint(BaseModel):
    name: str
    value: int


class CapabilityProfileResponse(BaseModel):
    completeness_score: int
    competitiveness_stars: int
    tags: list[str]
    radar: list[RadarPoint]
    strengths: list[str]
    suggestions: list[str]
