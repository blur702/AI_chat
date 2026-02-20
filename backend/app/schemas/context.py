"""Pydantic schemas for context management API."""

from datetime import datetime
from typing import Any, Dict, List, Literal, Optional
from uuid import UUID

from pydantic import BaseModel, Field, field_validator, model_validator

from app.kernel.mode_prompts import MODE_PROMPT_MODIFIERS

VALID_CHAT_MODES = list(MODE_PROMPT_MODIFIERS.keys())


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
    status: Optional[str] = None
    created_at: Optional[str] = None


class ConversationStateResponse(BaseModel):
    """Full conversation state including messages and compactions."""

    chat_id: str
    project_id: str
    title: str
    messages: List[MessageSummary] = Field(default_factory=list)
    compactions: List[CompactionSummary] = Field(default_factory=list)
    current_token_count: int = 0
    chat_instructions: Optional[str] = None
    system_prompt_id: Optional[str] = None
    chat_mode: Optional[str] = None


class ConversationStateUpdateRequest(BaseModel):
    """Request body for updating conversation state."""

    updates: Dict[str, Any] = Field(
        ..., description="Key-value pairs to merge into the conversation state"
    )

    @model_validator(mode="after")
    def cap_updates_size(self) -> "ConversationStateUpdateRequest":
        import json as _json

        raw = _json.dumps(self.updates, default=str)
        if len(raw) > 100_000:
            raise ValueError("Serialized updates must not exceed 100 KB")
        return self


# -------------------------------------------------------------------------
# Project Context
# -------------------------------------------------------------------------


