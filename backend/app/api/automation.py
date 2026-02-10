"""
Automation actions API endpoints.

Provides REST endpoints for:
- Creating pending automation actions
- Listing actions per project
- Approving, executing, and deleting actions
"""

import logging
from uuid import UUID

from arq import create_pool
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user_payload
from app.api.context_deps import validate_project_access
from app.database import get_db_session
from app.models.automation_action import AutomationAction
from app.schemas.automation import (
    AutomationActionApproveRequest,
    AutomationActionCreateRequest,
    AutomationActionExecuteResponse,
    AutomationActionListResponse,
    AutomationActionResponse,
)
from app.worker import get_redis_settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/automation", tags=["automation"])


# -------------------------------------------------------------------------
# Helpers
# -------------------------------------------------------------------------


def _action_to_response(action: AutomationAction) -> AutomationActionResponse:
    """Convert an AutomationAction model to a response schema."""
    return AutomationActionResponse(
        id=str(action.id),
        project_id=str(action.project_id),
        action_type=action.action_type,
        action_data=action.action_data,
        user_approved=action.user_approved,
        executed_at=str(action.executed_at) if action.executed_at else None,
        created_at=str(action.created_at) if action.created_at else None,
        updated_at=str(action.updated_at) if action.updated_at else None,
    )


async def _get_action_with_access(
    action_id: UUID,
    user_id: str,
    db: AsyncSession,
) -> AutomationAction:
    """Load an automation action and validate user has project access."""
    result = await db.execute(
        select(AutomationAction).where(AutomationAction.id == action_id)
    )
    action = result.scalar_one_or_none()
    if action is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Action '{action_id}' not found",
        )
    await validate_project_access(action.project_id, user_id, db)
    return action


# -------------------------------------------------------------------------
# Create Action
# -------------------------------------------------------------------------


@router.post(
    "/actions",
    response_model=AutomationActionResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_action(
    body: AutomationActionCreateRequest,
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
) -> AutomationActionResponse:
    """Create a new pending automation action for a project."""
    user_id = payload.get("user_id") or payload.get("sub", "")
    project_id = UUID(body.project_id)
    await validate_project_access(project_id, user_id, db)

    action = AutomationAction(
        project_id=project_id,
        action_type=body.action_type,
        action_data=body.action_data,
        user_approved=False,
    )
    db.add(action)
    await db.commit()
    await db.refresh(action)

    return _action_to_response(action)


# -------------------------------------------------------------------------
# List Actions
# -------------------------------------------------------------------------


@router.get(
    "/actions/{project_id}",
    response_model=AutomationActionListResponse,
)
async def list_actions(
    project_id: UUID,
    approved: bool | None = None,
    executed: bool | None = None,
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
) -> AutomationActionListResponse:
    """List all automation actions for a project with optional filters."""
    user_id = payload.get("user_id") or payload.get("sub", "")
    await validate_project_access(project_id, user_id, db)

    stmt = (
        select(AutomationAction)
        .where(AutomationAction.project_id == project_id)
    )

    if approved is not None:
        stmt = stmt.where(AutomationAction.user_approved == approved)

    if executed is not None:
        if executed:
            stmt = stmt.where(AutomationAction.executed_at.isnot(None))
        else:
            stmt = stmt.where(AutomationAction.executed_at.is_(None))

    stmt = stmt.order_by(AutomationAction.created_at.desc())

    result = await db.execute(stmt)
    actions = result.scalars().all()

    return AutomationActionListResponse(
        actions=[_action_to_response(a) for a in actions],
        count=len(actions),
    )


# -------------------------------------------------------------------------
# Get Action Detail
# -------------------------------------------------------------------------


@router.get(
    "/actions/{action_id}/detail",
    response_model=AutomationActionResponse,
)
async def get_action_detail(
    action_id: UUID,
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
) -> AutomationActionResponse:
    """Get details for a single automation action."""
    user_id = payload.get("user_id") or payload.get("sub", "")
    action = await _get_action_with_access(action_id, user_id, db)
    return _action_to_response(action)


# -------------------------------------------------------------------------
# Approve Action
# -------------------------------------------------------------------------


@router.put(
    "/actions/{action_id}/approve",
    response_model=AutomationActionResponse,
)
async def approve_action(
    action_id: UUID,
    body: AutomationActionApproveRequest | None = None,
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
) -> AutomationActionResponse:
    """Approve an automation action, optionally modifying its data."""
    user_id = payload.get("user_id") or payload.get("sub", "")
    action = await _get_action_with_access(action_id, user_id, db)

    action.user_approved = True
    if body and body.action_data is not None:
        action.action_data = body.action_data

    await db.commit()
    await db.refresh(action)

    return _action_to_response(action)


# -------------------------------------------------------------------------
# Execute Action
# -------------------------------------------------------------------------


@router.post(
    "/actions/{action_id}/execute",
    response_model=AutomationActionExecuteResponse,
)
async def execute_action(
    action_id: UUID,
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
) -> AutomationActionExecuteResponse:
    """Execute an approved automation action via background worker."""
    user_id = payload.get("user_id") or payload.get("sub", "")
    action = await _get_action_with_access(action_id, user_id, db)

    if not action.user_approved:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Action must be approved before execution",
        )

    if action.executed_at is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Action has already been executed",
        )

    # Enqueue worker task
    redis = None
    try:
        redis = await create_pool(get_redis_settings())
        await redis.enqueue_job("execute_automation_action_task", str(action_id))
        logger.info("Enqueued automation execution for action %s", action_id)
    except Exception as exc:
        logger.exception("Failed to enqueue automation task for action %s", action_id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to enqueue execution task",
        ) from exc
    finally:
        if redis is not None:
            await redis.close()

    return AutomationActionExecuteResponse(
        id=str(action.id),
        status="queued",
    )


# -------------------------------------------------------------------------
# Delete Action
# -------------------------------------------------------------------------


@router.delete(
    "/actions/{action_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_action(
    action_id: UUID,
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
) -> None:
    """Delete (reject) an automation action."""
    user_id = payload.get("user_id") or payload.get("sub", "")
    action = await _get_action_with_access(action_id, user_id, db)

    await db.delete(action)
    await db.commit()
