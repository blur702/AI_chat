"""Pydantic schemas for tool management API."""

from datetime import datetime
from typing import Any, Dict, List, Optional, Set
from uuid import UUID

from pydantic import BaseModel, Field


# -------------------------------------------------------------------------
# Tool Metadata
# -------------------------------------------------------------------------


class ToolInfo(BaseModel):
    """Metadata for a registered tool."""

    name: str = Field(..., description="Unique tool identifier")
    description: str = Field(..., description="Human-readable tool description")
    parameters_schema: Dict[str, Any] = Field(
        ..., description="JSON Schema for accepted parameters"
    )
    required_permissions: List[str] = Field(
        ..., description="Permissions required to execute this tool"
    )

    model_config = {
        "json_schema_extra": {
            "example": {
                "name": "echo",
                "description": "Echoes back the provided message",
                "parameters_schema": {
                    "type": "object",
                    "properties": {
                        "message": {"type": "string"}
                    },
                    "required": ["message"],
                },
                "required_permissions": ["tools.execute"],
            }
        }
    }


class ToolListResponse(BaseModel):
    """Response for listing all registered tools."""

    tools: List[ToolInfo] = Field(..., description="List of registered tools")
    count: int = Field(..., description="Total number of registered tools")


# -------------------------------------------------------------------------
# Tool Execution
# -------------------------------------------------------------------------


class ToolExecuteRequest(BaseModel):
    """Request to execute a tool."""

    tool_name: str = Field(..., description="Name of the tool to execute")
    parameters: Dict[str, Any] = Field(
        default_factory=dict, description="Parameters to pass to the tool"
    )
    use_cache: bool = Field(
        default=True, description="Whether to use cached results if available"
    )
    chat_id: Optional[UUID] = Field(
        None,
        description="Chat ID for conversation-scoped context. When provided, "
        "execution is routed through a sequential per-chat queue and "
        "conversation context is passed to the tool.",
    )
    context_data: Optional[Dict[str, Any]] = Field(
        None,
        description="Additional conversation context to merge before execution. "
        "Merged into existing context for the chat_id.",
    )

    model_config = {
        "json_schema_extra": {
            "example": {
                "tool_name": "echo",
                "parameters": {"message": "hello"},
                "use_cache": True,
                "chat_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
                "context_data": {"last_topic": "greetings"},
            }
        }
    }


class ToolExecuteResponse(BaseModel):
    """Response from a tool execution."""

    tool: str = Field(..., description="Name of the executed tool")
    success: bool = Field(..., description="Whether execution succeeded")
    result: Optional[Dict[str, Any]] = Field(
        None, description="Tool result on success"
    )
    error: Optional[str] = Field(
        None, description="Error message on failure"
    )
    cached: bool = Field(..., description="Whether the result came from cache")
    duration_ms: float = Field(
        ..., description="Execution time in milliseconds"
    )
    conversation_context: Optional[Dict[str, Any]] = Field(
        None,
        description="Updated conversation context after execution. "
        "Only present when chat_id was provided in the request.",
    )

    model_config = {
        "json_schema_extra": {
            "example": {
                "tool": "echo",
                "success": True,
                "result": {"echoed": "hello"},
                "error": None,
                "cached": False,
                "duration_ms": 12.5,
                "conversation_context": {"last_topic": "greetings"},
            }
        }
    }


# -------------------------------------------------------------------------
# Cache Management
# -------------------------------------------------------------------------


class CacheClearRequest(BaseModel):
    """Request to clear tool result cache."""

    tool_name: Optional[str] = Field(
        None,
        description="Tool name to clear cache for. If omitted, clears all tool caches.",
    )


class CacheClearResponse(BaseModel):
    """Response from cache clear operation."""

    deleted_count: int = Field(..., description="Number of cache keys deleted")
    tool_name: Optional[str] = Field(
        None, description="Tool name that was cleared, or null for all"
    )


# -------------------------------------------------------------------------
# Conversation Context
# -------------------------------------------------------------------------


class ConversationContextResponse(BaseModel):
    """Response for conversation context retrieval."""

    chat_id: UUID = Field(..., description="Chat ID the context belongs to")
    context: Dict[str, Any] = Field(
        default_factory=dict, description="Current conversation context"
    )


class ConversationContextUpdateRequest(BaseModel):
    """Request to update conversation context."""

    context: Dict[str, Any] = Field(
        ..., description="Context data to merge into existing context"
    )


class ConversationResultsResponse(BaseModel):
    """Response for conversation tool results."""

    chat_id: UUID = Field(..., description="Chat ID the results belong to")
    results: List[Dict[str, Any]] = Field(
        default_factory=list, description="Recent tool execution results"
    )
    count: int = Field(..., description="Number of results returned")
