from typing import Literal

from pydantic import Field

from app.schemas.coaching import CamelModel, EvidenceBasis


class ChatRequest(CamelModel):
    request_id: str | None = None
    user_id: str | None = None
    page: str | None = None
    message: str
    context: dict = Field(default_factory=dict)
    allow_external_model: bool = False


class ChatAction(CamelModel):
    label: str
    action: str


class ChatResponse(CamelModel):
    generation_mode: Literal["llm", "fallback"] = "fallback"
    model_name: str | None = None
    confidence: float = Field(default=0.45, ge=0, le=1)
    response_mode: Literal["direct", "coaching"] = "coaching"
    used_personal_context: bool = False
    reply: str
    evidence_basis: list[EvidenceBasis] = Field(default_factory=list, max_length=12)
    uncertainties: list[str] = Field(default_factory=list, max_length=12)
    next_step: str | None = None
    actions: list[ChatAction] = Field(default_factory=list)
    intent: str = "career_consultation"
