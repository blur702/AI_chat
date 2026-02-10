"""add_security_fields_and_audit_logs

Revision ID: g0h1i2j3k4l5
Revises: f6g7h8i9j0k1
Create Date: 2026-02-07 12:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'g0h1i2j3k4l5'
down_revision: Union[str, Sequence[str], None] = 'f6g7h8i9j0k1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add security fields to users and create audit_logs table."""
    # Add security columns to users table
    op.add_column('users', sa.Column('email_verified', sa.Boolean(), nullable=False, server_default='false'))
    op.add_column('users', sa.Column('email_verification_token', sa.String(255), nullable=True))
    op.add_column('users', sa.Column('password_reset_token', sa.String(255), nullable=True))
    op.add_column('users', sa.Column('password_reset_expires', sa.DateTime(timezone=True), nullable=True))
    op.add_column('users', sa.Column('failed_login_attempts', sa.Integer(), nullable=False, server_default='0'))
    op.add_column('users', sa.Column('locked_until', sa.DateTime(timezone=True), nullable=True))
    op.add_column('users', sa.Column('last_login_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('users', sa.Column('last_password_change', sa.DateTime(timezone=True), nullable=True))

    # Create indexes on users table
    op.create_index('idx_users_username', 'users', ['username'])
    op.create_index('idx_users_email_verified', 'users', ['email_verified'])
    op.create_index('idx_users_locked_until', 'users', ['locked_until'])

    # Create audit_logs table
    op.create_table(
        'audit_logs',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False, server_default=sa.text('uuid_generate_v4()')),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('action', sa.String(100), nullable=False),
        sa.Column('resource', sa.String(255), nullable=True),
        sa.Column('ip_address', sa.String(45), nullable=True),
        sa.Column('user_agent', sa.Text(), nullable=True),
        sa.Column('status', sa.String(50), nullable=False),
        sa.Column('details', postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.PrimaryKeyConstraint('id'),
    )

    # Add foreign key constraint
    op.create_foreign_key('fk_audit_logs_user_id', 'audit_logs', 'users', ['user_id'], ['id'], ondelete='SET NULL')

    # Create indexes on audit_logs
    op.create_index('idx_audit_logs_user_id', 'audit_logs', ['user_id'])
    op.create_index('idx_audit_logs_action', 'audit_logs', ['action'])
    op.create_index('idx_audit_logs_created_at', 'audit_logs', ['created_at'])
    op.create_index('idx_audit_logs_user_action', 'audit_logs', ['user_id', 'action'])
    op.create_index('idx_audit_logs_action_created', 'audit_logs', ['action', 'created_at'])


def downgrade() -> None:
    """Remove audit_logs table and security fields from users."""
    # Drop audit_logs indexes in reverse order
    op.drop_index('idx_audit_logs_action_created', table_name='audit_logs')
    op.drop_index('idx_audit_logs_user_action', table_name='audit_logs')
    op.drop_index('idx_audit_logs_created_at', table_name='audit_logs')
    op.drop_index('idx_audit_logs_action', table_name='audit_logs')
    op.drop_index('idx_audit_logs_user_id', table_name='audit_logs')

    # Drop foreign key and table
    op.drop_constraint('fk_audit_logs_user_id', 'audit_logs', type_='foreignkey')
    op.drop_table('audit_logs')

    # Drop users indexes
    op.drop_index('idx_users_locked_until', table_name='users')
    op.drop_index('idx_users_email_verified', table_name='users')
    op.drop_index('idx_users_username', table_name='users')

    # Drop users columns in reverse order
    op.drop_column('users', 'last_password_change')
    op.drop_column('users', 'last_login_at')
    op.drop_column('users', 'locked_until')
    op.drop_column('users', 'failed_login_attempts')
    op.drop_column('users', 'password_reset_expires')
    op.drop_column('users', 'password_reset_token')
    op.drop_column('users', 'email_verification_token')
    op.drop_column('users', 'email_verified')
