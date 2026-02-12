"""add_compaction_status_column

Revision ID: k4l5m6n7o8p9
Revises: j3k4l5m6n7o8
Create Date: 2026-02-11 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'k4l5m6n7o8p9'
down_revision: Union[str, Sequence[str], None] = 'j3k4l5m6n7o8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add status column to context_compactions and backfill existing rows."""
    op.add_column(
        'context_compactions',
        sa.Column('status', sa.String(50), nullable=False, server_default='completed'),
    )
    # Backfill: rows whose summary starts with '[Pending' are still pending
    op.execute(
        "UPDATE context_compactions SET status = 'pending' "
        "WHERE summary LIKE '[Pending%'"
    )


def downgrade() -> None:
    """Remove status column from context_compactions."""
    op.drop_column('context_compactions', 'status')
