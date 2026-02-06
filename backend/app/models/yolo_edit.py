"""YoloEdit model for recording direct file modifications with undo capability."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any, Dict, List, Optional
from uuid import UUID

from sqlalchemy import Boolean, ForeignKey, Index, Text
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import TimestampMixin, UUIDMixin

if TYPE_CHECKING:
    from app.models.chat import Chat
    from app.models.project import Project


class YoloEdit(UUIDMixin, TimestampMixin, Base):
    """
    Records direct file modifications made during AI assistance.

    Tracks which files were modified, stores undo data for recovery,
    and maintains history even if the originating chat is deleted.
    """

    __tablename__ = "yolo_edits"

    project_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
    )

    chat_id: Mapped[Optional[UUID]] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("chats.id", ondelete="SET NULL"),
        nullable=True,
    )

    files_modified: Mapped[List[str]] = mapped_column(
        ARRAY(Text),
        nullable=False,
    )

    undo_performed: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
    )

    undo_data: Mapped[Optional[Dict[str, Any]]] = mapped_column(
        JSONB,
        nullable=True,
    )

    # Relationships
    project: Mapped["Project"] = relationship(
        "Project",
        back_populates="yolo_edits",
    )
    chat: Mapped[Optional["Chat"]] = relationship(
        "Chat",
        back_populates="yolo_edits",
    )

    __table_args__ = (
        Index("idx_yolo_edits_project", "project_id", "created_at"),
        Index("idx_yolo_edits_chat", "chat_id"),
    )

    def __repr__(self) -> str:
        file_count = len(self.files_modified) if self.files_modified else 0
        return f"<YoloEdit(id={self.id}, project_id={self.project_id}, files={file_count})>"
