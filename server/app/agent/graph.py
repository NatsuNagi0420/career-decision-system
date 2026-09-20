"""The agent loop.

The division of labour in this file is the design: code owns the boundaries
(which tools exist, how many rounds, whether a write may happen at all) and the
model owns the choice inside them. v1 had it backwards — a Chinese-keyword table
decided the tool sequence while the model only dressed up prose.

Node order follows Compass's cost gating: intake sanity -> domain gate (rules,
before any paid call) -> tool loop -> synthesis -> durable approval -> finalize.

Each helper opens and commits its own session, and no LLM await happens while a
connection is held, so a slow model cannot pin the pool.
"""

from __future__ import annotations

import functools
import json
import re
import time
from dataclasses import dataclass, field
from datetime import timedelta
from typing import Any

from langgraph.graph import END, START, StateGraph
from langgraph.types import interrupt
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker

from app.agent.approvals import ApprovalAlreadyResolved, ApprovalRepository
from app.agent.events import (
    ApprovalRequired,
    ApprovalResolved,
    ArtifactCreated,
    EventLog,
    ObligationCreated,
    ProposalCreated,
    RunCompleted,
    RunFailed,
    StepCompleted,
    StepStarted,
    ToolCallFinished,
    UsageRecorded,
    WriteWithheld,
)
from app.agent.executors import apply_executor, build_proposal
from app.agent.persona import synthesis_system_prompt
from app.agent.state import RunState
from app.capabilities.registry import CAPABILITIES, is_valid_obligation_target
from app.capabilities.spec import CapabilitySpec
from app.config import Settings, get_settings
from app.db.domain import DecisionProject
from app.db.models import Artifact, Obligation, Proposal, Run, Step, new_id, utcnow
from app.llm.gateway import Gateway, GatewayError, Message, Usage
from app.tools.base import ToolRegistry

NUMBER_RE = re.compile(r"\d+(?:[.,]\d+)?%?")
MAX_FACTS_CHARS = 12_000
#: Shorter than this and "what will come back" cannot be in it, so it is not a promise.
MIN_INTENT_CHARS = 8
#: Synthesis emits a long structured object while still thinking, so it needs a
#: larger budget than a planning turn. §14-S1 measured deepseek-flash spending
#: reasoning tokens out of max_tokens: too small here means empty content, which
#: the gateway (correctly) refuses instead of returning a blank answer.
SYNTHESIS_MAX_TOKENS = 4500
PLANNER_MIN_TOKENS = 2500


class EvidenceLine(BaseModel):
    claim: str
    quote: str = ""
    source: str = ""


class NextStep(BaseModel):
    """What the agent commits to do next. The wording is the model's; whether the
    promise is allowed to exist at all is code's — `capability_id` is checked against
    the registry in `_record_obligation`, and `wait_hours` is clamped here so a
    promise cannot be deferred into effectively never."""

    capability_id: str = ""
    intent: str = ""
    wait_hours: int = Field(default=0, ge=0, le=336)


class DigestDraft(BaseModel):
    """Presentation only. Coverage, provisional and generation mode are computed by
    code, so no prompt tweak can inflate them. `proposed` is the write the agent
    wants to make; it is validated against a registered payload schema before
    anything can be applied, so filling it wrongly is harmless but honest."""

    conclusion: str = Field(min_length=1)
    evidence_basis: list[EvidenceLine] = Field(default_factory=list)
    uncertainties: list[str] = Field(default_factory=list)
    next_actions: list[str] = Field(default_factory=list)
    proposed: dict[str, Any] = Field(default_factory=dict)
    next_step: NextStep = Field(default_factory=NextStep)


@dataclass
class AgentDeps:
    capability: CapabilitySpec
    tools: ToolRegistry
    session_factory: sessionmaker[Session]
    gateway: Gateway
    events: EventLog
    approvals: ApprovalRepository
    settings: Settings = field(default_factory=get_settings)
    max_rounds: int = 6


# ------------------------------ persistence ---------------------------------


def emit(deps: AgentDeps, run_id: str, frame: Any) -> None:
    session = deps.session_factory()
    try:
        run = session.get(Run, run_id)
        if run is None:
            return
        deps.events.append(session, run, frame)
        session.commit()
    finally:
        session.close()
    deps.events.announce(run_id)


