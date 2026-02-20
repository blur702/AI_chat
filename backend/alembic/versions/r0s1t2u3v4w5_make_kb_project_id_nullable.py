"""make kb_sources and kb_chunks project_id nullable for global scope

Revision ID: r0s1t2u3v4w5
Revises: q9r0s1t2u3v4
Create Date: 2026-02-16 22:00:00.000000
"""

from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "r0s1t2u3v4w5"
down_revision: Union[str, Sequence[str]] = ("00871a7c39d4", "q9r0s1t2u3v4")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column("kb_sources", "project_id", nullable=True)
    op.alter_column("kb_chunks", "project_id", nullable=True)

    # Update FK on kb_sources to SET NULL on delete for global sources
    op.drop_constraint("kb_sources_project_id_fkey", "kb_sources", type_="foreignkey")
    op.create_foreign_key(
        "kb_sources_project_id_fkey",
        "kb_sources",
        "projects",
        ["project_id"],
        ["id"],
        ondelete="SET NULL",
    )

    # Update FK on kb_chunks to SET NULL on delete for global chunks
    op.drop_constraint("kb_chunks_project_id_fkey", "kb_chunks", type_="foreignkey")
    op.create_foreign_key(
        "kb_chunks_project_id_fkey",
        "kb_chunks",
        "projects",
        ["project_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    # Revert FKs back to CASCADE
    op.drop_constraint("kb_chunks_project_id_fkey", "kb_chunks", type_="foreignkey")
    op.create_foreign_key(
        "kb_chunks_project_id_fkey",
        "kb_chunks",
        "projects",
        ["project_id"],
        ["id"],
        ondelete="CASCADE",
    )

    op.drop_constraint("kb_sources_project_id_fkey", "kb_sources", type_="foreignkey")
    op.create_foreign_key(
        "kb_sources_project_id_fkey",
        "kb_sources",
        "projects",
        ["project_id"],
        ["id"],
        ondelete="CASCADE",
    )

    # WARNING: Downgrade permanently deletes all global (project-independent) KB data.
    # Back up kb_sources and kb_chunks before downgrading this migration.
    # Chunks must be deleted before sources due to FK constraint.
    op.execute("DELETE FROM kb_chunks WHERE project_id IS NULL")
    op.execute("DELETE FROM kb_sources WHERE project_id IS NULL")

    op.alter_column("kb_chunks", "project_id", nullable=False)
    op.alter_column("kb_sources", "project_id", nullable=False)