class ChatSummary(BaseModel):
    """Minimal chat metadata for project listing."""

    id: str
    title: str
    is_pinned: bool = False
    is_archived: bool = False
    chat_mode: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class ChatCreateRequest(BaseModel):
    """Request body for creating a new chat."""

    project_id: UUID
    title: str = Field(..., max_length=500, description="Chat title")
    chat_instructions: Optional[str] = Field(None, max_length=10000)
    system_prompt_id: Optional[UUID] = None
    chat_mode: Optional[str] = None

    @field_validator("chat_mode")
    @classmethod
    def validate_chat_mode(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in VALID_CHAT_MODES:
            raise ValueError(f"chat_mode must be one of {VALID_CHAT_MODES}")
        return v


class ChatCreateResponse(BaseModel):
    """Response after creating a new chat."""

    id: str
    title: str
    project_id: str
    chat_instructions: Optional[str] = None
    system_prompt_id: Optional[str] = None
    chat_mode: Optional[str] = None
    created_at: Optional[str] = None


class ChatUpdateRequest(BaseModel):
    """Request body for updating a chat."""

    title: Optional[str] = Field(None, max_length=500)
    is_pinned: Optional[bool] = None
    is_archived: Optional[bool] = None
    chat_instructions: Optional[str] = Field(None, max_length=10000)
    system_prompt_id: Optional[UUID] = None
    chat_mode: Optional[str] = None

    @field_validator("chat_mode")
    @classmethod
    def validate_chat_mode(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in VALID_CHAT_MODES:
            raise ValueError(f"chat_mode must be one of {VALID_CHAT_MODES}")
        return v


class ChatUpdateResponse(BaseModel):
    """Response after updating a chat."""

    id: str
    title: str
    project_id: str
    is_pinned: bool = False
    is_archived: bool = False
    chat_instructions: Optional[str] = None
    system_prompt_id: Optional[str] = None
    chat_mode: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class ProjectContextResponse(BaseModel):
    """Project-level context including metadata and chat list."""

    project_id: str
    user_id: str
    name: str
    path: str
    type: Optional[str] = None
    template_id: Optional[str] = None
    system_prompt_id: Optional[str] = None
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
    default_num_ctx: Optional[int] = None
    email_notifications: Optional[bool] = None
    in_app_notifications: Optional[bool] = None

    # Image generation defaults
    imggen_default_workflow: Optional[str] = None
    imggen_default_width: Optional[int] = None
    imggen_default_height: Optional[int] = None
    imggen_default_steps: Optional[int] = None
    imggen_default_cfg_scale: Optional[float] = None
    imggen_default_prompt: Optional[str] = None
    imggen_system_prompt: Optional[str] = None
    imggen_default_negative_prompt: Optional[str] = None
    imggen_completion_notification: Optional[bool] = None
    imggen_desktop_notification: Optional[bool] = None
    imggen_sound_notification: Optional[bool] = None
    imggen_notification_sound: Optional[str] = None
    imggen_auto_delete_days: Optional[int] = None
    imggen_max_generations: Optional[int] = None
    comfyui_base_url: Optional[str] = None
    mode_prompt_overrides: Optional[Dict[str, str]] = None


class UserPreferencesUpdateRequest(BaseModel):
    """Request body for updating user preferences."""

    custom_system_prompt: Optional[str] = Field(default=None, max_length=50_000)
    coding_principles: Optional[List[Any]] = None
    response_style: Optional[Dict[str, Any]] = None

    @field_validator("coding_principles")
    @classmethod
    def cap_coding_principles(cls, v: Optional[List[Any]]) -> Optional[List[Any]]:
        if v is not None and len(v) > 50:
            raise ValueError("At most 50 coding principles are allowed")
        return v

    @field_validator("response_style")
    @classmethod
    def cap_response_style(cls, v: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        if v is not None:
            import json as _json

            if len(_json.dumps(v, default=str)) > 10_000:
                raise ValueError("Serialized response_style must not exceed 10 KB")
        return v
    default_model: Optional[str] = Field(default=None, max_length=100)
    default_temperature: Optional[float] = Field(default=None, ge=0.0, le=2.0)
    default_num_ctx: Optional[int] = Field(default=None, ge=512, le=131072)
    email_notifications: Optional[bool] = None
    in_app_notifications: Optional[bool] = None

    # Image generation defaults
    imggen_default_workflow: Optional[str] = Field(default=None, max_length=50)
    imggen_default_width: Optional[int] = Field(default=None, ge=64, le=4096)
    imggen_default_height: Optional[int] = Field(default=None, ge=64, le=4096)
    imggen_default_steps: Optional[int] = Field(default=None, ge=1, le=150)
    imggen_default_cfg_scale: Optional[float] = Field(default=None, ge=1.0, le=30.0)
    imggen_default_prompt: Optional[str] = Field(default=None, max_length=2000)
    imggen_system_prompt: Optional[str] = Field(default=None, max_length=4000)
    imggen_default_negative_prompt: Optional[str] = Field(default=None, max_length=2000)
    imggen_completion_notification: Optional[bool] = None
    imggen_desktop_notification: Optional[bool] = None
    imggen_sound_notification: Optional[bool] = None
    imggen_notification_sound: Optional[str] = Field(default=None, max_length=100)
    imggen_auto_delete_days: Optional[int] = Field(default=None, ge=0, le=365)
    imggen_max_generations: Optional[int] = Field(default=None, ge=0, le=10000)
    comfyui_base_url: Optional[str] = Field(default=None, max_length=500)
    mode_prompt_overrides: Optional[Dict[str, str]] = None

    @field_validator("mode_prompt_overrides")
    @classmethod
    def validate_mode_prompt_overrides(
        cls, v: Optional[Dict[str, str]]
    ) -> Optional[Dict[str, str]]:
        if v is None:
            return v
        for key, value in v.items():
            if key not in VALID_CHAT_MODES:
                raise ValueError(
                    f"Invalid chat mode key '{key}'. Must be one of {VALID_CHAT_MODES}"
                )
            if not isinstance(value, str):
                raise ValueError(f"Value for mode '{key}' must be a string")
            if len(value) > 10_000:
                raise ValueError(
                    f"Value for mode '{key}' must not exceed 10,000 characters"
                )
        return v


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

    content: str = Field(..., min_length=1, max_length=100_000, description="User message content")
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
    path: str = Field(..., max_length=1000, description="Project filesystem path")
    type: Optional[str] = Field(None, max_length=50, description="Project type")
    template_id: Optional[str] = Field(None, max_length=100, description="Template ID for sandbox provisioning")
    selected_technologies: Optional[List[str]] = Field(
        None, max_length=20, description="List of technology IDs to combine for project setup"
    )
    settings: Optional[Dict[str, Any]] = None
    custom_context: Optional[str] = Field(default=None, max_length=100_000)
    important_files: Optional[List[str]] = None

    @field_validator("important_files")
    @classmethod
    def cap_important_files_create(cls, v: Optional[List[str]]) -> Optional[List[str]]:
        if v is not None:
            if len(v) > 100:
                raise ValueError("At most 100 important files are allowed")
            for item in v:
                if len(item) > 500:
                    raise ValueError("Each important file path must be at most 500 characters")
        return v


class ProjectCreateResponse(BaseModel):
    """Response after creating a new project."""

    id: str
    name: str
    path: str
    type: Optional[str] = None
    template_id: Optional[str] = None
    selected_technologies: Optional[List[str]] = None
    created_at: Optional[str] = None


class ProjectUpdateRequest(BaseModel):
    """Request body for updating a project."""

    name: Optional[str] = Field(None, max_length=255)
    path: Optional[str] = Field(default=None, max_length=1000)
    type: Optional[str] = Field(None, max_length=50)
    template_id: Optional[str] = Field(None, max_length=100, description="Template ID for sandbox provisioning")
    selected_technologies: Optional[List[str]] = Field(
        None, max_length=20, description="List of technology IDs (metadata update only, does not re-provision)"
    )
    system_prompt_id: Optional[UUID] = None
    settings: Optional[Dict[str, Any]] = None
    custom_context: Optional[str] = Field(default=None, max_length=100_000)
    important_files: Optional[List[str]] = None

    @field_validator("important_files")
    @classmethod
    def cap_important_files_update(cls, v: Optional[List[str]]) -> Optional[List[str]]:
        if v is not None:
            if len(v) > 100:
                raise ValueError("At most 100 important files are allowed")
            for item in v:
                if len(item) > 500:
                    raise ValueError("Each important file path must be at most 500 characters")
        return v


class ProjectUpdateResponse(BaseModel):
    """Response after updating a project."""

    id: str
    name: str
    path: str
    type: Optional[str] = None
    template_id: Optional[str] = None
    selected_technologies: Optional[List[str]] = None
    system_prompt_id: Optional[str] = None
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
    template_id: Optional[str] = None
    selected_technologies: Optional[List[str]] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class ProjectListResponse(BaseModel):
    """List of projects belonging to a user."""

    projects: List["ProjectSummary"] = Field(default_factory=list)
    count: int = 0
    total: Optional[int] = None
    limit: Optional[int] = None
    offset: Optional[int] = None


class ProjectDetailResponse(BaseModel):
    """Full project detail including chats."""

    project_id: str
    user_id: str
    name: str
    path: str
    type: Optional[str] = None
    template_id: Optional[str] = None
    system_prompt_id: Optional[str] = None
    settings: Optional[Dict[str, Any]] = None
    custom_context: Optional[str] = None
    important_files: Optional[List[str]] = None
    chats: List["ChatSummary"] = Field(default_factory=list)


# -------------------------------------------------------------------------
# System Prompts
# -------------------------------------------------------------------------


class SystemPromptCreateRequest(BaseModel):
    """Request body for creating a system prompt."""

    name: str = Field(..., max_length=255, description="Prompt name")
    content: str = Field(..., min_length=1, max_length=50000, description="Prompt content")
    description: Optional[str] = Field(None, max_length=500)
    is_default: bool = False


class SystemPromptUpdateRequest(BaseModel):
    """Request body for updating a system prompt."""

    name: Optional[str] = Field(None, max_length=255)
    content: Optional[str] = Field(None, min_length=1, max_length=50000)
    description: Optional[str] = None
    is_default: Optional[bool] = None


class SystemPromptResponse(BaseModel):
    """Response for a single system prompt."""

    id: str
    name: str
    content: str
    description: Optional[str] = None
    is_default: bool = False
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class SystemPromptListResponse(BaseModel):
    """List of system prompts belonging to a user."""

    prompts: List[SystemPromptResponse] = Field(default_factory=list)
    count: int = 0
    total: Optional[int] = None
    limit: Optional[int] = None
    offset: Optional[int] = None


# -------------------------------------------------------------------------
# Message Actions
# -------------------------------------------------------------------------


class MessageUpdateRequest(BaseModel):
    """Request body for updating a message (pin, exclude, edit)."""

    content: Optional[str] = Field(None, min_length=1, max_length=100_000)
    is_pinned: Optional[bool] = None
    is_excluded: Optional[bool] = None


class MessageUpdateResponse(BaseModel):
    """Response after updating a message."""

    id: str
    role: str
    content: str
    is_pinned: bool = False
    is_excluded: bool = False
    updated_at: Optional[str] = None


# -------------------------------------------------------------------------
# Token Breakdown
# -------------------------------------------------------------------------


class TokenBreakdownResponse(BaseModel):
    """Detailed per-layer token breakdown for a conversation."""

    system_prompt_tokens: int = 0
    project_context_tokens: int = 0
    chat_instructions_tokens: int = 0
    kb_results_tokens: int = 0
    compaction_summary_tokens: int = 0
    conversation_tokens: int = 0
    total: int = 0
    context_window: int = 0
    fill_ratio: float = 0.0
    message_count: int = 0
    excluded_count: int = 0
    pinned_count: int = 0


# -------------------------------------------------------------------------
# Assembled Context
# -------------------------------------------------------------------------


class AssembledContextLayer(BaseModel):
    """A single layer of the assembled context as the LLM sees it."""

    name: str
    role: str
    content: str
    tokens: int


class AssembledContextResponse(BaseModel):
    """Full assembled context with per-layer token counts."""

    layers: List[AssembledContextLayer]
    total_tokens: int
    context_window: int
    fill_ratio: float
    model_name: str


# -------------------------------------------------------------------------
# Compaction / Chat Instructions Edit
# -------------------------------------------------------------------------


class CompactionUpdateRequest(BaseModel):
    """Request body for editing a compaction summary."""

    summary: str = Field(..., min_length=1, max_length=50000)


class ChatInstructionsUpdateRequest(BaseModel):
    """Request body for editing per-chat instructions."""

    chat_instructions: str = Field(..., max_length=50000)


# -------------------------------------------------------------------------
# Context Snippets
# -------------------------------------------------------------------------


class ContextSnippetCreateRequest(BaseModel):
    """Request body for creating a context snippet."""

    name: str = Field(..., min_length=1, max_length=255, description="Snippet name")
    content: str = Field(..., min_length=1, max_length=50000, description="Snippet content")
    description: Optional[str] = Field(None, max_length=500)
    tags: List[str] = Field(default_factory=list)

    @field_validator("name")
    @classmethod
    def name_not_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Name must not be blank")
        return v.strip()

    @field_validator("tags")
    @classmethod
    def validate_tags(cls, v: List[str]) -> List[str]:
        if len(v) > 20:
            raise ValueError("At most 20 tags are allowed")
        cleaned = [t.strip() for t in v if t.strip()]
        for t in cleaned:
            if len(t) > 100:
                raise ValueError("Each tag must be at most 100 characters")
        return cleaned


class ContextSnippetUpdateRequest(BaseModel):
    """Request body for updating a context snippet."""

    name: Optional[str] = Field(None, min_length=1, max_length=255)
    content: Optional[str] = Field(None, min_length=1, max_length=50000)
    description: Optional[str] = Field(None, max_length=500)
    tags: Optional[List[str]] = None

    @field_validator("name")
    @classmethod
    def name_not_blank(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and not v.strip():
            raise ValueError("Name must not be blank")
        return v.strip() if v is not None else v

    @field_validator("tags")
    @classmethod
    def validate_tags(cls, v: Optional[List[str]]) -> Optional[List[str]]:
        if v is None:
            return v
        if len(v) > 20:
            raise ValueError("At most 20 tags are allowed")
        cleaned = [t.strip() for t in v if t.strip()]
        for t in cleaned:
            if len(t) > 100:
                raise ValueError("Each tag must be at most 100 characters")
        return cleaned


class ContextSnippetResponse(BaseModel):
    """Response for a single context snippet."""

    id: str
    name: str
    content: str
    description: Optional[str] = None
    tags: List[str] = Field(default_factory=list)
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class ContextSnippetListResponse(BaseModel):
    """List of context snippets belonging to a user."""

    snippets: List[ContextSnippetResponse] = Field(default_factory=list)
    count: int = 0


# -------------------------------------------------------------------------
# Compaction Status
# -------------------------------------------------------------------------


class CompactionStatusResponse(BaseModel):
    """Status of a context compaction operation."""

    id: str
    status: str
    original_message_count: int = 0
    compacted_message_count: int = 0
    summary: Optional[str] = None
    created_at: Optional[str] = None


# -------------------------------------------------------------------------
# Tokenization
# -------------------------------------------------------------------------


class TokenizeRequest(BaseModel):
    """Request body for tokenizing text into individual token spans."""

    text: str = Field(..., min_length=1, max_length=100_000, description="Text to tokenize")


class TokenSpan(BaseModel):
    """A single token with its text and character offsets."""

    text: str
    start: int
    end: int


class TokenizeResponse(BaseModel):
    """Response containing token spans and statistics."""

    tokens: List[TokenSpan]
    total: int
    characters: int
    chars_per_token: float