def open_step(deps: AgentDeps, run_id: str, kind: str, name: str) -> str:
    session = deps.session_factory()
    try:
        run = session.get(Run, run_id)
        if run is None:
            raise LookupError(f"run not found: {run_id}")
        step_id = new_id()
        session.add(Step(id=step_id, run_id=run_id, seq=len(run.steps), kind=kind, name=name))
        session.commit()
    finally:
        session.close()
    emit(deps, run_id, _frame(deps, run_id, StepStarted, kind="step_started", step_id=step_id, step_kind=kind, name=name))
    return step_id


def close_step(deps: AgentDeps, run_id: str, step_id: str, *, summary: str = "", error: str | None = None) -> None:
    session = deps.session_factory()
    try:
        step = session.get(Step, step_id)
        if step is None:
            return
        step.status = "failed" if error else "done"
        step.error = error
        step.output_json = {"summary": summary[:2000]} if summary else None
        step.finished_at = utcnow()
        session.commit()
    finally:
        session.close()
    emit(deps, run_id, _frame(deps, run_id, StepCompleted, kind="step_completed", step_id=step_id, summary=(error or summary)[:500]))


def record_usage(deps: AgentDeps, run_id: str, usage: Usage, model: str, thinking: str, step_id: str = "") -> None:
    session = deps.session_factory()
    try:
        run = session.get(Run, run_id)
        if run is None:
            return
        run.model_used = model
        run.thinking_mode = thinking
        run.prompt_tokens += usage.prompt
        run.completion_tokens += usage.completion
        run.reasoning_tokens += usage.reasoning
        run.cached_tokens += usage.cached
        run.steps_used += 1
        session.commit()
    finally:
        session.close()
    emit(
        deps,
        run_id,
        _frame(deps, run_id, UsageRecorded, kind="usage_recorded", model=model, thinking=thinking, step_id=step_id,
               prompt=usage.prompt, completion=usage.completion, reasoning=usage.reasoning, cached=usage.cached),
    )


def _frame(deps: AgentDeps, run_id: str, cls: type[BaseModel], **fields: Any) -> BaseModel:
    """Envelope values are placeholders here; EventLog overwrites them with the
    authoritative seq/event_id from the row it inserts."""
    session = deps.session_factory()
    try:
        run = session.get(Run, run_id)
        thread_id = run.thread_id if run else ""
    finally:
        session.close()
    return cls(
        run_id=run_id, thread_id=thread_id, seq=0, event_id="", occurred_at=utcnow(),
        **fields,
    )


def fail(deps: AgentDeps, state: RunState, reason: str) -> RunState:
    session = deps.session_factory()
    try:
        run = session.get(Run, state["run_id"])
        if run is not None:
            run.status = "failed"
            run.error = reason[:2000]
            run.finished_at = utcnow()
            session.commit()
    finally:
        session.close()
    emit(deps, state["run_id"], _frame(deps, state["run_id"], RunFailed, kind="run_failed", error=reason))
    return {"status": "failed", "errors": [reason]}


# --------------------------------- nodes ------------------------------------


async def intake(deps: AgentDeps, state: RunState) -> RunState:
    goal = (state.get("goal") or "").strip()
    if len(goal) < 4:
        return {"out_of_scope": True, "scope_reason": "目标太短，无法判断要推进什么"}
    if len(goal) > 4000:
        return {"out_of_scope": True, "scope_reason": "目标超出长度上限"}
    return {
        "out_of_scope": False,
        "scope_reason": "",
        "messages": [{"role": "user", "content": goal}],
        "tool_trace": [],
        "tool_facts": {},
        "pending_tool_calls": [],
        "rounds_used": 0,
    }


def domain_gate(deps: AgentDeps, state: RunState) -> RunState:
    """Rules only, and only ever to *reject*. Picking tools stays the model's job."""
    if deps.capability.status != "implemented":
        return {"out_of_scope": True, "scope_reason": f"能力 {deps.capability.id} 尚未实现"}
    project_id = state.get("project_id")
    if project_id:
        session = deps.session_factory()
        try:
            project = session.get(DecisionProject, str(project_id))
        finally:
            session.close()
        if project is None or project.user_id != state.get("user_id"):
            return {"out_of_scope": True, "scope_reason": "指定的决策项目不存在或不属于你"}
    return {}


