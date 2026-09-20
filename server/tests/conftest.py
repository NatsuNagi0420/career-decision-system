from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path

import pytest
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from app.config import Settings
from app.db import domain  # noqa: F401  # registers domain tables on Base.metadata
from app.db.base import build_engine, make_session_factory
from app.db.models import Base


@pytest.fixture(scope="session")
def settings(tmp_path_factory: pytest.TempPathFactory) -> Settings:
    root: Path = tmp_path_factory.mktemp("career-v2")
    return Settings(
        app_env="test",
        db_url="mysql+pymysql://root:root@127.0.0.1:3306/career_v2_test?charset=utf8mb4",
        test_db_url="mysql+pymysql://root:root@127.0.0.1:3306/career_v2_test?charset=utf8mb4",
        checkpoint_path=str(root / "checkpoints.sqlite"),
        llm_provider="mock",
        llm_model="mock-career-planner",
        internal_api_token="test-token-value-long-enough",
        approval_ttl_seconds=3600,
    )


@pytest.fixture(scope="session")
def engine(settings: Settings) -> Iterator[Engine]:
    from app.db.base import assert_safe_target

    assert_safe_target(settings.db_url)
    built = build_engine(settings.db_url)
    Base.metadata.drop_all(built)
    Base.metadata.create_all(built)
    try:
        yield built
    finally:
        Base.metadata.drop_all(built)
        built.dispose()


@pytest.fixture
def session_factory(engine: Engine) -> sessionmaker[Session]:
    return make_session_factory(engine)


@pytest.fixture(autouse=True)
def truncate_all(engine: Engine) -> Iterator[None]:
    yield
    with engine.begin() as conn:
        # Fail loudly instead of hanging: a leaked session holding a read view
        # would otherwise make TRUNCATE wait on a metadata lock indefinitely.
        conn.exec_driver_sql("SET SESSION lock_wait_timeout = 5")
        conn.exec_driver_sql("SET SESSION innodb_lock_wait_timeout = 5")
        conn.exec_driver_sql("SET FOREIGN_KEY_CHECKS = 0")
        for table in Base.metadata.sorted_tables:
            conn.exec_driver_sql(f"TRUNCATE TABLE `{table.name}`")
        conn.exec_driver_sql("SET FOREIGN_KEY_CHECKS = 1")


@pytest.fixture
def checkpoint_path(settings: Settings, tmp_path: Path) -> str:
    return str(tmp_path / "checkpoints.sqlite")
