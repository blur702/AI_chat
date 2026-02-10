"""Pydantic schemas for context management API."""

from datetime import datetime
from typing import Any, Dict, List, Literal, Optional
from uuid import UUID

from pydantic import BaseModel, Field


# -------------------------------------------------------------------------
# Conversation State
# -------------------------------------------------------------------------


class MessageSummary(BaseModel):
    """Summary of a single message within a conversation."""

    id: str
    role: str
    content: str
    metadata: Optional[Dict[str, Any]] = None
    is_pinned: bool = False
    is_excluded: bool = False
    created_at: Optional[str] = None


class CompactionSummary(BaseModel):
    """Summary of a context compaction event."""

    id: str
    original_message_count: int
    compacted_message_count: int
    summary: str
    created_at: Optional[str] = None


class ConversationStateResponse(BaseModel):
    """Full conversation state including messages and compactions."""

    chat_id: str
    project_id: str
    title: str
    messages: List[MessageSummary] = Field(default_factory=list)
    compactions: List[CompactionSummary] = Field(default_factory=list)
    current_token_count: int = 0


class ConversationStateUpdateRequest(BaseModel):
    """Request body for updating conversation state."""

    updates: Dict[str, Any] = Field(
        ..., description="Key-value pairs to merge into the conversation state"
    )


# -------------------------------------------------------------------------
# Project Context
# -------------------------------------------------------------------------


class ChatSummary(BaseModel):
    """Minimal chat metadata for project listing."""

    id: str
    title: str
    is_pinned: bool = False
    is_archived: bool = False
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class ChatCreateRequest(BaseModel):
    """Request body for creating a new chat."""

    project_id: UUID
    title: str = Field(..., max_length=500, description="Chat title")


class ChatCreateResponse(BaseModel):
    """Response after creating a new chat."""

    id: str
    title: str
    project_id: str
    created_at: Optional[str] = None


class ChatUpdateRequest(BaseModel):
    """Request body for updating a chat."""

    title: Optional[str] = Field(None, max_length=500)
    is_pinned: Optional[bool] = None
    is_archived: Optional[bool] = None


class ChatUpdateResponse(BaseModel):
    """Response after updating a chat."""

    id: str
    title: str
    project_id: str
    is_pinned: bool = False
    is_archived: bool = False
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class ProjectContextResponse(BaseModel):
    """Project-level context including metadata and chat list."""

    project_id: str
    user_id: str
    name: str
    path: str
    type: Optional[str] = None
    settings: Optional[Dict[str, Any]] = None
    custom_context: Optional[str] = None
    important_files: Optional[List[str]] = None
    chats: List[ChatSummary] = Field(default_factory=list)


class ChatListResponse(BaseModel):
    """List of chats belonging to a project."""

    chats: List[ChatSummary] = Field(default_factory=list)
    count: int = 0


# -------------------------------------------------------------------------
# User Preferences
# -------------------------------------------------------------------------


class UserPreferencesResponse(BaseModel):
    """Cached user preferences for AI behaviour customization."""

    custom_system_prompt: Optional[str] = None
    coding_principles: Optional[List[Any]] = None
    response_style: Optional[Dict[str, Any]] = None
    default_model: Optional[str] = None
    default_temperature: Optional[float] = None
    email_notifications: Optional[bool] = None
    in_app_notifications: Optional[bool] = None


class UserPreferencesUpdateRequest(BaseModel):
    """Request body for updating user preferences."""

    custom_system_prompt: Optional[str] = None
    coding_principles: Optional[List[Any]] = None
    response_style: Optional[Dict[str, Any]] = None
    default_model: Optional[str] = Field(default=None, max_length=100)
    default_temperature: Optional[float] = Field(default=None, ge=0.0, le=2.0)
    email_notifications: Optional[bool] = None
    in_app_notifications: Optional[bool] = None


class ModelInfo(BaseModel):
    """Information about an available Ollama model."""

    name: str
    size: Optional[int] = None
    modified_at: Optional[str] = None


class ModelListResponse(BaseModel):
    """List of available LLM models."""

    models: List[ModelInfo] = Field(default_factory=list)


# -------------------------------------------------------------------------
# Message Submission
# -------------------------------------------------------------------------


class MessageSubmitRequest(BaseModel):
    """Request body for submitting a user message and getting an AI response."""

    content: str = Field(..., min_length=1, description="User message content")
    metadata: Optional[Dict[str, Any]] = None
    model: Optional[str] = Field(None, description="Ollama model name (e.g. 'llama3.2')")


class MessageSubmitResponse(BaseModel):
    """Response after submitting a user message."""

    message_id: str
    assistant_message_id: str
    content: str
    model: str
    created_at: Optional[str] = None
    action_ids: Optional[List[str]] = None


# -------------------------------------------------------------------------
# SSE Streaming Events
# -------------------------------------------------------------------------


class StreamTokenEvent(BaseModel):
    """SSE event carrying a single token from the LLM stream."""

    type: Literal["token"] = "token"
    content: str


class StreamDoneEvent(BaseModel):
    """SSE event signalling the stream has completed."""

    type: Literal["done"] = "done"
    message_id: str
    model: str
    created_at: Optional[str] = None


class StreamErrorEvent(BaseModel):
    """SSE event carrying an error message."""

    type: Literal["error"] = "error"
    message: str


# -------------------------------------------------------------------------
# Token Usage
# -------------------------------------------------------------------------


class TokenUsageRequest(BaseModel):
    """Request body for tracking token usage."""

    token_count: int = Field(..., gt=0, description="Current token count")
    max_tokens: int = Field(..., gt=0, description="Maximum token budget")


class TokenUsageResponse(BaseModel):
    """Token usage statistics for a conversation."""

    current_tokens: int = 0
    max_tokens: int = 0
    usage_ratio: float = 0.0
    compaction_triggered: bool = False


# -------------------------------------------------------------------------
# Project CRUD
# -------------------------------------------------------------------------


class ProjectCreateRequest(BaseModel):
    """Request body for creating a new project."""

    name: str = Field(..., max_length=255, description="Project name")
    path: str = Field(..., description="Project filesystem path")
    type: Optional[str] = Field(None, max_length=50, description="Project type")
    settings: Optional[Dict[str, Any]] = None
    custom_context: Optional[str] = None
    important_files: Optional[List[str]] = None


class ProjectCreateResponse(BaseModel):
    """Response after creating a new project."""

    id: str
    name: str
    path: str
    type: Optional[str] = None
    created_at: Optional[str] = None


class ProjectUpdateRequest(BaseModel):
    """Request body for updating a project."""

    name: Optional[str] = Field(None, max_length=255)
    path: Optional[str] = None
    type: Optional[str] = Field(None, max_length=50)
    settings: Optional[Dict[str, Any]] = None
    custom_context: Optional[str] = None
    important_files: Optional[List[str]] = None


class ProjectUpdateResponse(BaseModel):
    """Response after updating a project."""

    id: str
    name: str
    path: str
    type: Optional[str] = None
    settings: Optional[Dict[str, Any]] = None
    custom_context: Optional[str] = None
    important_files: Optional[List[str]] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class ProjectSummary(BaseModel):
    """Minimal project metadata for listing."""

    id: str
    name: str
    path: str
    type: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class ProjectListResponse(BaseModel):
    """List of projects belonging to a user."""

    projects: List["ProjectSummary"] = Field(default_factory=list)
    count: int = 0
