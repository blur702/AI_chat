"""ContextSnippet model for storing reusable context text snippets."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import TYPE_CHECKING, List, Optional
from uuid import UUID

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import TimestampMixin, UUIDMixin

if TYPE_CHECKING:
    from app.models.user import User


class ContextSnippet(UUIDMixin, TimestampMixin, Base):
    """
    Reusable context text snippet owned by a user.

    Users can save frequently used text fragments (instructions, boilerplate,
    rules) and quickly insert them into context layers via the Context Editor.
    """

    __tablename__ = "context_snippets"

    user_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    tags: Mapped[Optional[List[str]]] = mapped_column(JSONB, default=list, nullable=False)
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    deleted_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="context_snippets")

    __table_args__ = (
        Index("idx_context_snippets_user_id_not_deleted", "user_id", "is_deleted"),
    )

    def soft_delete(self) -> None:
        """Mark the snippet as deleted without removing from database."""
        self.is_deleted = True
        self.deleted_at = datetime.now(timezone.utc)

    def __repr__(self) -> str:
        return f"<ContextSnippet(id={self.id}, name={self.name}, user_id={self.user_id})>"
