"""青穗集 · Alembic 入口。备份表 zz_bak_* 不参与漂移比较，也不生成删除迁移。"""

from __future__ import annotations

from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

from app.config import get_settings
from app.db import domain, models  # noqa: F401  # registers every table on Base.metadata
from app.db.base import assert_safe_target, ensure_database
from app.db.models import Base

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def include_object(obj, name, type_, reflected, compare_to) -> bool:
    """Keep operator backups out of autogenerate.

    `alembic check` otherwise reports twenty zz_bak_* tables as extra and wants
    remove_table. Those copies are not part of the schema; deleting them to
    green the gate would throw away recoverable data.
    """
    del obj, reflected, compare_to
    return not (type_ == "table" and str(name).startswith("zz_bak_"))


def _url() -> str:
    url = get_settings().db_url
    # Migrations are the one place where an accidental target is unrecoverable.
    assert_safe_target(url)
    return url


def run_migrations_offline() -> None:
    context.configure(
        url=_url(),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
        include_object=include_object,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    configuration = config.get_section(config.config_ini_section) or {}
    url = _url()
    ensure_database(url)
    configuration["sqlalchemy.url"] = url
    connectable = engine_from_config(configuration, prefix="sqlalchemy.", poolclass=pool.NullPool)
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
            include_object=include_object,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
