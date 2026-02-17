"""Pydantic schemas for knowledge base API."""

from typing import Any, Dict, List, Optional
from uuid import UUID

from pydantic import BaseModel, Field, model_validator


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
    model: Optional[str] = Field(default=None)


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


# -------------------------------------------------------------------------
# KB Builder Wizard Schemas
# -------------------------------------------------------------------------


class KBBulkUploadFileInfo(BaseModel):
    """Info for a single uploaded file."""

    file_id: str
    filename: str
    size: int
    type: str


class KBBulkUploadResponse(BaseModel):
    """Response after bulk file upload."""

    files: List[KBBulkUploadFileInfo] = Field(default_factory=list)


class KBExtractPreviewResponse(BaseModel):
    """Response for text extraction preview."""

    filename: str
    source_type: str
    extracted_text: str
    char_count: int
    extraction_method: str


class KBChunkPreviewRequest(BaseModel):
    """Request to preview chunking."""

    text: str = Field(..., min_length=1)
    chunk_size: int = Field(default=500, ge=50, le=5000)
    chunk_overlap: int = Field(default=50, ge=0, le=500)
    separators: Optional[List[str]] = None

    @model_validator(mode="after")
    def validate_overlap(self) -> "KBChunkPreviewRequest":
        if self.chunk_overlap >= self.chunk_size:
            raise ValueError("chunk_overlap must be less than chunk_size")
        return self


class KBChunkPreviewItem(BaseModel):
    """A single chunk in preview."""

    content: str
    index: int
    char_count: int


class KBChunkPreviewResponse(BaseModel):
    """Response for chunk preview."""

    chunks: List[KBChunkPreviewItem] = Field(default_factory=list)
    total_chunks: int
    avg_chunk_size: float


class KBEmbeddingModelInfo(BaseModel):
    """Info about an embedding model."""

    name: str
    size: Optional[str] = None
    parameter_size: Optional[str] = None
    embedding_length: Optional[int] = None


class KBEmbeddingModelsResponse(BaseModel):
    """Response listing embedding models."""

    models: List[KBEmbeddingModelInfo] = Field(default_factory=list)


class KBBulkIngestRequest(BaseModel):
    """Request to start batch ingestion."""

    project_id: Optional[UUID] = None
    file_ids: List[str] = Field(..., min_length=1)
    chunk_size: int = Field(default=500, ge=50, le=5000)
    chunk_overlap: int = Field(default=50, ge=0, le=500)
    embedding_model: str = Field(default="nomic-embed-text")
    image_processing: Optional[Dict[str, str]] = None
    scope: str = Field(default="project", pattern="^(project|global)$")

    @model_validator(mode="after")
    def validate_overlap(self) -> "KBBulkIngestRequest":
        if self.chunk_overlap >= self.chunk_size:
            raise ValueError("chunk_overlap must be less than chunk_size")
        return self


class KBBulkIngestResponse(BaseModel):
    """Response after starting batch ingestion."""

    batch_id: str
    total_files: int
    status: str


class KBBulkFileStatus(BaseModel):
    """Status for a single file in a batch."""

    file_id: str
    filename: str
    status: str
    chunks: int = 0
    error: Optional[str] = None


class KBBulkStatusResponse(BaseModel):
    """Response for batch ingestion status."""

    batch_id: str
    status: str
    total_files: int
    files_completed: int = 0
    files_failed: int = 0
    total_chunks: int = 0
    chunks_embedded: int = 0
    file_statuses: List[KBBulkFileStatus] = Field(default_factory=list)
