"""
Tool management API endpoints.

Provides REST endpoints for:
- Listing registered tools
- Executing tools with validation and permission checks
- Clearing tool result caches
- Managing conversation-scoped tool context
- Retrieving per-chat tool execution results
"""

import logging
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user_payload
from app.database import get_db_session
from app.kernel.tool_registry import ToolRegistry
from app.models.chat import Chat
from app.models.project import Project
from app.schemas.tool import (
    CacheClearRequest,
    CacheClearResponse,
    ConversationContextResponse,
    ConversationContextUpdateRequest,
    ConversationResultsResponse,
    ToolExecuteRequest,
    ToolExecuteResponse,
    ToolInfo,
    ToolListResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/tools", tags=["tools"])


# -------------------------------------------------------------------------
# Dependencies
# -------------------------------------------------------------------------


def get_tool_registry(request: Request) -> ToolRegistry:
    """
    Dependency to get ToolRegistry from kernel.

    Raises:
        HTTPException: If kernel or ToolRegistry is not available.
    """
    kernel = getattr(request.app.state, "kernel", None)
    if kernel is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Kernel not initialized",
        )

    registry = kernel.get_service("tool_registry")
    if registry is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="ToolRegistry service not available",
        )

    return registry


async def _validate_chat_access(
    chat_id: UUID,
    user_id: str,
    db: AsyncSession,
) -> None:
    """
    Validate that a chat exists and the user has access to it.

    Joins Chat to its parent Project to verify ownership.

    Raises:
        HTTPException 404: If chat does not exist or is soft-deleted.
        HTTPException 403: If user does not own the project containing the chat.
    """
    result = await db.execute(
        select(Chat, Project.user_id)
        .join(Project, Chat.project_id == Project.id)
        .where(Chat.id == chat_id, Chat.is_deleted == False)  # noqa: E712
    )
    row = result.one_or_none()
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Chat '{chat_id}' not found",
        )

    _, owner_id = row
    if str(owner_id) != str(user_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have access to this chat",
        )


# -------------------------------------------------------------------------
# Endpoints
# -------------------------------------------------------------------------


@router.get("", response_model=ToolListResponse)
async def list_tools(
    registry: ToolRegistry = Depends(get_tool_registry),
    _payload: dict = Depends(get_current_user_payload),
) -> ToolListResponse:
    """
    List all registered tools with their metadata.

    Requires a valid JWT token.
    """
    tools = registry.list_tools()
    return ToolListResponse(
        tools=[ToolInfo(**t) for t in tools],
        count=len(tools),
    )


@router.post("/execute", response_model=ToolExecuteResponse)
async def execute_tool(
    body: ToolExecuteRequest,
    registry: ToolRegistry = Depends(get_tool_registry),
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
) -> ToolExecuteResponse:
    """
    Execute a registered tool.

    The caller's permissions are derived from the JWT token. Parameter
    validation and permission checks are performed by the ToolRegistry
    before execution.

    If chat_id is provided, execution is routed through the per-chat
    sequential queue and conversation context is loaded/updated.

    Requires a valid JWT token.
    """
    # Validate chat_id if provided
    if body.chat_id is not None:
        user_id = payload.get("sub", "")
        await _validate_chat_access(body.chat_id, user_id, db)

    # Extract permissions from token payload (default to basic set)
    caller_permissions = set(payload.get("permissions", ["tools.execute"]))

    try:
        result = await registry.execute_tool(
            tool_name=body.tool_name,
            parameters=body.parameters,
            caller_permissions=caller_permissions,
            use_cache=body.use_cache,
            chat_id=body.chat_id,
            context_data=body.context_data,
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )

    return ToolExecuteResponse(**result)


@router.post("/cache/clear", response_model=CacheClearResponse)
async def clear_cache(
    body: CacheClearRequest,
    registry: ToolRegistry = Depends(get_tool_registry),
    _payload: dict = Depends(get_current_user_payload),
) -> CacheClearResponse:
    """
    Clear tool result cache.

    If tool_name is provided, clears only that tool's cache.
    Otherwise clears all tool result caches.

    Requires a valid JWT token.
    """
    deleted = await registry.clear_tool_cache(tool_name=body.tool_name)
    return CacheClearResponse(
        deleted_count=deleted,
        tool_name=body.tool_name,
    )


# -------------------------------------------------------------------------
# Conversation Context Endpoints
# -------------------------------------------------------------------------


@router.get(
    "/context/{chat_id}",
    response_model=ConversationContextResponse,
)
async def get_conversation_context(
    chat_id: UUID,
    registry: ToolRegistry = Depends(get_tool_registry),
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
) -> ConversationContextResponse:
    """
    Retrieve conversation context for a chat.

    Requires a valid JWT token and access to the chat.
    """
    user_id = payload.get("sub", "")
    await _validate_chat_access(chat_id, user_id, db)

    context = await registry.get_conversation_context(chat_id)
    return ConversationContextResponse(chat_id=chat_id, context=context)


@router.put(
    "/context/{chat_id}",
    response_model=ConversationContextResponse,
)
async def update_conversation_context(
    chat_id: UUID,
    body: ConversationContextUpdateRequest,
    registry: ToolRegistry = Depends(get_tool_registry),
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
) -> ConversationContextResponse:
    """
    Update conversation context for a chat.

    Merges the provided context data into the existing context.

    Requires a valid JWT token and access to the chat.
    """
    user_id = payload.get("sub", "")
    await _validate_chat_access(chat_id, user_id, db)

    await registry.update_conversation_context(chat_id, body.context)
    updated = await registry.get_conversation_context(chat_id)
    return ConversationContextResponse(chat_id=chat_id, context=updated)


@router.delete("/context/{chat_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_conversation_context(
    chat_id: UUID,
    registry: ToolRegistry = Depends(get_tool_registry),
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
) -> None:
    """
    Clear all conversation state for a chat.

    Stops the queue processor, removes the execution queue, clears
    both in-memory and Redis-persisted context, and clears results.

    Requires a valid JWT token and access to the chat.
    """
    user_id = payload.get("sub", "")
    await _validate_chat_access(chat_id, user_id, db)

    await registry.cleanup_conversation(chat_id)


@router.get(
    "/results/{chat_id}",
    response_model=ConversationResultsResponse,
)
async def get_conversation_results(
    chat_id: UUID,
    limit: Optional[int] = Query(
        None, ge=1, le=100, description="Max number of results to return"
    ),
    registry: ToolRegistry = Depends(get_tool_registry),
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
) -> ConversationResultsResponse:
    """
    Get recent tool execution results for a chat.

    Returns up to `limit` most recent results (default: all, max 100).

    Requires a valid JWT token and access to the chat.
    """
    user_id = payload.get("sub", "")
    await _validate_chat_access(chat_id, user_id, db)

    results = await registry.get_conversation_results(chat_id, limit=limit)
    return ConversationResultsResponse(
        chat_id=chat_id,
        results=results,
        count=len(results),
    )
