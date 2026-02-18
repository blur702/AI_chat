"""Note model for user notes with project scoping and categories."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import TYPE_CHECKING, Optional
from uuid import UUID

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, String, Text
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import TimestampMixin, UUIDMixin

if TYPE_CHECKING:
    from app.models.issue import Issue
    from app.models.note_category import NoteCategory
    from app.models.project import Project
    from app.models.user import User


class Note(UUIDMixin, TimestampMixin, Base):
    """User-owned note, optionally scoped to a project and category."""

    __tablename__ = "notes"

    user_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    project_id: Mapped[Optional[UUID]] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="SET NULL"),
        nullable=True,
    )
    category_id: Mapped[Optional[UUID]] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("note_categories.id", ondelete="SET NULL"),
        nullable=True,
    )
    title: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    body: Mapped[str] = mapped_column(Text, nullable=False, default="")
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="active"
    )
    pinned: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_deleted: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    deleted_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    completed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    issue_id: Mapped[Optional[UUID]] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("issues.id", ondelete="SET NULL"),
        nullable=True,
    )

    user: Mapped["User"] = relationship("User", back_populates="notes")
    issue: Mapped[Optional["Issue"]] = relationship(
        "Issue", foreign_keys=[issue_id], lazy="selectin"
    )
    project: Mapped[Optional["Project"]] = relationship("Project", lazy="selectin")
    category: Mapped[Optional["NoteCategory"]] = relationship("NoteCategory", lazy="selectin")

    __table_args__ = (
        Index("idx_notes_user_status", "user_id", "status", "is_deleted"),
        Index("idx_notes_project", "project_id", "is_deleted"),
    )

    def soft_delete(self) -> None:
        self.is_deleted = True
        self.deleted_at = datetime.now(timezone.utc)

    def mark_complete(self) -> None:
        self.status = "completed"
        self.completed_at = datetime.now(timezone.utc)

    def archive(self) -> None:
        self.status = "archived"
