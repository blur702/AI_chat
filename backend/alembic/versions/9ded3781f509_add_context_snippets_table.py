"""add_context_snippets_table

Revision ID: 9ded3781f509
Revises: 73febd1355c3
Create Date: 2026-02-15 18:45:18.235823

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '9ded3781f509'
down_revision: Union[str, Sequence[str], None] = '73febd1355c3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table('context_snippets',
    sa.Column('user_id', sa.UUID(), nullable=False),
    sa.Column('name', sa.String(length=255), nullable=False),
    sa.Column('content', sa.Text(), nullable=False),
    sa.Column('description', sa.Text(), nullable=True),
    sa.Column('tags', postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'[]'::jsonb"), nullable=False),
    sa.Column('is_deleted', sa.Boolean(), nullable=False, server_default=sa.text('false')),
    sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('id', sa.UUID(), server_default=sa.text('uuid_generate_v4()'), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index('idx_context_snippets_user_id_not_deleted', 'context_snippets', ['user_id', 'is_deleted'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index('idx_context_snippets_user_id_not_deleted', table_name='context_snippets')
    op.drop_table('context_snippets')
