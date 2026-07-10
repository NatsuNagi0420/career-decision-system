from datetime import UTC, datetime
from typing import Generic, TypeVar

from pydantic import BaseModel, Field

from app.trace_context import get_trace_id, set_trace_id

T = TypeVar("T")


def now_millis() -> int:
    return int(datetime.now(UTC).timestamp() * 1000)


class ApiResponse(BaseModel, Generic[T]):
    code: int = 0
    message: str = "success"
    data: T | None = None
    timestamp: int = Field(default_factory=now_millis)
    trace_id: str | None = None

    @classmethod
    def success(cls, data: T, trace_id: str | None = None) -> "ApiResponse[T]":
        resolved_trace_id = trace_id or get_trace_id()
        set_trace_id(resolved_trace_id)
        return cls(data=data, trace_id=resolved_trace_id)

    @classmethod
    def error(cls, code: int, message: str, trace_id: str | None = None) -> "ApiResponse[None]":
        resolved_trace_id = trace_id or get_trace_id()
        set_trace_id(resolved_trace_id)
        return cls(code=code, message=message, data=None, trace_id=resolved_trace_id)
