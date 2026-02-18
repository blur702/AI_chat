"""Video Studio models for video project editing, media assets, and exports."""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING, Any, Dict, List, Optional
from uuid import UUID

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Index, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import TimestampMixin, UUIDMixin

if TYPE_CHECKING:
    from app.models.user import User


class VideoProject(UUIDMixin, TimestampMixin, Base):
    """A video editing project with full timeline state stored as JSONB."""

    __tablename__ = "video_projects"

    user_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )

    name: Mapped[str] = mapped_column(String(255), nullable=False)

    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    timeline_data: Mapped[Optional[Dict[str, Any]]] = mapped_column(
        JSONB, nullable=True, default=dict
    )

    settings: Mapped[Dict[str, Any]] = mapped_column(
        JSONB,
        nullable=False,
        default=lambda: {
            "width": 1920,
            "height": 1080,
            "fps": 30,
            "background_color": "#000000",
        },
    )

    thumbnail_path: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    duration_seconds: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    status: Mapped[str] = mapped_column(
        String(50), nullable=False, default="draft"
    )

    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    deleted_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Relationships
    user: Mapped["User"] = relationship("User", passive_deletes=True)
    media_assets: Mapped[List["MediaAsset"]] = relationship(
        "MediaAsset", back_populates="video_project", passive_deletes=True
    )
    exports: Mapped[List["VideoExport"]] = relationship(
        "VideoExport", back_populates="video_project", passive_deletes=True
    )

    __table_args__ = (
        Index("idx_video_projects_user", "user_id"),
        Index("idx_video_projects_status", "status"),
        Index("idx_video_projects_deleted", "is_deleted"),
        Index("idx_video_projects_user_created", "user_id", "created_at"),
    )

    def __repr__(self) -> str:
        return f"<VideoProject(id={self.id}, name={self.name!r}, status={self.status})>"


class MediaAsset(UUIDMixin, TimestampMixin, Base):
    """An uploaded or recorded media file (video, audio, image) within a project."""

    __tablename__ = "media_assets"

    user_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )

    video_project_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("video_projects.id", ondelete="CASCADE"),
        nullable=False,
    )

    filename: Mapped[str] = mapped_column(String(500), nullable=False)
    file_path: Mapped[str] = mapped_column(String(1000), nullable=False)

    media_type: Mapped[str] = mapped_column(
        String(50), nullable=False
    )  # "video", "audio", "image"

    mime_type: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    file_size_bytes: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    duration_seconds: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    width: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    height: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    waveform_data: Mapped[Optional[Dict[str, Any]]] = mapped_column(
        JSONB, nullable=True
    )

    thumbnail_path: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    metadata: Mapped[Optional[Dict[str, Any]]] = mapped_column(
        JSONB, nullable=True
    )

    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # Relationships
    video_project: Mapped["VideoProject"] = relationship(
        "VideoProject", back_populates="media_assets"
    )

    __table_args__ = (
        Index("idx_media_assets_project", "video_project_id"),
        Index("idx_media_assets_user", "user_id"),
        Index("idx_media_assets_type", "media_type"),
        Index("idx_media_assets_deleted", "is_deleted"),
    )

    def __repr__(self) -> str:
        return (
            f"<MediaAsset(id={self.id}, filename={self.filename!r}, "
            f"media_type={self.media_type})>"
        )


class VideoExport(UUIDMixin, TimestampMixin, Base):
    """A render/export job for a video project."""

    __tablename__ = "video_exports"

    video_project_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("video_projects.id", ondelete="CASCADE"),
        nullable=False,
    )

    user_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )

    status: Mapped[str] = mapped_column(
        String(50), nullable=False, default="pending"
    )

    format: Mapped[str] = mapped_column(
        String(20), nullable=False, default="mp4"
    )

    resolution: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    file_path: Mapped[Optional[str]] = mapped_column(String(1000), nullable=True)
    file_size_bytes: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    progress_percent: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    export_settings: Mapped[Optional[Dict[str, Any]]] = mapped_column(
        JSONB, nullable=True
    )

    timeline_snapshot: Mapped[Optional[Dict[str, Any]]] = mapped_column(
        JSONB, nullable=True
    )

    # Relationships
    video_project: Mapped["VideoProject"] = relationship(
        "VideoProject", back_populates="exports"
    )

    __table_args__ = (
        Index("idx_video_exports_project", "video_project_id"),
        Index("idx_video_exports_user", "user_id"),
        Index("idx_video_exports_status", "status"),
    )

    def __repr__(self) -> str:
        return (
            f"<VideoExport(id={self.id}, project_id={self.video_project_id}, "
            f"status={self.status}, progress={self.progress_percent}%)>"
        )
