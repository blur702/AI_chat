"""
KBChunk model for knowledge base vector chunks.

Represents a chunk of content from a knowledge base source,
with vector embeddings for semantic search.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any, Dict, List, Optional
from uuid import UUID

from pgvector.sqlalchemy import VECTOR
from sqlalchemy import ForeignKey, Index, Integer, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import TimestampMixin, UUIDMixin

if TYPE_CHECKING:
    from app.models.kb_source import KBSource


class KBChunk(UUIDMixin, TimestampMixin, Base):
    """
    Knowledge base chunk model.

    Stores chunked content with vector embeddings for semantic search.
    Each chunk belongs to a source and contains metadata about its origin.
    """

    __tablename__ = "kb_chunks"

    source_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("kb_sources.id", ondelete="CASCADE"),
        nullable=False,
    )

    project_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
    )

    content: Mapped[str] = mapped_column(
        Text,
        nullable=False,
    )

    embedding: Mapped[Optional[List[float]]] = mapped_column(
        VECTOR(1024),
        nullable=True,
    )

    chunk_metadata: Mapped[Optional[Dict[str, Any]]] = mapped_column(
        "metadata",
        JSONB,
        nullable=True,
    )

    chunk_index: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )

    # Relationships
    source: Mapped["KBSource"] = relationship(
        "KBSource",
        back_populates="chunks",
    )

    # Indexes
    __table_args__ = (
        Index("idx_kb_chunks_project", "project_id"),
        Index("idx_kb_chunks_source", "source_id", "chunk_index"),
    )

    def __repr__(self) -> str:
        return f"<KBChunk(id={self.id}, source_id={self.source_id}, index={self.chunk_index})>"


# IVFFlat index for vector similarity search
# Optimized for cosine similarity with 100 lists (suitable for 10K-1M vectors)
ivfflat_index = Index(
    "idx_kb_chunks_embedding",
    KBChunk.embedding,
    postgresql_using="ivfflat",
    postgresql_with={"lists": 100},
    postgresql_ops={"embedding": "vector_cosine_ops"},
)
