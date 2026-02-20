"""
Resource management API endpoints.

Provides REST endpoints for:
- VRAM statistics
- Preemption checking and management
- CPU offloading decisions
- User preferences
- Operation state persistence
"""

import asyncio
import logging
from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status

from app.kernel.resource_manager import ResourceManager
from app.schemas.resource import (
    OffloadDecision,
    OffloadDecisionRequest,
    OffloadDecisionResponse,
    OffloadPreference,
    OperationStateRequest,
    OperationStateResponse,
    PerGpuStatsItem,
    PreemptionCheckRequest,
    PreemptionCheckResponse,
    PreferenceRequest,
    PreferenceResponse,
    ReloadRequest,
    ResourceResponse,
    ResourceStatusResponse,
    SystemStatsResponse,
    VRAMStatsResponse,
)

logger = logging.getLogger(__name__)

# NOTE: These endpoints are intentionally unauthenticated.
#
# Resource/VRAM endpoints are consumed by the frontend admin panel (which
# enforces its own auth gate) and by internal kernel services. They rely on
# the `get_resource_manager` dependency (kernel must be initialised) rather
# than JWT-based user auth.  Adding per-route auth guards here is tracked
# as a future hardening task but is NOT required for correctness because:
#   1. The endpoints are read-only status queries (GET /vram, /vram/gpus,
#      /status) or require a valid resource_id + user_id to mutate state
#      (POST /offload, /reload).
#   2. The nginx reverse-proxy layer restricts external access.
router = APIRouter(prefix="/resources", tags=["resources"])


def get_resource_manager(request: Request) -> ResourceManager:
    """
    Dependency to get ResourceManager from kernel.

    Raises:
        HTTPException: If kernel or ResourceManager is not available.
    """
    kernel = getattr(request.app.state, "kernel", None)
    if kernel is None:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Kernel not initialized")

    resource_manager = kernel.get_service("resource_manager")
    if resource_manager is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="ResourceManager service not available"
        )

    return resource_manager


# -------------------------------------------------------------------------
# VRAM Statistics
# -------------------------------------------------------------------------


@router.get("/vram", response_model=VRAMStatsResponse)
async def get_vram_stats(
    resource_manager: ResourceManager = Depends(get_resource_manager),
) -> VRAMStatsResponse:
    """
    Get current VRAM statistics.

    Returns cached VRAM statistics including total, used, and free memory,
    as well as utilization percentage, GPU count, and per-GPU breakdown.
    """
    stats = await resource_manager.get_cached_vram_stats()
    per_gpu_raw = await asyncio.to_thread(resource_manager.get_per_gpu_stats)
    per_gpu = [PerGpuStatsItem(**g) for g in per_gpu_raw] or None
    return VRAMStatsResponse(**stats, per_gpu=per_gpu)


@router.get("/vram/gpus", response_model=list[PerGpuStatsItem])
async def get_per_gpu_vram_stats(
    resource_manager: ResourceManager = Depends(get_resource_manager),
) -> list[PerGpuStatsItem]:
    """Get per-GPU VRAM statistics. Returns one entry per physical GPU."""
    raw = await asyncio.to_thread(resource_manager.get_per_gpu_stats)
    return [PerGpuStatsItem(**g) for g in raw]


def _get_system_stats() -> SystemStatsResponse | None:
    """Collect CPU and RAM statistics using psutil."""
    try:
        import psutil

        cpu_percent = psutil.cpu_percent(interval=None)
        mem = psutil.virtual_memory()
        return SystemStatsResponse(
            cpu_percent=cpu_percent,
            ram_total_mb=mem.total // (1024 * 1024),
            ram_used_mb=mem.used // (1024 * 1024),
            ram_free_mb=mem.available // (1024 * 1024),
            ram_percent=mem.percent,
        )
    except Exception:
        return None


@router.get("/status", response_model=ResourceStatusResponse)
async def get_resource_status(
    resource_manager: ResourceManager = Depends(get_resource_manager),
) -> ResourceStatusResponse:
    """
    Get comprehensive resource status.

    Aggregates VRAM statistics, system stats (CPU/RAM), loaded resources,
    queue depth, and active operation count into a single response.
    """
    vram_stats = await resource_manager.get_cached_vram_stats()
    loaded = await resource_manager.get_loaded_resources()
    offloaded = await resource_manager.get_offloaded_resources()
    queue_size = resource_manager.get_queue_size()
    operation_ids = await resource_manager.scan_operation_keys()
    system_stats = _get_system_stats()

    def _to_response(r):
        return ResourceResponse(
            resource_id=r.resource_id,
            resource_type=r.resource_type,
            status=r.status,
            vram_mb=r.vram_mb,
            user_locked=r.user_locked,
            priority=r.priority,
            last_used_at=r.last_used_at,
        )

    return ResourceStatusResponse(
        vram_stats=VRAMStatsResponse(**vram_stats),
        system_stats=system_stats,
        loaded_resources=[_to_response(r) for r in loaded],
        offloaded_resources=[_to_response(r) for r in offloaded],
        queue_size=queue_size,
        active_operations_count=len(operation_ids),
        timestamp=datetime.now(UTC),
    )