async def select_action(deps: AgentDeps, state: RunState) -> RunState:
    rounds = int(state.get("rounds_used") or 0)
    step_id = open_step(deps, state["run_id"], "plan", "select_action")
    budget = max(PLANNER_MIN_TOKENS, deps.capability.max_tokens)
    try:
        completion = await deps.gateway.complete(
            messages=_wire_messages(state),
            system=synthesis_system_prompt(deps.capability.name),
            allow_external_ai=bool(state.get("allow_external_ai")),
            tools=deps.tools.subset(set(deps.capability.tools)).schemas(),
            # Routing is not judgement: the planner always runs with thinking off,
            # because extended thinking spends the token budget and, measured in
            # §14-S1, can leave nothing for tool_calls at all.
            thinking="off",
            max_tokens=budget,
        )
    except GatewayError as exc:
        close_step(deps, state["run_id"], step_id, error=str(exc))
        return fail(deps, state, f"select_action: {exc}")

    record_usage(deps, state["run_id"], completion.usage, completion.model, deps.capability.thinking, step_id=step_id)
    messages = list(state.get("messages") or [])
    if completion.wants_tools and rounds < deps.max_rounds:
        messages.append(
            {
                "role": "assistant",
                "content": completion.text,
                "tool_calls": [call.to_wire_item() for call in completion.tool_calls],
            }
        )
        close_step(deps, state["run_id"], step_id, summary=f"{len(completion.tool_calls)} tool call(s)")
        return {
            "messages": messages,
            "rounds_used": rounds + 1,
            "pending_tool_calls": [
                {"id": call.id, "name": call.name, "arguments": call.arguments, "parse_error": call.parse_error}
                for call in completion.tool_calls
            ],
        }
    close_step(deps, state["run_id"], step_id, summary="no further tool calls")
    return {"messages": messages, "rounds_used": rounds + 1, "pending_tool_calls": []}


async def run_tools(deps: AgentDeps, state: RunState) -> RunState:
    session = deps.session_factory()
    try:
        run = session.get(Run, state["run_id"])
        if run is None:
            raise LookupError(state["run_id"])
        user_id = run.user_id
        run_id = run.id

        step_id = open_step(deps, run_id, "tool", "tool_batch")
        messages = list(state.get("messages") or [])
        facts = dict(state.get("tool_facts") or {})
        trace = list(state.get("tool_trace") or [])

        for call in state.get("pending_tool_calls") or []:
            name = str(call.get("name"))
            arguments = dict(call.get("arguments") or {})
            tool = deps.tools.get(name)
            allowed = name in deps.capability.tools

            if call.get("parse_error"):
                reason = f"arguments were not valid JSON: {call['parse_error']}"
                result_content = json.dumps({"ok": False, "error": reason}, ensure_ascii=False)
                truncated, refs = False, []
                trace.append({"name": name, "ok": False, "error": "arguments_unparseable"})
            elif not allowed:
                reason = f"tool {name} is not allowlisted for {deps.capability.id}"
                result_content = json.dumps({"ok": False, "error": reason}, ensure_ascii=False)
                truncated, refs = False, []
                trace.append({"name": name, "ok": False, "error": "not_allowlisted"})
            else:
                result = deps.tools.execute(session, user_id=user_id, name=name, arguments=arguments)
                session.commit()
                result_content = result.content(tool.max_output_chars)
                truncated, refs = result.truncated, result.source_refs
                facts[name] = result.payload
                trace.append({"name": name, "ok": result.ok, "truncated": truncated, "source_refs": refs})
                emit(
                    deps, run_id,
                    _frame(deps, run_id, ToolCallFinished, kind="tool_call", step_id=step_id, name=name,
                           arguments=arguments, truncated=truncated, source_refs=refs),
                )
            messages.append({"role": "tool", "tool_call_id": call.get("id"), "content": result_content})

        close_step(deps, run_id, step_id, summary=f"{len(state.get('pending_tool_calls') or [])} call(s) executed")
        return {"messages": messages, "tool_facts": facts, "tool_trace": trace, "pending_tool_calls": []}
    finally:
        session.close()


