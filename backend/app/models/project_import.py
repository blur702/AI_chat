"""ProjectImport model for tracking async import jobs."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any, Dict, Optional
from uuid import UUID

from sqlalchemy import ForeignKey, Index, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import TimestampMixin, UUIDMixin

if TYPE_CHECKING:
    from app.models.project import Project
    from app.models.user import User


class ProjectImport(UUIDMixin, TimestampMixin, Base):
    """Tracks an async project import job (git clone or archive upload)."""

    __tablename__ = "project_imports"

    user_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )

    project_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
    )

    import_type: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
    )

    source_url: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
    )

    status: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        default="pending",
    )

    detected_type: Mapped[Optional[str]] = mapped_column(
        String(50),
        nullable=True,
    )

    detected_template_id: Mapped[Optional[str]] = mapped_column(
        String(100),
        nullable=True,
    )

    progress_message: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
    )

    error_message: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
    )

    import_options: Mapped[Dict[str, Any]] = mapped_column(
        JSONB,
        nullable=False,
        default=dict,
    )

    # Relationships
    user: Mapped["User"] = relationship("User", passive_deletes=True)
    project: Mapped["Project"] = relationship("Project", passive_deletes=True)

    __table_args__ = (
        Index("idx_project_imports_user", "user_id"),
        Index("idx_project_imports_project", "project_id"),
        Index("idx_project_imports_status", "status"),
    )

    def __repr__(self) -> str:
        return (
            f"<ProjectImport(id={self.id}, project_id={self.project_id}, "
            f"type={self.import_type}, status={self.status})>"
        )
