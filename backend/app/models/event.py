"""
Event model for audit trail and event persistence.

Stores critical events from the EventBus for audit, debugging, and historical analysis.
"""

from uuid import UUID

from sqlalchemy import String, Index, ForeignKey
from sqlalchemy.dialects.postgresql import UUID as PGUUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import UUIDMixin, TimestampMixin


class Event(Base, UUIDMixin, TimestampMixin):
    """
    Persistent event record for the EventBus.

    Stores events that are marked for persistence, enabling audit trails,
    debugging, and historical analysis of system events.

    Attributes:
        event_type: Category of event (e.g., 'model_loaded', 'tool_executed')
        event_data: JSON payload containing event-specific data
        severity: Event severity level (info, warning, error, critical)
        source: Component or service that generated the event
        user_id: Optional user associated with the event
        chat_id: Optional chat session associated with the event
        resource_id: Optional resource identifier associated with the event
    """

    __tablename__ = "events"

    event_type: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
        index=True,
    )

    event_data: Mapped[dict] = mapped_column(
        JSONB,
        nullable=False,
        default=dict,
    )

    severity: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        default="info",
    )

    source: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
    )

    user_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    chat_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("chats.id", ondelete="SET NULL"),
        nullable=True,
    )

    resource_id: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
    )

    # Relationships
    user = relationship("User", back_populates="events", lazy="selectin")
    chat = relationship("Chat", back_populates="events", lazy="selectin")

    __table_args__ = (
        Index("idx_events_type_created", "event_type", "created_at"),
        Index("idx_events_severity", "severity"),
        Index("idx_events_user_id", "user_id"),
        Index("idx_events_chat_id", "chat_id"),
    )

    def __repr__(self) -> str:
        return f"<Event(id={self.id}, type={self.event_type})>"