#: How often a partial answer is handed to the transient channel. The browser only
#: ever renders the newest snapshot, so this is about not flooding the event loop.
DELTA_INTERVAL_SECONDS = 0.08


class _AnswerStream:
    """Turns the digest's raw JSON deltas into the sentence a person can read.

    The model is asked for `conclusion` first, so that string can be surfaced while
    the rest of the object is still arriving; everything after it stays invisible
    until the object validates. Reasoning is passed through as it comes — it is
    plain text, and the shell shows it as "thinking", never as a finding.
    """

    def __init__(self, events: EventLog, run_id: str) -> None:
        self._events = events
        self._run_id = run_id
        self._raw = ""
        self._reasoning: list[str] = []
        self._last = 0.0

    def push(self, content: str, reasoning: str) -> None:
        self._raw += content
        if reasoning:
            self._reasoning.append(reasoning)
        now = time.monotonic()
        if now - self._last < DELTA_INTERVAL_SECONDS:
            return
        self._last = now
        self._events.publish_delta(
            self._run_id,
            {"answer": streamed_conclusion(self._raw), "reasoning": "".join(self._reasoning)},
        )


_STRING_ESCAPES = {'"': '"', "\\": "\\", "/": "/", "b": "\b", "f": "\f", "n": "\n", "r": "\r", "t": "\t"}


def streamed_conclusion(buffer: str) -> str:
    """The value of `"conclusion"` as far as it has been written, decoded.

    Deliberately conservative: an incomplete escape or a truncated \\uXXXX yields
    nothing further rather than a guess, because the tail of this text is what the
    person is reading right now.
    """
    key = buffer.find('"conclusion"')
    if key < 0:
        return ""
    colon = buffer.find(":", key + len('"conclusion"'))
    if colon < 0:
        return ""
    start = buffer.find('"', colon + 1)
    if start < 0:
        return ""

    out: list[str] = []
    index = start + 1
    while index < len(buffer):
        char = buffer[index]
        if char == '"':
            break
        if char != "\\":
            out.append(char)
            index += 1
            continue
        nxt = buffer[index + 1] if index + 1 < len(buffer) else ""
        if not nxt:
            break
        if nxt == "u":
            digits = buffer[index + 2 : index + 6]
            if len(digits) < 4:
                break
            try:
                out.append(chr(int(digits, 16)))
            except ValueError:
                break
            index += 6
            continue
        if nxt not in _STRING_ESCAPES:
            break
        out.append(_STRING_ESCAPES[nxt])
        index += 2
    return "".join(out)


async def synthesize(deps: AgentDeps, state: RunState) -> RunState:
    facts = state.get("tool_facts") or {}
    step_id = open_step(deps, state["run_id"], "synthesize", "draft_digest")
    user_prompt = (
        f"用户目标：{state.get('goal')}\n"
        f"当前决策项目 id：{state.get('project_id') or '（尚无项目）'}\n\n"
        f"工具实际返回的事实（这是唯一可用依据）：\n{json.dumps(facts, ensure_ascii=False, default=str)[:MAX_FACTS_CHARS]}\n\n"
        "只基于上述事实整理。没有依据的部分写进 uncertainties，不要补数字或经历。\n"
        "如果你想推进一次写入，把它放进 proposed 字段（例如 name/statement/title/body），"
        "由程序校验并交给人确认；不确定就不填，不要编造字段。\n"
        "evidence_basis 里的 quote 必须是工具返回内容中面向人的那句原话"
        "（岗位描述、要求条目、记录正文），不是整个响应体；"
        "如果某条事实只存在于结构化字段里，就把该字段的可读值抄成 quote，"
        "不要贴 JSON 字符串。\n"
        f"next_step 是你对下一步的承诺：capability_id 只能从这些里选 "
        f"{sorted(_obligation_targets(deps))}，intent 一句话说清「去做什么、拿什么回来」，"
        "确实没有可承诺的下一步就留空（不要为了填而编）。\n"
    )
    try:
        answer = _AnswerStream(deps.events, state["run_id"])

        async def on_delta(*, content: str, reasoning: str) -> None:
            answer.push(content, reasoning)

        draft, completion = await deps.gateway.structured_stream(
            DigestDraft,
            system=synthesis_system_prompt(deps.capability.name),
            user=user_prompt,
            allow_external_ai=bool(state.get("allow_external_ai")),
            on_delta=on_delta,
            thinking=deps.capability.thinking,
            max_tokens=max(SYNTHESIS_MAX_TOKENS, deps.capability.max_tokens),
        )
    except GatewayError as exc:
        close_step(deps, state["run_id"], step_id, error=str(exc))
        return fail(deps, state, f"synthesize: {exc}")

    record_usage(deps, state["run_id"], completion.usage, completion.model, deps.capability.thinking, step_id=step_id)
    close_step(deps, state["run_id"], step_id, summary=draft.conclusion[:160])
    return {"synthesis": draft.model_dump(mode="json")}


