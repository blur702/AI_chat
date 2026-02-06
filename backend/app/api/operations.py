"""
Operations tracking API endpoints.

Provides REST endpoints for listing and inspecting active operations
tracked in Redis by the ResourceManager.
"""

import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status

from app.kernel.resource_manager import ResourceManager
from app.schemas.resource import (
    ActiveOperationResponse,
    OperationListResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/operations", tags=["operations"])


def get_resource_manager(request: Request) -> ResourceManager:
    """Dependency to get ResourceManager from kernel."""
    kernel = getattr(request.app.state, "kernel", None)
    if kernel is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Kernel not initialized",
        )
    resource_manager = kernel.get_service("resource_manager")
    if resource_manager is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="ResourceManager service not available",
        )
    return resource_manager


@router.get("", response_model=OperationListResponse)
async def list_operations(
    user_id: Optional[str] = None,
    resource_id: Optional[str] = None,
    op_status: Optional[str] = None,
    limit: int = 50,
    resource_manager: ResourceManager = Depends(get_resource_manager),
) -> OperationListResponse:
    """
    List active operations with optional filtering.

    Query parameters:
    - user_id: Filter by user who initiated the operation
    - resource_id: Filter by resource being operated on
    - op_status: Filter by operation status
    - limit: Maximum operations to return (default 50)
    """
    operation_ids = await resource_manager.scan_operation_keys()

    # Collect all matching operations first to get accurate total_count
    all_matching = []
    for op_id in operation_ids:
        state = await resource_manager.get_operation_state(op_id)
        if state is None:
            continue

        # Apply filters
        if user_id and state.get("user_id") != user_id:
            continue
        if resource_id and state.get("resource_id") != resource_id:
            continue
        if op_status and state.get("status") != op_status:
            continue

        all_matching.append(ActiveOperationResponse(
            operation_id=op_id,
            operation_type=state.get("operation_type"),
            resource_id=state.get("resource_id"),
            user_id=state.get("user_id"),
            status=state.get("status"),
            started_at=state.get("timestamp"),
            metadata=state.get("metadata", {}),
        ))

    return OperationListResponse(
        operations=all_matching[:limit],
        total_count=len(all_matching),
        timestamp=datetime.now(timezone.utc),
    )


@router.get("/{operation_id}", response_model=ActiveOperationResponse)
async def get_operation(
    operation_id: str,
    resource_manager: ResourceManager = Depends(get_resource_manager),
) -> ActiveOperationResponse:
    """
    Get details for a specific operation.

    Returns 404 if the operation is not found.
    """
    state = await resource_manager.get_operation_state(operation_id)

    if state is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Operation '{operation_id}' not found",
        )

    return ActiveOperationResponse(
        operation_id=operation_id,
        operation_type=state.get("operation_type"),
        resource_id=state.get("resource_id"),
        user_id=state.get("user_id"),
        status=state.get("status"),
        started_at=state.get("timestamp"),
        metadata=state.get("metadata", {}),
    )
