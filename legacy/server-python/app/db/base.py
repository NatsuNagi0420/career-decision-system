"""青穗集 · 已退休的 Python/MySQL 数据层：仅显式历史恢复时允许启用，现行产品使用 agent.sqlite。"""
from __future__ import annotations

import os
import re
from collections.abc import Iterator
from contextlib import contextmanager

from sqlalchemy import create_engine, make_url
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from app.config import get_settings

_PROTECTED_DB = re.compile(r"^career_v2")
# `assert_safe_target` only checks the prefix, which is enough for connecting but not
# for DDL: the name below is interpolated into a CREATE statement, where it cannot be
# bound as a parameter.
_CREATABLE_DB = re.compile(r"^career_v2[A-Za-z0-9_]*$")


def parse_db_name(url: str) -> str:
    tail = url.split("///", 1)[-1] if "///" in url else url.rsplit("/", 1)[-1]
    return tail.split("?", 1)[0]


def assert_safe_target(url: str) -> None:
    """Refuse to migrate/create anything outside the career_v2* namespace."""
    if os.environ.get("QINGSUIJI_RESTORE_LEGACY_DATABASES") != "1":
        raise RuntimeError("旧 MySQL 数据层已退休；当前主库为 agent/var/agent.sqlite。仅历史恢复可显式设置 QINGSUIJI_RESTORE_LEGACY_DATABASES=1。")
    name = parse_db_name(url)
    if not _PROTECTED_DB.match(name):
        raise RuntimeError(f"refusing to operate on database `{name}`; only career_v2* is allowed")


def ensure_database(url: str) -> None:
    """Create the target database when it does not exist yet.

    Without this a fresh clone cannot follow the README: the first `alembic upgrade
    head` dies on MySQL 1049 "Unknown database".
    """
    assert_safe_target(url)
    name = parse_db_name(url)
    if not _CREATABLE_DB.match(name):
        raise RuntimeError(f"refusing to create database `{name}`")
    # `_replace` is SQLAlchemy's sanctioned way to blank a URL element.
    server_url = make_url(url)._replace(database=None)
    engine = create_engine(server_url, isolation_level="AUTOCOMMIT", future=True)
    try:
        with engine.connect() as conn:
            conn.exec_driver_sql(f"CREATE DATABASE IF NOT EXISTS `{name}` CHARACTER SET utf8mb4")
    finally:
        engine.dispose()


def build_engine(url: str) -> Engine:
    assert_safe_target(url)
    return create_engine(url, pool_pre_ping=True, future=True)


def make_session_factory(engine: Engine) -> sessionmaker[Session]:
    return sessionmaker(bind=engine, expire_on_commit=False, future=True)


@contextmanager
def session_scope(factory: sessionmaker[Session]) -> Iterator[Session]:
    session = factory()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def default_session_factory() -> sessionmaker[Session]:
    return make_session_factory(build_engine(get_settings().db_url))


def default_engine() -> Engine:
    return build_engine(get_settings().db_url)
