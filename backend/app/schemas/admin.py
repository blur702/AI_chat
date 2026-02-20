"""Pydantic schemas for admin debugging and kernel introspection endpoints."""

from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import UUID

from pydantic import BaseModel, Field


class ServiceDebugResponse(BaseModel):
    """Debug information for a single kernel service."""

    service_name: str = Field(..., description="Service identifier")
    is_running: bool = Field(..., description="Whether the service is currently running")
    health_status: bool = Field(..., description="Current health check result")
    health_message: str = Field(..., description="Health check detail message")
    internal_state: Dict[str, Any] = Field(
        default_factory=dict,
        description="Service-specific internal state for debugging",
    )
    metrics: Dict[str, Any] = Field(
        default_factory=dict,
        description="Service-specific performance metrics",
    )

    model_config = {"json_schema_extra": {"example": {
        "service_name": "resource_manager",
        "is_running": True,
        "health_status": True,
        "health_message": "ok",
        "internal_state": {
            "vram_tracker_active": True,
            "queue_size": 3,
            "loaded_resource_count": 2,
        },
        "metrics": {
            "monitor_task_running": True,
        },
    }}}


class KernelDebugResponse(BaseModel):
    """Comprehensive kernel debug information."""

    kernel_info: Dict[str, Any] = Field(
        ..., description="Kernel initialization state and metadata"
    )
    services: Dict[str, ServiceDebugResponse] = Field(
        default_factory=dict,
        description="Per-service debug information",
    )
    redis_info: Dict[str, Any] = Field(
        default_factory=dict,
        description="Redis connection and memory info",
    )
    database_info: Dict[str, Any] = Field(
        default_factory=dict,
        description="Database connection pool statistics",
    )
    timestamp: datetime = Field(..., description="Debug snapshot timestamp")

    model_config = {"json_schema_extra": {"example": {
        "kernel_info": {
            "initialized": True,
            "registered_services": ["resource_manager", "event_bus", "tool_registry", "context_manager"],
            "uptime_seconds": 3600.0,
        },
        "services": {},
        "redis_info": {"ping_latency_ms": 0.5, "used_memory_human": "2.5M"},
        "database_info": {"pool_size": 5, "checked_out": 1},
        "timestamp": "2024-01-15T10:30:00Z",
    }}}


class KernelMetricsResponse(BaseModel):
    """Aggregated kernel performance metrics."""

    uptime_seconds: Optional[float] = Field(
        None, description="Kernel uptime in seconds"
    )
    registered_service_count: int = Field(
        ..., description="Number of registered services"
    )
    healthy_service_count: int = Field(
        ..., description="Number of healthy services"
    )
    total_subscriber_count: int = Field(
        0, description="Total EventBus subscriber callbacks"
    )
    total_registered_tools: int = Field(
        0, description="Total registered tools in ToolRegistry"
    )
    active_conversations: int = Field(
        0, description="Active conversation contexts in ToolRegistry"
    )
    active_queue_processors: int = Field(
        0, description="Running execution queue processors"
    )
    redis_memory_bytes: Optional[int] = Field(
        None, description="Redis used memory in bytes"
    )
    queue_size: int = Field(0, description="Resource manager load queue size")
    timestamp: datetime = Field(..., description="Metrics snapshot timestamp")

    model_config = {"json_schema_extra": {"example": {
        "uptime_seconds": 3600.0,
        "registered_service_count": 4,
        "healthy_service_count": 4,
        "total_subscriber_count": 5,
        "total_registered_tools": 3,
        "active_conversations": 10,
        "active_queue_processors": 8,
        "redis_memory_bytes": 2621440,
        "queue_size": 0,
        "timestamp": "2024-01-15T10:30:00Z",
    }}}


class UserUnlockResponse(BaseModel):
    user_id: UUID
    username: str
    message: str
    unlocked_at: datetime


class AuditLogResponse(BaseModel):
    """Single audit log entry."""

    id: UUID
    user_id: Optional[UUID] = None
    username: Optional[str] = None
    action: str
    resource: Optional[str] = None
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    status: str
    details: Dict[str, Any] = Field(default_factory=dict)
    created_at: datetime


class AuditLogListResponse(BaseModel):
    """Paginated list of audit log entries."""

    logs: List[AuditLogResponse]
    total: int
    page: int
    page_size: int


# -------------------------------------------------------------------------
# User Management Schemas
# -------------------------------------------------------------------------


class AdminUserResponse(BaseModel):
    """User details returned by admin endpoints."""

    id: UUID
    username: str
    email: Optional[str] = None
    role: str
    is_active: bool
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    screen_name: Optional[str] = None
    email_verified: bool = False
    failed_login_attempts: int = 0
    locked_until: Optional[datetime] = None
    last_login_at: Optional[datetime] = None
    last_password_change: Optional[datetime] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
    is_master: bool = False


class AdminUserListResponse(BaseModel):
    """Paginated list of users for admin."""

    users: List[AdminUserResponse]
    total: int
    page: int
    page_size: int


class AdminUserUpdateRequest(BaseModel):
    """Admin request to update a user."""

    role: Optional[str] = Field(None, pattern="^(admin|user)$")
    is_active: Optional[bool] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    screen_name: Optional[str] = None
    email: Optional[str] = None


class AdminUserUpdateResponse(BaseModel):
    """Response after admin updates a user."""

    user: AdminUserResponse
    message: str
