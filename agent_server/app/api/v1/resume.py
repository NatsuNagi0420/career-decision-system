from fastapi import APIRouter

from app.agents.resume_graph import analyze_resume
from app.schemas.common import ApiResponse
from app.schemas.resume import ResumeAnalysisRequest, ResumeAnalysisResponse

router = APIRouter()


@router.post("/analyze", response_model=ApiResponse[ResumeAnalysisResponse])
async def analyze(request: ResumeAnalysisRequest) -> ApiResponse[ResumeAnalysisResponse]:
    return ApiResponse.success(analyze_resume(request), trace_id=request.request_id)
