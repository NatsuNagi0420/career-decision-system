from pydantic import BaseModel, Field

from app.schemas.profile import UserProfile


class PathPlanRequest(BaseModel):
    request_id: str | None = None
    user_id: str | None = None
    profile: UserProfile = Field(default_factory=UserProfile)
    target_role: str
    allow_external_model: bool = False


class Milestone(BaseModel):
    title: str
    duration: str
    tasks: list[str]
    acceptance: list[str]


class PathPlanResponse(BaseModel):
    target_role: str
    overview: str
    milestones: list[Milestone]
    checkpoints: list[str]
