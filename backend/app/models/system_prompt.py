"""SystemPrompt model for storing reusable system prompt templates."""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING, Optional
from uuid import UUID

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, String, Text, func
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import TimestampMixin, UUIDMixin

if TYPE_CHECKING:
    from app.models.user import User


class SystemPrompt(UUIDMixin, TimestampMixin, Base):
    """
    Reusable system prompt template owned by a user.

    Users can create a library of named prompts and assign them to
    projects or individual chats. One prompt per user can be marked
    as the default fallback.
    """

    __tablename__ = "system_prompts"

    user_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    deleted_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="system_prompts")

    __table_args__ = (
        Index("idx_system_prompts_user_id", "user_id"),
        Index("idx_system_prompts_user_default", "user_id", "is_default"),
    )

    def soft_delete(self) -> None:
        """Mark the prompt as deleted without removing from database."""
        self.is_deleted = True
        self.deleted_at = func.now()

    def __repr__(self) -> str:
        return f"<SystemPrompt(id={self.id}, name={self.name}, user_id={self.user_id})>"
