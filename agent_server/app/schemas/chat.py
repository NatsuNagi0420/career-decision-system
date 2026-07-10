from pydantic import BaseModel, Field


class ChatRequest(BaseModel):
    request_id: str | None = None
    user_id: str | None = None
    page: str | None = None
    message: str
    context: dict = Field(default_factory=dict)


class ChatAction(BaseModel):
    label: str
    action: str


class ChatResponse(BaseModel):
    reply: str
    actions: list[ChatAction] = Field(default_factory=list)
    intent: str = "career_consultation"
