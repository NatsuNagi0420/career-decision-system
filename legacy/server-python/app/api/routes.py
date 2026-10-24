from __future__ import annotations

import asyncio
import json
import logging
from collections.abc import AsyncIterator
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.agent.approvals import ApprovalAlreadyResolved
from app.agent.events import EventLog
from app.agent.obligations import ObligationNotClaimable, ObligationNotFound
from app.agent.service import NotOwner, RunService, TaskResultExists
from app.capabilities.registry import visible_capabilities
from app.db.models import Event, User
from app.security import AuthRepository

router = APIRouter(prefix="/api/v1")


class Credentials(BaseModel):
    username: str = Field(min_length=2, max_length=64)
    password: str = Field(min_length=8, max_length=128)
    external_ai_consent: bool = False


class ConsentUpdate(BaseModel):
    granted: bool


class RunCreate(BaseModel):
    goal: str = Field(min_length=4, max_length=4000)
    capability_id: str | None = None
    project_id: str | None = Field(default=None, max_length=32)
    #: Set when this run exists to discharge a promise the agent made earlier.
    obligation_id: str | None = Field(default=None, max_length=32)


class ApprovalDecision(BaseModel):
    approved: bool
    feedback: str | None = Field(default=None, max_length=2000)


class TaskResultCreate(BaseModel):
    body: str = Field(min_length=2, max_length=4000)
    link: str | None = Field(default=None, max_length=500)
    #: The client generates this so a double click lands once.
    request_id: str = Field(min_length=8, max_length=80)


class WeeklyReviewConfirm(BaseModel):
    #: Monday of the week being closed. Validated as text at the boundary so a malformed
    #: date answers 422 here instead of surfacing as a 500 from the date parser.
    week_start: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    body: str = Field(min_length=2, max_length=4000)
    confidence_trend: Literal["up", "flat", "down"]
    confidence_reason: str = Field(default="", max_length=2000)
    next_focus: str = Field(default="", max_length=2000)
    #: The run whose draft this confirmation is reacting to.
    source_run_id: str | None = Field(default=None, max_length=32)
    request_id: str = Field(min_length=8, max_length=80)


def _auth(request: Request) -> AuthRepository:
    return request.app.state.auth


def _runs(request: Request) -> RunService:
    return request.app.state.runs


def _bearer(request: Request) -> str:
    header = request.headers.get("authorization", "")
    return header[7:].strip() if header.lower().startswith("bearer ") else ""


def current_user(request: Request) -> User:
    user = _auth(request).resolve(_bearer(request))
    if user is None:
        raise HTTPException(status_code=401, detail="请先登录。")
    return user


def _user_json(user: User) -> dict[str, Any]:
    return {"id": user.id, "username": user.username, "external_ai_consent": user.external_ai_consent_at is not None}


@router.post("/auth/register", status_code=201)
def register(payload: Credentials, request: Request) -> dict[str, Any]:
    repo = _auth(request)
    try:
        user = repo.register(payload.username, payload.password, external_ai_consent=payload.external_ai_consent)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    session = repo.login(payload.username, payload.password)
    if session is None:
        raise HTTPException(status_code=500, detail="注册成功了，但自动登录没成，请再登录一次。")
    return {"token": session.token, "user": _user_json(user)}


@router.post("/auth/login")
def login(payload: Credentials, request: Request) -> dict[str, Any]:
    session = _auth(request).login(payload.username, payload.password)
    if session is None:
        raise HTTPException(status_code=401, detail="用户名或密码不对。")
    return {"token": session.token, "user": _user_json(session.user)}


@router.post("/auth/logout", status_code=204)
def logout(request: Request, user: User = Depends(current_user)) -> None:
    _auth(request).revoke(_bearer(request))


@router.post("/auth/ai-consent")
def set_consent(payload: ConsentUpdate, request: Request, user: User = Depends(current_user)) -> dict[str, Any]:
    updated = _auth(request).set_ai_consent(user.id, payload.granted)
    return {"external_ai_consent": updated.external_ai_consent_at is not None}


