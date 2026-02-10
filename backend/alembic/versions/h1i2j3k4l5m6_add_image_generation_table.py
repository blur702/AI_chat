"""add_image_generation_table

Revision ID: h1i2j3k4l5m6
Revises: g0h1i2j3k4l5
Create Date: 2026-02-09 12:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'h1i2j3k4l5m6'
down_revision: Union[str, Sequence[str], None] = 'g0h1i2j3k4l5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'image_generations',
        sa.Column('id', postgresql.UUID(as_uuid=True), server_default=sa.text('uuid_generate_v4()'), nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('project_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('workflow_type', sa.String(50), nullable=False),
        sa.Column('prompt', sa.Text(), nullable=False),
        sa.Column('negative_prompt', sa.Text(), nullable=True),
        sa.Column('status', sa.String(50), nullable=False, server_default='pending'),
        sa.Column('workflow_data', postgresql.JSONB(), nullable=False, server_default='{}'),
        sa.Column('result_images', postgresql.JSONB(), nullable=False, server_default='[]'),
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.Column('comfyui_job_id', sa.String(255), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('idx_image_generations_user', 'image_generations', ['user_id'])
    op.create_index('idx_image_generations_project', 'image_generations', ['project_id'])
    op.create_index('idx_image_generations_status', 'image_generations', ['status'])


def downgrade() -> None:
    op.drop_index('idx_image_generations_status', table_name='image_generations')
    op.drop_index('idx_image_generations_project', table_name='image_generations')
    op.drop_index('idx_image_generations_user', table_name='image_generations')
    op.drop_table('image_generations')
