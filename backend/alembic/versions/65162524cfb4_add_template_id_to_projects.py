"""add template_id to projects

Revision ID: 65162524cfb4
Revises: m6n7o8p9q0r1
Create Date: 2026-02-13 05:26:37.862424

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '65162524cfb4'
down_revision: Union[str, Sequence[str], None] = 'm6n7o8p9q0r1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('projects', sa.Column('template_id', sa.String(length=100), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('projects', 'template_id')
