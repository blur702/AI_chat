"""Pydantic schemas for project import and container portability."""

import re
from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field, field_validator


# -------------------------------------------------------------------------
# Git Import
# -------------------------------------------------------------------------


class GitImportRequest(BaseModel):
    """Request to import a project from a Git repository."""

    name: str = Field(..., min_length=1, max_length=255)
    git_url: str = Field(..., min_length=1)
    branch: Optional[str] = Field(None, max_length=255)
    install_deps: bool = Field(True)
    path: Optional[str] = Field(None, max_length=500)

    @field_validator("git_url")
    @classmethod
    def validate_git_url(cls, v: str) -> str:
        v = v.strip()
        if not v.startswith("https://"):
            raise ValueError("Only HTTPS Git URLs are allowed")
        if not re.match(r"^https://[a-zA-Z0-9._\-]+/", v):
            raise ValueError("Invalid Git URL format")
        return v


class GitImportResponse(BaseModel):
    """Response after starting a Git import."""

    import_id: str
    project_id: str
    status: str
    message: str


# -------------------------------------------------------------------------
# Archive Upload
# -------------------------------------------------------------------------


class ArchiveUploadResponse(BaseModel):
    """Response after starting an archive import."""

    import_id: str
    project_id: str
    status: str
    message: str


# -------------------------------------------------------------------------
# Import Status
# -------------------------------------------------------------------------


class ImportStatusResponse(BaseModel):
    """Full import job state for polling."""

    import_id: str
    project_id: str
    import_type: str
    source_url: Optional[str] = None
    status: str
    detected_type: Optional[str] = None
    detected_template_id: Optional[str] = None
    progress_message: Optional[str] = None
    error_message: Optional[str] = None
    import_options: Dict[str, Any] = Field(default_factory=dict)
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


# -------------------------------------------------------------------------
# Clone
# -------------------------------------------------------------------------


class CloneProjectRequest(BaseModel):
    """Request to clone a project."""

    name: str = Field(..., min_length=1, max_length=255)
    path: Optional[str] = Field(None, max_length=500)


class CloneProjectResponse(BaseModel):
    """Response after cloning a project."""

    project_id: str
    name: str
    message: str


# -------------------------------------------------------------------------
# Snapshots
# -------------------------------------------------------------------------


class SnapshotCreateRequest(BaseModel):
    """Request to create a container snapshot."""

    name: str = Field(..., min_length=1, max_length=100)

    @field_validator("name")
    @classmethod
    def sanitize_name(cls, v: str) -> str:
        return re.sub(r"[^a-zA-Z0-9_-]", "-", v.strip())


class SnapshotInfo(BaseModel):
    """Information about a single snapshot."""

    name: str
    image_id: str
    created_at: Optional[str] = None
    size: Optional[int] = None


class SnapshotListResponse(BaseModel):
    """List of snapshots for a project."""

    project_id: str
    snapshots: List[SnapshotInfo] = Field(default_factory=list)


class SnapshotRestoreResponse(BaseModel):
    """Response after restoring a snapshot."""

    project_id: str
    snapshot_name: str
    container_id: str
    message: str


# -------------------------------------------------------------------------
# Detection
# -------------------------------------------------------------------------


class DetectionResultResponse(BaseModel):
    """Project type detection result."""

    project_type: str
    framework: Optional[str] = None
    suggested_template_id: Optional[str] = None
    confidence: float = 0.0
