from fastapi import APIRouter

from app.agents.career_report_graph import generate_career_report
from app.schemas.career_report import CareerReportRequest, CareerReportResponse
from app.schemas.common import ApiResponse

router = APIRouter()


@router.post("/generate", response_model=ApiResponse[CareerReportResponse])
async def generate(request: CareerReportRequest) -> ApiResponse[CareerReportResponse]:
    report = generate_career_report(request)
    return ApiResponse.success(report, trace_id=request.request_id)
