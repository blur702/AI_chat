"""PlanPhase model for sequential phases within a planning session."""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING, Any, Dict, List, Optional
from uuid import UUID

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, String, Text
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import TimestampMixin, UUIDMixin

if TYPE_CHECKING:
    from app.models.plan_task import PlanTask
    from app.models.planning_session import PlanningSession


class PlanPhase(UUIDMixin, TimestampMixin, Base):
    """
    A single phase in a planning session with inputs, outputs, and verification.

    Phases are sequential steps with explicit success criteria.
    Each phase must be approved before execution can begin.
    """

    __tablename__ = "plan_phases"

    session_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("planning_sessions.id", ondelete="CASCADE"),
        nullable=False,
    )

    title: Mapped[str] = mapped_column(String(500), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    phase_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # What this phase needs and produces
    inputs: Mapped[Optional[List[str]]] = mapped_column(
        ARRAY(Text), nullable=True, default=list
    )
    outputs: Mapped[Optional[List[str]]] = mapped_column(
        ARRAY(Text), nullable=True, default=list
    )

    # Detailed implementation plan: {files, classes, key_methods, ui_components}
    implementation_plan: Mapped[Optional[Dict[str, Any]]] = mapped_column(
        JSONB, nullable=True, default=dict
    )

    # Verification checks: [{type: "test"|"static"|"integration"|"manual"|"ui", criteria: "..."}]
    verification_checks: Mapped[Optional[List[Dict[str, Any]]]] = mapped_column(
        JSONB, nullable=True, default=list
    )

    # Workflow state: pending -> in_progress -> verifying -> completed -> failed
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="pending"
    )

    user_approved: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )

    # Results from running verification checks
    verification_result: Mapped[Optional[Dict[str, Any]]] = mapped_column(
        JSONB, nullable=True
    )

    started_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    completed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Relationships
    session: Mapped["PlanningSession"] = relationship(
        "PlanningSession",
        back_populates="phases",
        foreign_keys=[session_id],
    )
    tasks: Mapped[List["PlanTask"]] = relationship(
        "PlanTask",
        back_populates="phase",
        cascade="all, delete-orphan",
        order_by="PlanTask.task_order",
    )

    __table_args__ = (
        Index("idx_plan_phases_session_order", "session_id", "phase_order"),
    )

    def __repr__(self) -> str:
        return f"<PlanPhase(id={self.id}, title={self.title}, order={self.phase_order})>"
