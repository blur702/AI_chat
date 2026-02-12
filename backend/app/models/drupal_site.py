"""Drupal site connection model for remote site management via MCP."""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING, Any, Dict, Optional
from uuid import UUID

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import TimestampMixin, UUIDMixin

if TYPE_CHECKING:
    from app.models.project import Project


class DrupalSite(UUIDMixin, TimestampMixin, Base):
    """Stores a remote Drupal site connection for a project."""

    __tablename__ = "drupal_sites"

    project_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )

    site_url: Mapped[str] = mapped_column(
        String(2048),
        nullable=False,
    )

    api_key_encrypted: Mapped[str] = mapped_column(
        Text,
        nullable=False,
    )

    site_name: Mapped[Optional[str]] = mapped_column(
        String(255),
        nullable=True,
    )

    last_sync_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    sync_config: Mapped[Optional[Dict[str, Any]]] = mapped_column(
        JSONB,
        nullable=True,
    )

    # Relationships
    project: Mapped["Project"] = relationship(
        "Project",
        backref="drupal_site",
    )

    def __repr__(self) -> str:
        return f"<DrupalSite(id={self.id}, project_id={self.project_id}, site_url={self.site_url})>"
