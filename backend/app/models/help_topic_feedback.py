"""Feedback events for help topics."""

from __future__ import annotations

from typing import Optional
from uuid import UUID

from sqlalchemy import Boolean, ForeignKey, Index, String, Text
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.base import TimestampMixin, UUIDMixin


class HelpTopicFeedback(UUIDMixin, TimestampMixin, Base):
    """Stores whether a help topic response was helpful or not."""

    __tablename__ = "help_topic_feedback"

    help_topic_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("help_topics.id", ondelete="CASCADE"),
        nullable=False,
    )
    user_id: Mapped[Optional[UUID]] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    helpful: Mapped[bool] = mapped_column(Boolean, nullable=False)
    context_slug: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    query: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    source: Mapped[str] = mapped_column(String(50), nullable=False, default="help-modal")

    __table_args__ = (
        Index("idx_help_topic_feedback_topic_id", "help_topic_id"),
        Index("idx_help_topic_feedback_helpful", "helpful"),
        Index("idx_help_topic_feedback_created_at", "created_at"),
    )

