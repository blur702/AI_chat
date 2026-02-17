"""Pydantic schemas for prompt preset API."""

from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class PromptPresetCreate(BaseModel):
    """Request body for creating a prompt preset."""

    name: str = Field(..., min_length=1, max_length=200)
    prompt_text: str = Field(..., min_length=1, max_length=2000)
    negative_prompt_text: Optional[str] = Field(default=None, max_length=2000)
    category: str = Field(default="general", max_length=50)
    tags: Optional[List[str]] = None
    workflow_settings: Optional[Dict[str, Any]] = None
    is_public: bool = False


class PromptPresetUpdate(BaseModel):
    """Request body for updating a prompt preset."""

    name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    prompt_text: Optional[str] = Field(default=None, min_length=1, max_length=2000)
    negative_prompt_text: Optional[str] = Field(default=None, max_length=2000)
    category: Optional[str] = Field(default=None, max_length=50)
    tags: Optional[List[str]] = None
    workflow_settings: Optional[Dict[str, Any]] = None
    is_public: Optional[bool] = None


class PromptPresetResponse(BaseModel):
    """Response for a single prompt preset."""

    id: str
    user_id: str
    name: str
    prompt_text: str
    negative_prompt_text: Optional[str] = None
    category: str
    tags: Optional[List[str]] = None
    workflow_settings: Optional[Dict[str, Any]] = None
    is_public: bool
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class PromptPresetListResponse(BaseModel):
    """Paginated list of prompt presets."""

    presets: List[PromptPresetResponse] = Field(default_factory=list)
    count: int = 0
