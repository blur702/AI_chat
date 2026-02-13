"""Chat model for storing conversation sessions within projects."""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING, List, Optional
from uuid import UUID

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, String, Text, func
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import TimestampMixin, UUIDMixin

if TYPE_CHECKING:
    from app.models.context_compaction import ContextCompaction
    from app.models.event import Event
    from app.models.message import Message
    from app.models.project import Project
    from app.models.system_prompt import SystemPrompt
    from app.models.yolo_edit import YoloEdit


class Chat(UUIDMixin, TimestampMixin, Base):
    """
    Represents a chat session within a project.

    Chats contain a series of messages between the user and AI assistant.
    They support pinning, archiving, and soft deletion for organization.
    """

    __tablename__ = "chats"

    project_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
    )
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    is_pinned: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_archived: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    deleted_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    system_prompt_id: Mapped[Optional[UUID]] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("system_prompts.id", ondelete="SET NULL"),
        nullable=True,
    )
    chat_instructions: Mapped[Optional[str]] = mapped_column(
        Text, nullable=True
    )

    # Relationships
    project: Mapped["Project"] = relationship("Project", back_populates="chats")
    system_prompt: Mapped[Optional["SystemPrompt"]] = relationship(
        "SystemPrompt", foreign_keys=[system_prompt_id]
    )
    messages: Mapped[List["Message"]] = relationship(
        "Message",
        back_populates="chat",
        cascade="all, delete-orphan",
        order_by="Message.created_at",
    )
    context_compactions: Mapped[List["ContextCompaction"]] = relationship(
        "ContextCompaction",
        back_populates="chat",
        cascade="all, delete-orphan",
        order_by="ContextCompaction.created_at",
    )
    yolo_edits: Mapped[List["YoloEdit"]] = relationship(
        "YoloEdit",
        back_populates="chat",
    )

    events: Mapped[List["Event"]] = relationship(
        "Event",
        back_populates="chat",
    )

    __table_args__ = (
        Index("idx_chats_project_updated", "project_id", "updated_at"),
        Index("idx_chats_pinned", "project_id", "is_pinned", "updated_at"),
        Index("idx_chats_archived", "project_id", "is_archived"),
    )

    def soft_delete(self) -> None:
        """Mark the chat as deleted without removing from database."""
        self.is_deleted = True
        self.deleted_at = func.now()

    def restore(self) -> None:
        """Restore a soft-deleted chat."""
        self.is_deleted = False
        self.deleted_at = None

    def __repr__(self) -> str:
        return f"<Chat(id={self.id}, title={self.title}, project_id={self.project_id})>"
