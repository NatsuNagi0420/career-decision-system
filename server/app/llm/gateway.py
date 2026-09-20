"""Async OpenAI-compatible gateway.

Carries every countermeasure measured in docs/v2/AI_NATIVE_ARCHITECTURE.md §14-S1:

  * outbound calls are refused here unless the caller proves consent — the check
    cannot be bypassed by a caller that forgets to look at it
  * `finish_reason=length` with empty content raises instead of returning ""
    (deepseek-flash spends reasoning tokens out of max_tokens and then has
    nothing left for content; "" is indistinguishable from "model is silent")
  * `thinking: {"type":"disabled"}` is a per-call switch for extract/shape nodes
  * structured output uses json_object + Pydantic + exactly one repair retry,
    because json_schema/strict is rejected by the endpoint with HTTP 400
"""

from __future__ import annotations

import asyncio
import json
from collections.abc import AsyncIterator, Sequence
from dataclasses import dataclass, field
from typing import Any, Literal, Protocol, TypeVar

import httpx
from pydantic import BaseModel, ValidationError

from app.config import OPENAI_COMPATIBLE_PROVIDERS, Settings, get_settings

RETRYABLE_STATUS = {429, 500, 502, 503, 504}
Thinking = Literal["on", "off"]
ModelT = TypeVar("ModelT", bound=BaseModel)


class GatewayError(RuntimeError):
    pass


class ExternalAiNotAllowed(GatewayError):
    """Raised by the gateway itself, so no call site can opt out of consent."""


class TruncatedEmptyResponse(GatewayError):
    """finish_reason=length with neither content nor tool_calls."""


class StructuredOutputError(GatewayError):
    pass


@dataclass(frozen=True)
class Usage:
    prompt: int = 0
    completion: int = 0
    reasoning: int = 0
    cached: int = 0

    def __add__(self, other: Usage) -> Usage:
        return Usage(
            self.prompt + other.prompt,
            self.completion + other.completion,
            self.reasoning + other.reasoning,
            self.cached + other.cached,
        )

    @property
    def total(self) -> int:
        return self.prompt + self.completion


@dataclass(frozen=True)
class ToolCall:
    id: str
    name: str
    arguments: dict[str, Any]
    raw: str = ""
    parse_error: str | None = None

    def to_wire_item(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "type": "function",
            "function": {"name": self.name, "arguments": self.raw or json.dumps(self.arguments, ensure_ascii=False)},
        }


@dataclass(frozen=True)
class Message:
    role: str
    content: str | None = None
    tool_calls: tuple[ToolCall, ...] = ()
    tool_call_id: str | None = None

    def to_wire(self) -> dict[str, Any]:
        if self.role == "tool":
            return {"role": "tool", "tool_call_id": self.tool_call_id, "content": self.content or ""}
        out: dict[str, Any] = {"role": self.role, "content": self.content}
        if self.tool_calls:
            wired = [
                {
                    "id": t.id,
                    "type": "function",
                    "function": {"name": t.name, "arguments": t.raw or json.dumps(t.arguments, ensure_ascii=False)},
                }
                for t in self.tool_calls
            ]
            out["tool_calls"] = wired
        return out


@dataclass(frozen=True)
class Completion:
    text: str
    tool_calls: tuple[ToolCall, ...]
    usage: Usage
    finish_reason: str | None
    model: str

    @property
    def wants_tools(self) -> bool:
        return bool(self.tool_calls)


class Provider(Protocol):
    name: str

    async def complete(self, payload: dict[str, Any]) -> dict[str, Any]: ...

    def stream(self, payload: dict[str, Any]) -> AsyncIterator[dict[str, Any]]: ...


class DeltaCallback(Protocol):
    """Called with each raw content / reasoning fragment as it arrives."""

    async def __call__(self, *, content: str, reasoning: str) -> None: ...


DEFAULT_BASE_URLS = {
    "deepseek": "https://api.deepseek.com",
    "qwen": "https://dashscope.aliyuncs.com/compatible-mode/v1",
}


