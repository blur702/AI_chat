"""set kb_sources.project_id FK ondelete to SET NULL

Revision ID: s1t2u3v4w5x6
Revises: r0s1t2u3v4w5
Create Date: 2026-02-17 10:30:00.000000
"""

from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "s1t2u3v4w5x6"
down_revision: Union[str, Sequence[str], None] = "r0s1t2u3v4w5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_constraint("kb_sources_project_id_fkey", "kb_sources", type_="foreignkey")
    op.create_foreign_key(
        "kb_sources_project_id_fkey",
        "kb_sources",
        "projects",
        ["project_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("kb_sources_project_id_fkey", "kb_sources", type_="foreignkey")
    op.create_foreign_key(
        "kb_sources_project_id_fkey",
        "kb_sources",
        "projects",
        ["project_id"],
        ["id"],
        ondelete="CASCADE",
    )
