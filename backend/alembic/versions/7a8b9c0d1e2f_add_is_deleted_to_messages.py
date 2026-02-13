"""add is_deleted to messages for soft deletion

Revision ID: 7a8b9c0d1e2f
Revises: 3b0066816e54
Create Date: 2026-02-13 13:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '7a8b9c0d1e2f'
down_revision: Union[str, Sequence[str], None] = '3b0066816e54'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add soft-delete marker to messages."""
    op.add_column(
        'messages',
        sa.Column('is_deleted', sa.Boolean(), nullable=False, server_default=sa.text('false')),
    )
    op.create_index('idx_messages_deleted', 'messages', ['chat_id', 'is_deleted'])


def downgrade() -> None:
    """Remove soft-delete marker from messages."""
    op.drop_index('idx_messages_deleted', table_name='messages')
    op.drop_column('messages', 'is_deleted')
