from fastapi import APIRouter

from app.agents.path_plan_graph import generate_path_plan
from app.schemas.common import ApiResponse
from app.schemas.path_plan import PathPlanRequest, PathPlanResponse

router = APIRouter()


@router.post("/generate", response_model=ApiResponse[PathPlanResponse])
async def generate(request: PathPlanRequest) -> ApiResponse[PathPlanResponse]:
    return ApiResponse.success(generate_path_plan(request), trace_id=request.request_id)
