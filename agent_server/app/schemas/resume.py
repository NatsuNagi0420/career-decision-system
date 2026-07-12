from pydantic import BaseModel, Field


class ResumeAnalysisRequest(BaseModel):
    request_id: str | None = None
    user_id: str | None = None
    target_role: str | None = None
    resume_text: str
    allow_external_model: bool = False


class ResumeAnalysisResponse(BaseModel):
    score: int
    ats_score: int
    keyword_match: int
    issues: list[str]
    suggestions: list[str]
    improved_fragments: list[str] = Field(default_factory=list)
