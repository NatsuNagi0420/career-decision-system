from __future__ import annotations

import json
from typing import Any

import httpx
import pytest
from pydantic import BaseModel

from app.config import Settings
from app.llm.gateway import (
    Completion,
    ExternalAiNotAllowed,
    Gateway,
    Message,
    ScriptedProvider,
    StructuredOutputError,
    ToolCall,
    TruncatedEmptyResponse,
    Usage,
    parse_completion,
)


def settings_for(provider: str = "deepseek", api_key: str | None = "k" * 24) -> Settings:
    return Settings(
        app_env="local",
        llm_provider=provider,
        llm_model="deepseek-flash",
        llm_api_key=api_key,
        llm_base_url="https://api.deepseek.com",
        llm_default_max_tokens=2000,
        _env_file=None,
    )


def payload(
    text: str | None = "ok",
    tool_calls: list[dict[str, Any]] | None = None,
    finish: str = "stop",
    usage: dict[str, Any] | None = None,
) -> dict[str, Any]:
    message: dict[str, Any] = {"content": text}
    if tool_calls:
        message["tool_calls"] = tool_calls
    default_usage = {"prompt_tokens": 1, "completion_tokens": 1}
    return {
        "choices": [{"message": message, "finish_reason": finish}],
        "model": "deepseek-flash",
        "usage": usage or default_usage,
    }


def tool_call(name: str, arguments: Any, call_id: str = "c1") -> dict[str, Any]:
    raw = arguments if isinstance(arguments, str) else json.dumps(arguments, ensure_ascii=False)
    return {"id": call_id, "type": "function", "function": {"name": name, "arguments": raw}}


class Answer(BaseModel):
    conclusion: str
    next_actions: list[str] = []


async def test_mock_provider_needs_no_consent() -> None:
    gateway = Gateway(settings=settings_for("mock"), provider=None)
    completion = await gateway.complete(messages=[Message(role="user", content="hi")], allow_external_ai=False)
    assert isinstance(completion, Completion) and completion.text


async def test_gateway_refuses_external_call_without_consent() -> None:
    gateway = Gateway(settings=settings_for("deepseek"))
    with pytest.raises(ExternalAiNotAllowed):
        await gateway.complete(messages=[Message(role="user", content="hi")], allow_external_ai=False)


async def test_gateway_allows_external_call_once_consent_exists() -> None:
    script = ScriptedProvider([payload(text="fine")])
    gateway = Gateway(settings=settings_for("deepseek"), provider=script)
    completion = await gateway.complete(messages=[Message(role="user", content="hi")], allow_external_ai=True)
    assert completion.text == "fine"


async def test_truncated_reasoning_response_is_an_error_not_silence() -> None:
    """§14-S1: deepseek-flash can spend the whole budget on reasoning and return "".

    It gets one retry with room to spare, and if that also comes back empty the run
    still fails loudly — an empty answer must never look like a finished one.
    """
    exhausted = {
        "prompt_tokens": 10,
        "completion_tokens": 299,
        "completion_tokens_details": {"reasoning_tokens": 299},
    }
    script = ScriptedProvider(
        [
            payload(text="", finish="length", usage=exhausted),
            payload(text="", finish="length", usage=exhausted),
        ]
    )
    gateway = Gateway(settings=settings_for(), provider=script)
    with pytest.raises(TruncatedEmptyResponse):
        await gateway.complete(messages=[Message(role="user", content="hi")], allow_external_ai=True)
    budgets = [p["max_tokens"] for p in script.seen_payloads]
    assert len(budgets) == 2 and budgets[1] > budgets[0]


@pytest.mark.asyncio
async def test_an_escalated_call_reports_what_both_attempts_cost() -> None:
    """The second answer is not the whole bill.

    Measured against the live endpoint, a truncated stream carries usage like any
    other frame — so the rung that burned its budget was paid for, and returning
    only the winning response made a run look cheaper than it was.
    """
    burned = {"prompt_tokens": 10, "completion_tokens": 299, "completion_tokens_details": {"reasoning_tokens": 299}}
    paid = {"prompt_tokens": 12, "completion_tokens": 40, "completion_tokens_details": {"reasoning_tokens": 30}}
    script = ScriptedProvider(
        [
            payload(text="", finish="length", usage=burned),
            payload(text="ok", usage=paid),
        ]
    )
    gateway = Gateway(settings=settings_for(), provider=script)
    completion = await gateway.complete(messages=[Message(role="user", content="hi")], allow_external_ai=True)
    assert (completion.usage.prompt, completion.usage.completion, completion.usage.reasoning) == (22, 339, 329)


