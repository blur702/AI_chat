"""enable_uuid_ossp_extension

Revision ID: a1b2c3d4e5f6
Revises: 5f312de9b01a
Create Date: 2026-02-03 03:30:00.000000

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, Sequence[str], None] = '5f312de9b01a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Enable the uuid-ossp extension for UUID generation."""
    op.execute('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"')


def downgrade() -> None:
    """Drop the uuid-ossp extension."""
    op.execute('DROP EXTENSION IF EXISTS "uuid-ossp"')
