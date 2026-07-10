from fastapi import APIRouter

from app.agents.chat_graph import answer_chat
from app.schemas.chat import ChatRequest, ChatResponse
from app.schemas.common import ApiResponse

router = APIRouter()


@router.post("/messages", response_model=ApiResponse[ChatResponse])
async def send_message(request: ChatRequest) -> ApiResponse[ChatResponse]:
    return ApiResponse.success(answer_chat(request), trace_id=request.request_id)