@pytest.mark.asyncio
async def test_a_failure_that_used_up_the_ladder_still_carries_its_cost() -> None:
    burned = {"prompt_tokens": 10, "completion_tokens": 299, "completion_tokens_details": {"reasoning_tokens": 299}}
    script = ScriptedProvider(
        [
            payload(text="", finish="length", usage=burned),
            payload(text="", finish="length", usage=burned),
        ]
    )
    gateway = Gateway(settings=settings_for(), provider=script)
    with pytest.raises(TruncatedEmptyResponse) as caught:
        await gateway.complete(messages=[Message(role="user", content="hi")], allow_external_ai=True)
    assert caught.value.usage == Usage(prompt=20, completion=598, reasoning=598)


async def test_tool_calls_are_parsed_and_parallel_is_allowed() -> None:
    script = ScriptedProvider([payload(tool_calls=[tool_call("a", {"x": 1}, "1"), tool_call("b", {"y": 2}, "2")], finish="tool_calls")])
    gateway = Gateway(settings=settings_for(), provider=script)
    completion = await gateway.complete(messages=[Message(role="user", content="hi")], allow_external_ai=True, tools=[])
    assert [call.name for call in completion.tool_calls] == ["a", "b"]
    assert completion.tool_calls[0].arguments == {"x": 1}
    assert completion.wants_tools


async def test_unparseable_tool_arguments_surface_as_error_not_crash() -> None:
    script = ScriptedProvider([payload(tool_calls=[tool_call("a", "{not json")], finish="tool_calls")])
    gateway = Gateway(settings=settings_for(), provider=script)
    completion = await gateway.complete(messages=[Message(role="user", content="hi")], allow_external_ai=True)
    bad = completion.tool_calls[0]
    assert bad.arguments == {} and bad.parse_error


async def test_structured_output_puts_the_schema_in_the_prompt() -> None:
    """json_object only guarantees parseable JSON. Without the shape written down,
    the model wraps output in its own envelope (observed: {"speaker": "穗奈"})."""
    script = ScriptedProvider([payload(text=json.dumps({"conclusion": "先看两条 JD", "next_actions": ["找广州岗位样本"]}))])
    gateway = Gateway(settings=settings_for(), provider=script)
    await gateway.structured(Answer, system="你是穗奈", user="帮我整理", allow_external_ai=True)
    system_prompt = script.seen_payloads[0]["messages"][0]["content"]
    assert "conclusion" in system_prompt and "required" in system_prompt
    assert "JSON Schema" in system_prompt


async def test_structured_output_uses_json_object_and_repairs_once() -> None:
    script = ScriptedProvider(
        [
            payload(text=json.dumps({"next_actions": []})),  # missing required conclusion
            payload(text=json.dumps({"conclusion": "先看两条岗位证据", "next_actions": ["查样本"]})),
        ]
    )
    gateway = Gateway(settings=settings_for(), provider=script)
    answer, completion = await gateway.structured(Answer, system="sys", user="usr", allow_external_ai=True)
    assert answer.conclusion.startswith("先看")
    assert len(script.seen_payloads) == 2
    assert script.seen_payloads[0]["response_format"] == {"type": "json_object"}
    repair_turn = script.seen_payloads[1]["messages"]
    assert any("schema" in str(item.get("content", "")) for item in repair_turn if item["role"] == "user")
    assert completion.usage.total > 0


async def test_structured_output_gives_up_loudly_after_one_retry() -> None:
    """Giving up must give up *both* attempts' cost, not report a free failure.

    This is the failure a real run hits most: the model answered twice and neither
    answer fitted the schema. P3 wants cost per capability, and a run that fails
    here has paid for two calls.
    """
    script = ScriptedProvider([payload(text="{"), payload(text="{}")])
    gateway = Gateway(settings=settings_for(), provider=script)
    with pytest.raises(StructuredOutputError) as caught:
        await gateway.structured(Answer, system="sys", user="usr", allow_external_ai=True)
    assert len(script.seen_payloads) == 2
    assert caught.value.usage == Usage(prompt=2, completion=2)