def persist_draft(deps: AgentDeps, state: RunState) -> RunState:
    synthesis = state.get("synthesis") or {}
    facts = state.get("tool_facts") or {}
    coverage = _coverage(facts)
    quotes = {line["claim"]: line["quote"] for line in synthesis.get("evidence_basis") or [] if (line.get("quote") or "").strip()}
    fabricated = _fabricated_numbers(synthesis, facts)
    provisional = bool(
        fabricated
        or (deps.capability.evidence_required and not quotes)
        or coverage < deps.capability.min_data_coverage
    )
    content = {
        **synthesis,
        "fact_check": {"numbers_not_in_tool_facts": fabricated},
        "computed": {"data_coverage": coverage, "is_provisional": provisional},
    }
    source_refs = [{"table": "agent_runs", "id": state["run_id"]}] + [
        {"table": "tool", "id": name} for name in sorted(facts)
    ]

    session = deps.session_factory()
    try:
        run = session.get(Run, state["run_id"])
        artifact = Artifact(
            run_id=run.id,
            user_id=run.user_id,
            artifact_type=deps.capability.artifact_type or "RunDigest",
            status="pending_approval",
            title=f"{deps.capability.name}：{run.goal[:40]}",
            content=content,
            source_refs=source_refs,
            evidence_quotes=quotes,
            data_coverage=coverage,
            is_provisional=provisional,
            generation_mode="llm" if synthesis else "fallback",
        )
        session.add(artifact)
        session.flush()
        emit(
            deps, run.id,
            _frame(deps, run.id, ArtifactCreated, kind="artifact_created", artifact_id=artifact.id,
                   artifact_type=artifact.artifact_type, title=artifact.title, version=artifact.version,
                   data_coverage=coverage, is_provisional=provisional, generation_mode=artifact.generation_mode),
        )

        # A provisional artifact must not come with an actionable write. Otherwise
        # the human is the only guard against acting on nothing, and the run below
        # showed exactly that: no tool called, coverage 0, and a garbage candidate
        # still offered for approval.
        suppress_write = provisional and deps.capability.evidence_required
        proposal = None if suppress_write else build_proposal(deps.capability, run, artifact, synthesis)
        if suppress_write:
            emit(
                deps, run.id,
                _frame(deps, run.id, WriteWithheld, kind="write_withheld", artifact_id=artifact.id,
                       capability_id=deps.capability.id, wanted_proposal=(deps.capability.proposal_types or [""])[0],
                       reason=f"覆盖度 {coverage}%，缺少逐字引文" if not quotes else "结论含工具未给出过的数字"),
            )
        proposal_id = ""
        approval_id = ""
        if proposal is not None:
            session.add(proposal)
            session.flush()
            proposal_id = proposal.id
            emit(
                deps, run.id,
                _frame(deps, run.id, ProposalCreated, kind="proposal_created", proposal_id=proposal.id,
                       proposal_type=proposal.proposal_type, title=proposal.title, rationale=proposal.rationale,
                       risk_tier=deps.capability.risk_tier, acceptance_criteria=proposal.acceptance_criteria,
                       source_refs=source_refs),
            )
            if proposal.status == "pending":
                approval = deps.approvals.open(session, run, proposal)
                approval_id = approval.id
                run.status = "awaiting_approval"
                session.commit()
                emit(
                    deps, run.id,
                    _frame(deps, run.id, ApprovalRequired, kind="approval_required", approval_id=approval.id,
                           proposal_id=proposal.id, expires_at=approval.expires_at),
                )
            else:
                # The payload failed its schema, so there is nothing to approve.
                # Say so on the timeline; a proposal that silently never resolves
                # looks like a stuck system.
                session.commit()
                emit(
                    deps, run.id,
                    _frame(deps, run.id, WriteWithheld, kind="write_withheld", artifact_id=artifact.id,
                           capability_id=deps.capability.id, wanted_proposal=proposal.proposal_type,
                           reason=(proposal.error or "写入内容不符合 schema")[:300]),
                )
        else:
            artifact.status = "draft"
            session.commit()
        return {"artifact_id": artifact.id, "proposal_id": proposal_id, "approval_id": approval_id}
    finally:
        session.close()


