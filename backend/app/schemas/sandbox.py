"""Pydantic schemas for sandbox file system operations."""

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field


class FileNodeResponse(BaseModel):
    """Represents a file or directory in the sandbox."""

    name: str
    type: str = Field(..., description="'file' or 'directory'")
    path: str = Field(..., description="Path relative to /workspace")
    size: Optional[int] = None
    modified_at: Optional[str] = None
    children: Optional[List["FileNodeResponse"]] = None


class FileTreeResponse(BaseModel):
    """Wrapper for a file tree listing."""

    files: List[FileNodeResponse] = Field(default_factory=list)
    total: int = 0


class FileContentResponse(BaseModel):
    """File content with metadata."""

    path: str
    content: str
    language: str = "plaintext"


class FileCreateRequest(BaseModel):
    """Request to create a new file."""

    path: str = Field(..., min_length=1, description="Path relative to /workspace")
    content: str = Field(default="", description="Initial file content")


class DirectoryCreateRequest(BaseModel):
    """Request to create a new directory."""

    path: str = Field(..., min_length=1, description="Path relative to /workspace")


class FileUpdateRequest(BaseModel):
    """Request to update file content."""

    path: str = Field(..., min_length=1, description="Path relative to /workspace")
    content: str = Field(..., description="New file content")


class FileRenameRequest(BaseModel):
    """Request to rename or move a file/directory."""

    old_path: str = Field(..., min_length=1)
    new_path: str = Field(..., min_length=1)
