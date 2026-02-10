"""Pydantic schemas for knowledge base API."""

from typing import Any, Dict, List, Optional
from uuid import UUID

from pydantic import BaseModel, Field


# -------------------------------------------------------------------------
# Request Schemas
# -------------------------------------------------------------------------


class KBSourceUploadRequest(BaseModel):
    """Request body for uploading a KB source (used with form data)."""

    project_id: UUID
    source_type: str = Field(..., pattern="^(pdf|text|markdown)$")
    source_path: str
    metadata: Optional[Dict[str, Any]] = None


# -------------------------------------------------------------------------
# Response Schemas
# -------------------------------------------------------------------------


class KBSourceResponse(BaseModel):
    """Response for a single KB source."""

    id: str
    project_id: str
    source_type: str
    source_path: str
    status: str
    chunk_count: int
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class KBSourceListResponse(BaseModel):
    """List of KB sources belonging to a project."""

    sources: List[KBSourceResponse] = Field(default_factory=list)
    count: int = 0


class KBChunkResponse(BaseModel):
    """Response for a single KB chunk."""

    id: str
    source_id: str
    content: str
    chunk_index: int
    metadata: Optional[Dict[str, Any]] = None
    has_embedding: bool
    similarity: Optional[float] = None


# -------------------------------------------------------------------------
# Search Schemas
# -------------------------------------------------------------------------


class KBSearchRequest(BaseModel):
    """Request body for semantic KB search."""

    project_id: UUID
    query: str = Field(..., min_length=1, max_length=1000)
    top_k: int = Field(default=5, ge=1, le=20)
    model: Optional[str] = Field(default="nomic-embed-text")


class KBSearchResult(BaseModel):
    """A single result from a semantic KB search."""

    chunk_id: str
    source_id: str
    content: str
    similarity: float
    metadata: Optional[Dict[str, Any]] = None


class KBSearchResponse(BaseModel):
    """Response wrapper for semantic KB search."""

    results: List[KBSearchResult] = Field(default_factory=list)
    query: str
    count: int
