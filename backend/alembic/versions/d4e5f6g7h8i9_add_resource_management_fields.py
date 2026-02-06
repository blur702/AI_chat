"""add_resource_management_fields

Revision ID: d4e5f6g7h8i9
Revises: c3d4e5f6g7h8
Create Date: 2026-02-03 05:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'd4e5f6g7h8i9'
down_revision: Union[str, Sequence[str], None] = 'c3d4e5f6g7h8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add resource management fields for VRAM tracking and user locking."""
    # Add user_locked column
    op.add_column(
        'resources',
        sa.Column('user_locked', sa.Boolean(), nullable=False, server_default='false')
    )

    # Add user_id column with foreign key to users table
    op.add_column(
        'resources',
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=True)
    )
    op.create_foreign_key(
        'fk_resources_user_id',
        'resources',
        'users',
        ['user_id'],
        ['id'],
        ondelete='SET NULL'
    )

    # Add vram_mb column
    op.add_column(
        'resources',
        sa.Column('vram_mb', sa.Integer(), nullable=True)
    )

    # Add base_priority column
    op.add_column(
        'resources',
        sa.Column('base_priority', sa.Integer(), nullable=False, server_default='0')
    )

    # Migrate existing priority values to base_priority to preserve ordering
    op.execute("UPDATE resources SET base_priority = priority")

    # Create indexes for efficient querying
    op.create_index('idx_resources_user_locked', 'resources', ['user_locked'])
    op.create_index('idx_resources_user_id', 'resources', ['user_id'])


def downgrade() -> None:
    """Remove resource management fields."""
    # Drop indexes in reverse order
    op.drop_index('idx_resources_user_id', table_name='resources')
    op.drop_index('idx_resources_user_locked', table_name='resources')

    # Drop foreign key constraint
    op.drop_constraint('fk_resources_user_id', 'resources', type_='foreignkey')

    # Drop columns in reverse order
    op.drop_column('resources', 'base_priority')
    op.drop_column('resources', 'vram_mb')
    op.drop_column('resources', 'user_id')
    op.drop_column('resources', 'user_locked')
