"""Message model for storing individual messages within chats."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any, Dict, Optional
from uuid import UUID

from sqlalchemy import Boolean, ForeignKey, Index, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import TimestampMixin, UUIDMixin

if TYPE_CHECKING:
    from app.models.chat import Chat


class Message(UUIDMixin, TimestampMixin, Base):
    """
    Represents a single message within a chat session.

    Messages store the conversation history between users and the AI assistant.
    They support metadata for tool calls and attachments, pinning for important
    messages, and exclusion from context for fine-grained control.
    """

    __tablename__ = "messages"

    chat_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("chats.id", ondelete="CASCADE"),
        nullable=False,
    )
    role: Mapped[str] = mapped_column(String(50), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    message_metadata: Mapped[Optional[Dict[str, Any]]] = mapped_column(
        "metadata", JSONB, nullable=True
    )
    is_pinned: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_excluded: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # Relationships
    chat: Mapped["Chat"] = relationship("Chat", back_populates="messages")

    __table_args__ = (
        Index("idx_messages_chat_created", "chat_id", "created_at"),
        Index("idx_messages_pinned", "chat_id", "is_pinned"),
        Index("idx_messages_excluded", "chat_id", "is_excluded"),
        Index("idx_messages_deleted", "chat_id", "is_deleted"),
    )

    def soft_delete(self) -> None:
        """Mark the message as deleted without removing from database."""
        self.is_deleted = True

    def __repr__(self) -> str:
        return f"<Message(id={self.id}, role={self.role}, chat_id={self.chat_id})>"
