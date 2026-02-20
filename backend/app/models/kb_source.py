"""
KBSource model for knowledge base source tracking.

Represents a source (file, directory, URL) that has been ingested
into the knowledge base for a project.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, List, Optional
from uuid import UUID

from sqlalchemy import ForeignKey, Index, Integer, String
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import TimestampMixin, UUIDMixin

if TYPE_CHECKING:
    from app.models.kb_chunk import KBChunk
    from app.models.project import Project


class KBSource(UUIDMixin, TimestampMixin, Base):
    """
    Knowledge base source model.

    Tracks sources that have been ingested into a project's knowledge base,
    including their processing status and chunk count.
    """

    __tablename__ = "kb_sources"

    project_id: Mapped[Optional[UUID]] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="SET NULL"),
        nullable=True,
    )

    source_type: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
    )

    source_path: Mapped[str] = mapped_column(
        String(1000),
        nullable=False,
    )

    status: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        default="pending",
    )

    chunk_count: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
    )

    # Relationships
    project: Mapped["Project"] = relationship(
        "Project",
        back_populates="kb_sources",
    )
    chunks: Mapped[List["KBChunk"]] = relationship(
        "KBChunk",
        back_populates="source",
        cascade="all, delete-orphan",
    )

    # Indexes
    __table_args__ = (
        Index("idx_kb_sources_project", "project_id"),
        Index("idx_kb_sources_status", "project_id", "status"),
    )

    def __repr__(self) -> str:
        return f"<KBSource(id={self.id}, type={self.source_type}, status={self.status})>"