@router.get("/auth/me")
def me(user: User = Depends(current_user)) -> dict[str, Any]:
    """Who this session belongs to, and whether they have consented. The shell must
    not infer consent from a cached blob: revoking it in one tab would leave another
    tab asserting the opposite."""
    return _user_json(user)


@router.get("/capabilities")
def list_capabilities(user: User = Depends(current_user)) -> list[dict[str, Any]]:
    """Student-facing only. `skeleton_probe` is plumbing and would otherwise sit in the
    picker looking like a thing to ask for."""
    return [
        {
            "id": spec.id,
            "name": spec.name,
            "domain": spec.domain,
            "status": spec.status,
            "risk_tier": spec.risk_tier,
            "description": spec.description,
        }
        for spec in visible_capabilities()
    ]


@router.get("/feed")
def get_feed(request: Request, user: User = Depends(current_user)) -> dict[str, Any]:
    """The object layer: projects, artifacts, promises and open decisions, read
    across runs rather than through one run's transcript."""
    return _runs(request).feed(user)


@router.get("/continuations")
def get_continuation(request: Request, user: User = Depends(current_user)) -> dict[str, Any]:
    """What 穗奈 picks up now without being asked, or the reason she stays quiet.

    The shell calls this on load. Whether anything is eligible is decided by the
    obligation's trigger plus a cooldown in code — never by the model that wrote the
    promise, and never with a push channel it does not have.
    """
    return _runs(request).continuation(user)


@router.post("/obligations/{obligation_id}/abandon")
def abandon_obligation(
    obligation_id: str,
    request: Request,
    user: User = Depends(current_user),
) -> dict[str, Any]:
    try:
        return _runs(request).abandon_obligation(user, obligation_id)
    except NotOwner as exc:
        raise HTTPException(status_code=404, detail="这条承诺不存在，或者不属于你。") from exc


@router.post("/tasks/{task_id}/results", status_code=201)
async def submit_task_result(
    task_id: str,
    payload: TaskResultCreate,
    request: Request,
    user: User = Depends(current_user),
) -> dict[str, Any]:
    """The person reports what actually happened.

    No Proposal here on purpose: this is their own account of their own week, and
    confirming it back to them would point the approval gate at the wrong party. The
    write that does need a human is the one it triggers — the agent proposing to archive
    these words as evidence.
    """
    service = _runs(request)
    try:
        outcome, run = service.submit_task_result(
            user,
            task_id,
            body=payload.body,
            link=payload.link,
            request_id=payload.request_id,
        )
    except NotOwner as exc:
        raise HTTPException(status_code=404, detail="这条行动任务不存在，或者不属于你。") from exc
    except TaskResultExists as exc:
        raise HTTPException(
            status_code=409,
            detail="这条任务的结果已经交过了。重复交不会算成第二份证据；要补充或更正，直接说给 agent 听。",
        ) from exc
    if run is not None:
        _spawn(request, service.start(run, allow_external_ai=user.allows_external_ai), run_id=run.id)
    return {**outcome, "run_id": run.id if run else None}


@router.post("/projects/{project_id}/weekly-review", status_code=201)
async def confirm_weekly_review(
    project_id: str,
    payload: WeeklyReviewConfirm,
    request: Request,
    user: User = Depends(current_user),
) -> dict[str, Any]:
    """The person closes the week. The agent may draft it, never file it.

    `weekly_review` is R3, and applying an approved R3 proposal is what the graph
    deliberately fails on — so the one write that turns a draft into this week's
    record sits here, behind the session, with nothing between it and a human click.
    """
    service = _runs(request)
    try:
        outcome = service.confirm_weekly_review(
            user,
            project_id,
            week_start=payload.week_start,
            body=payload.body,
            confidence_trend=payload.confidence_trend,
            confidence_reason=payload.confidence_reason,
            next_focus=payload.next_focus,
            request_id=payload.request_id,
            source_run_id=payload.source_run_id,
        )
    except NotOwner as exc:
        raise HTTPException(status_code=404, detail="项目不存在") from exc
    if outcome.get("week_conflict"):
        raise HTTPException(status_code=409, detail="这一周已经有一条复盘，先修订那条，不要再开一周")
    return outcome


