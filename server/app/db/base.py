from __future__ import annotations

import re
from collections.abc import Iterator
from contextlib import contextmanager

from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from app.config import get_settings

_PROTECTED_DB = re.compile(r"^career_v2")


def parse_db_name(url: str) -> str:
    tail = url.split("///", 1)[-1] if "///" in url else url.rsplit("/", 1)[-1]
    return tail.split("?", 1)[0]


def assert_safe_target(url: str) -> None:
    """Refuse to migrate/create anything outside the career_v2* namespace."""
    name = parse_db_name(url)
    if not _PROTECTED_DB.match(name):
        raise RuntimeError(f"refusing to operate on database `{name}`; only career_v2* is allowed")


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
