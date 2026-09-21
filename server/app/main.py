from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import timedelta
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.agent.approvals import ApprovalRepository
from app.agent.checkpointer import open_checkpointer
from app.agent.events import EventLog
from app.agent.obligations import ObligationRepository
from app.agent.service import GraphRegistry, RunService, expire_stale_approvals, reconcile_stale_runs
from app.api.routes import router
from app.capabilities.registry import CAPABILITIES
from app.config import Settings, get_settings
from app.db.base import build_engine, make_session_factory
from app.llm.gateway import Gateway
from app.security import AuthRepository
from app.tools.base import ToolRegistry
from app.tools.domain import DOMAIN_TOOLS
from app.tools.readonly import READ_ONLY_TOOLS

FIELD_LABELS = {
    "username": "用户名",
    "password": "密码",
    "goal": "目标",
    "capability_id": "能力",
    "project_id": "决策项目",
    "obligation_id": "承诺",
    "body": "结果内容",
    "link": "链接",
    "request_id": "请求编号",
    "approved": "批准与否",
    "feedback": "补充说明",
    "week_start": "周起始日",
}
KIND_LABELS = {
    "missing": "不能不填",
    "string_too_short": "至少 {min_length} 个字符",
    "string_too_long": "最多 {max_length} 个字符",
    "int_parsing": "要写一个整数",
    "bool_parsing": "要写「是」或「否」",
    "json_invalid": "不是合法的 JSON",
    "too_short": "至少要有 {min_length} 项",
    "too_long": "最多 {max_length} 项",
}


def _humanize_validation(exc: RequestValidationError) -> str:
    """One readable sentence per bad field, joined by 「；」.

    A field the label table does not know keeps its own name rather than being dropped —
    the sentence still has to point at something the person can find on the form.
    """
    parts: list[str] = []
    for error in exc.errors():
        names = [str(seg) for seg in error["loc"] if isinstance(seg, str) and seg not in {"body", "payload"}]
        raw = names[-1] if names else ""
        label = FIELD_LABELS.get(raw, raw or "输入")
        ctx = error.get("ctx") or {}
        if error["type"] == "value_error":
            reason = str(ctx.get("error", "填得不对"))
        else:
            template = KIND_LABELS.get(error["type"], "格式不对")
            try:
                reason = template.format(**ctx)
            except (KeyError, IndexError):
                reason = template
        parts.append(f"{label}：{reason}")
    return "；".join(parts) or "输入没通过校验"


def create_app(settings: Settings | None = None, *, gateway: Gateway | None = None) -> FastAPI:
    active = settings or get_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[dict[str, Any]]:
        engine = build_engine(active.db_url)
        session_factory = make_session_factory(engine)
        events = EventLog(session_factory)
        approvals = ApprovalRepository(active)
        tools = ToolRegistry([*READ_ONLY_TOOLS, *DOMAIN_TOOLS])
        model_gateway = gateway or Gateway(settings=active)

        async with open_checkpointer(active) as checkpointer:
            graphs = GraphRegistry.build(
                capabilities=list(CAPABILITIES),
                tools=tools,
                session_factory=session_factory,
                gateway=model_gateway,
                events=events,
                approvals=approvals,
                settings=active,
                checkpointer=checkpointer,
            )
            app.state.engine = engine
            app.state.session_factory = session_factory
            app.state.events = events
            app.state.gateway = model_gateway
            app.state.tools = tools
            app.state.auth = AuthRepository(session_factory)
            app.state.runs = RunService(
                session_factory=session_factory,
                graphs=graphs,
                events=events,
                approvals=approvals,
                obligations=ObligationRepository(),
                autorun_cooldown=timedelta(minutes=active.autorun_cooldown_minutes),
            )
            app.state.background_tasks: set[asyncio.Task[Any]] = set()
            # A process that died mid-run leaves its rows claiming to work forever. The
            # window is zero here: nothing of *this* process is in flight yet, so every
            # "created" row is a leftover of the one that just went away.
            reconcile_stale_runs(
                session_factory,
                events,
                stale_after=timedelta(0),
                reason="上次进程退出时它还停在这一步",
            )
            expire_stale_approvals(session_factory, approvals, events)

            async def sweep_stalled_runs() -> None:
                while True:
                    await asyncio.sleep(60)
                    expire_stale_approvals(session_factory, approvals, events)
                    reconcile_stale_runs(session_factory, events)

            sweeper = asyncio.create_task(sweep_stalled_runs())
            app.state.background_tasks.add(sweeper)
            sweeper.add_done_callback(app.state.background_tasks.discard)
            yield {"graphs": graphs}
            for task in list(app.state.background_tasks):
                task.cancel()

    app = FastAPI(title="career-decision v2", version="0.1.0", lifespan=lifespan)
    app.state.settings = active

    @app.exception_handler(ValueError)
    async def _value_error(_request: Request, exc: ValueError) -> JSONResponse:
        return JSONResponse({"detail": str(exc)}, status_code=400)

    @app.exception_handler(RequestValidationError)
    async def _validation_error(_request: Request, exc: RequestValidationError) -> JSONResponse:
        return JSONResponse({"detail": _humanize_validation(exc)}, status_code=422)

    @app.get("/healthz")
    async def healthz() -> dict[str, Any]:
        issues = app.state.settings.readiness_issues()
        return {"ok": not issues, "env": app.state.settings.app_env, "issues": issues}

    app.include_router(router)
    return app


app = create_app()
