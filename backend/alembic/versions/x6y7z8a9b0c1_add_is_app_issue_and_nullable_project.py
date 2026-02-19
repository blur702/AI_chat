"""add is_app_issue and nullable project_id to issues

Revision ID: x6y7z8a9b0c1
Revises: w5x6y7z8a9b0
Create Date: 2026-02-19 10:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "x6y7z8a9b0c1"
down_revision: str | Sequence[str] | None = "w5x6y7z8a9b0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 1. Drop existing composite index before altering column
    op.drop_index("idx_issues_user_project_status", table_name="issues")

    # 2. Make project_id nullable (FK stays CASCADE — deleting a project
    #    still removes its project-scoped issues; app issues have NULL and
    #    are unaffected by project deletion)
    op.alter_column("issues", "project_id", existing_type=sa.dialects.postgresql.UUID(), nullable=True)

    # 3. Add is_app_issue column
    op.add_column(
        "issues",
        sa.Column("is_app_issue", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )

    # 5. Recreate composite index
    op.create_index(
        "idx_issues_user_project_status",
        "issues",
        ["user_id", "project_id", "status", "is_deleted"],
    )

    # 6. Add partial index for app issues
    op.create_index(
        "idx_issues_app_issues",
        "issues",
        ["user_id", "is_deleted"],
        postgresql_where=sa.text("is_app_issue = true"),
    )


def downgrade() -> None:
    # Remove partial index
    op.drop_index("idx_issues_app_issues", table_name="issues")

    # Drop composite index
    op.drop_index("idx_issues_user_project_status", table_name="issues")

    # Remove is_app_issue column
    op.drop_column("issues", "is_app_issue")

    # WARNING: Permanently deletes all app-level issues (project_id IS NULL).
    # Back up data before running this downgrade if you need to preserve them.
    op.execute("DELETE FROM issues WHERE project_id IS NULL")

    # Make project_id non-nullable (requires all rows to have a project_id)
    op.alter_column("issues", "project_id", existing_type=sa.dialects.postgresql.UUID(), nullable=False)

    # Recreate original composite index
    op.create_index(
        "idx_issues_user_project_status",
        "issues",
        ["user_id", "project_id", "status", "is_deleted"],
    )