def approval_gate(deps: AgentDeps, state: RunState) -> RunState:
    if not state.get("approval_id"):
        return {"decision": None}
    raw = interrupt(
        {
            "kind": "approval_request",
            "approval_id": state.get("approval_id"),
            "proposal_id": state.get("proposal_id"),
            "risk_tier": deps.capability.risk_tier,
        }
    )
    payload = raw if isinstance(raw, dict) else {"approved": bool(raw)}
    return {"decision": {"approved": bool(payload.get("approved")), "feedback": str(payload.get("feedback") or "")}}


def finalize(deps: AgentDeps, state: RunState) -> RunState:
    run_id = state["run_id"]
    proposal_id = state.get("proposal_id") or ""
    approval_id = state.get("approval_id") or ""
    decision = state.get("decision") or {}
    had_failure = state.get("status") == "failed" or state.get("out_of_scope")

    applied: dict[str, Any] | None = None
    # The single-writer claim already happened at the decision boundary
    # (RunService.mark_approval_decided), which is where a second "采纳" click or
    # an expiry sweep gets rejected. The terminal label records what this graph
    # actually did, not what the human asked for: an approval whose executor
    # failed must not read as success.
    if had_failure:
        outcome, run_status = "error", "failed"
    elif not approval_id:
        outcome, run_status = "approved", "completed"
    elif not decision.get("approved"):
        outcome, run_status = "rejected", "cancelled"
        _record_rejection(deps, proposal_id, state)
    elif deps.capability.risk_tier == "R3":
        outcome, run_status = "error", "failed"
    else:
        outcome, run_status = _apply_proposal(deps, run_id, proposal_id, state.get("artifact_id"))

    if approval_id:
        _resolve_approval(deps, approval_id, outcome, state)

    session = deps.session_factory()
    try:
        run = session.get(Run, run_id)
        run.status = run_status
        run.finished_at = utcnow()
        # Never overwrite a cause that an earlier node already recorded.
        if outcome == "error" and not run.error:
            run.error = "finalize: proposal could not be applied"
        session.commit()
    finally:
        session.close()

    # The commitment is written before the closing frame so the timeline reads
    # "promised the next step, then ended", which is the order that actually
    # happened. A run that did not finish cleanly gets no new debt: a human saying
    # no, or a failure, is not a licence to keep planning behind their back.
    obligation_id = ""
    if run_status == "completed":
        _discharge_source_obligation(deps, run_id)
        obligation_id = _record_obligation(deps, state)

    emit(deps, run_id, _frame(deps, run_id, RunCompleted, kind="run_completed", status=run_status,
                              summary=json.dumps(applied or {}, ensure_ascii=False, default=str)[:200]))
    return {"applied": applied, "status": run_status, "obligation_id": obligation_id}


def _obligation_targets(deps: AgentDeps) -> set[str]:
    """Which capabilities a promise may point at. The declared chain comes first
    because that ordering was designed; a model is never offered a step the registry
    has not marked runnable and student-visible."""
    declared = {cid for cid in deps.capability.next_capabilities if is_valid_obligation_target(cid)}
    if declared:
        return declared
    return {spec.id for spec in CAPABILITIES if is_valid_obligation_target(spec.id)}


