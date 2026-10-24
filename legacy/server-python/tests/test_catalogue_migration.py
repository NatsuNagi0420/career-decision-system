"""The catalogue migration, run on its own against a scratch database.

Two facts only a migration can establish: that a database which does not exist yet
reaches the schema the model describes, and that the rows already sitting in `jobs`
when the columns landed come out *marked* rather than dated. The second is where a
back-filled `captured_at` would hide, so it is checked against the constants
`app.db.catalogue` reads — migration SQL and code are pinned to each other here, not
by someone remembering that they match.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from collections.abc import Iterator
from pathlib import Path

import pytest
from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import Engine, make_url, select, text
from sqlalchemy.orm import Session

from app.config import Settings
from app.db import catalogue
from app.db.base import build_engine, ensure_database
from app.db.domain import Job
from app.db.models import Base

SERVER_ROOT = Path(__file__).resolve().parents[1]
CATALOGUE_REVISION = "f495db1845fc"
PROBE_DB = "career_v2_migrate_probe"
NEW_COLUMNS = {
    "captured_at",
    "last_seen_at",
    "expires_at",
    "content_hash",
    "work_type",
    "source_type",
    "quality_flags",
    "batch_id",
}


@pytest.fixture
def probe_url(settings: Settings) -> Iterator[str]:
    """An emptied database for one test to migrate through, then emptied again.

    `render_as_string(hide_password=False)`, not `str()`: a URL's string form masks the
    password as `***`, and the masked one is what the child process and every engine
    built from it would then try to authenticate with.
    """
    url = make_url(settings.test_db_url)._replace(database=PROBE_DB).render_as_string(hide_password=False)
    ensure_database(url)
    _reset(url)
    try:
        yield url
    finally:
        _reset(url)


def _reset(url: str) -> None:
    engine = build_engine(url)
    try:
        Base.metadata.drop_all(engine)
        with engine.begin() as conn:
            conn.exec_driver_sql("DROP TABLE IF EXISTS alembic_version")
    finally:
        engine.dispose()


def _alembic(url: str, *args: str) -> None:
    """Out of process, because `migrations/env.py` takes its target from settings the
    same way the app does. A subprocess with `DB_URL` pointed at the probe is the one
    invocation that cannot accidentally migrate the development database."""
    finished = subprocess.run(
        [sys.executable, "-m", "alembic", *args],
        cwd=SERVER_ROOT,
        env={**os.environ, "DB_URL": url},
        capture_output=True,
        text=True,
        check=False,
    )
    assert finished.returncode == 0, f"alembic {' '.join(args)} failed\n{finished.stdout}\n{finished.stderr}"


def _revision_before_the_catalogue_one() -> str:
    config = Config(str(SERVER_ROOT / "alembic.ini"))
    config.set_main_option("script_location", str(SERVER_ROOT / "migrations"))
    return ScriptDirectory.from_config(config).get_revision(CATALOGUE_REVISION).down_revision


def _indexes(engine: Engine) -> set[frozenset[str]]:
    """Column sets of every unique key on `jobs`."""
    with engine.connect() as conn:
        return {
            frozenset(row[1].split(","))
            for row in conn.execute(
                text(
                    "SELECT index_name, GROUP_CONCAT(column_name ORDER BY seq_in_index) AS cols, MIN(non_unique) AS nu"
                    " FROM information_schema.statistics"
                    " WHERE table_schema = DATABASE() AND table_name = 'jobs'"
                    " GROUP BY index_name"
                )
            )
            if row[2] == 0
        }


def test_a_database_that_does_not_exist_yet_arrives_at_the_new_schema(probe_url: str) -> None:
    _alembic(probe_url, "upgrade", "head")

    engine = build_engine(probe_url)
    with engine.connect() as conn:
        tables = {row[0] for row in conn.exec_driver_sql("SHOW TABLES")}
        columns = {row[0] for row in conn.execute(text("SHOW COLUMNS FROM jobs"))}
        stamped = conn.execute(text("SELECT version_num FROM alembic_version")).scalar()
    engine.dispose()

    assert {"job_import_batches", "job_raw_records"} <= tables
    assert columns >= NEW_COLUMNS
    assert stamped == CATALOGUE_REVISION


def _job_columns(engine: Engine) -> set[str]:
    with engine.connect() as conn:
        return {row[0] for row in conn.execute(text("SHOW COLUMNS FROM jobs"))}


def _tables(engine: Engine) -> set[str]:
    with engine.connect() as conn:
        return {row[0] for row in conn.exec_driver_sql("SHOW TABLES")}


def test_the_catalogue_revision_walks_back_and_forward_again(probe_url: str) -> None:
    """`downgrade` is the recovery path for a batch somebody decides to revert, and it
    is the half of a migration nobody runs until they need it. This one was broken the
    first time it was tried: MySQL 1553 refuses to drop an index a foreign key is still
    riding on, so the ledger table's `batch_id` index has to go with the table."""
    _alembic(probe_url, "upgrade", "head")

    engine = build_engine(probe_url)
    try:
        assert _job_columns(engine) >= NEW_COLUMNS
        _alembic(probe_url, "downgrade", "-1")
        assert not NEW_COLUMNS & _job_columns(engine)
        assert not {"job_import_batches", "job_raw_records"} & _tables(engine)

        _alembic(probe_url, "upgrade", "head")
        assert _job_columns(engine) >= NEW_COLUMNS
        assert {"job_import_batches", "job_raw_records"} <= _tables(engine)
    finally:
        engine.dispose()


