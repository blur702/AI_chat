"""add imggen_default_prompt to user_preferences

Revision ID: a95f2e39edc9
Revises: 5efa1e1ff905
Create Date: 2026-02-16 18:30:40.138347

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'a95f2e39edc9'
down_revision: Union[str, Sequence[str], None] = '5efa1e1ff905'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('user_preferences', sa.Column('imggen_default_prompt', sa.Text(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('user_preferences', 'imggen_default_prompt')
