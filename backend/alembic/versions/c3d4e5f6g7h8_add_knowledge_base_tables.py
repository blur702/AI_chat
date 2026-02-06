"""add_knowledge_base_tables

Revision ID: c3d4e5f6g7h8
Revises: b2c3d4e5f6g7
Create Date: 2026-02-03 04:30:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from pgvector.sqlalchemy import VECTOR
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'c3d4e5f6g7h8'
down_revision: Union[str, Sequence[str], None] = 'b3c4d5e6f7g8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create kb_sources and kb_chunks tables with indexes."""
    # Create kb_sources table
    op.create_table(
        'kb_sources',
        sa.Column('id', postgresql.UUID(as_uuid=True), server_default=sa.text('uuid_generate_v4()'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('project_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('source_type', sa.String(50), nullable=False),
        sa.Column('source_path', sa.String(1000), nullable=False),
        sa.Column('status', sa.String(50), nullable=False, server_default='pending'),
        sa.Column('chunk_count', sa.Integer(), nullable=False, server_default='0'),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ondelete='CASCADE'),
    )

    # Create kb_sources indexes
    op.create_index('idx_kb_sources_project', 'kb_sources', ['project_id'])
    op.create_index('idx_kb_sources_status', 'kb_sources', ['project_id', 'status'])

    # Create kb_chunks table
    op.create_table(
        'kb_chunks',
        sa.Column('id', postgresql.UUID(as_uuid=True), server_default=sa.text('uuid_generate_v4()'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('source_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('project_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column('embedding', VECTOR(1024), nullable=True),
        sa.Column('metadata', postgresql.JSONB(), nullable=True),
        sa.Column('chunk_index', sa.Integer(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['source_id'], ['kb_sources.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ondelete='CASCADE'),
    )

    # Create kb_chunks indexes
    op.create_index('idx_kb_chunks_project', 'kb_chunks', ['project_id'])
    op.create_index('idx_kb_chunks_source', 'kb_chunks', ['source_id', 'chunk_index'])

    # Create IVFFlat index for vector similarity search
    op.create_index(
        'idx_kb_chunks_embedding',
        'kb_chunks',
        ['embedding'],
        postgresql_using='ivfflat',
        postgresql_with={'lists': 100},
        postgresql_ops={'embedding': 'vector_cosine_ops'},
    )


def downgrade() -> None:
    """Drop kb_chunks and kb_sources tables."""
    # Drop kb_chunks indexes
    op.drop_index('idx_kb_chunks_embedding', table_name='kb_chunks')
    op.drop_index('idx_kb_chunks_source', table_name='kb_chunks')
    op.drop_index('idx_kb_chunks_project', table_name='kb_chunks')

    # Drop kb_chunks table
    op.drop_table('kb_chunks')

    # Drop kb_sources indexes
    op.drop_index('idx_kb_sources_status', table_name='kb_sources')
    op.drop_index('idx_kb_sources_project', table_name='kb_sources')

    # Drop kb_sources table
    op.drop_table('kb_sources')
