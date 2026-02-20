"""Claude Code chat messages for remote bug reporting."""

from uuid import UUID

from sqlalchemy import ForeignKey, Index, String, Text
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.base import TimestampMixin, UUIDMixin


class ClaudeCodeMessage(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "claude_code_messages"

    user_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    role: Mapped[str] = mapped_column(String(20), nullable=False)  # "user" or "assistant"
    content: Mapped[str] = mapped_column(Text, nullable=False)
    page_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    console_logs: Mapped[str | None] = mapped_column(Text, nullable=True)

    __table_args__ = (Index("idx_cc_messages_user_created", "user_id", "created_at"),)