async def test_structured_output_reads_the_object_and_drops_the_tail() -> None:
    """Measured live on `action_plan`: one complete object, then a second one.

    The half we needed was valid, so rejecting the whole reply for extra data threw
    away a judgement the model had actually made. Formatting is not correctness —
    the schema still has to validate.
    """
    first = json.dumps({"conclusion": "先补 SQL 那一格", "next_actions": ["排一条第 5 周的验证任务"]})
    tail = json.dumps({"conclusion": "重复的第二份", "next_actions": []})
    script = ScriptedProvider([payload(text=first + "\n" + tail)])
    gateway = Gateway(settings=settings_for(), provider=script)
    answer, _ = await gateway.structured(Answer, system="sys", user="usr", allow_external_ai=True)
    assert answer.conclusion == "先补 SQL 那一格"
    assert len(script.seen_payloads) == 1, "没有多余的 schema 缺失就不该再花一次调用"


async def test_structured_output_still_repairs_a_reply_that_carries_no_object() -> None:
    script = ScriptedProvider(
        [
            payload(text="我需要先看一下证据才能回答"),
            payload(text=json.dumps({"conclusion": "补上了", "next_actions": []})),
        ]
    )
    gateway = Gateway(settings=settings_for(), provider=script)
    answer, _ = await gateway.structured(Answer, system="sys", user="usr", allow_external_ai=True)
    assert answer.conclusion == "补上了"
    assert len(script.seen_payloads) == 2


async def test_an_empty_reasoning_reply_is_retried_once_with_room_to_spare() -> None:
    """`finish_reason=length` with no content is a budget fault, not a refusal.

    Measured live on 2026-09-20: `action_plan`'s synthesis died this way three runs in
    a row while every ceiling was being raised by hand. Reasoning is billed out of the
    same budget as the answer, so the only thing missing was room.
    """
    script = ScriptedProvider([payload(text="", finish="length"), payload(text=json.dumps({"conclusion": "补上了", "next_actions": []}))])
    gateway = Gateway(settings=settings_for(), provider=script)
    answer, _ = await gateway.structured(
        Answer, system="sys", user="usr", thinking="on", max_tokens=2000, allow_external_ai=True
    )
    assert answer.conclusion == "补上了"
    assert [p["max_tokens"] for p in script.seen_payloads] == [2000, 4000]


async def test_the_escalation_stops_at_the_ceiling_and_then_fails_loudly() -> None:
    """Escalating forever would hide a capability that cannot finish; the run must still
    end red, with the failure at the stage that actually happened."""
    script = ScriptedProvider([payload(text="", finish="length"), payload(text="", finish="length")])
    gateway = Gateway(settings=settings_for(), provider=script)
    with pytest.raises(TruncatedEmptyResponse):
        await gateway.structured(Answer, system="sys", user="usr", thinking="on", max_tokens=10000, allow_external_ai=True)
    assert [p["max_tokens"] for p in script.seen_payloads] == [10000, 12000]


async def test_thinking_off_is_sent_as_a_per_call_switch() -> None:
    script = ScriptedProvider([payload(), payload()])
    gateway = Gateway(settings=settings_for(), provider=script)
    await gateway.complete(messages=[Message(role="user", content="hi")], allow_external_ai=True, thinking="on")
    await gateway.complete(messages=[Message(role="user", content="hi")], allow_external_ai=True, thinking="off")
    assert "thinking" not in script.seen_payloads[0]
    assert script.seen_payloads[1]["thinking"] == {"type": "disabled"}


async def test_usage_accounts_reasoning_and_cache_hits() -> None:
    parsed = parse_completion(
        payload(
            usage={
                "prompt_tokens": 1000,
                "completion_tokens": 120,
                "prompt_tokens_details": {"cached_tokens": 800},
                "completion_tokens_details": {"reasoning_tokens": 90},
            }
        ),
        "deepseek-flash",
    )
    assert parsed.usage == Usage(prompt=1000, completion=120, reasoning=90, cached=800)


def test_usage_addition_accumulates_across_rounds() -> None:
    assert (Usage(10, 5, 2, 8) + Usage(4, 3, 1, 0)) == Usage(14, 8, 3, 8)


def test_message_rebuilds_tool_calls_for_the_wire() -> None:
    message = Message(role="assistant", content="thinking", tool_calls=(ToolCall(id="1", name="a", arguments={"x": 1}),))
    wire = message.to_wire()
    assert wire["tool_calls"][0]["function"]["name"] == "a"
    assert json.loads(wire["tool_calls"][0]["function"]["arguments"]) == {"x": 1}