def _record_obligation(deps: AgentDeps, state: RunState) -> str:
    synthesis = state.get("synthesis") or {}
    nxt = synthesis.get("next_step") or {}
    capability_id = str(nxt.get("capability_id") or "").strip()
    intent = str(nxt.get("intent") or "").strip()
    if not capability_id or not intent:
        return ""
    if len(intent) < MIN_INTENT_CHARS:
        # A promise too short to say what it will bring back is not a commitment, and
        # it would later become a run whose goal text is unreadable. Drop it here
        # rather than letting `POST /runs` reject it with a 422 the user cannot act on.
        return ""
    if capability_id not in _obligation_targets(deps):
        # Dropped, not fatal. A wrong promise costs one row less; failing the run
        # would throw away an answer that was already good.
        return ""
    try:
        wait_hours = max(0, min(336, int(nxt.get("wait_hours") or 0)))
    except (TypeError, ValueError):
        wait_hours = 0

    trigger = "on_return" if wait_hours == 0 else "scheduled"
    not_before = utcnow() + timedelta(hours=wait_hours) if wait_hours else None
    project_id = state.get("project_id")
    intent = intent[:2000]

    session = deps.session_factory()
    try:
        run = session.get(Run, state["run_id"])
        if run is None:
            return ""
        obligation = Obligation(
            user_id=run.user_id,
            run_id=run.id,
            project_id=project_id,
            capability_id=capability_id,
            intent=intent,
            trigger_kind=trigger,
            not_before=not_before,
        )
        session.add(obligation)
        session.flush()
        obligation_id = obligation.id
        due_at = obligation.not_before
        session.commit()
    finally:
        session.close()

    emit(
        deps, state["run_id"],
        _frame(deps, state["run_id"], ObligationCreated, kind="obligation_created",
               obligation_id=obligation_id, capability_id=capability_id, intent=intent,
               project_id=project_id, trigger_kind=trigger, not_before=due_at),
    )
    return obligation_id


def _discharge_source_obligation(deps: AgentDeps, run_id: str) -> None:
    """A promise was "go into X and come back", not "guarantee a result about X", so
    a completed run that went and looked is the honest discharge point. If it came
    back thin, it will have made a new and narrower promise instead."""
    session = deps.session_factory()
    try:
        obligation = session.scalar(select(Obligation).where(Obligation.claimed_run_id == run_id))
        if obligation is None:
            return
        obligation.status = "fulfilled"
        obligation.resolved_at = utcnow()
        session.commit()
    finally:
        session.close()


def _record_rejection(deps: AgentDeps, proposal_id: str, state: RunState) -> None:
    """A human saying no is an outcome, not an absence of one: the proposal and its
    draft both have to stop looking actionable."""
    session = deps.session_factory()
    try:
        proposal = session.get(Proposal, proposal_id)
        if proposal is None:
            return
        proposal.status = "rejected"
        proposal.decided_at = utcnow()
        proposal.result_json = {"feedback": (state.get("decision") or {}).get("feedback") or ""}
        artifact = session.get(Artifact, state.get("artifact_id")) if state.get("artifact_id") else None
        if artifact is not None and artifact.status == "pending_approval":
            artifact.status = "rejected"
        session.commit()
    finally:
        session.close()


def _apply_proposal(deps: AgentDeps, run_id: str, proposal_id: str, artifact_id: str | None) -> tuple[str, str]:
    session = deps.session_factory()
    try:
        run = session.get(Run, run_id)
        proposal = session.get(Proposal, proposal_id)
        artifact = session.get(Artifact, artifact_id) if artifact_id else None
        try:
            result = apply_executor(session, run, proposal)
        except Exception as exc:
            proposal.status = "failed"
            proposal.error = str(exc)[:2000]
            proposal.decided_at = utcnow()
            session.commit()
            return "error", "failed"
        proposal.status = "applied"
        proposal.result_json = result
        proposal.decided_at = utcnow()
        proposal.applied_at = utcnow()
        if artifact is not None:
            artifact.status = "committed"
            artifact.approved_at = utcnow()
            artifact.committed_at = utcnow()
        session.commit()
        return "approved", "completed"
    finally:
        session.close()


def _resolve_approval(deps: AgentDeps, approval_id: str, outcome: str, state: RunState) -> None:
    session = deps.session_factory()
    try:
        try:
            deps.approvals.resolve(session, approval_id, status=outcome, decided_by=state.get("user_id"),
                                   feedback=(state.get("decision") or {}).get("feedback"))
        except ApprovalAlreadyResolved:
            pass
        finally:
            session.commit()
    finally:
        session.close()
    emit(deps, state["run_id"], _frame(deps, state["run_id"], ApprovalResolved, kind="approval_resolved",
                                       approval_id=approval_id, status=outcome, decided_by=state.get("user_id")))


