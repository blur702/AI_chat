"""add system_prompts table and chat_instructions

Revision ID: 3b0066816e54
Revises: 65162524cfb4
Create Date: 2026-02-13 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = '3b0066816e54'
down_revision: Union[str, Sequence[str], None] = '65162524cfb4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create system_prompts table and add FK columns to projects and chats."""
    # Create system_prompts table
    op.create_table(
        'system_prompts',
        sa.Column('id', postgresql.UUID(as_uuid=True), server_default=sa.text('uuid_generate_v4()'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), server_onupdate=sa.func.now(), nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('is_default', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        sa.Column('is_deleted', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('idx_system_prompts_user_id', 'system_prompts', ['user_id'])
    op.create_index('idx_system_prompts_user_default', 'system_prompts', ['user_id', 'is_default'])
    # Partial unique index: only one default per user among non-deleted prompts
    op.execute(
        "CREATE UNIQUE INDEX idx_system_prompts_one_default "
        "ON system_prompts (user_id) WHERE is_default = true AND is_deleted = false"
    )

    # Add system_prompt_id to projects
    op.add_column('projects', sa.Column(
        'system_prompt_id',
        postgresql.UUID(as_uuid=True),
        nullable=True,
    ))
    op.create_foreign_key(
        'fk_projects_system_prompt_id',
        'projects', 'system_prompts',
        ['system_prompt_id'], ['id'],
        ondelete='SET NULL',
    )

    # Add system_prompt_id and chat_instructions to chats
    op.add_column('chats', sa.Column(
        'system_prompt_id',
        postgresql.UUID(as_uuid=True),
        nullable=True,
    ))
    op.create_foreign_key(
        'fk_chats_system_prompt_id',
        'chats', 'system_prompts',
        ['system_prompt_id'], ['id'],
        ondelete='SET NULL',
    )
    op.add_column('chats', sa.Column(
        'chat_instructions',
        sa.Text(),
        nullable=True,
    ))


def downgrade() -> None:
    """Drop chat_instructions, system_prompt FKs, and system_prompts table."""
    op.drop_column('chats', 'chat_instructions')
    op.drop_constraint('fk_chats_system_prompt_id', 'chats', type_='foreignkey')
    op.drop_column('chats', 'system_prompt_id')
    op.drop_constraint('fk_projects_system_prompt_id', 'projects', type_='foreignkey')
    op.drop_column('projects', 'system_prompt_id')
    op.execute("DROP INDEX IF EXISTS idx_system_prompts_one_default")
    op.drop_index('idx_system_prompts_user_default', 'system_prompts')
    op.drop_index('idx_system_prompts_user_id', 'system_prompts')
    op.drop_table('system_prompts')
