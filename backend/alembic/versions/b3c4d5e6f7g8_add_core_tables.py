"""add_core_tables

Revision ID: b3c4d5e6f7g8
Revises: b2c3d4e5f6g7
Create Date: 2026-02-03 04:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'b3c4d5e6f7g8'
down_revision: Union[str, Sequence[str], None] = 'b2c3d4e5f6g7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create all core tables: users, user_preferences, projects, chats, messages,
    resources, context_compactions, automation_actions, yolo_edits, archives."""

    # Create users table
    op.create_table(
        'users',
        sa.Column('id', postgresql.UUID(as_uuid=True), server_default=sa.text('uuid_generate_v4()'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('username', sa.String(100), nullable=False),
        sa.Column('email', sa.String(255), nullable=True),
        sa.Column('hashed_password', sa.String(255), nullable=False),
        sa.Column('role', sa.String(50), nullable=False, server_default='user'),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('username'),
        sa.UniqueConstraint('email'),
    )
    op.create_index('idx_users_username', 'users', ['username'])

    # Create user_preferences table
    op.create_table(
        'user_preferences',
        sa.Column('id', postgresql.UUID(as_uuid=True), server_default=sa.text('uuid_generate_v4()'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('custom_system_prompt', sa.Text(), nullable=True),
        sa.Column('coding_principles', postgresql.JSONB(), nullable=True),
        sa.Column('response_style', postgresql.JSONB(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.UniqueConstraint('user_id'),
    )

    # Create projects table
    op.create_table(
        'projects',
        sa.Column('id', postgresql.UUID(as_uuid=True), server_default=sa.text('uuid_generate_v4()'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('path', sa.Text(), nullable=False),
        sa.Column('type', sa.String(50), nullable=True),
        sa.Column('settings', postgresql.JSONB(), nullable=True),
        sa.Column('custom_context', sa.Text(), nullable=True),
        sa.Column('important_files', postgresql.ARRAY(sa.Text()), nullable=True),
        sa.Column('is_deleted', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    )
    op.create_index('idx_projects_user_id', 'projects', ['user_id'])
    op.create_index('idx_projects_user_active', 'projects', ['user_id', 'is_deleted'])

    # Create chats table
    op.create_table(
        'chats',
        sa.Column('id', postgresql.UUID(as_uuid=True), server_default=sa.text('uuid_generate_v4()'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('project_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('title', sa.String(500), nullable=False),
        sa.Column('is_pinned', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('is_archived', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('is_deleted', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ondelete='CASCADE'),
    )
    op.create_index('idx_chats_project_updated', 'chats', ['project_id', 'updated_at'])
    op.create_index('idx_chats_pinned', 'chats', ['project_id', 'is_pinned', 'updated_at'])
    op.create_index('idx_chats_archived', 'chats', ['project_id', 'is_archived'])

    # Create messages table
    op.create_table(
        'messages',
        sa.Column('id', postgresql.UUID(as_uuid=True), server_default=sa.text('uuid_generate_v4()'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('chat_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('role', sa.String(50), nullable=False),
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column('metadata', postgresql.JSONB(), nullable=True),
        sa.Column('is_pinned', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('is_excluded', sa.Boolean(), nullable=False, server_default='false'),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['chat_id'], ['chats.id'], ondelete='CASCADE'),
    )
    op.create_index('idx_messages_chat_created', 'messages', ['chat_id', 'created_at'])
    op.create_index('idx_messages_pinned', 'messages', ['chat_id', 'is_pinned'])
    op.create_index('idx_messages_excluded', 'messages', ['chat_id', 'is_excluded'])

    # Create resources table
    op.create_table(
        'resources',
        sa.Column('id', postgresql.UUID(as_uuid=True), server_default=sa.text('uuid_generate_v4()'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('resource_id', sa.String(255), nullable=False),
        sa.Column('resource_type', sa.String(100), nullable=False),
        sa.Column('status', sa.String(50), nullable=False, server_default='active'),
        sa.Column('location', sa.Text(), nullable=True),
        sa.Column('priority', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('auto_unload', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('last_used_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('resource_id'),
    )
    op.create_index('idx_resources_status', 'resources', ['status'])

    # Create context_compactions table
    op.create_table(
        'context_compactions',
        sa.Column('id', postgresql.UUID(as_uuid=True), server_default=sa.text('uuid_generate_v4()'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('chat_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('original_message_count', sa.Integer(), nullable=False),
        sa.Column('compacted_message_count', sa.Integer(), nullable=False),
        sa.Column('summary', sa.Text(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['chat_id'], ['chats.id'], ondelete='CASCADE'),
    )
    op.create_index('idx_compactions_chat', 'context_compactions', ['chat_id'])

    # Create automation_actions table
    op.create_table(
        'automation_actions',
        sa.Column('id', postgresql.UUID(as_uuid=True), server_default=sa.text('uuid_generate_v4()'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('project_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('action_type', sa.String(100), nullable=False),
        sa.Column('action_data', postgresql.JSONB(), nullable=True),
        sa.Column('status', sa.String(50), nullable=False, server_default='pending'),
        sa.Column('result', postgresql.JSONB(), nullable=True),
        sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ondelete='CASCADE'),
    )
    op.create_index('idx_automation_project_created', 'automation_actions', ['project_id', 'created_at'])

    # Create yolo_edits table
    op.create_table(
        'yolo_edits',
        sa.Column('id', postgresql.UUID(as_uuid=True), server_default=sa.text('uuid_generate_v4()'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('project_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('chat_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('files_modified', postgresql.ARRAY(sa.Text()), nullable=False),
        sa.Column('undo_performed', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('undo_data', postgresql.JSONB(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['chat_id'], ['chats.id'], ondelete='SET NULL'),
    )
    op.create_index('idx_yolo_edits_project', 'yolo_edits', ['project_id', 'created_at'])
    op.create_index('idx_yolo_edits_chat', 'yolo_edits', ['chat_id'])

    # Create archives table
    op.create_table(
        'archives',
        sa.Column('id', postgresql.UUID(as_uuid=True), server_default=sa.text('uuid_generate_v4()'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('project_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('base_url', sa.Text(), nullable=False),
        sa.Column('archive_path', sa.Text(), nullable=False),
        sa.Column('manifest', postgresql.JSONB(), nullable=True),
        sa.Column('status', sa.String(50), nullable=False, server_default='pending'),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ondelete='CASCADE'),
    )
    op.create_index('idx_archives_project', 'archives', ['project_id', 'created_at'])
    op.create_index('idx_archives_status', 'archives', ['status'])


def downgrade() -> None:
    """Drop all core tables in reverse order."""
    # Drop archives
    op.drop_index('idx_archives_status', table_name='archives')
    op.drop_index('idx_archives_project', table_name='archives')
    op.drop_table('archives')

    # Drop yolo_edits
    op.drop_index('idx_yolo_edits_chat', table_name='yolo_edits')
    op.drop_index('idx_yolo_edits_project', table_name='yolo_edits')
    op.drop_table('yolo_edits')

    # Drop automation_actions
    op.drop_index('idx_automation_project_created', table_name='automation_actions')
    op.drop_table('automation_actions')

    # Drop context_compactions
    op.drop_index('idx_compactions_chat', table_name='context_compactions')
    op.drop_table('context_compactions')

    # Drop resources
    op.drop_index('idx_resources_status', table_name='resources')
    op.drop_table('resources')

    # Drop messages
    op.drop_index('idx_messages_excluded', table_name='messages')
    op.drop_index('idx_messages_pinned', table_name='messages')
    op.drop_index('idx_messages_chat_created', table_name='messages')
    op.drop_table('messages')

    # Drop chats
    op.drop_index('idx_chats_archived', table_name='chats')
    op.drop_index('idx_chats_pinned', table_name='chats')
    op.drop_index('idx_chats_project_updated', table_name='chats')
    op.drop_table('chats')

    # Drop projects
    op.drop_index('idx_projects_user_active', table_name='projects')
    op.drop_index('idx_projects_user_id', table_name='projects')
    op.drop_table('projects')

    # Drop user_preferences
    op.drop_table('user_preferences')

    # Drop users
    op.drop_index('idx_users_username', table_name='users')
    op.drop_table('users')
