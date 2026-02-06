"""AutomationAction model for tracking automated actions requiring user approval."""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING, Any, Dict, Optional
from uuid import UUID

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, String
from sqlalchemy.dialects.postgresql import JSONB, UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import TimestampMixin, UUIDMixin

if TYPE_CHECKING:
    from app.models.project import Project


class AutomationAction(UUIDMixin, TimestampMixin, Base):
    """
    Tracks automated actions that require user approval before execution.

    Stores action type, associated data, and approval/execution status.
    Used for auditing and user control over automated behaviors.
    """

    __tablename__ = "automation_actions"

    project_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
    )

    action_type: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
    )

    action_data: Mapped[Optional[Dict[str, Any]]] = mapped_column(
        JSONB,
        nullable=True,
    )

    user_approved: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
    )

    executed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    # Relationships
    project: Mapped["Project"] = relationship(
        "Project",
        back_populates="automation_actions",
    )

    __table_args__ = (
        Index("idx_automation_project_created", "project_id", "created_at"),
    )

    def __repr__(self) -> str:
        return f"<AutomationAction(id={self.id}, action_type={self.action_type}, project_id={self.project_id})>"
