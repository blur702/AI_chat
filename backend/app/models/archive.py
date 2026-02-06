"""Archive model for managing project archives."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any, Dict, Optional
from uuid import UUID

from sqlalchemy import ForeignKey, Index, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import TimestampMixin, UUIDMixin

if TYPE_CHECKING:
    from app.models.project import Project


class Archive(UUIDMixin, TimestampMixin, Base):
    """
    Manages project archives for storage and retrieval.

    Stores archive location, access URL, and manifest metadata
    describing the archived content structure.
    """

    __tablename__ = "archives"

    project_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
    )

    base_url: Mapped[str] = mapped_column(
        Text,
        nullable=False,
    )

    archive_path: Mapped[str] = mapped_column(
        Text,
        nullable=False,
    )

    manifest: Mapped[Optional[Dict[str, Any]]] = mapped_column(
        JSONB,
        nullable=True,
    )

    status: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        default="pending",
    )

    # Relationships
    project: Mapped["Project"] = relationship(
        "Project",
        back_populates="archives",
    )

    __table_args__ = (
        Index("idx_archives_project", "project_id", "created_at"),
        Index("idx_archives_status", "status"),
    )

    def __repr__(self) -> str:
        return f"<Archive(id={self.id}, project_id={self.project_id}, status={self.status})>"
