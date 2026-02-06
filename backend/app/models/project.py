"""
Project model for managing user code projects.
"""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING, Any, Dict, List, Optional
from uuid import UUID

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, String, Text
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import TimestampMixin, UUIDMixin

if TYPE_CHECKING:
    from app.models.archive import Archive
    from app.models.automation_action import AutomationAction
    from app.models.chat import Chat
    from app.models.kb_source import KBSource
    from app.models.user import User
    from app.models.yolo_edit import YoloEdit


class Project(UUIDMixin, TimestampMixin, Base):
    """
    Project model representing a user's code project.

    Stores project metadata, settings, and custom context for AI assistance.
    Supports soft delete for recovery and audit purposes.
    """

    __tablename__ = "projects"

    user_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )

    name: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )

    path: Mapped[str] = mapped_column(
        Text,
        nullable=False,
    )

    type: Mapped[Optional[str]] = mapped_column(
        String(50),
        nullable=True,
    )

    settings: Mapped[Optional[Dict[str, Any]]] = mapped_column(
        JSONB,
        nullable=True,
    )

    custom_context: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
    )

    important_files: Mapped[Optional[List[str]]] = mapped_column(
        ARRAY(Text),
        nullable=True,
    )

    is_deleted: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
    )

    deleted_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    # Relationships
    user: Mapped["User"] = relationship(
        "User",
        back_populates="projects",
    )
    chats: Mapped[List["Chat"]] = relationship(
        "Chat",
        back_populates="project",
        cascade="all, delete-orphan",
    )
    kb_sources: Mapped[List["KBSource"]] = relationship(
        "KBSource",
        back_populates="project",
        cascade="all, delete-orphan",
    )
    automation_actions: Mapped[List["AutomationAction"]] = relationship(
        "AutomationAction",
        back_populates="project",
        cascade="all, delete-orphan",
    )
    yolo_edits: Mapped[List["YoloEdit"]] = relationship(
        "YoloEdit",
        back_populates="project",
        cascade="all, delete-orphan",
    )
    archives: Mapped[List["Archive"]] = relationship(
        "Archive",
        back_populates="project",
        cascade="all, delete-orphan",
    )

    # Indexes
    __table_args__ = (
        Index("idx_projects_user_id", "user_id"),
        Index("idx_projects_user_active", "user_id", "is_deleted"),
    )

    def __repr__(self) -> str:
        return f"<Project(id={self.id}, name={self.name}, user_id={self.user_id})>"

    def soft_delete(self) -> None:
        """Mark the project as deleted without removing from database."""
        from sqlalchemy.sql import func
        self.is_deleted = True
        self.deleted_at = func.now()

    def restore(self) -> None:
        """Restore a soft-deleted project."""
        self.is_deleted = False
        self.deleted_at = None