@router.get("/projects/{project_id}/comparison")
def get_comparison(
    project_id: str,
    request: Request,
    user: User = Depends(current_user),
) -> list[dict[str, Any]]:
    """The comparison as it was actually stored, newest round first.

    Not the run's prose: per-cell verdict, the quotes that earned the score, the ones
    the model judged to speak against it, and the round that this one replaced. That is
    what lets a student see why the answer moved instead of being handed a number.
    """
    try:
        return _runs(request).comparison_board(user, project_id)
    except NotOwner as exc:
        raise HTTPException(status_code=404, detail="项目不存在") from exc


@router.post("/runs", status_code=202)
async def create_run(payload: RunCreate, request: Request, user: User = Depends(current_user)) -> dict[str, Any]:
    service = _runs(request)
    try:
        run = service.create_run(
            user,
            payload.goal,
            capability_id=payload.capability_id,
            project_id=payload.project_id,
            obligation_id=payload.obligation_id,
        )
    except NotOwner as exc:
        raise HTTPException(status_code=404, detail="这条承诺不存在，或者不属于你。") from exc
    except ObligationNotFound as exc:
        # A promise belonging to someone else reads identically to one that does not
        # exist, so 404 here keeps the endpoint from being an existence oracle.
        raise HTTPException(status_code=404, detail="这条承诺不存在，或者不属于你。") from exc
    except ObligationNotClaimable as exc:
        raise HTTPException(status_code=409, detail="这条承诺已经被领走或不再有效，刷新一下再看看。") from exc
    except RuntimeError as exc:
        # Already claimed by another tab or another click. The 202 path below would
        # otherwise look like a silently duplicated run.
        raise HTTPException(status_code=409, detail=f"这一轮现在不能启动：{exc}") from exc
    # Running in the background is what makes the replay contract load-bearing:
    # the client attaches to /events after this response, and must still see every
    # event emitted in the meantime.
    _spawn(request, service.start(run, allow_external_ai=user.allows_external_ai), run_id=run.id)
    return {"run_id": run.id, "thread_id": run.thread_id, "status": run.status}


@router.get("/runs/{run_id}")
def get_run(run_id: str, request: Request, user: User = Depends(current_user)) -> dict[str, Any]:
    try:
        return _runs(request).snapshot(run_id, user)
    except NotOwner as exc:
        raise HTTPException(status_code=404, detail="这一轮不存在，或者不属于你。") from exc


#: Each state `resolve()` can refuse from explains a different one, and the status is the
#: only thing that says why this click did nothing. The keys must be the vocabulary
#: `app/agent/approvals.py` actually writes — `scripts/validate.py` pins that, because a
#: guessed key reads as a working sentence while never being reachable.
APPROVAL_STATE_HINT = {
    "approved": "这张确认卡已经点过「采纳」了，同样的写入不会再来一次。",
    "rejected": "这张确认卡已经被你拒绝了，那次写入没有发生。",
    "timed_out": "这张确认卡已经过期，那次写入没有发生。",
    "error": "这次写入执行失败了，所以没有算成功。可以重新发起一轮。",
    "resuming": "这张确认卡正在执行中，请等它跑完。",
}


@router.post("/runs/{run_id}/approvals/{approval_id}/decision", status_code=202)
async def decide(
    run_id: str,
    approval_id: str,
    payload: ApprovalDecision,
    request: Request,
    user: User = Depends(current_user),
) -> dict[str, Any]:
    service = _runs(request)
    try:
        run = service.owned_run(run_id, user)
        service.mark_approval_decided(run_id, user, approval_id)
    except NotOwner as exc:
        raise HTTPException(status_code=404, detail="这张确认卡不存在，或者不属于你。") from exc
    except ApprovalAlreadyResolved as exc:
        raise HTTPException(
            status_code=409,
            detail=APPROVAL_STATE_HINT.get(exc.status, "这张确认卡现在不能再点了。"),
        ) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=409, detail=f"这次确认没有被受理：{exc}") from exc

    _spawn(
        request,
        service.resume(
            run,
            decision={"approved": payload.approved, "feedback": payload.feedback or ""},
            allow_external_ai=user.allows_external_ai,
        ),
        run_id=run.id,
    )
    return {"run_id": run_id, "approval_id": approval_id, "accepted": True}


