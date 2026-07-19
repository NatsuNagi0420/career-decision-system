from fastapi import APIRouter

from app.agents.coaching_graph import coach_action, coach_decision, coach_weekly_review, compare_jobs, preview_action_plan
from app.schemas.coaching import (
    ActionCoachRequest,
    ActionCoachResponse,
    ActionPlanPreviewRequest,
    ActionPlanPreviewResponse,
    DecisionCoachRequest,
    DecisionCoachResponse,
    JobComparisonRequest,
    JobComparisonResponse,
    WeeklyReviewCoachRequest,
    WeeklyReviewCoachResponse,
)
from app.schemas.common import ApiResponse

router = APIRouter()


@router.post("/decision", response_model=ApiResponse[DecisionCoachResponse])
async def decision(request: DecisionCoachRequest) -> ApiResponse[DecisionCoachResponse]:
    return ApiResponse.success(coach_decision(request), trace_id=request.request_id)


@router.post("/job-comparison", response_model=ApiResponse[JobComparisonResponse])
async def job_comparison(request: JobComparisonRequest) -> ApiResponse[JobComparisonResponse]:
    return ApiResponse.success(compare_jobs(request), trace_id=request.request_id)


@router.post("/action", response_model=ApiResponse[ActionCoachResponse])
async def action(request: ActionCoachRequest) -> ApiResponse[ActionCoachResponse]:
    return ApiResponse.success(coach_action(request), trace_id=request.request_id)


@router.post("/action-plan-preview", response_model=ApiResponse[ActionPlanPreviewResponse])
async def action_plan_preview(request: ActionPlanPreviewRequest) -> ApiResponse[ActionPlanPreviewResponse]:
    return ApiResponse.success(preview_action_plan(request), trace_id=request.request_id)


@router.post("/weekly-review", response_model=ApiResponse[WeeklyReviewCoachResponse])
async def weekly_review(request: WeeklyReviewCoachRequest) -> ApiResponse[WeeklyReviewCoachResponse]:
    return ApiResponse.success(coach_weekly_review(request), trace_id=request.request_id)
