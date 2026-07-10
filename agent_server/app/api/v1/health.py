from fastapi import APIRouter
from fastapi.responses import JSONResponse

from app.config.settings import get_settings
from app.schemas.common import ApiResponse

router = APIRouter()


@router.get("/health", response_model=ApiResponse[dict[str, str]])
async def health() -> ApiResponse[dict[str, str]]:
    settings = get_settings()
    return ApiResponse.success(
        {
            "status": "ok",
            "environment": settings.app_env,
            "llmProvider": settings.llm_provider,
        }
    )


@router.get("/ready", response_model=ApiResponse[dict[str, str]])
async def ready() -> ApiResponse[dict[str, str]] | JSONResponse:
    settings = get_settings()
    internal_token_issue = settings.internal_token_readiness_issue()
    if internal_token_issue:
        response = ApiResponse.error(50301, internal_token_issue)
        return JSONResponse(status_code=503, content=response.model_dump(mode="json"))
    llm_issue = settings.llm_readiness_issue()
    if llm_issue:
        response = ApiResponse.error(50301, llm_issue)
        return JSONResponse(status_code=503, content=response.model_dump(mode="json"))
    return ApiResponse.success({"status": "ready"})
