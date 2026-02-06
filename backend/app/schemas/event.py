"""Pydantic schemas for event management API."""

from datetime import datetime
from enum import Enum
from typing import Any, Dict, Optional
from uuid import UUID

from pydantic import BaseModel, Field


class EventType(str, Enum):
    """Standard event type values."""

    MODEL_LOADED = "model_loaded"
    MODEL_UNLOADED = "model_unloaded"
    TOOL_EXECUTED = "tool_executed"
    RESOURCE_UPDATED = "resource_updated"
    RESOURCE_CREATED = "resource_created"
    RESOURCE_DELETED = "resource_deleted"
    ERROR = "error"
    SYSTEM = "system"
    USER_ACTION = "user_action"
    CHAT_MESSAGE = "chat_message"
    KERNEL_STARTUP = "kernel_startup"
    KERNEL_SHUTDOWN = "kernel_shutdown"
    SERVICE_HEALTH_CHANGED = "service_health_changed"


class EventSeverity(str, Enum):
    """Event severity levels."""

    INFO = "info"
    WARNING = "warning"
    ERROR = "error"
    CRITICAL = "critical"


class EventCreate(BaseModel):
    """Schema for creating a new event."""

    event_type: str = Field(..., description="Type of event (e.g., 'model_loaded')")
    event_data: Dict[str, Any] = Field(
        default_factory=dict, description="Event payload data"
    )
    severity: EventSeverity = Field(
        default=EventSeverity.INFO, description="Event severity level"
    )
    source: str = Field(..., description="Component that generated the event")
    user_id: Optional[UUID] = Field(None, description="Associated user ID")
    chat_id: Optional[UUID] = Field(None, description="Associated chat ID")
    resource_id: Optional[str] = Field(None, description="Associated resource ID")
    persist: bool = Field(
        default=False, description="Whether to persist event to database"
    )

    model_config = {
        "json_schema_extra": {
            "example": {
                "event_type": "model_loaded",
                "event_data": {"model_name": "llama-3-70b", "vram_mb": 8192},
                "severity": "info",
                "source": "resource_manager",
                "user_id": "550e8400-e29b-41d4-a716-446655440000",
                "resource_id": "llama-3-70b",
                "persist": True,
            }
        }
    }


class EventResponse(BaseModel):
    """Schema for event response."""

    id: UUID = Field(..., description="Event unique identifier")
    event_type: str = Field(..., description="Type of event")
    event_data: Dict[str, Any] = Field(..., description="Event payload data")
    severity: str = Field(..., description="Event severity level")
    source: str = Field(..., description="Component that generated the event")
    user_id: Optional[UUID] = Field(None, description="Associated user ID")
    chat_id: Optional[UUID] = Field(None, description="Associated chat ID")
    resource_id: Optional[str] = Field(None, description="Associated resource ID")
    created_at: datetime = Field(..., description="Event creation timestamp")

    model_config = {
        "json_schema_extra": {
            "example": {
                "id": "550e8400-e29b-41d4-a716-446655440001",
                "event_type": "model_loaded",
                "event_data": {"model_name": "llama-3-70b", "vram_mb": 8192},
                "severity": "info",
                "source": "resource_manager",
                "user_id": "550e8400-e29b-41d4-a716-446655440000",
                "chat_id": None,
                "resource_id": "llama-3-70b",
                "created_at": "2024-01-15T10:30:00Z",
            }
        }
    }


class WebSocketMessage(BaseModel):
    """Schema for WebSocket messages."""

    type: str = Field(..., description="Message type identifier")
    data: Dict[str, Any] = Field(..., description="Message payload")
    timestamp: datetime = Field(..., description="Message timestamp")

    model_config = {
        "json_schema_extra": {
            "example": {
                "type": "model_loaded",
                "data": {"model_name": "llama-3-70b", "vram_mb": 8192},
                "timestamp": "2024-01-15T10:30:00Z",
            }
        }
    }


class EventBroadcastResponse(BaseModel):
    """Schema for non-persisted event broadcast response."""

    event_type: str = Field(..., description="Type of event")
    event_data: Dict[str, Any] = Field(..., description="Event payload data")
    severity: str = Field(..., description="Event severity level")
    source: str = Field(..., description="Component that generated the event")
    user_id: Optional[UUID] = Field(None, description="Associated user ID")
    chat_id: Optional[UUID] = Field(None, description="Associated chat ID")
    resource_id: Optional[str] = Field(None, description="Associated resource ID")
    persisted: bool = Field(
        default=False, description="Whether the event was persisted to database"
    )
    broadcast_at: datetime = Field(..., description="Timestamp when event was broadcast")

    model_config = {
        "json_schema_extra": {
            "example": {
                "event_type": "model_loaded",
                "event_data": {"model_name": "llama-3-70b", "vram_mb": 8192},
                "severity": "info",
                "source": "resource_manager",
                "user_id": None,
                "chat_id": None,
                "resource_id": "llama-3-70b",
                "persisted": False,
                "broadcast_at": "2024-01-15T10:30:00Z",
            }
        }
    }


class EventListResponse(BaseModel):
    """Schema for paginated event list response."""

    events: list[EventResponse] = Field(..., description="List of events")
    total: int = Field(..., description="Total number of events matching filters")
    limit: int = Field(..., description="Maximum events per page")
    offset: int = Field(..., description="Offset from start of results")

    model_config = {
        "json_schema_extra": {
            "example": {
                "events": [
                    {
                        "id": "550e8400-e29b-41d4-a716-446655440001",
                        "event_type": "model_loaded",
                        "event_data": {"model_name": "llama-3-70b"},
                        "severity": "info",
                        "source": "resource_manager",
                        "user_id": None,
                        "chat_id": None,
                        "resource_id": "llama-3-70b",
                        "created_at": "2024-01-15T10:30:00Z",
                    }
                ],
                "total": 150,
                "limit": 20,
                "offset": 0,
            }
        }
    }
