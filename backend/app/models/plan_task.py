"""PlanTask model for granular tasks within a planning phase."""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING, Any, Dict, List, Optional
from uuid import UUID

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, Text
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import TimestampMixin, UUIDMixin

if TYPE_CHECKING:
    from app.models.automation_action import AutomationAction
    from app.models.plan_phase import PlanPhase


class PlanTask(UUIDMixin, TimestampMixin, Base):
    """
    An atomic task within a planning phase.

    Tasks map to specific operations: file changes, UI component additions,
    command execution, or verification steps. When executed, they can
    generate automation actions for the approval workflow.
    """

    __tablename__ = "plan_tasks"

    phase_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("plan_phases.id", ondelete="CASCADE"),
        nullable=False,
    )

    title: Mapped[str] = mapped_column(String(500), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    task_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # Task type: file_create, file_modify, file_delete, ui_component,
    #            ui_layout, ui_style, run_command, install_package, verification
    task_type: Mapped[str] = mapped_column(String(50), nullable=False)

    # Type-specific data payload
    task_data: Mapped[Optional[Dict[str, Any]]] = mapped_column(
        JSONB, nullable=True, default=dict
    )

    # Task IDs this depends on (as strings)
    depends_on: Mapped[Optional[List[str]]] = mapped_column(
        ARRAY(Text), nullable=True, default=list
    )

    # Workflow state: pending -> ready -> in_progress -> completed -> failed
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="pending"
    )

    # Execution result
    result: Mapped[Optional[Dict[str, Any]]] = mapped_column(
        JSONB, nullable=True
    )

    completed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Link to automation action created during execution
    automation_action_id: Mapped[Optional[UUID]] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("automation_actions.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Relationships
    phase: Mapped["PlanPhase"] = relationship(
        "PlanPhase", back_populates="tasks"
    )
    automation_action: Mapped[Optional["AutomationAction"]] = relationship(
        "AutomationAction", foreign_keys=[automation_action_id]
    )

    __table_args__ = (
        Index("idx_plan_tasks_phase_order", "phase_id", "task_order"),
        Index("idx_plan_tasks_status", "phase_id", "status"),
    )

    def __repr__(self) -> str:
        return f"<PlanTask(id={self.id}, title={self.title}, type={self.task_type})>"
