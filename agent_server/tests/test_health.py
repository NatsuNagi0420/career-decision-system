from app.api.v1 import health
from app.config.settings import Settings
from tests.http_client import api_get


def test_health_ok():
    response = api_get("/api/v1/health", internal_token=False)
    assert response.status_code == 200
    body = response.json()
    assert body["code"] == 0
    assert body["data"]["status"] == "ok"


def test_ready_rejects_default_internal_token_in_production(monkeypatch):
    monkeypatch.setattr(
        health,
        "get_settings",
        lambda: Settings(app_env="production", internal_api_token="change-me"),
    )

    response = api_get("/api/v1/ready", internal_token=False)

    assert response.status_code == 503
    body = response.json()
    assert body["code"] == 50301
    assert "must not use the local default" in body["message"]


def test_ready_accepts_strong_internal_token_in_production(monkeypatch):
    monkeypatch.setattr(
        health,
        "get_settings",
        lambda: Settings(
            app_env="production",
            internal_api_token="production-token-123",
            llm_provider="openai_compatible",
            llm_model="career-model",
            llm_api_key="test-key",
        ),
    )

    response = api_get("/api/v1/ready", internal_token=False)

    assert response.status_code == 200
    body = response.json()
    assert body["code"] == 0
    assert body["data"]["status"] == "ready"


def test_ready_allows_mock_llm_in_local_development(monkeypatch):
    monkeypatch.setattr(
        health,
        "get_settings",
        lambda: Settings(app_env="local", internal_api_token="change-me", llm_provider="mock"),
    )

    response = api_get("/api/v1/ready", internal_token=False)

    assert response.status_code == 200
    body = response.json()
    assert body["code"] == 0
    assert body["data"]["status"] == "ready"


def test_ready_rejects_mock_llm_in_production(monkeypatch):
    monkeypatch.setattr(
        health,
        "get_settings",
        lambda: Settings(
            app_env="production",
            internal_api_token="production-token-123",
            llm_provider="mock",
        ),
    )

    response = api_get("/api/v1/ready", internal_token=False)

    assert response.status_code == 503
    body = response.json()
    assert body["code"] == 50301
    assert body["message"] == "LLM_PROVIDER must not be mock in production."


def test_ready_rejects_missing_llm_api_key_in_production(monkeypatch):
    monkeypatch.setattr(
        health,
        "get_settings",
        lambda: Settings(
            app_env="production",
            internal_api_token="production-token-123",
            llm_provider="openai_compatible",
            llm_model="career-model",
            llm_api_key=None,
        ),
    )

    response = api_get("/api/v1/ready", internal_token=False)

    assert response.status_code == 503
    body = response.json()
    assert body["code"] == 50301
    assert body["message"] == "LLM_API_KEY is required in production."
