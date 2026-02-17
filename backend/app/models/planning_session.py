"""PlanningSession model for Traycer-style structured planning workflows."""

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
    from app.models.chat import Chat
    from app.models.plan_phase import PlanPhase
    from app.models.project import Project
    from app.models.user import User


class PlanningSession(UUIDMixin, TimestampMixin, Base):
    """
    A structured planning session following the Plan -> Execute -> Verify -> Ship workflow.

    Sessions contain ordered phases, each with tasks and verification checks.
    They can target sandbox projects, the UI builder, or both.
    """

    __tablename__ = "planning_sessions"

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
    user_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )

    title: Mapped[str] = mapped_column(String(500), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Where generated output goes: 'sandbox', 'ui_builder', or 'both'
    target_type: Mapped[str] = mapped_column(
        String(20), nullable=False, default="sandbox"
    )

    # Serialized UI builder tree state (when target includes ui_builder)
    ui_builder_state: Mapped[Optional[Dict[str, Any]]] = mapped_column(
        JSONB, nullable=True
    )

    # Workflow state: draft -> active -> in_progress -> completed -> archived
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="draft"
    )

    current_phase_id: Mapped[Optional[UUID]] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("plan_phases.id", ondelete="SET NULL", use_alter=True),
        nullable=True,
    )

    # High-level success criteria for the entire plan
    success_criteria: Mapped[Optional[List[str]]] = mapped_column(
        ARRAY(Text), nullable=True, default=list
    )

    # Relationships
    project: Mapped["Project"] = relationship(
        "Project", back_populates="planning_sessions"
    )
    chat: Mapped[Optional["Chat"]] = relationship(
        "Chat", foreign_keys=[chat_id]
    )
    user: Mapped["User"] = relationship("User")
    phases: Mapped[List["PlanPhase"]] = relationship(
        "PlanPhase",
        back_populates="session",
        cascade="all, delete-orphan",
        order_by="PlanPhase.phase_order",
        foreign_keys="PlanPhase.session_id",
    )

    __table_args__ = (
        Index("idx_planning_sessions_project_status", "project_id", "status"),
        Index("idx_planning_sessions_chat", "chat_id"),
        Index("idx_planning_sessions_user", "user_id"),
    )

    def __repr__(self) -> str:
        return f"<PlanningSession(id={self.id}, title={self.title}, status={self.status})>"
