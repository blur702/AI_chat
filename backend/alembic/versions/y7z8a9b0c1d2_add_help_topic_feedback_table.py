"""add_help_topic_feedback_table

Revision ID: y7z8a9b0c1d2
Revises: x6y7z8a9b0c1
Create Date: 2026-02-19 00:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "y7z8a9b0c1d2"
down_revision: Union[str, Sequence[str], None] = "x6y7z8a9b0c1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"')
    op.create_table(
        "help_topic_feedback",
        sa.Column(
            "help_topic_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("help_topics.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("helpful", sa.Boolean(), nullable=False),
        sa.Column("context_slug", sa.String(length=255), nullable=True),
        sa.Column("query", sa.Text(), nullable=True),
        sa.Column("source", sa.String(length=50), nullable=False, server_default="help-modal"),
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=sa.text("uuid_generate_v4()"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "idx_help_topic_feedback_topic_id",
        "help_topic_feedback",
        ["help_topic_id"],
        unique=False,
    )
    op.create_index(
        "idx_help_topic_feedback_helpful",
        "help_topic_feedback",
        ["helpful"],
        unique=False,
    )
    op.create_index(
        "idx_help_topic_feedback_created_at",
        "help_topic_feedback",
        ["created_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("idx_help_topic_feedback_created_at", table_name="help_topic_feedback")
    op.drop_index("idx_help_topic_feedback_helpful", table_name="help_topic_feedback")
    op.drop_index("idx_help_topic_feedback_topic_id", table_name="help_topic_feedback")
    op.drop_table("help_topic_feedback")