@router.get("/runs/{run_id}/events")
async def stream_events(
    run_id: str,
    request: Request,
    user: User = Depends(current_user),
    after_seq: int = Query(default=-1, ge=-1),
) -> StreamingResponse:
    try:
        _runs(request).owned_run(run_id, user)
    except NotOwner as exc:
        raise HTTPException(status_code=404, detail="这一轮不存在，或者不属于你。") from exc

    log: EventLog = request.app.state.events

    async def frames() -> AsyncIterator[str]:
        """Durable events plus the run's in-flight answer text, in arrival order.

        The two cannot simply be concatenated: during the digest there are no durable
        frames at all for several seconds, so a merge that only flushed between events
        would deliver the whole answer at the end and look exactly like no streaming.
        """
        deltas, detach = log.subscribe_delta(run_id)
        merged: asyncio.Queue[tuple[str, Any]] = asyncio.Queue()

        async def pump_durable() -> None:
            async for event in log.stream(run_id, after_seq=after_seq):
                await merged.put(("event", event))
            await merged.put(("end", None))

        async def pump_deltas() -> None:
            while True:
                await merged.put(("delta", await deltas.get()))

        tasks = [asyncio.create_task(pump_durable()), asyncio.create_task(pump_deltas())]
        try:
            while True:
                kind, payload = await merged.get()
                if kind == "end":
                    return
                if kind == "delta":
                    yield _sse_delta(run_id, payload)
                else:
                    yield _sse(payload)
        finally:
            for task in tasks:
                task.cancel()
            detach()

    return StreamingResponse(
        frames(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


def _sse_delta(run_id: str, payload: dict[str, Any]) -> str:
    """A snapshot of the answer so far. No `id:` line: it is not part of the durable
    sequence, so a reconnect must never resume from it."""
    body = json.dumps(
        {"kind": "delta", "run_id": run_id, "answer": payload.get("answer", ""), "reasoning": payload.get("reasoning", "")},
        ensure_ascii=False,
        separators=(",", ":"),
    )
    return f"event: delta\ndata: {body}\n\n"


def _sse(event: Event) -> str:
    frame = EventLog.to_frame(event)
    body = json.dumps(frame.model_dump(mode="json"), ensure_ascii=False, separators=(",", ":"))
    return f"id: {event.seq}\nevent: {event.kind}\ndata: {body}\n\n"


logger = logging.getLogger("career.routes")


def _spawn(request: Request, coroutine: Any, *, run_id: str = "") -> None:
    """Run a graph in the background, and say so out loud when it dies.

    A strong reference goes on `app.state` because asyncio only keeps a bare task
    alive while something else holds it. The done callback used to *only* drop that
    reference, so a coroutine that raised left nothing behind: no log line, and a run
    still claiming to work until the 15-minute sweep noticed. Now the exception is
    logged and the run is closed on the spot with the stage `background:`, because
    "它死了" and "它还在跑" cannot look the same to the person waiting.
    """
    task = asyncio.create_task(coroutine)
    pending: set[asyncio.Task[Any]] = request.app.state.background_tasks
    pending.add(task)

    def _finished(finished: asyncio.Task[Any]) -> None:
        pending.discard(finished)
        if finished.cancelled():
            logger.warning("后台任务被取消 run_id=%s", run_id or "?")
            error: BaseException | None = asyncio.CancelledError("后台任务被取消")
        else:
            error = finished.exception()
        if error is None:
            return
        logger.error("后台任务中断 run_id=%s：%r", run_id or "?", error)
        if run_id:
            _runs(request).abandon_crashed(run_id, reason=repr(error))

    task.add_done_callback(_finished)
