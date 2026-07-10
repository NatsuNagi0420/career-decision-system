from contextvars import ContextVar, Token

TraceContext = dict[str, str | None]

current_trace_context: ContextVar[TraceContext | None] = ContextVar("current_trace_context", default=None)


def get_trace_id() -> str | None:
    context = current_trace_context.get()
    if context is None:
        return None
    return context.get("trace_id")


def set_trace_id(trace_id: str | None) -> Token[TraceContext | None] | None:
    if not trace_id:
        return None
    context = current_trace_context.get()
    if context is not None:
        context["trace_id"] = trace_id
        return None
    return current_trace_context.set({"trace_id": trace_id})


def reset_trace_id(token: Token[TraceContext | None] | None) -> None:
    if token is not None:
        current_trace_context.reset(token)
