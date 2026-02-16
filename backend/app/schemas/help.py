"""Pydantic schemas for help topics API."""

from typing import List, Optional

from pydantic import BaseModel, Field


# -------------------------------------------------------------------------
# Request Schemas
# -------------------------------------------------------------------------


class HelpTopicCreateRequest(BaseModel):
    """Request body for creating a help topic."""

    slug: str = Field(..., min_length=1, max_length=255)
    section_id: str = Field(..., min_length=1, max_length=255)
    title: str = Field(..., min_length=1, max_length=500)
    body: str = Field(..., min_length=1)
    tags: Optional[List[str]] = Field(default_factory=list)


class HelpTopicUpdateRequest(BaseModel):
    """Request body for updating a help topic (partial)."""

    slug: Optional[str] = Field(default=None, min_length=1, max_length=255)
    section_id: Optional[str] = Field(default=None, min_length=1, max_length=255)
    title: Optional[str] = Field(default=None, min_length=1, max_length=500)
    body: Optional[str] = Field(default=None, min_length=1)
    tags: Optional[List[str]] = None


class HelpSearchRequest(BaseModel):
    """Request body for semantic help search."""

    query: str = Field(..., min_length=1, max_length=1000)
    top_k: int = Field(default=5, ge=1, le=20)


# -------------------------------------------------------------------------
# Response Schemas
# -------------------------------------------------------------------------


class HelpTopicResponse(BaseModel):
    """Response for a single help topic."""

    id: str
    slug: str
    section_id: str
    title: str
    body: str
    tags: List[str] = Field(default_factory=list)
    has_embedding: bool = False
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class HelpTopicListResponse(BaseModel):
    """Paginated list of help topics."""

    topics: List[HelpTopicResponse] = Field(default_factory=list)
    count: int = 0


class HelpSearchResult(BaseModel):
    """A single result from a semantic help search."""

    id: str
    slug: str
    section_id: str
    title: str
    body: str
    tags: List[str] = Field(default_factory=list)
    similarity: float


class HelpSearchResponse(BaseModel):
    """Response wrapper for semantic help search."""

    results: List[HelpSearchResult] = Field(default_factory=list)
    query: str
    count: int
