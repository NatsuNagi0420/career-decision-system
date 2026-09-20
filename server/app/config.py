from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

DEFAULT_INTERNAL_API_TOKEN = "change-me"
MIN_TOKEN_LENGTH = 16
OPENAI_COMPATIBLE_PROVIDERS = {"openai", "openai_compatible", "openai-compatible", "deepseek", "qwen"}
MOCK_PROVIDERS = {"mock"}


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_env: str = "local"
    log_level: str = "INFO"

    db_url: str = "mysql+pymysql://root:root@127.0.0.1:3306/career_v2?charset=utf8mb4"
    test_db_url: str = "mysql+pymysql://root:root@127.0.0.1:3306/career_v2_test?charset=utf8mb4"
    checkpoint_path: str = "./var/checkpoints.sqlite"

    llm_provider: str = "mock"
    llm_model: str = "mock-career-planner"
    llm_base_url: str | None = None
    llm_api_key: str | None = None
    llm_timeout_seconds: float = Field(default=60.0, gt=0)
    llm_max_retries: int = Field(default=2, ge=0, le=5)
    llm_retry_backoff_seconds: float = Field(default=0.3, ge=0, le=10)
    llm_default_max_tokens: int = Field(default=2000, ge=500)

    internal_api_token: str = DEFAULT_INTERNAL_API_TOKEN

    approval_ttl_seconds: int = Field(default=86_400, gt=0)
    replay_buffer_size: int = Field(default=500, gt=10)
    event_page_size: int = Field(default=200, gt=0)
    #: How often the agent may start a run *on its own* from an obligation. This caps
    #: unprompted spending only; a run the person starts from the feed is never
    #: rate-limited (§11.4). Only `on_return` and due `scheduled` triggers exist at
    #: all, and the shell is the only caller — there is no push channel to abuse.
    autorun_cooldown_minutes: int = Field(default=30, ge=0)

    def is_production(self) -> bool:
        return self.app_env.strip().lower() in {"prod", "production"}

    def readiness_issues(self) -> list[str]:
        issues: list[str] = []
        if not self.is_production():
            return issues

        token = self.internal_api_token.strip()
        if not token or token == DEFAULT_INTERNAL_API_TOKEN:
            issues.append("INTERNAL_API_TOKEN must be set to a non-default value in production.")
        elif len(token) < MIN_TOKEN_LENGTH:
            issues.append(f"INTERNAL_API_TOKEN must be at least {MIN_TOKEN_LENGTH} characters.")

        provider = self.llm_provider.strip().lower()
        if not provider:
            issues.append("LLM_PROVIDER is required.")
        elif provider not in OPENAI_COMPATIBLE_PROVIDERS | MOCK_PROVIDERS:
            issues.append(f"Unsupported LLM provider: {self.llm_provider}")
        elif provider in MOCK_PROVIDERS:
            issues.append("LLM_PROVIDER must not be mock in production.")
        elif not (self.llm_api_key or "").strip():
            issues.append("LLM_API_KEY is required for non-mock providers.")
        if not self.llm_model.strip():
            issues.append("LLM_MODEL is required.")
        return issues


ProviderKind = Literal["mock", "openai_compatible"]


@lru_cache
def get_settings() -> Settings:
    return Settings()
