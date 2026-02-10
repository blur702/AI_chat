"""Chat CRUD endpoints."""

import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.context_deps import (
    get_context_manager,
    get_current_user_payload,
    get_db_session,
    validate_chat_access,
    validate_project_access,
)
from app.kernel.context_manager import ContextManager
from app.models.chat import Chat
from app.schemas.context import (
    ChatCreateRequest,
    ChatCreateResponse,
    ChatListResponse,
    ChatSummary,
    ChatUpdateRequest,
    ChatUpdateResponse,
    ProjectContextResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/context", tags=["context"])


@router.post("/chats", response_model=ChatCreateResponse, status_code=status.HTTP_201_CREATED)
async def create_chat(
    body: ChatCreateRequest,
    cm: ContextManager = Depends(get_context_manager),
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
) -> ChatCreateResponse:
    """Create a new chat within a project."""
    user_id = payload.get("user_id", "")
    await validate_project_access(body.project_id, user_id, db)

    chat = Chat(project_id=body.project_id, title=body.title)
    db.add(chat)
    await db.commit()
    await db.refresh(chat)

    await cm.invalidate_project_cache(body.project_id)

    return ChatCreateResponse(
        id=str(chat.id),
        title=chat.title,
        project_id=str(chat.project_id),
        created_at=chat.created_at.isoformat() if chat.created_at else None,
    )


@router.put("/chats/{chat_id}", response_model=ChatUpdateResponse)
async def update_chat(
    chat_id: UUID,
    body: ChatUpdateRequest,
    cm: ContextManager = Depends(get_context_manager),
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
) -> ChatUpdateResponse:
    """Update a chat's title, pin, or archive status."""
    user_id = payload.get("user_id", "")
    await validate_chat_access(chat_id, user_id, db)

    result = await db.execute(
        select(Chat).where(Chat.id == chat_id, Chat.is_deleted == False)  # noqa: E712
    )
    chat = result.scalar_one_or_none()
    if chat is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Chat '{chat_id}' not found",
        )

    if body.title is not None:
        chat.title = body.title
    if body.is_pinned is not None:
        chat.is_pinned = body.is_pinned
    if body.is_archived is not None:
        chat.is_archived = body.is_archived

    await db.commit()
    await db.refresh(chat)

    await cm.invalidate_conversation_cache(chat_id)
    await cm.invalidate_project_cache(chat.project_id)

    return ChatUpdateResponse(
        id=str(chat.id),
        title=chat.title,
        project_id=str(chat.project_id),
        is_pinned=chat.is_pinned,
        is_archived=chat.is_archived,
        created_at=chat.created_at.isoformat() if chat.created_at else None,
        updated_at=chat.updated_at.isoformat() if chat.updated_at else None,
    )


@router.delete("/chats/{chat_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_chat(
    chat_id: UUID,
    cm: ContextManager = Depends(get_context_manager),
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
) -> None:
    """Soft-delete a chat."""
    user_id = payload.get("user_id", "")
    await validate_chat_access(chat_id, user_id, db)

    result = await db.execute(
        select(Chat).where(Chat.id == chat_id, Chat.is_deleted == False)  # noqa: E712
    )
    chat = result.scalar_one_or_none()
    if chat is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Chat '{chat_id}' not found",
        )

    project_id = chat.project_id
    chat.soft_delete()
    await db.commit()

    await cm.invalidate_conversation_cache(chat_id)
    await cm.invalidate_project_cache(project_id)


# -------------------------------------------------------------------------
# Project Context Endpoints (read-only project views under /context)
# -------------------------------------------------------------------------


@router.post("/project/{project_id}/default-chat")
async def get_or_create_default_chat(
    project_id: UUID,
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
    cm: ContextManager = Depends(get_context_manager),
) -> dict:
    """Get or create the default sandbox chat for a project."""
    user_id = payload.get("user_id", "")
    await validate_project_access(project_id, user_id, db)

    result = await db.execute(
        select(Chat)
        .where(
            Chat.project_id == project_id,
            Chat.title == "Sandbox Chat",
            Chat.is_deleted == False,  # noqa: E712
        )
        .limit(1)
    )
    chat = result.scalar_one_or_none()

    if chat is None:
        chat = Chat(project_id=project_id, title="Sandbox Chat")
        db.add(chat)
        await db.commit()
        await db.refresh(chat)

    state = await cm.get_conversation_state(chat.id)

    return {
        "chat_id": str(chat.id),
        "conversation": state,
    }


@router.get("/project/{project_id}", response_model=ProjectContextResponse)
async def get_project_context(
    project_id: UUID,
    cm: ContextManager = Depends(get_context_manager),
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
) -> ProjectContextResponse:
    """Retrieve project-level context including metadata and chat list."""
    user_id = payload.get("user_id", "")
    await validate_project_access(project_id, user_id, db)

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
    user_id = payload.get("user_id", "")
    await validate_project_access(project_id, user_id, db)

    chats = await cm.get_all_chats_in_project(project_id)
    return ChatListResponse(
        chats=[ChatSummary(**c) for c in chats],
        count=len(chats),
    )
