"""Pydantic schemas for resource management API."""

from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional
from uuid import UUID

from pydantic import BaseModel, Field


class ResourceStatus(str, Enum):
    """Valid resource status values."""

    ACTIVE = "active"
    LOADING = "loading"
    LOADED = "loaded"
    UNLOADING = "unloading"
    CPU_OFFLOADED = "cpu_offloaded"
    ERROR = "error"


class OffloadPreference(str, Enum):
    """User preference for handling offload decisions."""

    ALWAYS_OFFLOAD = "always_offload"
    ALWAYS_CANCEL = "always_cancel"
    ASK_EACH_TIME = "ask_each_time"


class OffloadDecision(str, Enum):
    """User's decision when prompted about offloading."""

    OFFLOAD = "offload"
    CANCEL = "cancel"


# -------------------------------------------------------------------------
# VRAM Statistics
# -------------------------------------------------------------------------


class PerGpuStatsItem(BaseModel):
    """VRAM statistics for a single GPU."""

    gpu_index: int = Field(..., description="Zero-based GPU index")
    name: str = Field(..., description="GPU model name from driver")
    total_mb: int = Field(..., description="Total VRAM in MB")
    used_mb: int = Field(..., description="Used VRAM in MB")
    free_mb: int = Field(..., description="Free VRAM in MB")
    utilization_percent: float = Field(..., description="Utilization 0-100")

    model_config = {"json_schema_extra": {"example": {
        "gpu_index": 0, "name": "NVIDIA GeForce RTX 4090",
        "total_mb": 24576, "used_mb": 8192, "free_mb": 16384,
        "utilization_percent": 33.33,
    }}}


class VRAMStatsResponse(BaseModel):
    """VRAM statistics response."""

    total_mb: int = Field(..., description="Total VRAM in megabytes")
    used_mb: int = Field(..., description="Used VRAM in megabytes")
    free_mb: int = Field(..., description="Free VRAM in megabytes")
    utilization_percent: float = Field(
        ..., description="VRAM utilization as percentage (0-100)"
    )
    gpu_count: int = Field(..., description="Number of GPUs detected")
    per_gpu: Optional[List[PerGpuStatsItem]] = Field(
        None, description="Per-GPU breakdown (included when available)"
    )

    model_config = {"json_schema_extra": {"example": {
        "total_mb": 24576,
        "used_mb": 8192,
        "free_mb": 16384,
        "utilization_percent": 33.33,
        "gpu_count": 1,
        "per_gpu": [{
            "gpu_index": 0, "name": "NVIDIA GeForce RTX 4090",
            "total_mb": 24576, "used_mb": 8192, "free_mb": 16384,
            "utilization_percent": 33.33,
        }],
    }}}


# -------------------------------------------------------------------------
# Resource Information
# -------------------------------------------------------------------------


class ResourceResponse(BaseModel):
    """Resource information response."""

    resource_id: str = Field(..., description="Unique resource identifier")
    resource_type: str = Field(..., description="Type of resource (e.g., 'model', 'file')")
    status: ResourceStatus = Field(..., description="Current resource status")
    vram_mb: Optional[int] = Field(None, description="VRAM usage in megabytes")
    user_locked: bool = Field(..., description="Whether resource is locked by a user")
    priority: int = Field(..., description="Current priority value")
    last_used_at: Optional[datetime] = Field(None, description="Last access timestamp")

    model_config = {"json_schema_extra": {"example": {
        "resource_id": "llama-3-70b",
        "resource_type": "model",
        "status": "loaded",
        "vram_mb": 8192,
        "user_locked": False,
        "priority": 100,
        "last_used_at": "2024-01-15T10:30:00Z"
    }}}


# -------------------------------------------------------------------------
# Preemption Check
# -------------------------------------------------------------------------


class PreemptionCheckRequest(BaseModel):
    """Request to check VRAM availability and preemption options."""

    required_vram_mb: int = Field(
        ..., gt=0, description="Amount of VRAM needed in megabytes"
    )

    model_config = {"json_schema_extra": {"example": {"required_vram_mb": 8192}}}


