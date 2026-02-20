"""add prompt presets table

Revision ID: e4f5g6h7i8j9
Revises: d3e4f5g6h7i8
Create Date: 2026-02-16 23:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'e4f5g6h7i8j9'
down_revision: Union[str, Sequence[str], None] = 'd3e4f5g6h7i8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute('CREATE EXTENSION IF NOT EXISTS pgcrypto')
    op.create_table(
        'prompt_presets',
        sa.Column('id', postgresql.UUID(as_uuid=True), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('name', sa.String(200), nullable=False),
        sa.Column('prompt_text', sa.Text(), nullable=False),
        sa.Column('negative_prompt_text', sa.Text(), nullable=True),
        sa.Column('category', sa.String(50), nullable=False, server_default='general'),
        sa.Column('tags', postgresql.ARRAY(sa.Text()), nullable=True),
        sa.Column('workflow_settings', postgresql.JSONB(), nullable=True),
        sa.Column('is_public', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('is_deleted', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('idx_prompt_presets_user', 'prompt_presets', ['user_id'])
    op.create_index('idx_prompt_presets_category', 'prompt_presets', ['category'])
    op.create_index('idx_prompt_presets_public', 'prompt_presets', ['is_public'])

    # Also add favorites + metadata columns to image_generations for Phase 4
    op.add_column('image_generations', sa.Column('is_favorite', sa.Boolean(), nullable=False, server_default='false'))
    op.add_column('image_generations', sa.Column('generation_metadata', postgresql.JSONB(), nullable=True))
    op.add_column('image_generations', sa.Column('source_generation_id', postgresql.UUID(as_uuid=True), nullable=True))
    op.create_foreign_key(
        'fk_image_gen_source', 'image_generations', 'image_generations',
        ['source_generation_id'], ['id'], ondelete='SET NULL'
    )
    op.create_index('idx_image_gen_favorite', 'image_generations', ['is_favorite'])


def downgrade() -> None:
    op.drop_index('idx_image_gen_favorite', table_name='image_generations')
    op.drop_constraint('fk_image_gen_source', 'image_generations', type_='foreignkey')
    op.drop_column('image_generations', 'source_generation_id')
    op.drop_column('image_generations', 'generation_metadata')
    op.drop_column('image_generations', 'is_favorite')
    op.drop_index('idx_prompt_presets_public', table_name='prompt_presets')
    op.drop_index('idx_prompt_presets_category', table_name='prompt_presets')
    op.drop_index('idx_prompt_presets_user', table_name='prompt_presets')
    op.drop_table('prompt_presets')
