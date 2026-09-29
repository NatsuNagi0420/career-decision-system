"""Rules of the job evidence library (docs/v2/JOB_CATALOGUE_PIPELINE.md, stage A).

Data layer only, on purpose: what a row's provenance marks mean, which rows a query
may return, and what happens when an incoming payload hashes to something already
stored. There is no ingest entry point, no agent-facing tool and no endpoint here —
the later slices have to call into this module rather than restate the rules.

Two hard edges the tests hold down:

  * the imported 2025 slice has no capture date and nothing to expire against, so it
    is not falsifiable and never enters the student-facing main search. It stays
    readable as an undated social-recruitment reference, which is what it is.
  * identity is `content_hash` over the stored payload, not the title: two employers
    both post 数据分析师 and must not merge, while the same employer reposting with a
    changed salary line must not create a second live row either.
"""

from __future__ import annotations

import hashlib
from datetime import datetime

from sqlalchemy import ColumnElement, Select, or_, select
from sqlalchemy.orm import Session

from app.db.domain import BATCH_SOURCE_TYPES, Job, JobImportBatch
from app.db.models import utcnow

#: The bucket the pre-catalogue import lands in: rows we hold but cannot date.
LEGACY_SOURCE_TYPE = "legacy_zhaopin_2025"
UNDATED_FLAG = "undated"
NO_EXPERIENCE_FLAG = "no_experience"
NO_DESCRIPTION_FLAG = "no_description"

#: What `record_incoming_job` did with the draft it was handed.
MERGED = "merged"
INSERTED = "inserted"
SUPERSEDED_AND_INSERTED = "superseded_and_inserted"


def normalize_payload(payload: str) -> str:
    """The exact text a raw record stores. Only the surrounding whitespace goes: who
    copied a JD should not decide whether its repost counts as new content."""
    return payload.strip()


def content_hash_of(payload: str) -> str:
    """SHA-256 of the stored payload, so the hash always re-derives from the row that
    carries it — hash `normalize_payload(x)`, never `x` itself."""
    return hashlib.sha256(normalize_payload(payload).encode("utf-8")).hexdigest()


def is_legacy(job: Job) -> bool:
    return job.source_type == LEGACY_SOURCE_TYPE


def _ready_conditions(*, now: datetime) -> list[ColumnElement[bool]]:
    """Rows an agent may read at all: alive, and not past a deadline it owns."""
    return [
        Job.status == "active",
        or_(Job.expires_at.is_(None), Job.expires_at > now),
    ]


def retrieval_ready_jobs(*, now: datetime | None = None) -> Select[tuple[Job]]:
    """Everything still claimable, including the undated legacy slice.

    This is the *reference* set: comparing 社招 against 实习 is a legitimate question and
    answering it needs the old rows. What it must not do is pose as the market a
    student is being told about — that is `student_main_jobs`.
    """
    return select(Job).where(*_ready_conditions(now=now or utcnow()))


def student_main_jobs(*, now: datetime | None = None) -> Select[tuple[Job]]:
    """The student main search: every row here can be falsified and says when it was true.

    `captured_at` and `expires_at` are both required, not just "unexpired". A row with
    no capture date has no freshness claim to check, and a row with no expiry cannot be
    retired — which is the same as silently trusting it forever. The imported slice
    fails both tests, so it drops out without anyone having to remember to exclude it
    by name.
    """
    return select(Job).where(
        *_ready_conditions(now=now or utcnow()),
        Job.captured_at.is_not(None),
        Job.expires_at.is_not(None),
    )


def is_retrieval_ready(session: Session, job: Job, *, now: datetime | None = None) -> bool:
    return _matches(session, job, retrieval_ready_jobs(now=now))


def is_student_main_ready(session: Session, job: Job, *, now: datetime | None = None) -> bool:
    """Asked through the real statement, never a Python restatement of it.

    A mirror predicate would be a second source of truth, and "same rule, two places"
    is how this project's rules have kept drifting.
    """
    return _matches(session, job, student_main_jobs(now=now))


def _matches(session: Session, job: Job, stmt: Select[tuple[Job]]) -> bool:
    if job.id is None:
        raise ValueError("this asks about a stored row; flush the draft first")
    return session.scalar(stmt.where(Job.id == job.id)) is not None


def find_job_by_content_hash(session: Session, content_hash: str) -> Job | None:
    """The row holding this exact text, whatever its status.

    Not filtered on `active`: `content_hash` identifies a piece of content, and the
    unique index refuses a second row whether or not the first was superseded. Looking
    the row up the way the index sees it is what turns a repeat sighting into "we saw
    this again" instead of an IntegrityError inside the ingest loop.
    """
    return session.scalar(select(Job).where(Job.content_hash == content_hash))


def find_live_jobs_with_same_source_code(
    session: Session, *, source_platform: str, source_job_code: str | None
) -> list[Job]:
    """Live rows posted under the same listing id.

    Non-unique on purpose — the imported snapshot had 800 rows with 799 distinct codes,
    so this is a hint that "the same listing moved", not a key anyone may enforce.
    """
    if not source_job_code:
        return []
    return list(
        session.scalars(
            select(Job).where(
                Job.source_platform == source_platform,
                Job.source_job_code == source_job_code,
                Job.status == "active",
            )
        )
    )


def record_incoming_job(session: Session, *, draft: Job, content_hash: str, now: datetime | None = None) -> tuple[Job, str]:
    """Apply the dedup rule to one incoming row.

    `draft` must be an unattached instance the caller built: this function decides
    whether it ever reaches the table. Same hash → the draft is dropped and the stored
    row's `last_seen_at` moves. Same source code with different text → the live rows go
    `superseded` (kept for audit, invisible to retrieval) and the draft is inserted.

    Returns the row that now stands and which of those happened, so a batch can report
    read/merged/inserted/superseded counts instead of asserting them.
    """
    moment = now or utcnow()
    existing = find_job_by_content_hash(session, content_hash)
    if existing is not None:
        existing.last_seen_at = moment
        session.add(existing)
        return existing, MERGED

    stale_rows = find_live_jobs_with_same_source_code(
        session, source_platform=draft.source_platform, source_job_code=draft.source_job_code
    )
    for stale in stale_rows:
        stale.status = "superseded"

    draft.content_hash = content_hash
    if draft.last_seen_at is None:
        draft.last_seen_at = moment
    session.add(draft)
    return draft, SUPERSEDED_AND_INSERTED if stale_rows else INSERTED


def new_import_batch(
    *,
    source_type: str,
    source_label: str = "",
    license_note: str = "",
    operator_user_id: int | None = None,
) -> JobImportBatch:
    """Start a batch. A `dump` with no stated right to store it is refused here.

    The check belongs at construction because an unlicensed dump is not a mistake
    anyone notices afterwards — its rows look exactly like licensed ones.
    """
    if source_type not in BATCH_SOURCE_TYPES:
        raise ValueError(f"unknown batch source_type: {source_type} (allowed: {', '.join(BATCH_SOURCE_TYPES)})")
    if source_type == "dump" and not license_note.strip():
        raise ValueError("dump 批次必须写明授权/来源说明（license_note）")
    return JobImportBatch(
        source_type=source_type,
        source_label=source_label,
        license_note=license_note,
        operator_user_id=operator_user_id,
        status="running",
    )
