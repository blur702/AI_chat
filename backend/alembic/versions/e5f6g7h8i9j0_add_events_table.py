"""add_events_table

Revision ID: e5f6g7h8i9j0
Revises: d4e5f6g7h8i9
Create Date: 2026-02-03 06:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'e5f6g7h8i9j0'
down_revision: Union[str, Sequence[str], None] = 'd4e5f6g7h8i9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create events table for EventBus persistence."""
    # Create events table
    op.create_table(
        'events',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False,
                  server_default=sa.text('uuid_generate_v4()')),
        sa.Column('event_type', sa.String(100), nullable=False),
        sa.Column('event_data', postgresql.JSONB(astext_type=sa.Text()), nullable=False,
                  server_default='{}'),
        sa.Column('severity', sa.String(50), nullable=False, server_default='info'),
        sa.Column('source', sa.String(100), nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('chat_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('resource_id', sa.String(255), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.func.now(), onupdate=sa.func.now()),
        sa.PrimaryKeyConstraint('id')
    )

    # Create foreign key constraints
    op.create_foreign_key(
        'fk_events_user_id',
        'events',
        'users',
        ['user_id'],
        ['id'],
        ondelete='SET NULL'
    )

    op.create_foreign_key(
        'fk_events_chat_id',
        'events',
        'chats',
        ['chat_id'],
        ['id'],
        ondelete='SET NULL'
    )

    # Create indexes for efficient querying
    op.create_index('idx_events_event_type', 'events', ['event_type'])
    op.create_index('idx_events_type_created', 'events', ['event_type', 'created_at'])
    op.create_index('idx_events_severity', 'events', ['severity'])
    op.create_index('idx_events_user_id', 'events', ['user_id'])
    op.create_index('idx_events_chat_id', 'events', ['chat_id'])
    op.create_index('idx_events_created_at', 'events', ['created_at'])


def downgrade() -> None:
    """Drop events table."""
    # Drop indexes in reverse order
    op.drop_index('idx_events_created_at', table_name='events')
    op.drop_index('idx_events_chat_id', table_name='events')
    op.drop_index('idx_events_user_id', table_name='events')
    op.drop_index('idx_events_severity', table_name='events')
    op.drop_index('idx_events_type_created', table_name='events')
    op.drop_index('idx_events_event_type', table_name='events')

    # Drop foreign key constraints
    op.drop_constraint('fk_events_chat_id', 'events', type_='foreignkey')
    op.drop_constraint('fk_events_user_id', 'events', type_='foreignkey')

    # Drop table
    op.drop_table('events')
