"""add default_num_ctx to user_preferences

Revision ID: 5efa1e1ff905
Revises: a1b2c3d4e5f7
Create Date: 2026-02-16 18:07:09.320165

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '5efa1e1ff905'
down_revision: Union[str, Sequence[str], None] = 'a1b2c3d4e5f7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('user_preferences', sa.Column('default_num_ctx', sa.Integer(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('user_preferences', 'default_num_ctx')
