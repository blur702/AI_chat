"""Pydantic schemas for UI Component CRUD operations."""

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class UIComponentCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    category: str = Field(..., min_length=1, max_length=50)
    description: str = ""
    is_framework_specific: bool = False
    framework: Optional[str] = None
    html_template: str = Field(..., min_length=1)
    framework_code: Optional[str] = None
    props_schema: Dict[str, Any] = Field(default_factory=dict)
    preview_image: Optional[str] = None
    tags: List[str] = Field(default_factory=list)
    is_mobile_responsive: bool = True


class UIComponentUpdateRequest(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    category: Optional[str] = Field(None, min_length=1, max_length=50)
    description: Optional[str] = None
    is_framework_specific: Optional[bool] = None
    framework: Optional[str] = None
    html_template: Optional[str] = None
    framework_code: Optional[str] = None
    props_schema: Optional[Dict[str, Any]] = None
    preview_image: Optional[str] = None
    tags: Optional[List[str]] = None
    is_mobile_responsive: Optional[bool] = None


class UIComponentResponse(BaseModel):
    id: str
    name: str
    category: str
    description: str
    is_framework_specific: bool
    framework: Optional[str] = None
    html_template: str
    framework_code: Optional[str] = None
    props_schema: Dict[str, Any] = Field(default_factory=dict)
    preview_image: Optional[str] = None
    tags: List[str] = Field(default_factory=list)
    is_mobile_responsive: bool
    created_at: Optional[str] = None

    model_config = {"from_attributes": True}


class UIComponentListResponse(BaseModel):
    components: List[UIComponentResponse] = Field(default_factory=list)
    categories: List[str] = Field(default_factory=list)
    count: int = 0
