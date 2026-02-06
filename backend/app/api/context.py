"""
Context management API endpoints.

Provides REST endpoints for:
- Conversation state retrieval and updates
- Project-level context access
- User preferences caching
- Token usage tracking with compaction triggering
"""

import logging
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Header, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import verify_token
from app.database import get_db_session
from app.kernel.context_manager import ContextManager
from app.models.chat import Chat
from app.models.project import Project
from app.schemas.context import (
    ChatListResponse,
    ChatSummary,
    ConversationStateResponse,
    ConversationStateUpdateRequest,
    ProjectContextResponse,
    TokenUsageRequest,
    TokenUsageResponse,
    UserPreferencesResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/context", tags=["context"])


# -------------------------------------------------------------------------
# Dependencies
# -------------------------------------------------------------------------


def get_context_manager(request: Request) -> ContextManager:
    """Dependency to get ContextManager from kernel."""
    kernel = getattr(request.app.state, "kernel", None)
    if kernel is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Kernel not initialized",
        )

    cm = kernel.get_service("context_manager")
    if cm is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="ContextManager service not available",
        )

    return cm


def get_current_user_payload(
    authorization: Optional[str] = Header(None),
) -> dict:
    """Dependency to extract and verify JWT from the Authorization header."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid Authorization header",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = authorization[len("Bearer "):]
    payload = verify_token(token)
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return payload


async def _validate_chat_access(
    chat_id: UUID,
    user_id: str,
    db: AsyncSession,
) -> None:
    """Validate that a chat exists and the user has access to it."""
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


async def _validate_project_access(
    project_id: UUID,
    user_id: str,
    db: AsyncSession,
) -> None:
    """Validate that a project exists and the user owns it."""
    result = await db.execute(
        select(Project.user_id)
        .where(Project.id == project_id, Project.is_deleted == False)  # noqa: E712
    )
    row = result.one_or_none()
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Project '{project_id}' not found",
        )

    (owner_id,) = row
    if str(owner_id) != str(user_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have access to this project",
        )


# -------------------------------------------------------------------------
# Conversation Endpoints
# -------------------------------------------------------------------------


@router.get("/conversation/{chat_id}", response_model=ConversationStateResponse)
async def get_conversation_state(
    chat_id: UUID,
    cm: ContextManager = Depends(get_context_manager),
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
) -> ConversationStateResponse:
    """Retrieve the full conversation state for a chat."""
    user_id = payload.get("sub", "")
    await _validate_chat_access(chat_id, user_id, db)

    state = await cm.get_conversation_state(chat_id)
    if state is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Chat '{chat_id}' not found",
        )

    return ConversationStateResponse(**state)


@router.put("/conversation/{chat_id}", response_model=ConversationStateResponse)
async def update_conversation_state(
    chat_id: UUID,
    body: ConversationStateUpdateRequest,
    cm: ContextManager = Depends(get_context_manager),
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
) -> ConversationStateResponse:
    """Update the cached conversation state with the provided updates."""
    user_id = payload.get("sub", "")
    await _validate_chat_access(chat_id, user_id, db)

    state = await cm.update_conversation_state(chat_id, body.updates)
    if state is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Chat '{chat_id}' not found",
        )

    return ConversationStateResponse(**state)


@router.delete(
    "/conversation/{chat_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def invalidate_conversation_cache(
    chat_id: UUID,
    cm: ContextManager = Depends(get_context_manager),
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
) -> None:
    """Invalidate the cached conversation state for a chat."""
    user_id = payload.get("sub", "")
    await _validate_chat_access(chat_id, user_id, db)

    await cm.invalidate_conversation_cache(chat_id)


# -------------------------------------------------------------------------
# Project Endpoints
# -------------------------------------------------------------------------


@router.get("/project/{project_id}", response_model=ProjectContextResponse)
async def get_project_context(
    project_id: UUID,
    cm: ContextManager = Depends(get_context_manager),
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
) -> ProjectContextResponse:
    """Retrieve project-level context including metadata and chat list."""
    user_id = payload.get("sub", "")
    await _validate_project_access(project_id, user_id, db)

    context = await cm.get_project_context(project_id)
    if context is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Project '{project_id}' not found",
        )

    return ProjectContextResponse(**context)


@router.get("/project/{project_id}/chats", response_model=ChatListResponse)
async def get_project_chats(
    project_id: UUID,
    cm: ContextManager = Depends(get_context_manager),
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
) -> ChatListResponse:
    """List all non-deleted chats belonging to a project."""
    user_id = payload.get("sub", "")
    await _validate_project_access(project_id, user_id, db)

    chats = await cm.get_all_chats_in_project(project_id)
    return ChatListResponse(
        chats=[ChatSummary(**c) for c in chats],
        count=len(chats),
    )


# -------------------------------------------------------------------------
# User Preferences Endpoints
# -------------------------------------------------------------------------


@router.get("/user/{user_id}/preferences", response_model=UserPreferencesResponse)
async def get_user_preferences(
    user_id: UUID,
    cm: ContextManager = Depends(get_context_manager),
    payload: dict = Depends(get_current_user_payload),
) -> UserPreferencesResponse:
    """Retrieve cached user preferences."""
    requesting_user = payload.get("sub", "")
    if str(user_id) != str(requesting_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only access your own preferences",
        )

    prefs = await cm.get_user_preferences(user_id)
    return UserPreferencesResponse(**prefs)


# -------------------------------------------------------------------------
# Token Usage Endpoints
# -------------------------------------------------------------------------


@router.post("/conversation/{chat_id}/tokens", response_model=TokenUsageResponse)
async def track_token_usage(
    chat_id: UUID,
    body: TokenUsageRequest,
    cm: ContextManager = Depends(get_context_manager),
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
) -> TokenUsageResponse:
    """Track token usage and trigger compaction if threshold is exceeded."""
    user_id = payload.get("sub", "")
    await _validate_chat_access(chat_id, user_id, db)

    needs_compaction = await cm.track_token_usage(
        chat_id, body.token_count, body.max_tokens
    )

    compaction_triggered = False
    if needs_compaction:
        compaction_id = await cm.trigger_compaction(chat_id)
        compaction_triggered = compaction_id is not None

    usage = await cm.get_token_usage(chat_id)
    return TokenUsageResponse(
        current_tokens=usage["current_tokens"],
        max_tokens=usage["max_tokens"],
        usage_ratio=usage["usage_ratio"],
        compaction_triggered=compaction_triggered,
    )


@router.get("/conversation/{chat_id}/tokens", response_model=TokenUsageResponse)
async def get_token_usage(
    chat_id: UUID,
    cm: ContextManager = Depends(get_context_manager),
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
) -> TokenUsageResponse:
    """Retrieve current token usage statistics for a conversation."""
    user_id = payload.get("sub", "")
    await _validate_chat_access(chat_id, user_id, db)

    usage = await cm.get_token_usage(chat_id)
    return TokenUsageResponse(
        current_tokens=usage["current_tokens"],
        max_tokens=usage["max_tokens"],
        usage_ratio=usage["usage_ratio"],
        compaction_triggered=False,
    )
