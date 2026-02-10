"""
User preference model for storing personalized AI settings.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any, Dict, List, Optional
from uuid import UUID

from sqlalchemy import Boolean, Float, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import TimestampMixin, UUIDMixin

if TYPE_CHECKING:
    from app.models.user import User


class UserPreference(UUIDMixin, TimestampMixin, Base):
    """
    User preferences for AI behavior customization.

    Stores custom system prompts, coding principles, response style
    configurations, default model/temperature, and notification settings.
    Each user has at most one preference record.
    """

    __tablename__ = "user_preferences"

    user_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
    )

    custom_system_prompt: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
    )

    coding_principles: Mapped[Optional[List[Any]]] = mapped_column(
        JSONB,
        nullable=True,
    )

    response_style: Mapped[Optional[Dict[str, Any]]] = mapped_column(
        JSONB,
        nullable=True,
    )

    default_model: Mapped[Optional[str]] = mapped_column(
        String(100),
        nullable=True,
    )

    default_temperature: Mapped[Optional[float]] = mapped_column(
        Float,
        nullable=True,
        default=0.7,
    )

    email_notifications: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
    )

    in_app_notifications: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
    )

    # Image generation defaults
    imggen_default_workflow: Mapped[Optional[str]] = mapped_column(
        String(50),
        nullable=True,
        default="text-to-image",
    )

    imggen_default_width: Mapped[Optional[int]] = mapped_column(
        Integer,
        nullable=True,
        default=512,
    )

    imggen_default_height: Mapped[Optional[int]] = mapped_column(
        Integer,
        nullable=True,
        default=512,
    )

    imggen_default_steps: Mapped[Optional[int]] = mapped_column(
        Integer,
        nullable=True,
        default=20,
    )

    imggen_default_cfg_scale: Mapped[Optional[float]] = mapped_column(
        Float,
        nullable=True,
        default=7.0,
    )

    imggen_default_negative_prompt: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
    )

    imggen_completion_notification: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
    )

    imggen_desktop_notification: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
    )

    imggen_sound_notification: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
    )

    imggen_notification_sound: Mapped[Optional[str]] = mapped_column(
        String(100),
        nullable=True,
        default="default",
    )

    imggen_auto_delete_days: Mapped[Optional[int]] = mapped_column(
        Integer,
        nullable=True,
    )

    imggen_max_generations: Mapped[Optional[int]] = mapped_column(
        Integer,
        nullable=True,
    )

    comfyui_base_url: Mapped[Optional[str]] = mapped_column(
        String(500),
        nullable=True,
    )

    # Relationship
    user: Mapped["User"] = relationship(
        "User",
        back_populates="preference",
    )

    def __repr__(self) -> str:
        return f"<UserPreference(id={self.id}, user_id={self.user_id})>"
