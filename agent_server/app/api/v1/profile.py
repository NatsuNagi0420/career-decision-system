from fastapi import APIRouter

from app.agents.profile_graph import generate_profile
from app.schemas.common import ApiResponse
from app.schemas.profile import CapabilityProfileRequest, CapabilityProfileResponse

router = APIRouter()


@router.post("/generate", response_model=ApiResponse[CapabilityProfileResponse])
async def generate(request: CapabilityProfileRequest) -> ApiResponse[CapabilityProfileResponse]:
    return ApiResponse.success(generate_profile(request), trace_id=request.request_id)
