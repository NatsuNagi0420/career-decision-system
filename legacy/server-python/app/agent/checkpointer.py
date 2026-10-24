from __future__ import annotations

import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from langgraph.checkpoint.base import BaseCheckpointSaver
from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver

from app.config import Settings

ENV_PROVIDER = "CHECKPOINTER_PROVIDER"


class UnsupportedCheckpointer(RuntimeError):
    pass


@asynccontextmanager
async def open_checkpointer(settings: Settings) -> AsyncIterator[BaseCheckpointSaver]:
    """Checkpoints live apart from business data on purpose.

    MySQL stays the system of record for users, runs, artifacts and approvals;
    the checkpointer is resumable execution state that may be discarded. See
    §14-S2 for why the MySQL saver was rejected rather than merely downgraded.
    """
    provider = os.environ.get(ENV_PROVIDER, "sqlite").strip().lower()

    if provider == "sqlite":
        path = Path(settings.checkpoint_path)
        path.parent.mkdir(parents=True, exist_ok=True)
        async with AsyncSqliteSaver.from_conn_string(str(path)) as saver:
            yield saver
        return

    if provider in {"mysql", "postgres"}:
        raise UnsupportedCheckpointer(
            f"CHECKPOINTER_PROVIDER={provider} is not available: the MySQL saver is third-party, "
            "needs MySQL >= 8.0.13, and leaves a half-created schema behind on failure (§14-S2). "
            "Use sqlite until a conformance-passing backend is chosen."
        )

    raise UnsupportedCheckpointer(f"unknown CHECKPOINTER_PROVIDER: {provider}")