async def test_retry_only_on_retryable_status_codes() -> None:
    calls = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        if calls["n"] < 3:
            return httpx.Response(429, json={})
        return httpx.Response(200, json=payload(text="recovered"))

    settings = settings_for()
    settings = settings.model_copy(update={"llm_max_retries": 3, "llm_retry_backoff_seconds": 0})
    gateway = Gateway(settings=settings, transport=httpx.MockTransport(handler))
    completion = await gateway.complete(messages=[Message(role="user", content="hi")], allow_external_ai=True)
    assert completion.text == "recovered"
    assert calls["n"] == 3


async def test_non_retryable_status_fails_fast() -> None:
    calls = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        return httpx.Response(400, json={"error": {"message": "bad"}})

    settings = settings_for().model_copy(update={"llm_retry_backoff_seconds": 0})
    gateway = Gateway(settings=settings, transport=httpx.MockTransport(handler))
    with pytest.raises(Exception) as caught:
        await gateway.complete(messages=[Message(role="user", content="hi")], allow_external_ai=True)
    assert calls["n"] == 1
    assert "400" in str(caught.value)


async def test_stream_completion_reassembles_the_answer_and_keeps_usage() -> None:
    """The whole point of streaming is that the text arrives in pieces; the guards and
    the accounting must survive that."""
    chunks = [
        {"choices": [{"delta": {"reasoning_content": "先想一下"}}], "model": "deepseek-flash"},
        {"choices": [{"delta": {"content": '{"conclu'}}]},
        {"choices": [{"delta": {"content": 'sion": "方向不对'}}]},
        {
            "choices": [{"delta": {}, "finish_reason": "stop"}],
            "usage": {"prompt_tokens": 30, "completion_tokens": 9, "prompt_tokens_details": {"cached_tokens": 12}},
        },
    ]
    body = "".join(f"data: {json.dumps(chunk, ensure_ascii=False)}\n\n" for chunk in chunks) + "data: [DONE]\n\n"

    def handler(request: httpx.Request) -> httpx.Response:
        sent = json.loads(request.content.decode())
        assert sent["stream"] is True
        assert sent["stream_options"] == {"include_usage": True}
        return httpx.Response(200, content=body.encode("utf-8"), headers={"content-type": "text/event-stream"})

    gateway = Gateway(settings=settings_for(), transport=httpx.MockTransport(handler))
    seen: list[tuple[str, str]] = []

    async def on_delta(*, content: str, reasoning: str) -> None:
        seen.append((content, reasoning))

    completion = await gateway.stream_completion(
        messages=[Message(role="user", content="hi")], allow_external_ai=True, on_delta=on_delta
    )
    assert completion.text == '{"conclusion": "方向不对'
    assert completion.usage == Usage(prompt=30, completion=9, reasoning=0, cached=12)
    assert "".join(content for content, _ in seen) == completion.text
    assert [reasoning for _, reasoning in seen if reasoning] == ["先想一下"]


async def test_stream_completion_still_refuses_without_consent() -> None:
    gateway = Gateway(settings=settings_for("deepseek"))

    async def on_delta(*, content: str, reasoning: str) -> None:
        raise AssertionError("must not be called")

    with pytest.raises(ExternalAiNotAllowed):
        await gateway.stream_completion(
            messages=[Message(role="user", content="hi")], allow_external_ai=False, on_delta=on_delta
        )


async def test_streaming_a_truncated_reasoning_response_is_still_an_error() -> None:
    body = "data: " + json.dumps({"choices": [{"delta": {}, "finish_reason": "length"}]}) + "\n\ndata: [DONE]\n\n"

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, content=body.encode("utf-8"))

    gateway = Gateway(settings=settings_for(), transport=httpx.MockTransport(handler))

    async def on_delta(*, content: str, reasoning: str) -> None:
        return None

    with pytest.raises(TruncatedEmptyResponse):
        await gateway.stream_completion(
            messages=[Message(role="user", content="hi")], allow_external_ai=True, on_delta=on_delta
        )


async def test_structured_stream_repairs_once_and_returns_the_model() -> None:
    script = ScriptedProvider([payload(text="不是 JSON"), payload(text='{"conclusion": "好了", "next_actions": []}')])
    gateway = Gateway(settings=settings_for("deepseek"), provider=script)
    shown: list[str] = []

    async def on_delta(*, content: str, reasoning: str) -> None:
        shown.append(content)

    answer, completion = await gateway.structured_stream(
        Answer, system="s", user="u", allow_external_ai=True, on_delta=on_delta
    )
    assert answer.conclusion == "好了"
    assert completion.text == '{"conclusion": "好了", "next_actions": []}'
    assert "".join(shown).endswith("next_actions\": []}")
