"""UI Component model for the drag-and-drop builder component library."""

from __future__ import annotations

from datetime import datetime
from typing import List, Optional
from uuid import UUID

from sqlalchemy import Boolean, DateTime, Index, String, Text
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.base import TimestampMixin, UUIDMixin


class UIComponent(UUIDMixin, TimestampMixin, Base):
    """Reusable UI component for the drag-and-drop builder."""

    __tablename__ = "ui_components"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    category: Mapped[str] = mapped_column(String(50), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    is_framework_specific: Mapped[bool] = mapped_column(Boolean, default=False)
    framework: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    html_template: Mapped[str] = mapped_column(Text, nullable=False)
    framework_code: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    props_schema: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    preview_image: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    tags: Mapped[List[str]] = mapped_column(ARRAY(String), nullable=False, default=list)
    is_mobile_responsive: Mapped[bool] = mapped_column(Boolean, default=True)

    __table_args__ = (
        Index("idx_ui_components_category", "category"),
        Index("idx_ui_components_framework", "framework"),
        Index("idx_ui_components_created", "created_at"),
    )
