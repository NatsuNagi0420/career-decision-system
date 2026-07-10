import logging

from app.trace_context import get_trace_id

logger = logging.getLogger("app.agents.llm_fallback")


def log_llm_fallback(workflow: str, error: Exception) -> None:
    """Log LLM fallback without including private prompt or resume content."""
    logger.warning(
        "LLM enhancement fallback used",
        extra={
            "workflow": workflow,
            "trace_id": get_trace_id(),
            "error_type": error.__class__.__name__,
        },
    )
