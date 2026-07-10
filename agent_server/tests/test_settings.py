from app.config.settings import Settings


def test_llm_readiness_allows_mock_outside_production():
    settings = Settings(app_env="local", llm_provider="mock")

    assert settings.llm_readiness_issue() is None


def test_llm_readiness_rejects_mock_in_production():
    settings = Settings(app_env="production", llm_provider="mock")

    assert settings.llm_readiness_issue() == "LLM_PROVIDER must not be mock in production."


def test_llm_readiness_rejects_missing_api_key_in_production():
    settings = Settings(app_env="production", llm_provider="openai_compatible", llm_model="career-model", llm_api_key=None)

    assert settings.llm_readiness_issue() == "LLM_API_KEY is required in production."


def test_llm_readiness_accepts_openai_compatible_production_config():
    settings = Settings(
        app_env="production",
        llm_provider="openai_compatible",
        llm_model="career-model",
        llm_api_key="test-key",
    )

    assert settings.llm_readiness_issue() is None