def test_the_dedup_key_is_unique_and_the_old_pair_still_is_not(probe_url: str) -> None:
    _alembic(probe_url, "upgrade", "head")

    engine = build_engine(probe_url)
    try:
        unique = _indexes(engine)
    finally:
        engine.dispose()

    assert frozenset({"content_hash"}) in unique
    # 800 rows with 799 distinct codes: a key on the old pair would have broken the
    # import, and nothing since has made it a fact about the market rather than about
    # one snapshot of it.
    assert not {pair for pair in unique if {"source_job_code", "source_platform"} <= pair}


def test_rows_that_were_already_there_are_marked_and_left_without_a_date(probe_url: str) -> None:
    _alembic(probe_url, "upgrade", _revision_before_the_catalogue_one())

    engine = build_engine(probe_url)
    with engine.begin() as conn:
        conn.exec_driver_sql(
            "INSERT INTO jobs (source_platform, source_job_code, title, description, status, experience_level)"
            " VALUES ('zhaopin','ZP-1','数据分析师','取数、搭看板','active',NULL),"
            " ('zhaopin','ZP-2','测试工程师','','active','1-3年'),"
            " ('seed','seed-1','前端工程师','服务端开发','active','3-5年')"
        )
    engine.dispose()

    _alembic(probe_url, "upgrade", "head")

    engine = build_engine(probe_url)
    with engine.connect() as conn:
        rows = {
            row[0]: row[1:]
            for row in conn.execute(
                text(
                    "SELECT source_job_code, source_type, work_type, quality_flags, captured_at, expires_at, content_hash"
                    " FROM jobs ORDER BY id"
                )
            )
        }
    engine.dispose()

    assert set(rows) == {"ZP-1", "ZP-2", "seed-1"}
    assert {code: (row[0], row[1], set(json.loads(row[2]))) for code, row in rows.items()} == {
        "ZP-1": (
            catalogue.LEGACY_SOURCE_TYPE,
            "unknown",
            {catalogue.UNDATED_FLAG, catalogue.NO_EXPERIENCE_FLAG},
        ),
        "ZP-2": (
            catalogue.LEGACY_SOURCE_TYPE,
            "unknown",
            {catalogue.UNDATED_FLAG, catalogue.NO_DESCRIPTION_FLAG},
        ),
        "seed-1": (catalogue.LEGACY_SOURCE_TYPE, "unknown", {catalogue.UNDATED_FLAG}),
    }
    # Nothing was invented to fill these in: no capture date, so nothing can expire,
    # and no payload survives to hash.
    assert all(row[3] is None and row[4] is None and row[5] is None for row in rows.values())


def test_the_migrated_database_serves_the_same_rules_as_the_model_built_one(probe_url: str) -> None:
    """The migration and `Base.metadata` describe one schema from two directions. A row
    the ORM reads out of the migrated database has to answer to the same helpers as one
    it reads out of a `create_all` database, or the next slice gets written against a
    shape production does not have."""
    _alembic(probe_url, "upgrade", "head")

    engine = build_engine(probe_url)
    try:
        with engine.begin() as conn:
            conn.exec_driver_sql(
                "INSERT INTO jobs (source_platform, title, description, status, work_type, quality_flags, source_type)"
                f" VALUES ('zhaopin','数据分析师','取数、搭看板','active','unknown','[\"{catalogue.UNDATED_FLAG}\"]',"
                f"'{catalogue.LEGACY_SOURCE_TYPE}')"
            )
        with Session(engine) as session:
            job = session.scalars(select(Job)).one()
            assert catalogue.is_legacy(job)
            assert catalogue.is_retrieval_ready(session, job)
            assert not catalogue.is_student_main_ready(session, job)
    finally:
        engine.dispose()
