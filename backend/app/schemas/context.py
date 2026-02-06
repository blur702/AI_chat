"""Pydantic schemas for context management API."""

from datetime import datetime
from typing import Any, Dict, List, Optional
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
    created_at: Optional[str] = None


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
