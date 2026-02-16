"""HelpTopic model for storing searchable help content."""

from __future__ import annotations

from typing import Any, Dict, List, Optional
from uuid import UUID

from pgvector.sqlalchemy import VECTOR
from sqlalchemy import Index, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.base import TimestampMixin, UUIDMixin


class HelpTopic(UUIDMixin, TimestampMixin, Base):
    """
    Searchable help topic with vector embedding for semantic search.

    Each topic has a unique slug that serves as a section anchor,
    enabling UI tooltips and help modals to deep-link to specific sections.
    """

    __tablename__ = "help_topics"

    slug: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    section_id: Mapped[str] = mapped_column(String(255), nullable=False)
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    tags: Mapped[Optional[List[str]]] = mapped_column(
        JSONB, default=list, nullable=False, server_default="'[]'::jsonb"
    )
    embedding: Mapped[Optional[List[float]]] = mapped_column(
        VECTOR(1024), nullable=True
    )

    __table_args__ = (
        Index("idx_help_topics_slug", "slug", unique=True),
        Index("idx_help_topics_section_id", "section_id"),
    )

    def __repr__(self) -> str:
        return f"<HelpTopic(id={self.id}, slug={self.slug}, title={self.title})>"