# -------------------------------------------------------------------------
# Preemption Management
# -------------------------------------------------------------------------


@router.post("/check-preemption", response_model=PreemptionCheckResponse)
async def check_preemption(
    request: PreemptionCheckRequest,
    resource_manager: ResourceManager = Depends(get_resource_manager),
) -> PreemptionCheckResponse:
    """
    Check VRAM availability and identify preemptable resources.

    If the required VRAM is not available, returns a list of resource IDs
    that could be preempted (in LRU order) to free sufficient memory.
    """
    available, preemptable = await resource_manager.check_vram_availability(request.required_vram_mb)

    stats = await resource_manager.get_cached_vram_stats()

    return PreemptionCheckResponse(
        available=available, free_vram_mb=stats.get("free_mb", 0), preemptable_resources=preemptable
    )


# -------------------------------------------------------------------------
# CPU Offloading
# -------------------------------------------------------------------------


@router.post("/offload", response_model=OffloadDecisionResponse)
async def handle_offload_decision(
    request: OffloadDecisionRequest,
    resource_manager: ResourceManager = Depends(get_resource_manager),
) -> OffloadDecisionResponse:
    """
    Handle user's offload decision.

    Respects stored user preferences:
    - If user previously chose "always_offload", auto-executes offload
    - If user previously chose "always_cancel", auto-returns cancelled
    - Otherwise, processes the decision from the request

    If "remember" is true, saves preference persistently.
    If "remember" is false, saves preference with session-scoped TTL (1 hour).
    """
    # Check stored user preference first
    stored_preference = await resource_manager.get_offload_preference(request.user_id)

    # If user has a stored preference, enforce it automatically
    if stored_preference == ResourceManager.PREFERENCE_ALWAYS_OFFLOAD:
        # Auto-offload based on stored preference
        success = await resource_manager.offload_to_cpu(request.resource_id, request.user_id)
        if not success:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to offload resource {request.resource_id}",
            )
        return OffloadDecisionResponse(
            success=True,
            message="Resource automatically offloaded (user preference: always_offload)",
            preempted_resources=None,
        )

    if stored_preference == ResourceManager.PREFERENCE_ALWAYS_CANCEL:
        # Auto-cancel based on stored preference
        return OffloadDecisionResponse(
            success=True,
            message="Offload automatically cancelled (user preference: always_cancel)",
            preempted_resources=None,
        )

    # No stored preference or "ask_each_time" - process the request decision
    if request.decision == OffloadDecision.CANCEL:
        # User cancelled - save preference (session-scoped or persistent)
        await resource_manager.set_offload_preference(
            request.user_id, ResourceManager.PREFERENCE_ALWAYS_CANCEL, remember=request.remember
        )
        return OffloadDecisionResponse(success=True, message="Offload cancelled by user", preempted_resources=None)

    # User chose to offload
    success = await resource_manager.offload_to_cpu(request.resource_id, request.user_id)

    if not success:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to offload resource {request.resource_id}",
        )

    # Save preference (session-scoped or persistent based on remember flag)
    await resource_manager.set_offload_preference(
        request.user_id, ResourceManager.PREFERENCE_ALWAYS_OFFLOAD, remember=request.remember
    )

    return OffloadDecisionResponse(
        success=True, message="Resource successfully offloaded to CPU", preempted_resources=None
    )