class PreemptionCheckResponse(BaseModel):
    """Response with VRAM availability and preemption suggestions."""

    available: bool = Field(..., description="Whether required VRAM is available")
    free_vram_mb: int = Field(..., description="Currently free VRAM in megabytes")
    preemptable_resources: List[str] = Field(
        default_factory=list,
        description="Resource IDs that can be preempted to free VRAM"
    )

    model_config = {"json_schema_extra": {"example": {
        "available": False,
        "free_vram_mb": 4096,
        "preemptable_resources": ["model-a", "model-b"]
    }}}


# -------------------------------------------------------------------------
# Offload Decision
# -------------------------------------------------------------------------


class OffloadDecisionRequest(BaseModel):
    """Request to handle user's offload decision."""

    resource_id: str = Field(..., description="Resource to offload")
    user_id: UUID = Field(..., description="User making the decision")
    decision: OffloadDecision = Field(..., description="User's decision: offload or cancel")
    remember: bool = Field(
        default=False,
        description="Whether to remember this preference for future operations"
    )

    model_config = {"json_schema_extra": {"example": {
        "resource_id": "llama-3-70b",
        "user_id": "550e8400-e29b-41d4-a716-446655440000",
        "decision": "offload",
        "remember": True
    }}}


class OffloadDecisionResponse(BaseModel):
    """Response after processing offload decision."""

    success: bool = Field(..., description="Whether the operation succeeded")
    message: str = Field(..., description="Human-readable status message")
    preempted_resources: Optional[List[str]] = Field(
        None, description="List of resources that were preempted"
    )

    model_config = {"json_schema_extra": {"example": {
        "success": True,
        "message": "Resource successfully offloaded to CPU",
        "preempted_resources": None
    }}}


# -------------------------------------------------------------------------
# Reload Request
# -------------------------------------------------------------------------


class ReloadRequest(BaseModel):
    """Request to reload a resource from CPU to GPU."""

    resource_id: str = Field(..., description="Resource to reload")
    estimated_vram_mb: int = Field(
        ..., gt=0, description="Expected VRAM usage after reload"
    )
    user_id: Optional[UUID] = Field(
        None,
        description="User ID for preference lookup. If provided, user preferences are enforced."
    )

    model_config = {"json_schema_extra": {"example": {
        "resource_id": "llama-3-70b",
        "estimated_vram_mb": 8192,
        "user_id": "550e8400-e29b-41d4-a716-446655440000"
    }}}


# -------------------------------------------------------------------------
# User Preferences
# -------------------------------------------------------------------------


class PreferenceRequest(BaseModel):
    """Request to set user offload preference."""

    user_id: UUID = Field(..., description="User ID")
    preference: OffloadPreference = Field(..., description="Offload preference setting")
    remember: bool = Field(
        default=False,
        description="If true, preference persists. If false, expires after session."
    )

    model_config = {"json_schema_extra": {"example": {
        "user_id": "550e8400-e29b-41d4-a716-446655440000",
        "preference": "always_offload",
        "remember": True
    }}}


class PreferenceResponse(BaseModel):
    """Response with user preference."""

    preference: OffloadPreference = Field(..., description="Current preference setting")

    model_config = {"json_schema_extra": {"example": {"preference": "ask_each_time"}}}


# -------------------------------------------------------------------------
# Operation State
# -------------------------------------------------------------------------


class OperationStateRequest(BaseModel):
    """Request to save operation state."""

    operation_id: str = Field(..., description="Unique operation identifier")
    operation_type: str = Field(
        ..., description="Type of operation (e.g., 'load', 'offload', 'reload')"
    )
    resource_id: str = Field(..., description="Resource being operated on")
    user_id: UUID = Field(..., description="User who initiated the operation")
    metadata: Dict[str, Any] = Field(
        default_factory=dict, description="Additional operation-specific data"
    )

    model_config = {"json_schema_extra": {"example": {
        "operation_id": "op-12345",
        "operation_type": "load",
        "resource_id": "llama-3-70b",
        "user_id": "550e8400-e29b-41d4-a716-446655440000",
        "metadata": {"priority_boost": 100}
    }}}


