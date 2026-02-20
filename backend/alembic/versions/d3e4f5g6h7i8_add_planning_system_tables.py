"""add planning system tables

Revision ID: d3e4f5g6h7i8
Revises: c2d3e4f5g6h7
Create Date: 2026-02-16 23:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'd3e4f5g6h7i8'
down_revision: Union[str, Sequence[str], None] = 'c2d3e4f5g6h7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Planning Sessions
    op.create_table(
        'planning_sessions',
        sa.Column('id', postgresql.UUID(as_uuid=True), server_default=sa.text('uuid_generate_v4()'), nullable=False),
        sa.Column('project_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('chat_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('title', sa.String(500), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('target_type', sa.String(20), nullable=False, server_default='sandbox'),
        sa.Column('ui_builder_state', postgresql.JSONB(), nullable=True),
        sa.Column('status', sa.String(20), nullable=False, server_default='draft'),
        sa.Column('current_phase_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('success_criteria', postgresql.ARRAY(sa.Text()), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['chat_id'], ['chats.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    )
    op.create_index('idx_planning_sessions_project_status', 'planning_sessions', ['project_id', 'status'])
    op.create_index('idx_planning_sessions_chat', 'planning_sessions', ['chat_id'])
    op.create_index('idx_planning_sessions_user', 'planning_sessions', ['user_id'])

    # Plan Phases
    op.create_table(
        'plan_phases',
        sa.Column('id', postgresql.UUID(as_uuid=True), server_default=sa.text('uuid_generate_v4()'), nullable=False),
        sa.Column('session_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('title', sa.String(500), nullable=False),
        sa.Column('description', sa.Text(), nullable=False, server_default=''),
        sa.Column('phase_order', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('inputs', postgresql.ARRAY(sa.Text()), nullable=True),
        sa.Column('outputs', postgresql.ARRAY(sa.Text()), nullable=True),
        sa.Column('implementation_plan', postgresql.JSONB(), nullable=True),
        sa.Column('verification_checks', postgresql.JSONB(), nullable=True),
        sa.Column('status', sa.String(20), nullable=False, server_default='pending'),
        sa.Column('user_approved', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('verification_result', postgresql.JSONB(), nullable=True),
        sa.Column('started_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['session_id'], ['planning_sessions.id'], ondelete='CASCADE'),
    )
    op.create_index('idx_plan_phases_session_order', 'plan_phases', ['session_id', 'phase_order'])

    # Add current_phase_id FK now that plan_phases exists
    op.create_foreign_key(
        'fk_planning_sessions_current_phase',
        'planning_sessions', 'plan_phases',
        ['current_phase_id'], ['id'],
        ondelete='SET NULL',
    )

    # Plan Tasks
    op.create_table(
        'plan_tasks',
        sa.Column('id', postgresql.UUID(as_uuid=True), server_default=sa.text('uuid_generate_v4()'), nullable=False),
        sa.Column('phase_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('title', sa.String(500), nullable=False),
        sa.Column('description', sa.Text(), nullable=False, server_default=''),
        sa.Column('task_order', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('task_type', sa.String(50), nullable=False),
        sa.Column('task_data', postgresql.JSONB(), nullable=True),
        sa.Column('depends_on', postgresql.ARRAY(sa.Text()), nullable=True),
        sa.Column('status', sa.String(20), nullable=False, server_default='pending'),
        sa.Column('result', postgresql.JSONB(), nullable=True),
        sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('automation_action_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['phase_id'], ['plan_phases.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['automation_action_id'], ['automation_actions.id'], ondelete='SET NULL'),
    )
    op.create_index('idx_plan_tasks_phase_order', 'plan_tasks', ['phase_id', 'task_order'])
    op.create_index('idx_plan_tasks_status', 'plan_tasks', ['phase_id', 'status'])


def downgrade() -> None:
    op.drop_index('idx_plan_tasks_status', table_name='plan_tasks')
    op.drop_index('idx_plan_tasks_phase_order', table_name='plan_tasks')
    op.drop_table('plan_tasks')
    op.drop_constraint('fk_planning_sessions_current_phase', 'planning_sessions', type_='foreignkey')
    op.drop_index('idx_plan_phases_session_order', table_name='plan_phases')
    op.drop_table('plan_phases')
    op.drop_index('idx_planning_sessions_user', table_name='planning_sessions')
    op.drop_index('idx_planning_sessions_chat', table_name='planning_sessions')
    op.drop_index('idx_planning_sessions_project_status', table_name='planning_sessions')
    op.drop_table('planning_sessions')
