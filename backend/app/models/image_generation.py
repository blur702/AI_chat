"""ImageGeneration model for tracking ComfyUI image generation jobs."""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING, Any, Dict, List, Optional
from uuid import UUID

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import TimestampMixin, UUIDMixin

if TYPE_CHECKING:
    from app.models.user import User


class ImageGeneration(UUIDMixin, TimestampMixin, Base):
    """Tracks a ComfyUI image generation job from submission to completion."""

    __tablename__ = "image_generations"

    user_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )

    project_id: Mapped[Optional[UUID]] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=True,
    )

    workflow_type: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
    )

    prompt: Mapped[str] = mapped_column(
        Text,
        nullable=False,
    )

    negative_prompt: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
    )

    status: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        default="pending",
    )

    workflow_data: Mapped[Dict[str, Any]] = mapped_column(
        JSONB,
        nullable=False,
        default=dict,
    )

    result_images: Mapped[List[str]] = mapped_column(
        JSONB,
        nullable=False,
        default=list,
    )

    error_message: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
    )

    comfyui_job_id: Mapped[Optional[str]] = mapped_column(
        String(255),
        nullable=True,
    )

    # Soft deletion
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    deleted_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Relationships
    user: Mapped["User"] = relationship(
        "User",
        back_populates="image_generations",
    )

    __table_args__ = (
        Index("idx_image_generations_user", "user_id"),
        Index("idx_image_generations_project", "project_id"),
        Index("idx_image_generations_status", "status"),
    )

    def __repr__(self) -> str:
        return (
            f"<ImageGeneration(id={self.id}, user_id={self.user_id}, "
            f"status={self.status}, workflow_type={self.workflow_type})>"
        )
