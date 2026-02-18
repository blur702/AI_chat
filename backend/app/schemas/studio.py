"""Pydantic schemas for the Video Studio API."""

from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Video Project
# ---------------------------------------------------------------------------


class VideoProjectSettings(BaseModel):
    width: int = 1920
    height: int = 1080
    fps: int = 30
    background_color: str = "#000000"


class VideoProjectCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None
    settings: VideoProjectSettings = Field(default_factory=VideoProjectSettings)


class VideoProjectUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = None
    timeline_data: Optional[Dict[str, Any]] = None
    settings: Optional[VideoProjectSettings] = None
    duration_seconds: Optional[float] = None
    status: Optional[str] = None


class VideoProjectResponse(BaseModel):
    id: str
    user_id: str
    name: str
    description: Optional[str] = None
    timeline_data: Optional[Dict[str, Any]] = None
    settings: Dict[str, Any]
    thumbnail_path: Optional[str] = None
    duration_seconds: Optional[float] = None
    status: str
    created_at: Optional[str] = None
    updated_at: Optional[str] = None

    model_config = {"from_attributes": True}


class VideoProjectListResponse(BaseModel):
    projects: List[VideoProjectResponse]
    count: int


# ---------------------------------------------------------------------------
# Media Asset
# ---------------------------------------------------------------------------


class MediaAssetResponse(BaseModel):
    id: str
    user_id: str
    video_project_id: str
    filename: str
    media_type: str
    mime_type: Optional[str] = None
    file_size_bytes: Optional[int] = None
    duration_seconds: Optional[float] = None
    width: Optional[int] = None
    height: Optional[int] = None
    thumbnail_path: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None
    created_at: Optional[str] = None

    model_config = {"from_attributes": True}


class MediaAssetListResponse(BaseModel):
    assets: List[MediaAssetResponse]
    count: int


# ---------------------------------------------------------------------------
# Video Export
# ---------------------------------------------------------------------------


class ExportRequest(BaseModel):
    format: str = "mp4"
    resolution: Optional[str] = None
    export_settings: Optional[Dict[str, Any]] = None


class VideoExportResponse(BaseModel):
    id: str
    video_project_id: str
    user_id: str
    status: str
    format: str
    resolution: Optional[str] = None
    file_path: Optional[str] = None
    file_size_bytes: Optional[int] = None
    progress_percent: int = 0
    error_message: Optional[str] = None
    export_settings: Optional[Dict[str, Any]] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None

    model_config = {"from_attributes": True}
