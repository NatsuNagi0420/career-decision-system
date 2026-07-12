from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

DEFAULT_INTERNAL_API_TOKEN = "change-me"
MIN_PRODUCTION_INTERNAL_TOKEN_LENGTH = 16
OPENAI_COMPATIBLE_PROVIDERS = {"openai", "openai_compatible", "openai-compatible", "deepseek", "qwen"}


class Settings(BaseSettings):
    app_name: str = "Career Decision Agent Server"
    app_env: str = "local"
    log_level: str = "INFO"
    backend_base_url: str = "https://192.168.1.159:8443"
    internal_api_token: str = DEFAULT_INTERNAL_API_TOKEN
    llm_provider: str = "mock"
    llm_model: str = "mock-career-planner"
    llm_base_url: str | None = None
    llm_api_key: str | None = None
    llm_timeout_seconds: float = Field(default=30.0, gt=0)
    llm_max_retries: int = Field(default=2, ge=0, le=5)
    llm_retry_backoff_seconds: float = Field(default=0.2, ge=0, le=10)

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    def is_production(self) -> bool:
        return self.app_env.strip().lower() in {"prod", "production"}

    def normalized_internal_api_token(self) -> str:
        return self.internal_api_token.strip()

    def internal_token_readiness_issue(self) -> str | None:
        token = self.normalized_internal_api_token()
        if not token:
            return "INTERNAL_API_TOKEN is required."
        if not self.is_production():
            return None
        if token == DEFAULT_INTERNAL_API_TOKEN:
            return "INTERNAL_API_TOKEN must not use the local default in production."
        if len(token) < MIN_PRODUCTION_INTERNAL_TOKEN_LENGTH:
            return f"INTERNAL_API_TOKEN must be at least {MIN_PRODUCTION_INTERNAL_TOKEN_LENGTH} characters in production."
        return None

    def llm_readiness_issue(self) -> str | None:
        if not self.is_production():
            return None

        provider = self.llm_provider.strip().lower()
        if not provider:
            return "LLM_PROVIDER is required in production."
        if provider == "mock":
            return "LLM_PROVIDER must not be mock in production."
        if provider not in OPENAI_COMPATIBLE_PROVIDERS:
            return f"Unsupported LLM provider: {self.llm_provider}"
        if not self.llm_model.strip():
            return "LLM_MODEL is required in production."
        if not self.llm_api_key or not self.llm_api_key.strip():
            return "LLM_API_KEY is required in production."
        return None


@lru_cache
def get_settings() -> Settings:
    return Settings()
