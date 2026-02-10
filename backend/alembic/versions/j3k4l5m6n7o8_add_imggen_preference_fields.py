"""Add image generation preference fields to user_preferences

Revision ID: j3k4l5m6n7o8
Revises: i2j3k4l5m6n7
Create Date: 2026-02-10 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "j3k4l5m6n7o8"
down_revision = "i2j3k4l5m6n7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "user_preferences",
        sa.Column("imggen_default_workflow", sa.String(50), nullable=True, server_default="text-to-image"),
    )
    op.add_column(
        "user_preferences",
        sa.Column("imggen_default_width", sa.Integer(), nullable=True, server_default="512"),
    )
    op.add_column(
        "user_preferences",
        sa.Column("imggen_default_height", sa.Integer(), nullable=True, server_default="512"),
    )
    op.add_column(
        "user_preferences",
        sa.Column("imggen_default_steps", sa.Integer(), nullable=True, server_default="20"),
    )
    op.add_column(
        "user_preferences",
        sa.Column("imggen_default_cfg_scale", sa.Float(), nullable=True, server_default="7.0"),
    )
    op.add_column(
        "user_preferences",
        sa.Column("imggen_default_negative_prompt", sa.Text(), nullable=True),
    )
    op.add_column(
        "user_preferences",
        sa.Column("imggen_completion_notification", sa.Boolean(), nullable=False, server_default="true"),
    )
    op.add_column(
        "user_preferences",
        sa.Column("imggen_desktop_notification", sa.Boolean(), nullable=False, server_default="false"),
    )
    op.add_column(
        "user_preferences",
        sa.Column("imggen_sound_notification", sa.Boolean(), nullable=False, server_default="false"),
    )
    op.add_column(
        "user_preferences",
        sa.Column("imggen_notification_sound", sa.String(100), nullable=True, server_default="default"),
    )
    op.add_column(
        "user_preferences",
        sa.Column("imggen_auto_delete_days", sa.Integer(), nullable=True),
    )
    op.add_column(
        "user_preferences",
        sa.Column("imggen_max_generations", sa.Integer(), nullable=True),
    )
    op.add_column(
        "user_preferences",
        sa.Column("comfyui_base_url", sa.String(500), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("user_preferences", "comfyui_base_url")
    op.drop_column("user_preferences", "imggen_max_generations")
    op.drop_column("user_preferences", "imggen_auto_delete_days")
    op.drop_column("user_preferences", "imggen_notification_sound")
    op.drop_column("user_preferences", "imggen_sound_notification")
    op.drop_column("user_preferences", "imggen_desktop_notification")
    op.drop_column("user_preferences", "imggen_completion_notification")
    op.drop_column("user_preferences", "imggen_default_negative_prompt")
    op.drop_column("user_preferences", "imggen_default_cfg_scale")
    op.drop_column("user_preferences", "imggen_default_steps")
    op.drop_column("user_preferences", "imggen_default_height")
    op.drop_column("user_preferences", "imggen_default_width")
    op.drop_column("user_preferences", "imggen_default_workflow")
