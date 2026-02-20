"""Add default_model, default_temperature, notification settings to user_preferences

Revision ID: i2j3k4l5m6n7
Revises: h1i2j3k4l5m6
Create Date: 2026-02-09 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "i2j3k4l5m6n7"
down_revision = "h1i2j3k4l5m6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "user_preferences",
        sa.Column("default_model", sa.String(100), nullable=True),
    )
    op.add_column(
        "user_preferences",
        sa.Column("default_temperature", sa.Float(), nullable=True, server_default="0.7"),
    )
    op.add_column(
        "user_preferences",
        sa.Column("email_notifications", sa.Boolean(), nullable=False, server_default="true"),
    )
    op.add_column(
        "user_preferences",
        sa.Column("in_app_notifications", sa.Boolean(), nullable=False, server_default="true"),
    )


def downgrade() -> None:
    op.drop_column("user_preferences", "in_app_notifications")
    op.drop_column("user_preferences", "email_notifications")
    op.drop_column("user_preferences", "default_temperature")
    op.drop_column("user_preferences", "default_model")
