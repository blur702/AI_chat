"""Pydantic schemas for YOLO edit tracking API."""

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


# -------------------------------------------------------------------------
# Request Schemas
# -------------------------------------------------------------------------


class YoloEditCreateRequest(BaseModel):
    """Request body for recording a new file edit."""

    project_id: str
    chat_id: Optional[str] = None
    files_modified: List[str] = Field(..., min_length=1)
    undo_data: Optional[Dict[str, Any]] = None


# -------------------------------------------------------------------------
# Response Schemas
# -------------------------------------------------------------------------


class YoloEditResponse(BaseModel):
    """Response for a single YOLO edit record."""

    id: str
    project_id: str
    chat_id: Optional[str] = None
    files_modified: List[str]
    undo_performed: bool
    undo_data: Optional[Dict[str, Any]] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class YoloEditListResponse(BaseModel):
    """List of YOLO edit records."""

    edits: List[YoloEditResponse] = Field(default_factory=list)
    count: int = 0


class YoloEditUndoResponse(BaseModel):
    """Response after requesting an undo operation."""

    id: str
    status: str
    files_restored: List[str] = Field(default_factory=list)
