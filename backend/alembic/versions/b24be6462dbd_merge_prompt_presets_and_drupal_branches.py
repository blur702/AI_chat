"""merge prompt presets and drupal branches

Revision ID: b24be6462dbd
Revises: e4f5g6h7i8j9, p8q9r0s1t2u3
Create Date: 2026-02-16 22:08:52.329666

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b24be6462dbd'
down_revision: Union[str, Sequence[str], None] = ('e4f5g6h7i8j9', 'p8q9r0s1t2u3')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