class OpenAICompatibleProvider:
    name = "openai_compatible"

    def __init__(self, settings: Settings, transport: httpx.AsyncBaseTransport | None = None) -> None:
        self._s = settings
        self._transport = transport

    def _base_url(self) -> str:
        configured = (self._s.llm_base_url or "").rstrip("/")
        if configured:
            return configured
        return DEFAULT_BASE_URLS.get(self._s.llm_provider.strip().lower(), "https://api.openai.com/v1").rstrip("/")

    async def complete(self, payload: dict[str, Any]) -> dict[str, Any]:
        headers = {"Authorization": f"Bearer {self._s.llm_api_key}", "Content-Type": "application/json"}
        url = f"{self._base_url()}/chat/completions"
        last: Exception | None = None
        max_attempts = max(0, self._s.llm_max_retries)
        for attempt in range(max_attempts + 1):
            try:
                async with httpx.AsyncClient(timeout=self._s.llm_timeout_seconds, transport=self._transport) as client:
                    response = await client.post(url, json=payload, headers=headers)
                    response.raise_for_status()
                    return response.json()
            except httpx.HTTPStatusError as exc:
                if exc.response.status_code not in RETRYABLE_STATUS or attempt >= max_attempts:
                    raise GatewayError(f"model request failed: {exc}") from exc
                last = exc
            except (httpx.TimeoutException, httpx.TransportError) as exc:
                if attempt >= max_attempts:
                    raise GatewayError(f"model request failed: {exc}") from exc
                last = exc
            await asyncio.sleep(self._s.llm_retry_backoff_seconds * (2**attempt))
        raise GatewayError(f"model request failed: {last}")

    async def stream(self, payload: dict[str, Any]) -> AsyncIterator[dict[str, Any]]:
        """Yield each decoded SSE chunk.

        No retry here on purpose: once a byte has been shown to a person, replaying
        the call would silently rewrite what they watched. The digest keeps its own
        schema-repair retry, which re-streams from the start and replaces the text.
        """
        headers = {"Authorization": f"Bearer {self._s.llm_api_key}", "Content-Type": "application/json"}
        url = f"{self._base_url()}/chat/completions"
        try:
            async with (
                httpx.AsyncClient(timeout=self._s.llm_timeout_seconds, transport=self._transport) as client,
                client.stream("POST", url, json=payload, headers=headers) as response,
            ):
                if response.status_code >= 400:
                    body = await response.aread()
                    raise GatewayError(f"model stream failed: {response.status_code} {body[:200]!r}")
                async for line in response.aiter_lines():
                    chunk = _sse_data(line)
                    if chunk is None:
                        continue
                    if chunk == "[DONE]":
                        return
                    try:
                        yield json.loads(chunk)
                    except ValueError:
                        # A partial line from a proxy: skip it, the next one carries
                        # the rest of the sentence and the accumulator is additive.
                        continue
        except (httpx.TimeoutException, httpx.TransportError) as exc:
            raise GatewayError(f"model stream failed: {exc}") from exc


def _sse_data(line: str) -> str | None:
    stripped = line.strip()
    if not stripped.startswith("data:"):
        return None
    return stripped[5:].strip()


