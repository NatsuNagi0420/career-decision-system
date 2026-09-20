"""versioned comparison cells and the artifact supersede chain

The matrix could only ever hold one answer: `uq_comparison_cell` keyed a cell by
(project, criterion, candidate) with no round, so a second conclusion had to overwrite
the first — which is precisely what "用户能看懂当前结论为什么发生变化" forbids. And
`Artifact.version` is an optimistic lock, not a version chain, so a recomputed draft
lost the text it replaced.

This adds the two things the loop needs to say "last week it read X, now it reads Y":
a round on each cell with separate supporting/opposing references, and
`artifacts.supersedes_id` pointing at the artifact this one replaces.

Revision ID: 3f9a41c7de05
Revises: 7c2f1a9d4b83
Create Date: 2026-09-21 02:56:41.882310
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = '3f9a41c7de05'
down_revision: str | None = '7c2f1a9d4b83'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Both tables are empty here — they have had no writer in `app/` until this slice,
    # which is the whole reason this migration can add NOT NULL columns plainly.
    op.add_column('comparison_results', sa.Column('round_no', sa.Integer(), nullable=False))
    op.add_column('comparison_results', sa.Column('request_id', sa.String(length=160), nullable=False))
    op.add_column('comparison_results', sa.Column('counter_refs', sa.JSON(), nullable=False))
    op.drop_constraint('uq_comparison_cell', 'comparison_results', type_='unique')
    op.create_unique_constraint(
        'uq_comparison_cell_round', 'comparison_results', ['project_id', 'criterion_id', 'candidate_id', 'round_no']
    )
    op.create_unique_constraint('uq_comparison_request', 'comparison_results', ['request_id'])

    # Column, then index, then the foreign key: MySQL backs a foreign key with an index
    # of its own if none is usable yet, and that extra key would make the reflected
    # schema stop matching the model's `__table_args__`.
    op.add_column('artifacts', sa.Column('supersedes_id', sa.String(length=32), nullable=True))
    op.create_index('ix_artifacts_supersedes_id', 'artifacts', ['supersedes_id'], unique=False)
    op.create_foreign_key(
        None, 'artifacts', 'artifacts', ['supersedes_id'], ['id'], ondelete='SET NULL'
    )


def downgrade() -> None:
    op.drop_constraint('artifacts_supersedes_id_fkey', 'artifacts', type_='foreignkey')
    op.drop_column('artifacts', 'supersedes_id')
    op.drop_index('ix_artifacts_supersedes_id', table_name='artifacts')

    op.drop_constraint('uq_comparison_request', 'comparison_results', type_='unique')
    op.create_unique_constraint('uq_comparison_cell', 'comparison_results', ['project_id', 'criterion_id', 'candidate_id'])
    op.drop_constraint('uq_comparison_cell_round', 'comparison_results', type_='unique')
    op.drop_column('comparison_results', 'counter_refs')
    op.drop_column('comparison_results', 'request_id')
    op.drop_column('comparison_results', 'round_no')
