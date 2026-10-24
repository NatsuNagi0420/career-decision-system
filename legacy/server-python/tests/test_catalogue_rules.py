"""Stage A rules of the job evidence library, against a real database.

Two things the later slices must not be free to redefine: which rows a student-facing
search may answer from, and what a repeat sighting of the same text does to the table.
Both are asserted through the statements the rules module returns, because a rule that
lives only in a docstring is the one someone restates differently later.
"""

from __future__ import annotations

import hashlib
from collections.abc import Iterator
from datetime import datetime, timedelta

import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, sessionmaker

from app.db import catalogue
from app.db.domain import Job

PAST = datetime(2026, 3, 1)
FUTURE = datetime(2026, 12, 1)
#: A row as the migration leaves the imported slice: alive, with nothing to say about
#: when it was true.
LEGACY = {
    "source_type": catalogue.LEGACY_SOURCE_TYPE,
    "quality_flags": [catalogue.UNDATED_FLAG, catalogue.NO_EXPERIENCE_FLAG],
}
#: A row as a batch is expected to write one: dated, with a deadline to retire by.
DATED = {
    "source_type": "school",
    "work_type": "intern",
    "captured_at": PAST,
    "expires_at": FUTURE,
}


@pytest.fixture
def session(session_factory: sessionmaker[Session]) -> Iterator[Session]:
    with session_factory() as opened:
        yield opened


def _stored(session: Session, **overrides: object) -> Job:
    fields: dict = {"title": "数据分析师", "source_platform": "zhaopin", "description": "取数、搭看板、出周报", "city": "广州"}
    fields.update(overrides)
    job = Job(**fields)
    session.add(job)
    session.flush()
    return job


def _draft(**overrides: object) -> Job:
    fields: dict = {"title": "数据分析师", "source_platform": "zhaopin", "description": "取数、搭看板"}
    fields.update(overrides)
    return Job(**fields)


def test_the_undated_slice_stays_a_reference_and_never_the_student_search(session: Session) -> None:
    legacy = _stored(session, **LEGACY)

    assert catalogue.is_legacy(legacy)
    assert catalogue.is_retrieval_ready(session, legacy, now=FUTURE)
    assert not catalogue.is_student_main_ready(session, legacy, now=FUTURE)


def test_a_dated_row_with_a_deadline_answers_both(session: Session) -> None:
    dated = _stored(session, **DATED)

    assert catalogue.is_retrieval_ready(session, dated, now=FUTURE - timedelta(days=1))
    assert catalogue.is_student_main_ready(session, dated, now=FUTURE - timedelta(days=1))


def test_a_row_past_its_deadline_is_invisible_to_every_query(session: Session) -> None:
    """Asking after `expires_at` is the whole point of storing it."""
    dated = _stored(session, **DATED)

    assert not catalogue.is_retrieval_ready(session, dated, now=FUTURE)
    assert not catalogue.is_student_main_ready(session, dated, now=FUTURE)


def test_a_row_that_cannot_be_retired_cannot_be_trusted_forever(session: Session) -> None:
    """`captured_at` alone is not falsifiable. With no deadline the row is simply
    current forever, which is the claim the undated import already cannot make."""
    no_expiry = _stored(session, source_type="school", captured_at=PAST)

    assert catalogue.is_retrieval_ready(session, no_expiry, now=FUTURE)
    assert not catalogue.is_student_main_ready(session, no_expiry, now=FUTURE)


def test_a_row_with_a_deadline_but_no_capture_date_still_cannot_answer(session: Session) -> None:
    """The two conditions are not one condition wearing a coat. A row that knows when
    it stops being valid but not when it was seen can be retired, yet the sample card
    has no 样本日期 to print — and "采集时间未知" is not a thing the agent gets to say
    about a row it is quoting as market evidence."""
    blind = _stored(session, source_type="school", expires_at=FUTURE)

    assert catalogue.is_retrieval_ready(session, blind, now=PAST)
    assert not catalogue.is_student_main_ready(session, blind, now=PAST)


def test_a_superseded_row_is_gone_from_both_even_while_still_in_date(session: Session) -> None:
    retired = _stored(session, status="superseded", **DATED)

    assert not catalogue.is_retrieval_ready(session, retired, now=PAST)
    assert not catalogue.is_student_main_ready(session, retired, now=PAST)


def test_the_two_queries_differ_by_falsifiability_not_by_row_count(session: Session) -> None:
    intern = _stored(session, title="数据分析实习生", **DATED)
    undated = _stored(session, title="数据分析师", **LEGACY)
    _stored(session, title="已过期的岗", source_type="school", captured_at=PAST, expires_at=PAST + timedelta(days=1))

    on_the_day = PAST + timedelta(days=30)
    assert list(session.scalars(catalogue.student_main_jobs(now=on_the_day))) == [intern]
    assert set(session.scalars(catalogue.retrieval_ready_jobs(now=on_the_day))) == {intern, undated}


def test_the_same_text_twice_is_one_row_and_the_second_sighting_moves_last_seen(session: Session) -> None:
    content_hash = catalogue.content_hash_of("数据分析师（广州）\n任职要求：1. 会用 SQL 取数")

    first, first_action = catalogue.record_incoming_job(session, draft=_draft(), content_hash=content_hash, now=PAST)
    assert first_action == catalogue.INSERTED
    session.flush()

    second, second_action = catalogue.record_incoming_job(
        session, draft=_draft(title="重复的草稿"), content_hash=content_hash, now=FUTURE
    )

    assert second_action == catalogue.MERGED
    assert second is first
    assert first.last_seen_at == FUTURE
    assert len(list(session.scalars(select(Job)))) == 1  # the duplicate draft never reached the table