class MockProvider:
    """Offline default. Produces a plain-text answer and no tool calls."""

    name = "mock"

    async def complete(self, payload: dict[str, Any]) -> dict[str, Any]:
        return _mock_envelope(self._text(payload))

    async def stream(self, payload: dict[str, Any]) -> AsyncIterator[dict[str, Any]]:
        text = self._text(payload)
        # Four chunks so the offline path actually shows the answer growing.
        size = max(1, len(text) // 4)
        for start in range(0, len(text), size):
            yield {"choices": [{"delta": {"content": text[start : start + size]}}]}
        yield {"choices": [{"delta": {}, "finish_reason": "stop"}], "usage": _mock_usage(text)}

    @staticmethod
    def _text(payload: dict[str, Any]) -> str:
        user = next((m["content"] for m in reversed(payload["messages"]) if m["role"] == "user"), "")
        return f"[mock:{payload.get('model')}] 已收到目标：{(user or '')[:80]}"


def _mock_envelope(text: str) -> dict[str, Any]:
    return {
        "choices": [{"message": {"content": text}, "finish_reason": "stop"}],
        "usage": {"prompt_tokens": 10, "completion_tokens": max(1, len(text) // 4)},
    }


def _mock_usage(text: str) -> dict[str, Any]:
    return {"prompt_tokens": 10, "completion_tokens": max(1, len(text) // 4)}


class ScriptedProvider:
    """Test double: replays prepared payloads so tool loops are exercisable offline."""

    name = "scripted"

    def __init__(self, script: Sequence[dict[str, Any]]) -> None:
        self._script = list(script)
        self.seen_payloads: list[dict[str, Any]] = []
        self.streamed: list[dict[str, Any]] = []

    async def complete(self, payload: dict[str, Any]) -> dict[str, Any]:
        self.seen_payloads.append(payload)
        if not self._script:
            raise GatewayError("scripted provider exhausted")
        item = self._script.pop(0)
        if isinstance(item, Exception):
            raise item
        return item

    async def stream(self, payload: dict[str, Any]) -> AsyncIterator[dict[str, Any]]:
        """Replay a scripted message as SSE deltas, so the streaming path is
        exercisable without a live endpoint. `content` is cut into pieces and
        `reasoning_content`, when present, streams ahead of it — that is the order
        the real endpoint uses."""
        self.streamed.append(payload)
        item = await self.complete(payload)
        message = (item.get("choices") or [{}])[0].get("message", {})
        reasoning = message.get("reasoning_content") or ""
        content = message.get("content") or ""
        if reasoning:
            yield {"choices": [{"delta": {"reasoning_content": reasoning}}]}
        for start in range(0, len(content), 12):
            yield {"choices": [{"delta": {"content": content[start : start + 12]}}]}
        yield {
            "choices": [{"delta": {}, "finish_reason": item.get("choices", [{}])[0].get("finish_reason", "stop")}],
            "usage": item.get("usage") or {},
        }


def parse_completion(data: dict[str, Any], requested_model: str) -> Completion:
    try:
        choice = data["choices"][0]
    except (KeyError, IndexError, TypeError) as exc:
        raise GatewayError("model returned an invalid response shape") from exc

    message = choice.get("message") or {}
    finish = choice.get("finish_reason")
    text = (message.get("content") or "").strip()
    tool_calls = _parse_tool_calls(message.get("tool_calls") or [])

    if finish == "length" and not text and not tool_calls:
        raise TruncatedEmptyResponse(
            "model exhausted max_tokens on reasoning without emitting content; raise the budget or disable thinking"
        )
    return Completion(
        text=text,
        tool_calls=tool_calls,
        usage=_parse_usage(data),
        finish_reason=finish,
        model=data.get("model") or requested_model,
    )


def _parse_tool_calls(raw: list[dict[str, Any]]) -> tuple[ToolCall, ...]:
    out: list[ToolCall] = []
    for item in raw:
        fn = item.get("function") or {}
        arguments = fn.get("arguments") or "{}"
        parse_error: str | None = None
        try:
            parsed = json.loads(arguments) if isinstance(arguments, str) else dict(arguments)
            if not isinstance(parsed, dict):
                raise ValueError("arguments payload is not an object")
        except (ValueError, TypeError) as exc:
            parsed, parse_error = {}, f"{type(exc).__name__}: {exc}"
        raw_arguments = arguments if isinstance(arguments, str) else json.dumps(arguments, ensure_ascii=False)
        out.append(
            ToolCall(id=item.get("id") or "", name=fn.get("name") or "", arguments=parsed, raw=raw_arguments, parse_error=parse_error)
        )
    return tuple(out)


def _parse_usage(data: dict[str, Any]) -> Usage:
    usage = data.get("usage") or {}
    prompt_details = usage.get("prompt_tokens_details") or {}
    completion_details = usage.get("completion_tokens_details") or {}
    prompt = usage.get("prompt_tokens")
    if prompt is None:
        prompt = int(usage.get("prompt_cache_hit_tokens") or 0) + int(usage.get("prompt_cache_miss_tokens") or 0)
    cached = prompt_details.get("cached_tokens")
    if cached is None:
        cached = usage.get("prompt_cache_hit_tokens")
    return Usage(
        prompt=int(prompt or 0),
        completion=int(usage.get("completion_tokens") or 0),
        reasoning=int(completion_details.get("reasoning_tokens") or 0),
        cached=int(cached or 0),
    )


@dataclass
class Gateway:
    settings: Settings = field(default_factory=get_settings)
    provider: Provider | None = None
    transport: httpx.AsyncBaseTransport | None = None

    def __post_init__(self) -> None:
        if self.provider is not None:
            return
        provider_name = self.settings.llm_provider.strip().lower()
        if provider_name == "mock":
            self.provider = MockProvider()
        elif provider_name in OPENAI_COMPATIBLE_PROVIDERS:
            self.provider = OpenAICompatibleProvider(self.settings, self.transport)
        else:
            raise GatewayError(f"unsupported LLM provider: {self.settings.llm_provider}")

    async def complete(
        self,
        *,
        messages: Sequence[Message],
        allow_external_ai: bool,
        tools: Sequence[dict[str, Any]] = (),
        thinking: Thinking = "on",
        max_tokens: int | None = None,
        json_mode: bool = False,
        system: str = "",
    ) -> Completion:
        payload = self._payload(
            messages=messages,
            tools=tools,
            thinking=thinking,
            max_tokens=max_tokens,
            json_mode=json_mode,
            system=system,
        )
        self._guard(allow_external_ai)
        data = await self._require().complete(payload)
        return parse_completion(data, self.settings.llm_model)

    async def stream_completion(
        self,
        *,
        messages: Sequence[Message],
        allow_external_ai: bool,
        on_delta: DeltaCallback,
        tools: Sequence[dict[str, Any]] = (),
        thinking: Thinking = "on",
        max_tokens: int | None = None,
        json_mode: bool = False,
        system: str = "",
    ) -> Completion:
        """Same guards and the same final shape as `complete`, plus a callback for
        each fragment. The chunks are folded back into a normal response envelope so
        the truncation check and tool-call parsing are shared, not re-implemented."""
        payload = self._payload(
            messages=messages,
            tools=tools,
            thinking=thinking,
            max_tokens=max_tokens,
            json_mode=json_mode,
            system=system,
        )
        payload["stream"] = True
        # Without this the endpoint sends no usage at all when streaming, and the
        # spend would silently drop out of `usage_recorded`.
        payload["stream_options"] = {"include_usage": True}
        self._guard(allow_external_ai)

        content: list[str] = []
        tool_calls: dict[int, dict[str, Any]] = {}
        finish: str | None = None
        usage: dict[str, Any] = {}
        model = ""

        async for chunk in self._require().stream(payload):
            model = chunk.get("model") or model
            if chunk.get("usage"):
                usage = chunk["usage"]
            choices = chunk.get("choices") or []
            if not choices:
                continue
            choice = choices[0]
            delta = choice.get("delta") or {}
            piece = delta.get("content") or ""
            reasoning = delta.get("reasoning_content") or ""
            if piece:
                content.append(piece)
            for item in delta.get("tool_calls") or []:
                slot = tool_calls.setdefault(int(item.get("index") or 0), {"id": "", "name": "", "arguments": ""})
                slot["id"] = item.get("id") or slot["id"]
                fn = item.get("function") or {}
                slot["name"] = fn.get("name") or slot["name"]
                slot["arguments"] += fn.get("arguments") or ""
            finish = choice.get("finish_reason") or finish
            if piece or reasoning:
                await on_delta(content=piece, reasoning=reasoning)

        message: dict[str, Any] = {"role": "assistant", "content": "".join(content)}
        if tool_calls:
            message["tool_calls"] = [
                {
                    "id": call["id"] or f"call-{index}",
                    "type": "function",
                    "function": {"name": call["name"], "arguments": call["arguments"]},
                }
                for index, call in sorted(tool_calls.items())
            ]
        return parse_completion(
            {"choices": [{"message": message, "finish_reason": finish}], "usage": usage, "model": model},
            self.settings.llm_model,
        )

    def _require(self) -> Provider:
        assert self.provider is not None
        return self.provider

    def _guard(self, allow_external_ai: bool) -> None:
        is_mock = isinstance(self.provider, (MockProvider, ScriptedProvider))
        if not is_mock and not allow_external_ai:
            raise ExternalAiNotAllowed("user has not granted external AI consent")

    def _payload(
        self,
        *,
        messages: Sequence[Message],
        tools: Sequence[dict[str, Any]],
        thinking: Thinking,
        max_tokens: int | None,
        json_mode: bool,
        system: str,
    ) -> dict[str, Any]:
        budget = max_tokens or self.settings.llm_default_max_tokens
        turns = [m.to_wire() for m in messages]
        wire = [{"role": "system", "content": system}, *turns] if system else turns
        payload: dict[str, Any] = {
            "model": self.settings.llm_model,
            "messages": wire,
            "temperature": 0.2,
            "max_tokens": budget,
        }
        if tools:
            payload["tools"] = list(tools)
            payload["tool_choice"] = "auto"
        if json_mode:
            payload["response_format"] = {"type": "json_object"}
        if thinking == "off":
            payload["thinking"] = {"type": "disabled"}
        return payload

    async def structured_stream(
        self,
        schema: type[ModelT],
        *,
        system: str,
        user: str,
        allow_external_ai: bool,
        on_delta: DeltaCallback,
        thinking: Thinking = "off",
        max_tokens: int | None = None,
    ) -> tuple[ModelT, Completion]:
        """`structured`, but the model's text is handed to `on_delta` as it arrives.

        The deltas are raw — for a json_object call that is JSON text, so the caller
        decides what is legible enough to show. The schema-repair retry is unchanged:
        a second attempt re-streams and replaces what the first one showed.
        """
        contract = json.dumps(schema.model_json_schema(), ensure_ascii=False, separators=(",", ":"))
        shaped = f"{system}\n\n输出必须严格符合这个 JSON Schema，不得增删或改名：\n{contract}"
        messages = [Message(role="user", content=user)]
        last_error = ""
        for attempt in range(2):
            completion = await self.stream_completion(
                messages=messages,
                system=shaped if attempt == 0 else _REPAIR_SYSTEM + "\n\n" + contract,
                allow_external_ai=allow_external_ai,
                on_delta=on_delta,
                thinking=thinking,
                max_tokens=max_tokens,
                json_mode=True,
            )
            try:
                return schema.model_validate(json.loads(completion.text or "{}")), completion
            except (ValidationError, ValueError) as exc:
                last_error = _short(str(exc))
                messages = [
                    *messages,
                    Message(role="assistant", content=completion.text),
                    Message(role="user", content=f"上一次输出不符合 schema：{last_error}\n请只输出符合 schema 的 JSON。"),
                ]
        raise StructuredOutputError(f"model output failed schema validation after 1 repair retry: {last_error}")

    async def structured(
        self,
        schema: type[ModelT],
        *,
        system: str,
        user: str,
        allow_external_ai: bool,
        thinking: Thinking = "off",
        max_tokens: int | None = None,
    ) -> tuple[ModelT, Completion]:
        """json_object + Pydantic + exactly one repair retry, then give up loudly.

        The schema is spelled out in the prompt because the endpoint rejects
        `response_format: json_schema` (§14-S1): `json_object` only guarantees
        parseable JSON, so without the shape written down the model invents its
        own envelope — in practice a `{"speaker": "穗奈", ...}` wrapper.
        """
        contract = json.dumps(schema.model_json_schema(), ensure_ascii=False, separators=(",", ":"))
        shaped = f"{system}\n\n输出必须严格符合这个 JSON Schema，不得增删或改名：\n{contract}"
        messages = [Message(role="user", content=user)]
        last_error = ""
        for attempt in range(2):
            completion = await self.complete(
                messages=messages,
                system=shaped if attempt == 0 else _REPAIR_SYSTEM + "\n\n" + contract,
                allow_external_ai=allow_external_ai,
                thinking=thinking,
                max_tokens=max_tokens,
                json_mode=True,
            )
            try:
                return schema.model_validate(json.loads(completion.text or "{}")), completion
            except (ValidationError, ValueError) as exc:
                last_error = _short(str(exc))
                messages = [
                    *messages,
                    Message(role="assistant", content=completion.text),
                    Message(role="user", content=f"上一次输出不符合 schema：{last_error}\n请只输出符合 schema 的 JSON。"),
                ]
        raise StructuredOutputError(f"model output failed schema validation after 1 repair retry: {last_error}")


_REPAIR_SYSTEM = "你只输出符合给定 JSON schema 的对象，不输出任何解释、前后缀或代码围栏。"


def _short(text: str, limit: int = 800) -> str:
    collapsed = " ".join(text.split())
    return collapsed if len(collapsed) <= limit else collapsed[:limit] + "…"
