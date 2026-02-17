"""add_created_at_index_to_ui_components

Revision ID: 00871a7c39d4
Revises: b24be6462dbd
Create Date: 2026-02-16 23:57:14.995787

"""
from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = '00871a7c39d4'
down_revision: Union[str, Sequence[str], None] = 'b24be6462dbd'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add created_at index to ui_components for list endpoint sorting."""
    op.create_index('idx_ui_components_created', 'ui_components', ['created_at'], unique=False)


def downgrade() -> None:
    """Remove created_at index from ui_components."""
    op.drop_index('idx_ui_components_created', table_name='ui_components')
