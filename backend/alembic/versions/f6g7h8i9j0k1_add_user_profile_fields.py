"""add_user_profile_fields

Revision ID: f6g7h8i9j0k1
Revises: e5f6g7h8i9j0
Create Date: 2026-02-07 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'f6g7h8i9j0k1'
down_revision: Union[str, Sequence[str], None] = 'e5f6g7h8i9j0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add first_name, last_name, screen_name columns to users."""
    op.add_column('users', sa.Column('first_name', sa.String(255), nullable=True))
    op.add_column('users', sa.Column('last_name', sa.String(255), nullable=True))
    op.add_column('users', sa.Column('screen_name', sa.String(255), nullable=True))


def downgrade() -> None:
    """Remove profile fields from users."""
    op.drop_column('users', 'screen_name')
    op.drop_column('users', 'last_name')
    op.drop_column('users', 'first_name')
