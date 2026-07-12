from fastapi import APIRouter

from app.api.v1 import career_report, chat, coaching, health, path_plan, profile, resume

api_router = APIRouter()
api_router.include_router(health.router, tags=["health"])
api_router.include_router(career_report.router, prefix="/career-reports", tags=["career reports"])
api_router.include_router(profile.router, prefix="/profiles", tags=["profiles"])
api_router.include_router(chat.router, prefix="/chat", tags=["chat"])
api_router.include_router(resume.router, prefix="/resumes", tags=["resumes"])
api_router.include_router(path_plan.router, prefix="/path-plans", tags=["path plans"])
api_router.include_router(coaching.router, prefix="/coaching", tags=["coaching"])