class OperationStateResponse(BaseModel):
    """Response with operation state."""

    operation_id: str = Field(..., description="Operation identifier")
    found: bool = Field(..., description="Whether the operation state was found")
    state: Optional[Dict[str, Any]] = Field(
        None, description="Operation state if found"
    )

    model_config = {"json_schema_extra": {"example": {
        "operation_id": "op-12345",
        "found": True,
        "state": {
            "operation_type": "load",
            "resource_id": "llama-3-70b",
            "user_id": "550e8400-e29b-41d4-a716-446655440000",
            "status": "in_progress",
            "timestamp": "2024-01-15T10:30:00Z"
        }
    }}}


# -------------------------------------------------------------------------
# Resource Status (Comprehensive)
# -------------------------------------------------------------------------


class SystemStatsResponse(BaseModel):
    """CPU and RAM statistics for the host system."""

    cpu_percent: float = Field(..., description="CPU utilization as percentage (0-100)")
    ram_total_mb: int = Field(..., description="Total system RAM in megabytes")
    ram_used_mb: int = Field(..., description="Used system RAM in megabytes")
    ram_free_mb: int = Field(..., description="Available system RAM in megabytes")
    ram_percent: float = Field(..., description="RAM utilization as percentage (0-100)")

    model_config = {"json_schema_extra": {"example": {
        "cpu_percent": 24.5,
        "ram_total_mb": 32768,
        "ram_used_mb": 16384,
        "ram_free_mb": 16384,
        "ram_percent": 50.0,
    }}}


class ResourceStatusResponse(BaseModel):
    """Comprehensive resource status aggregating VRAM, system stats, loaded resources, and queue info."""

    vram_stats: VRAMStatsResponse = Field(..., description="Current VRAM statistics")
    system_stats: Optional[SystemStatsResponse] = Field(
        None, description="CPU and RAM statistics (None if unavailable)"
    )
    loaded_resources: List[ResourceResponse] = Field(
        default_factory=list, description="Currently loaded resources"
    )
    offloaded_resources: List[ResourceResponse] = Field(
        default_factory=list, description="Resources offloaded to system RAM"
    )
    queue_size: int = Field(..., description="Number of pending model loads in queue")
    active_operations_count: int = Field(
        ..., description="Number of active operations tracked in Redis"
    )
    timestamp: datetime = Field(..., description="Snapshot timestamp")

    model_config = {"json_schema_extra": {"example": {
        "vram_stats": {
            "total_mb": 24576,
            "used_mb": 8192,
            "free_mb": 16384,
            "utilization_percent": 33.33,
            "gpu_count": 1,
        },
        "system_stats": {
            "cpu_percent": 24.5,
            "ram_total_mb": 32768,
            "ram_used_mb": 16384,
            "ram_free_mb": 16384,
            "ram_percent": 50.0,
        },
        "loaded_resources": [],
        "queue_size": 0,
        "active_operations_count": 2,
        "timestamp": "2024-01-15T10:30:00Z",
    }}}


# -------------------------------------------------------------------------
# Active Operations
# -------------------------------------------------------------------------


class ActiveOperationResponse(BaseModel):
    """Details of a single active operation."""

    operation_id: str = Field(..., description="Unique operation identifier")
    operation_type: Optional[str] = Field(None, description="Type of operation")
    resource_id: Optional[str] = Field(None, description="Resource being operated on")
    user_id: Optional[str] = Field(None, description="User who initiated the operation")
    status: Optional[str] = Field(None, description="Current operation status")
    started_at: Optional[str] = Field(None, description="When the operation started")
    metadata: Dict[str, Any] = Field(
        default_factory=dict, description="Additional operation-specific data"
    )

    model_config = {"json_schema_extra": {"example": {
        "operation_id": "op-12345",
        "operation_type": "load",
        "resource_id": "llama-3-70b",
        "user_id": "550e8400-e29b-41d4-a716-446655440000",
        "status": "in_progress",
        "started_at": "2024-01-15T10:30:00Z",
        "metadata": {"priority_boost": 100},
    }}}


class OperationListResponse(BaseModel):
    """Paginated list of active operations."""

    operations: List[ActiveOperationResponse] = Field(
        default_factory=list, description="List of active operations"
    )
    total_count: int = Field(..., description="Total number of operations found")
    timestamp: datetime = Field(..., description="Response timestamp")

    model_config = {"json_schema_extra": {"example": {
        "operations": [],
        "total_count": 0,
        "timestamp": "2024-01-15T10:30:00Z",
    }}}
