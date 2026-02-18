"""Pydantic schemas for notes and note categories."""

from typing import List, Literal, Optional
from uuid import UUID

from pydantic import BaseModel, Field

NoteStatus = Literal["active", "completed", "archived"]


# ---- Note Category Schemas ----

class NoteCategoryCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    color: Optional[str] = Field(default=None, max_length=7)
    sort_order: int = Field(default=0)


class NoteCategoryUpdateRequest(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    color: Optional[str] = Field(default=None, max_length=7)
    sort_order: Optional[int] = None


class NoteCategoryResponse(BaseModel):
    id: str
    name: str
    slug: str
    color: Optional[str] = None
    is_system: bool = False
    sort_order: int = 0
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class NoteCategoryListResponse(BaseModel):
    categories: List[NoteCategoryResponse] = Field(default_factory=list)
    count: int = 0


# ---- Note Schemas ----

class NoteCreateRequest(BaseModel):
    title: Optional[str] = Field(default=None, max_length=255)
    body: str = Field(default="", max_length=50000)
    project_id: Optional[UUID] = None
    category_id: Optional[UUID] = None
    pinned: bool = False
    generate_title: bool = False


class NoteUpdateRequest(BaseModel):
    title: Optional[str] = Field(default=None, max_length=255)
    body: Optional[str] = Field(default=None, max_length=50000)
    project_id: Optional[UUID] = None
    category_id: Optional[UUID] = None
    status: Optional[NoteStatus] = None
    pinned: Optional[bool] = None


class NoteResponse(BaseModel):
    id: str
    title: Optional[str] = None
    body: str = ""
    status: NoteStatus = "active"
    pinned: bool = False
    project_id: Optional[str] = None
    project_name: Optional[str] = None
    category_id: Optional[str] = None
    category_name: Optional[str] = None
    category_color: Optional[str] = None
    issue_id: Optional[str] = None
    completed_at: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class NoteListResponse(BaseModel):
    notes: List[NoteResponse] = Field(default_factory=list)
    count: int = 0