# --------------------------------- routing ----------------------------------


def route_after_gate(state: RunState) -> str:
    return "finalize" if state.get("out_of_scope") else "proceed"


def route_after_select(state: RunState) -> str:
    return "run_tools" if state.get("pending_tool_calls") else "synthesize"


def route_after_synthesize(state: RunState) -> str:
    """A failed synthesis must not continue into draft creation. v1's failure mode
    was exactly this: fall back quietly and carry on as if the model had answered."""
    return "finalize" if state.get("status") == "failed" else "persist"


def build_agent_graph(deps: AgentDeps) -> StateGraph:
    graph = StateGraph(RunState)
    graph.add_node("intake", functools.partial(intake, deps))
    graph.add_node("domain_gate", functools.partial(domain_gate, deps))
    graph.add_node("select_action", functools.partial(select_action, deps))
    graph.add_node("run_tools", functools.partial(run_tools, deps))
    graph.add_node("synthesize", functools.partial(synthesize, deps))
    graph.add_node("persist_draft", functools.partial(persist_draft, deps))
    graph.add_node("approval_gate", functools.partial(approval_gate, deps))
    graph.add_node("finalize", functools.partial(finalize, deps))

    graph.add_edge(START, "intake")
    graph.add_conditional_edges("intake", route_after_gate, {"proceed": "domain_gate", "finalize": "finalize"})
    graph.add_conditional_edges("domain_gate", route_after_gate, {"proceed": "select_action", "finalize": "finalize"})
    graph.add_conditional_edges("select_action", route_after_select, {"run_tools": "run_tools", "synthesize": "synthesize"})
    graph.add_edge("run_tools", "select_action")
    graph.add_conditional_edges("synthesize", route_after_synthesize, {"persist": "persist_draft", "finalize": "finalize"})
    graph.add_edge("persist_draft", "approval_gate")
    graph.add_edge("approval_gate", "finalize")
    graph.add_edge("finalize", END)
    return graph


# --------------------------------- helpers ----------------------------------


def _wire_messages(state: RunState) -> list[Message]:
    out: list[Message] = []
    for item in state.get("messages") or []:
        role = item.get("role")
        if role == "assistant":
            calls = tuple(
                {"id": c.get("id", ""), "name": c["function"]["name"], "raw": c["function"]["arguments"]}
                for c in item.get("tool_calls") or []
            )
            out.append(_assistant(item.get("content"), calls))
        elif role == "tool":
            out.append(Message(role="tool", content=item.get("content"), tool_call_id=item.get("tool_call_id")))
        else:
            out.append(Message(role=str(role), content=item.get("content")))
    return out


def _assistant(content: str | None, calls: tuple[dict[str, str], ...]):
    from app.llm.gateway import ToolCall

    return Message(
        role="assistant",
        content=content,
        tool_calls=tuple(
            ToolCall(id=c["id"], name=c["name"], arguments=_safe_args(c["raw"]), raw=c["raw"]) for c in calls
        ),
    )


def _safe_args(raw: str) -> dict[str, Any]:
    try:
        parsed = json.loads(raw or "{}")
    except ValueError:
        return {}
    return parsed if isinstance(parsed, dict) else {}


def _coverage(facts: dict[str, Any]) -> int:
    """Deterministic and explainable: how much of what the tools were asked for
    actually came back. Never delegated to the model."""
    if not facts:
        return 0
    filled = sum(1 for value in facts.values() if value)
    return min(100, round(100 * filled / len(facts)))


def _fabricated_numbers(synthesis: dict[str, Any], facts: dict[str, Any]) -> list[str]:
    """MyOfferAgent's guard transplanted: a number in the prose that never appeared
    in tool output forces the artifact provisional. The model is not trusted to
    self-report this."""
    allowed = set(NUMBER_RE.findall(json.dumps(facts, ensure_ascii=False, default=str)))
    text = " ".join(
        [str(synthesis.get("conclusion") or "")]
        + [str(line.get("claim") or "") for line in synthesis.get("evidence_basis") or []]
        + [str(action) for action in synthesis.get("next_actions") or []]
    )
    return sorted({token for token in NUMBER_RE.findall(text) if token not in allowed})