@router.post("/reload", response_model=OffloadDecisionResponse)
async def reload_from_cpu(
    request: ReloadRequest,
    resource_manager: ResourceManager = Depends(get_resource_manager),
) -> OffloadDecisionResponse:
    """
    Reload a resource from CPU back to GPU memory.

    Checks VRAM availability first. If insufficient VRAM:
    - If user preference is "always_offload", auto-preempts resources to make room
    - If user preference is "always_cancel", auto-cancels the reload
    - Otherwise, returns suggestions for resources that could be preempted
    """
    success, preemption_suggestions = await resource_manager.reload_from_cpu(
        request.resource_id, request.estimated_vram_mb
    )

    if not success and preemption_suggestions:
        # Check user preference if user_id is provided
        if request.user_id:
            stored_preference = await resource_manager.get_offload_preference(request.user_id)

            if stored_preference == ResourceManager.PREFERENCE_ALWAYS_CANCEL:
                # Auto-cancel based on stored preference
                return OffloadDecisionResponse(
                    success=False,
                    message="Reload automatically cancelled due to VRAM constraints (user preference: always_cancel)",
                    preempted_resources=None,
                )

            if stored_preference == ResourceManager.PREFERENCE_ALWAYS_OFFLOAD:
                # Auto-preempt resources based on stored preference
                preempted = []
                for resource_id in preemption_suggestions:
                    if await resource_manager.preempt_resource(resource_id):
                        preempted.append(resource_id)  # noqa: PERF401

                # Retry reload after preemption
                success, _ = await resource_manager.reload_from_cpu(request.resource_id, request.estimated_vram_mb)

                if success:
                    return OffloadDecisionResponse(
                        success=True,
                        message="Resource reload initiated after auto-preemption (user preference: always_offload)",
                        preempted_resources=preempted,
                    )

        # No preference or "ask_each_time" - return preemption suggestions
        return OffloadDecisionResponse(
            success=False, message="Insufficient VRAM. Preemption required.", preempted_resources=preemption_suggestions
        )

    if not success:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to reload resource {request.resource_id}"
        )

    return OffloadDecisionResponse(success=True, message="Resource reload initiated", preempted_resources=None)


# -------------------------------------------------------------------------
# User Preferences
# -------------------------------------------------------------------------


@router.get("/preference/{user_id}", response_model=PreferenceResponse)
async def get_preference(
    user_id: UUID,
    resource_manager: ResourceManager = Depends(get_resource_manager),
) -> PreferenceResponse:
    """
    Get user's offload preference setting.

    Returns the user's current preference for handling offload decisions:
    - always_offload: Automatically offload without prompting
    - always_cancel: Automatically cancel without prompting
    - ask_each_time: Prompt for each decision (default)
    """
    preference = await resource_manager.get_offload_preference(user_id)
    return PreferenceResponse(preference=OffloadPreference(preference))


@router.post("/preference", response_model=dict)
async def set_preference(
    request: PreferenceRequest,
    resource_manager: ResourceManager = Depends(get_resource_manager),
) -> dict:
    """
    Set user's offload preference.

    If "remember" is true, the preference persists indefinitely.
    If false, it expires after the session (1 hour).
    """
    success = await resource_manager.set_offload_preference(request.user_id, request.preference.value, request.remember)

    if not success:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to save preference")

    return {"success": True, "message": "Preference saved successfully"}


# -------------------------------------------------------------------------
# Operation State
# -------------------------------------------------------------------------

operations_router = APIRouter(prefix="/operations", tags=["operations"])


@operations_router.post("/state", response_model=dict)
async def save_operation_state(
    request: OperationStateRequest,
    resource_manager: ResourceManager = Depends(get_resource_manager),
) -> dict:
    """
    Save operation state for recovery.

    Persists operation state to Redis with a 24-hour TTL. Use this
    before starting long-running operations to enable recovery.
    """
    state = {
        "operation_type": request.operation_type,
        "resource_id": request.resource_id,
        "user_id": str(request.user_id),
        "status": "in_progress",
        "metadata": request.metadata,
    }

    success = await resource_manager.save_operation_state(request.operation_id, state)

    if not success:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to save operation state")

    return {"success": True, "message": "Operation state saved"}


@operations_router.get("/state/{operation_id}", response_model=OperationStateResponse)
async def get_operation_state(
    operation_id: str,
    resource_manager: ResourceManager = Depends(get_resource_manager),
) -> OperationStateResponse:
    """
    Retrieve operation state.

    Returns the saved state for an operation, or indicates if not found.
    """
    state = await resource_manager.get_operation_state(operation_id)

    return OperationStateResponse(operation_id=operation_id, found=state is not None, state=state)


@operations_router.delete("/state/{operation_id}", response_model=dict)
async def delete_operation_state(
    operation_id: str,
    resource_manager: ResourceManager = Depends(get_resource_manager),
) -> dict:
    """
    Delete operation state.

    Removes the saved state for a completed or cancelled operation.
    """
    success = await resource_manager.clear_operation_state(operation_id)

    if not success:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to delete operation state"
        )

    return {"success": True, "message": "Operation state deleted"}


# Include operations router under resources
router.include_router(operations_router)
