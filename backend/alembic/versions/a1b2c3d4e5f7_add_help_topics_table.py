"""add_help_topics_table

Revision ID: a1b2c3d4e5f7
Revises: 9ded3781f509
Create Date: 2026-02-16 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from pgvector.sqlalchemy import VECTOR
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f7'
down_revision: Union[str, Sequence[str], None] = '9ded3781f509'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create help_topics table with vector embedding support."""
    op.execute('CREATE EXTENSION IF NOT EXISTS vector')
    op.create_table('help_topics',
        sa.Column('slug', sa.String(length=255), nullable=False),
        sa.Column('section_id', sa.String(length=255), nullable=False),
        sa.Column('title', sa.String(length=500), nullable=False),
        sa.Column('body', sa.Text(), nullable=False),
        sa.Column('tags', postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'[]'::jsonb"), nullable=False),
        sa.Column('embedding', VECTOR(1024), nullable=True),
        sa.Column('id', sa.UUID(), server_default=sa.text('uuid_generate_v4()'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('slug'),
    )
    op.create_index('idx_help_topics_slug', 'help_topics', ['slug'], unique=True)
    op.create_index('idx_help_topics_section_id', 'help_topics', ['section_id'], unique=False)

    # IVFFlat index for vector similarity search
    op.execute(
        'CREATE INDEX idx_help_topics_embedding ON help_topics '
        'USING ivfflat (embedding vector_cosine_ops) WITH (lists = 50)'
    )


def downgrade() -> None:
    """Drop help_topics table."""
    op.execute('DROP INDEX IF EXISTS idx_help_topics_embedding')
    op.drop_index('idx_help_topics_section_id', table_name='help_topics')
    op.drop_index('idx_help_topics_slug', table_name='help_topics')
    op.drop_table('help_topics')
