from uuid import uuid4

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.requests import Request
from fastapi.responses import JSONResponse

from app.api.v1.router import api_router
from app.config.settings import get_settings
from app.schemas.common import ApiResponse
from app.trace_context import get_trace_id, reset_trace_id, set_trace_id

settings = get_settings()
INTERNAL_TOKEN_HEADER = "X-Internal-Token"
PUBLIC_PATHS = {"/", "/docs", "/redoc", "/openapi.json", "/api/v1/health", "/api/v1/ready"}

app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    description="AI agent service for the career decision system.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def trace_context_middleware(request: Request, call_next):
    trace_id = request.headers.get("X-Request-ID") or request.headers.get("X-Trace-ID") or str(uuid4())
    token = set_trace_id(trace_id)
    try:
        if requires_internal_token(request) and request.headers.get(INTERNAL_TOKEN_HEADER) != settings.normalized_internal_api_token():
            response = ApiResponse.error(401, "Unauthorized agent request", trace_id=trace_id)
            return JSONResponse(
                status_code=401,
                content=response.model_dump(mode="json"),
                headers={"X-Trace-ID": response.trace_id or trace_id},
            )
        response = await call_next(request)
        response.headers["X-Trace-ID"] = get_trace_id() or trace_id
        return response
    finally:
        reset_trace_id(token)


def requires_internal_token(request: Request) -> bool:
    if request.method == "OPTIONS":
        return False
    return request.url.path.startswith("/api/v1/") and request.url.path not in PUBLIC_PATHS


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    response = ApiResponse.error(422, "Validation failed")
    return JSONResponse(status_code=422, content=response.model_dump(mode="json"))


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    response = ApiResponse.error(500, "Internal server error")
    return JSONResponse(status_code=500, content=response.model_dump(mode="json"))


app.include_router(api_router, prefix="/api/v1")


@app.get("/")
async def root() -> dict[str, str]:
    return {"service": settings.app_name, "status": "ok"}
