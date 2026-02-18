"""add issues table

Revision ID: v4w5x6y7z8a9
Revises: u3v4w5x6y7z8
Create Date: 2026-02-18 12:00:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = "v4w5x6y7z8a9"
down_revision: Union[str, Sequence[str], None] = "u3v4w5x6y7z8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Issues table
    op.create_table(
        "issues",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("uuid_generate_v4()"), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("projects.id", ondelete="SET NULL"), nullable=False),
        sa.Column("note_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("notes.id", ondelete="SET NULL"), nullable=True),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("severity", sa.String(20), nullable=False, server_default=sa.text("'medium'")),
        sa.Column("status", sa.String(30), nullable=False, server_default=sa.text("'open'")),
        sa.Column("reproduction_steps", sa.Text(), nullable=True),
        sa.Column("fix_branch", sa.String(255), nullable=True),
        sa.Column("fix_pr_url", sa.String(500), nullable=True),
        sa.Column("coderabbit_review_url", sa.String(500), nullable=True),
        sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("idx_issues_user_project_status", "issues", ["user_id", "project_id", "status", "is_deleted"])
    op.create_index("idx_issues_project_open", "issues", ["project_id", "is_deleted"])

    # Add issue_id FK to notes
    op.add_column("notes", sa.Column("issue_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("issues.id", ondelete="SET NULL"), nullable=True))


def downgrade() -> None:
    op.drop_column("notes", "issue_id")
    op.drop_index("idx_issues_project_open", table_name="issues")
    op.drop_index("idx_issues_user_project_status", table_name="issues")
    op.drop_table("issues")
