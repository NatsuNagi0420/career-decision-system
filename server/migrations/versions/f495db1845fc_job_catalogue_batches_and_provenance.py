"""job catalogue batches and provenance

The library could not be replaced or retired: 808 rows had been imported once from a
2025 zhaopin slice, the table carried no capture date, no expiry, no content identity
and no record of which write put a row there. That makes "the market looks like this"
unfalsifiable, so every later slice — a batch import, a student's pasted JD, a
retrieval tool — would have had nowhere to put its provenance and no way to be
believed more than the undated rows.

This adds the ledger (`job_import_batches`, `job_raw_records`), the provenance columns
on `jobs`, and marks the imported slice as what it is: `legacy_zhaopin_2025`, flagged
`undated`, with `captured_at` left NULL rather than back-filled with a plausible date.
`app/db/catalogue.py` is the rule those marks feed; the rows themselves stay readable
as a social-recruitment reference.

Revision ID: f495db1845fc
Revises: 3f9a41c7de05
Create Date: 2026-09-21 11:39:49.325331
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import mysql

revision: str = 'f495db1845fc'
down_revision: str | None = '3f9a41c7de05'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

#: `app.db.models.Timestamp`, restated because a migration must not import the model
#: it is about to change. Microseconds, or a timeline of the agent working collapses
#: onto whole seconds.
Timestamp = sa.DateTime().with_variant(mysql.DATETIME(fsp=6), 'mysql')


def upgrade() -> None:
    op.create_table(
        'job_import_batches',
        sa.Column('id', sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column('operator_user_id', sa.BigInteger(), nullable=True),
        sa.Column('source_type', sa.String(length=24), nullable=False),
        sa.Column('source_label', sa.String(length=96), nullable=False),
        sa.Column('license_note', sa.String(length=500), nullable=False),
        sa.Column('stats_json', sa.JSON(), nullable=False),
        sa.Column('status', sa.String(length=16), nullable=False),
        sa.Column('created_at', Timestamp, nullable=False),
        sa.Column('finished_at', Timestamp, nullable=True),
        sa.ForeignKeyConstraint(['operator_user_id'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_table(
        'job_raw_records',
        sa.Column('id', sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column('batch_id', sa.BigInteger(), nullable=False),
        sa.Column('payload', sa.Text(), nullable=False),
        sa.Column('content_hash', sa.String(length=64), nullable=False),
        sa.Column('source_url', sa.String(length=500), nullable=True),
        sa.Column('captured_at', Timestamp, nullable=False),
        sa.Column('fetch_status', sa.String(length=16), nullable=False),
        sa.ForeignKeyConstraint(['batch_id'], ['job_import_batches.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_job_raw_records_batch_id'), 'job_raw_records', ['batch_id'], unique=False)
    op.create_index(op.f('ix_job_raw_records_content_hash'), 'job_raw_records', ['content_hash'], unique=False)

    op.add_column('jobs', sa.Column('captured_at', Timestamp, nullable=True))
    op.add_column('jobs', sa.Column('last_seen_at', Timestamp, nullable=True))
    op.add_column('jobs', sa.Column('expires_at', Timestamp, nullable=True))
    # The dedup key. Unique, because it is the identity of a piece of text rather than
    # an attribute of a listing; NULL is unaffected, and every imported row's is one —
    # there is no payload here to hash, so no hash gets invented.
    op.add_column('jobs', sa.Column('content_hash', sa.String(length=64), nullable=True))
    op.create_index(op.f('ix_jobs_content_hash'), 'jobs', ['content_hash'], unique=True)
    op.add_column('jobs', sa.Column('work_type', sa.String(length=16), nullable=False))
    op.add_column('jobs', sa.Column('source_type', sa.String(length=40), nullable=True))
    op.add_column('jobs', sa.Column('quality_flags', sa.JSON(), nullable=False))
    # Column, index, then the foreign key: MySQL backs a foreign key with an index of
    # its own when none is usable yet, and that extra key would make the reflected
    # schema stop matching the model's declaration.
    op.add_column('jobs', sa.Column('batch_id', sa.BigInteger(), nullable=True))
    op.create_index(op.f('ix_jobs_batch_id'), 'jobs', ['batch_id'], unique=False)
    op.create_foreign_key(None, 'jobs', 'job_import_batches', ['batch_id'], ['id'], ondelete='SET NULL')

    _mark_the_imported_slice_as_legacy()


def _mark_the_imported_slice_as_legacy() -> None:
    """Everything already in `jobs` is the one-off v1 import: 800 zhaopin rows plus 8
    seed rows, none of them datable.

    Marked, not dated. `work_type` becomes `unknown` rather than `fulltime` because
    nothing in those rows was ever read for that question, and the flags record what
    is actually missing per row (a run of empty `experience_level` is the reason the
    snapshot cannot answer "需要几年经验" at all).
    """
    op.execute(
        """
        UPDATE jobs
        SET source_type = 'legacy_zhaopin_2025',
            work_type = 'unknown',
            quality_flags = JSON_MERGE_PRESERVE(
                JSON_ARRAY('undated'),
                IF(experience_level IS NULL OR experience_level = '',
                   JSON_ARRAY('no_experience'), JSON_ARRAY()),
                IF(description IS NULL OR description = '',
                   JSON_ARRAY('no_description'), JSON_ARRAY())
            )
        WHERE source_type IS NULL
        """
    )


def downgrade() -> None:
    op.drop_constraint('jobs_ibfk_1', 'jobs', type_='foreignkey')  # MySQL named it
    op.drop_index(op.f('ix_jobs_batch_id'), table_name='jobs')
    for column in ('batch_id', 'quality_flags', 'source_type', 'work_type'):
        op.drop_column('jobs', column)
    op.drop_index(op.f('ix_jobs_content_hash'), table_name='jobs')
    op.drop_column('jobs', 'content_hash')
    for column in ('expires_at', 'last_seen_at', 'captured_at'):
        op.drop_column('jobs', column)

    op.drop_index(op.f('ix_job_raw_records_content_hash'), table_name='job_raw_records')
    # `ix_job_raw_records_batch_id` is not dropped by name: MySQL 1553 refuses to drop
    # an index a foreign key is riding on, and the table drop below takes it with it.
    op.drop_table('job_raw_records')
    op.drop_table('job_import_batches')
