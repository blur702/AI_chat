"""add soft delete columns to image_generations

Revision ID: 73febd1355c3
Revises: 7a8b9c0d1e2f
Create Date: 2026-02-14 04:05:01.670822

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '73febd1355c3'
down_revision: Union[str, Sequence[str], None] = '7a8b9c0d1e2f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add is_deleted and deleted_at columns to image_generations."""
    op.add_column('image_generations', sa.Column('is_deleted', sa.Boolean(), nullable=False, server_default=sa.text('false')))
    op.add_column('image_generations', sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    """Remove soft delete columns from image_generations."""
    op.drop_column('image_generations', 'deleted_at')
    op.drop_column('image_generations', 'is_deleted')
