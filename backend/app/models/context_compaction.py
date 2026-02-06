"""Context compaction model for managing conversation history compression."""

from __future__ import annotations

from typing import TYPE_CHECKING, Optional
from uuid import UUID

from sqlalchemy import ForeignKey, Index, Integer, Text
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import TimestampMixin, UUIDMixin

if TYPE_CHECKING:
    from app.models.chat import Chat


class ContextCompaction(UUIDMixin, TimestampMixin, Base):
    """
    Records context compaction events for chat conversations.

    When a chat's message history grows too large for the context window,
    older messages are summarized into a compaction record. This preserves
    important context while reducing token usage.

    Attributes:
        chat_id: Foreign key to the parent chat.
        original_message_count: Number of messages before compaction.
        compacted_message_count: Number of messages after compaction.
        summary: The generated summary of compacted messages.
    """

    __tablename__ = "context_compactions"

    chat_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("chats.id", ondelete="CASCADE"),
        nullable=False,
    )
    original_message_count: Mapped[int] = mapped_column(Integer, nullable=False)
    compacted_message_count: Mapped[int] = mapped_column(Integer, nullable=False)
    summary: Mapped[str] = mapped_column(Text, nullable=False)

    # Relationships
    chat: Mapped["Chat"] = relationship("Chat", back_populates="context_compactions")

    __table_args__ = (Index("idx_compactions_chat", "chat_id"),)

    def __repr__(self) -> str:
        return (
            f"<ContextCompaction(id={self.id}, chat_id={self.chat_id}, "
            f"original={self.original_message_count}, compacted={self.compacted_message_count})>"
        )
