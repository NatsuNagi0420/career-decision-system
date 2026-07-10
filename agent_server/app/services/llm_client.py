import time
from collections.abc import Callable
from typing import Any

import httpx

from app.config.settings import Settings, get_settings


class LlmClientError(RuntimeError):
    pass


class LlmClient:
    OPENAI_COMPATIBLE_PROVIDERS = {"openai", "openai_compatible", "openai-compatible", "deepseek", "qwen"}
    RETRYABLE_STATUS_CODES = {429, 500, 502, 503, 504}

    def __init__(self, sleeper: Callable[[float], None] = time.sleep) -> None:
        self._sleeper = sleeper

    def complete(
        self,
        system_prompt: str,
        user_prompt: str,
        settings: Settings | None = None,
        transport: httpx.BaseTransport | None = None,
    ) -> str:
        active_settings = settings or get_settings()
        provider = active_settings.llm_provider.lower()
        if provider == "mock":
            return "Mock AI response generated from the current structured workflow."
        if provider in self.OPENAI_COMPATIBLE_PROVIDERS:
            return self._complete_openai_compatible(system_prompt, user_prompt, active_settings, transport)
        raise LlmClientError(f"Unsupported LLM provider: {active_settings.llm_provider}")

    def _complete_openai_compatible(
        self,
        system_prompt: str,
        user_prompt: str,
        settings: Settings,
        transport: httpx.BaseTransport | None,
    ) -> str:
        if not settings.llm_api_key:
            raise LlmClientError("LLM_API_KEY is required for non-mock providers.")

        base_url = (settings.llm_base_url or self.default_base_url(settings.llm_provider)).rstrip("/")
        payload: dict[str, Any] = {
            "model": settings.llm_model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "temperature": 0.2,
        }
        headers = {
            "Authorization": f"Bearer {settings.llm_api_key}",
            "Content-Type": "application/json",
        }

        response = self._post_with_retries(
            url=f"{base_url}/chat/completions",
            payload=payload,
            headers=headers,
            settings=settings,
            transport=transport,
        )

        try:
            data = response.json()
        except ValueError as exc:
            raise LlmClientError("LLM provider returned invalid JSON.") from exc
        try:
            content = data["choices"][0]["message"]["content"]
        except (KeyError, IndexError, TypeError) as exc:
            raise LlmClientError("LLM provider returned an invalid response shape.") from exc

        if not isinstance(content, str) or not content.strip():
            raise LlmClientError("LLM provider returned empty content.")
        return content.strip()

    def _post_with_retries(
        self,
        url: str,
        payload: dict[str, Any],
        headers: dict[str, str],
        settings: Settings,
        transport: httpx.BaseTransport | None,
    ) -> httpx.Response:
        max_retries = max(0, settings.llm_max_retries)
        last_error: httpx.HTTPError | None = None
        for attempt in range(max_retries + 1):
            try:
                with httpx.Client(timeout=settings.llm_timeout_seconds, transport=transport) as client:
                    response = client.post(url, json=payload, headers=headers)
                    response.raise_for_status()
                    return response
            except httpx.HTTPStatusError as exc:
                if not self._should_retry_status(exc.response.status_code) or attempt >= max_retries:
                    raise LlmClientError(f"LLM provider request failed: {exc}") from exc
                last_error = exc
            except (httpx.TimeoutException, httpx.TransportError) as exc:
                if attempt >= max_retries:
                    raise LlmClientError(f"LLM provider request failed: {exc}") from exc
                last_error = exc
            self._sleep_before_retry(attempt, settings.llm_retry_backoff_seconds)
        raise LlmClientError(f"LLM provider request failed: {last_error}")

    def _should_retry_status(self, status_code: int) -> bool:
        return status_code in self.RETRYABLE_STATUS_CODES

    def _sleep_before_retry(self, attempt: int, base_backoff_seconds: float) -> None:
        if base_backoff_seconds <= 0:
            return
        self._sleeper(base_backoff_seconds * (2**attempt))

    def default_base_url(self, provider: str) -> str:
        normalized = provider.lower()
        if normalized == "deepseek":
            return "https://api.deepseek.com/v1"
        if normalized == "qwen":
            return "https://dashscope.aliyuncs.com/compatible-mode/v1"
        return "https://api.openai.com/v1"


llm_client = LlmClient()
