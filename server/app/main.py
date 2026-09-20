from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import timedelta
from typing import Any

from fastapi import FastAPI, Request
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

    @app.get("/healthz")
    async def healthz() -> dict[str, Any]:
        issues = app.state.settings.readiness_issues()
        return {"ok": not issues, "env": app.state.settings.app_env, "issues": issues}

    app.include_router(router)
    return app


app = create_app()
