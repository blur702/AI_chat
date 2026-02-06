"""Resource model for tracking external resources loaded into the system."""

from datetime import datetime
from typing import Optional
from uuid import UUID

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.base import TimestampMixin, UUIDMixin


class Resource(UUIDMixin, TimestampMixin, Base):
    """
    Tracks external resources loaded into the application.

    Resources represent files, APIs, databases, or other external data sources
    that can be loaded and managed within the system. Supports priority-based
    loading and automatic unloading for memory management.

    Attributes:
        resource_id: Unique external identifier for the resource.
        resource_type: Category of resource (e.g., "file", "api", "database").
        status: Current state of the resource (e.g., "active", "loading", "error").
        location: Path or URL where the resource can be accessed.
        priority: Loading priority (higher values = higher priority).
        auto_unload: Whether to automatically unload when memory is constrained.
        last_used_at: Timestamp of the most recent access.
        user_locked: Whether the resource is locked by a user, preventing preemption.
        user_id: The UUID of the user who locked this resource (if locked).
        vram_mb: VRAM usage in megabytes for loaded models.
        base_priority: Base priority value before any user lock boosts are applied.
    """

    __tablename__ = "resources"

    resource_id: Mapped[str] = mapped_column(
        String(255), nullable=False, unique=True
    )
    resource_type: Mapped[str] = mapped_column(String(100), nullable=False)
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="active")
    location: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    priority: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    auto_unload: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    last_used_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Resource management fields
    user_locked: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    user_id: Mapped[Optional[UUID]] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True
    )
    vram_mb: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    base_priority: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    __table_args__ = (
        Index("idx_resources_status", "status"),
        Index("idx_resources_user_locked", "user_locked"),
        Index("idx_resources_user_id", "user_id"),
    )

    def __repr__(self) -> str:
        return f"<Resource(id={self.id}, resource_id={self.resource_id}, status={self.status})>"
