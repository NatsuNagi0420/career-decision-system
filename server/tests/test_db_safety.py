"""The one boundary that can destroy the developer's machine: which database we touch.

`ensure_database` issues DDL, and an identifier cannot be a bound parameter, so the
name check here is the only thing between a typo in `.env` and a `CREATE DATABASE`.
"""

from __future__ import annotations

import pytest

from app.db.base import assert_safe_target, ensure_database, parse_db_name


def test_only_the_career_v2_namespace_is_ever_addressable() -> None:
    assert parse_db_name("mysql+pymysql://u:p@127.0.0.1:3306/career_v2?charset=utf8mb4") == "career_v2"
    assert parse_db_name("mysql+pymysql://u:p@127.0.0.1:3306/career_v2_test") == "career_v2_test"

    for name in ("career_decision_system", "career_db", "mysql", "test"):
        with pytest.raises(RuntimeError, match="only career_v2\\* is allowed"):
            assert_safe_target(f"mysql+pymysql://u:p@127.0.0.1:3306/{name}")


def test_a_name_that_would_escape_the_ddl_identifier_is_refused() -> None:
    # These payloads deliberately avoid a `/` after the database name: `parse_db_name`
    # takes everything after the last slash, so a slash would make the prefix guard
    # catch it first and the create-time guard would never be exercised.
    for url in (
        "mysql+pymysql://u:p@127.0.0.1:3306/career_v2`x",
        "mysql+pymysql://u:p@127.0.0.1:3306/career_v2 ; drop table users",
    ):
        assert_safe_target(url)  # the looser guard lets both through...
        with pytest.raises(RuntimeError, match="refusing to create database"):
            ensure_database(url)  # ...the one that interpolates into DDL does not


def test_creating_an_existing_database_is_a_no_op(settings) -> None:
    ensure_database(settings.db_url)
    ensure_database(settings.db_url)
