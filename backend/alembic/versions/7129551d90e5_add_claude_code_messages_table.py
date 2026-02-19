"""add claude_code_messages table

Revision ID: 7129551d90e5
Revises: y7z8a9b0c1d2
Create Date: 2026-02-19 18:14:57.785764

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "7129551d90e5"
down_revision: str | Sequence[str] | None = "y7z8a9b0c1d2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "claude_code_messages",
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("role", sa.String(length=20), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("page_url", sa.Text(), nullable=True),
        sa.Column("console_logs", sa.Text(), nullable=True),
        sa.Column("id", sa.UUID(), server_default=sa.text("uuid_generate_v4()"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("idx_cc_messages_user_created", "claude_code_messages", ["user_id", "created_at"], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index("idx_cc_messages_user_created", table_name="claude_code_messages")
    op.drop_table("claude_code_messages")
