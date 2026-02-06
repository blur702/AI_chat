"""Pydantic schemas for API request/response validation."""

from app.schemas.event import (
    EventCreate,
    EventListResponse,
    EventResponse,
    EventSeverity,
    EventType,
    WebSocketMessage,
)
from app.schemas.resource import (
    OffloadDecisionRequest,
    OffloadDecisionResponse,
    OffloadPreference,
    OperationStateRequest,
    OperationStateResponse,
    PreemptionCheckRequest,
    PreemptionCheckResponse,
    PreferenceRequest,
    PreferenceResponse,
    ReloadRequest,
    ResourceResponse,
    ResourceStatus,
    VRAMStatsResponse,
)
from app.schemas.tool import (
    CacheClearRequest,
    CacheClearResponse,
    ToolExecuteRequest,
    ToolExecuteResponse,
    ToolInfo,
    ToolListResponse,
)

__all__ = [
    # Event schemas
    "EventCreate",
    "EventListResponse",
    "EventResponse",
    "EventSeverity",
    "EventType",
    "WebSocketMessage",
    # Resource schemas
    "ResourceStatus",
    "OffloadPreference",
    "VRAMStatsResponse",
    "ResourceResponse",
    "OffloadDecisionRequest",
    "OffloadDecisionResponse",
    "PreemptionCheckRequest",
    "PreemptionCheckResponse",
    "OperationStateRequest",
    "OperationStateResponse",
    "PreferenceRequest",
    "PreferenceResponse",
    "ReloadRequest",
    # Tool schemas
    "ToolInfo",
    "ToolListResponse",
    "ToolExecuteRequest",
    "ToolExecuteResponse",
    "CacheClearRequest",
    "CacheClearResponse",
]
