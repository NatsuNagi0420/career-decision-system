import json

import httpx
import pytest

from app.config.settings import Settings
from app.services.llm_client import LlmClient, LlmClientError


def test_mock_provider_returns_deterministic_text():
    client = LlmClient()
    settings = Settings(llm_provider="mock")

    result = client.complete("system", "user", settings=settings)

    assert result == "Mock AI response generated from the current structured workflow."


def test_openai_compatible_provider_posts_chat_completion_payload():
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(
            200,
            json={
                "choices": [
                    {
                        "message": {
                            "content": "Career plan generated."
                        }
                    }
                ]
            },
        )

    transport = httpx.MockTransport(handler)
    settings = Settings(
        llm_provider="openai_compatible",
        llm_base_url="https://llm.example.test/v1",
        llm_api_key="test-key",
        llm_model="career-model",
    )

    result = LlmClient().complete("system prompt", "user prompt", settings=settings, transport=transport)

    assert result == "Career plan generated."
    assert len(requests) == 1
    assert str(requests[0].url) == "https://llm.example.test/v1/chat/completions"
    assert requests[0].headers["authorization"] == "Bearer test-key"
    payload = json.loads(requests[0].content)
    assert payload["model"] == "career-model"
    assert payload["messages"][0]["content"] == "system prompt"
    assert payload["messages"][1]["content"] == "user prompt"


def test_non_mock_provider_requires_api_key():
    settings = Settings(llm_provider="openai_compatible", llm_base_url="https://llm.example.test/v1", llm_api_key=None)

    with pytest.raises(LlmClientError, match="LLM_API_KEY"):
        LlmClient().complete("system", "user", settings=settings)


def test_provider_retries_retryable_status_before_success():
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        if len(requests) == 1:
            return httpx.Response(503, json={"error": "busy"})
        return httpx.Response(200, json={"choices": [{"message": {"content": "Recovered plan."}}]})

    settings = Settings(
        llm_provider="openai_compatible",
        llm_base_url="https://llm.example.test/v1",
        llm_api_key="test-key",
        llm_model="career-model",
        llm_max_retries=1,
        llm_retry_backoff_seconds=0,
    )

    result = LlmClient(sleeper=lambda _: None).complete("system", "user", settings=settings, transport=httpx.MockTransport(handler))

    assert result == "Recovered plan."
    assert len(requests) == 2


def test_provider_does_not_retry_non_retryable_status():
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(400, json={"error": "bad request"})

    settings = Settings(
        llm_provider="openai_compatible",
        llm_base_url="https://llm.example.test/v1",
        llm_api_key="test-key",
        llm_model="career-model",
        llm_max_retries=3,
        llm_retry_backoff_seconds=0,
    )

    with pytest.raises(LlmClientError, match="LLM provider request failed"):
        LlmClient(sleeper=lambda _: None).complete("system", "user", settings=settings, transport=httpx.MockTransport(handler))

    assert len(requests) == 1


def test_provider_retries_transport_error_before_success():
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        if len(requests) == 1:
            raise httpx.ConnectTimeout("temporary timeout")
        return httpx.Response(200, json={"choices": [{"message": {"content": "Recovered after timeout."}}]})

    settings = Settings(
        llm_provider="openai_compatible",
        llm_base_url="https://llm.example.test/v1",
        llm_api_key="test-key",
        llm_model="career-model",
        llm_max_retries=1,
        llm_retry_backoff_seconds=0,
    )

    result = LlmClient(sleeper=lambda _: None).complete("system", "user", settings=settings, transport=httpx.MockTransport(handler))

    assert result == "Recovered after timeout."
    assert len(requests) == 2


def test_provider_invalid_json_is_wrapped_as_llm_error():
    transport = httpx.MockTransport(lambda _request: httpx.Response(200, text="not-json"))
    settings = Settings(
        llm_provider="openai_compatible",
        llm_base_url="https://llm.example.test/v1",
        llm_api_key="test-key",
        llm_model="career-model",
    )

    with pytest.raises(LlmClientError, match="invalid JSON"):
        LlmClient().complete("system", "user", settings=settings, transport=transport)