def test_the_same_listing_with_changed_text_retires_the_row_it_replaces(session: Session) -> None:
    """Dedup keys on content, so a repost with a new salary line is a *new* row — and
    the one it replaces must stop being answerable, not linger as live data."""
    old, old_action = catalogue.record_incoming_job(
        session, draft=_draft(source_job_code="ZP-1", **DATED), content_hash=catalogue.content_hash_of("薪资 9-13k"), now=PAST
    )
    assert old_action == catalogue.INSERTED
    session.flush()

    fresh, fresh_action = catalogue.record_incoming_job(
        session, draft=_draft(source_job_code="ZP-1", **DATED), content_hash=catalogue.content_hash_of("薪资 12-16k"), now=FUTURE
    )

    assert fresh_action == catalogue.SUPERSEDED_AND_INSERTED
    session.flush()  # `status` is a column default, so it exists only once the row does
    assert (old.status, fresh.status) == ("superseded", "active")
    on_the_day = PAST + timedelta(days=30)
    assert not catalogue.is_student_main_ready(session, old, now=on_the_day)
    assert catalogue.is_student_main_ready(session, fresh, now=on_the_day)


def test_a_dated_batch_row_retires_the_undated_row_it_matches(session: Session) -> None:
    """The quiet retirement path for the imported slice: when a batch brings a row for a
    listing the 2025 snapshot already holds, the undated one steps aside. It never had
    a `content_hash` to collide with, so this is the merge rule doing the work."""
    undated = _stored(session, source_job_code="ZP-1", **LEGACY)
    fresh, action = catalogue.record_incoming_job(
        session,
        draft=_draft(source_job_code="ZP-1", **DATED),
        content_hash=catalogue.content_hash_of("薪资 12-16k"),
        now=PAST + timedelta(days=1),
    )

    assert action == catalogue.SUPERSEDED_AND_INSERTED
    session.flush()
    assert (undated.status, fresh.status) == ("superseded", "active")


def test_two_employers_who_wrote_the_same_title_are_two_jobs(session: Session) -> None:
    """The dedup key is not the title: A and B both posting 数据分析师 is a fact about
    the market, and merging them would erase one side of it."""
    a, _ = catalogue.record_incoming_job(
        session, draft=_draft(company="A 公司"), content_hash=catalogue.content_hash_of("A：SQL"), now=PAST
    )
    b, _ = catalogue.record_incoming_job(
        session, draft=_draft(company="B 公司"), content_hash=catalogue.content_hash_of("B：SQL"), now=PAST
    )

    assert a.id != b.id
    assert len(list(session.scalars(select(Job)))) == 2


def test_no_second_row_carries_a_hash_that_is_already_taken(session: Session) -> None:
    """The rule is enforced in the table, not only in the helper: anyone can build a
    `Job` without going through `record_incoming_job`, and the unique index is what
    that path hits."""
    content_hash = catalogue.content_hash_of("同一段正文")
    _stored(session, content_hash=content_hash)

    session.add(Job(title="手写的重复行", source_platform="zhaopin", content_hash=content_hash))
    with pytest.raises(IntegrityError):
        session.flush()
    session.rollback()


def test_the_hash_is_of_the_payload_that_gets_stored() -> None:
    """A paste that gained a trailing newline is the same text; anything else is not.
    Whoever stores a raw record stores `normalize_payload`, or the hash stops
    re-deriving from the row that carries it."""
    assert catalogue.normalize_payload("  取数、搭看板 \n") == "取数、搭看板"
    assert catalogue.content_hash_of("  取数、搭看板 \n") == catalogue.content_hash_of("取数、搭看板")
    assert catalogue.content_hash_of("取数、搭看板") == hashlib.sha256("取数、搭看板".encode()).hexdigest()
    assert catalogue.content_hash_of("取数、搭看板") != catalogue.content_hash_of("取数,搭看板")


def test_a_dump_batch_without_a_stated_right_to_store_it_is_refused() -> None:
    with pytest.raises(ValueError, match="license_note"):
        catalogue.new_import_batch(source_type="dump", source_label="gz-campus-2026q3")

    batch = catalogue.new_import_batch(source_type="dump", license_note="就业办导出，允许校内使用", source_label="gz-campus-2026q3")
    assert batch.status == "running"
    assert batch.license_note.startswith("就业办")


def test_only_the_four_source_types_exist() -> None:
    """`crawler` is not one of them, and a batch cannot claim to be."""
    assert catalogue.new_import_batch(source_type="user_paste").source_type == "user_paste"
    with pytest.raises(ValueError, match="unknown batch source_type"):
        catalogue.new_import_batch(source_type="crawler")


def test_a_paste_batch_needs_no_licence_note_because_the_user_offered_it(session: Session) -> None:
    batch = catalogue.new_import_batch(source_type="user_paste", source_label="学生粘贴")
    session.add(batch)
    session.flush()

    assert batch.id is not None


def test_reverting_a_batch_does_not_erase_the_rows_it_wrote(session: Session) -> None:
    """`jobs.batch_id` is SET NULL on purpose: two batches can each have sighted the
    same text, and deleting the earlier one must not silently remove a job the later
    one still vouches for. A revert that really means it deletes rows by id — a
    decision somebody has to make explicitly."""
    batch = catalogue.new_import_batch(source_type="school", license_note="学校就业网公开页", source_label="2026q3")
    session.add(batch)
    session.flush()
    job = _stored(session, batch_id=batch.id, **DATED)

    session.delete(batch)
    session.flush()
    session.refresh(job)  # SET NULL happens in the server; the Python copy is stale until read back

    assert job.batch_id is None
    assert session.scalar(select(Job.id).where(Job.id == job.id)) == job.id
