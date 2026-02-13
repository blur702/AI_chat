"""System prompt library CRUD endpoints."""

import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.context_deps import (
    get_current_user_payload,
    get_db_session,
)
from app.models.chat import Chat
from app.models.project import Project
from app.models.system_prompt import SystemPrompt
from app.schemas.context import (
    SystemPromptCreateRequest,
    SystemPromptListResponse,
    SystemPromptResponse,
    SystemPromptUpdateRequest,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/context/system-prompts", tags=["context"])


def _get_user_id(payload: dict) -> UUID:
    raw_user_id = payload.get("user_id")
    if not raw_user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing required user_id in auth payload",
        )
    try:
        return UUID(str(raw_user_id))
    except (TypeError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid user_id format in auth payload",
        ) from None


def _prompt_to_response(p: SystemPrompt) -> SystemPromptResponse:
    return SystemPromptResponse(
        id=str(p.id),
        name=p.name,
        content=p.content,
        description=p.description,
        is_default=p.is_default,
        created_at=p.created_at.isoformat() if p.created_at else None,
        updated_at=p.updated_at.isoformat() if p.updated_at else None,
    )


@router.get("", response_model=SystemPromptListResponse)
async def list_system_prompts(
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
) -> SystemPromptListResponse:
    """List all non-deleted system prompts for the current user."""
    user_id = _get_user_id(payload)

    result = await db.execute(
        select(SystemPrompt)
        .where(
            SystemPrompt.user_id == user_id,
            SystemPrompt.is_deleted == False,  # noqa: E712
        )
        .order_by(SystemPrompt.is_default.desc(), SystemPrompt.updated_at.desc())
    )
    prompts = result.scalars().all()

    return SystemPromptListResponse(
        prompts=[_prompt_to_response(p) for p in prompts],
        count=len(prompts),
    )


@router.post(
    "",
    response_model=SystemPromptResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_system_prompt(
    body: SystemPromptCreateRequest,
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
) -> SystemPromptResponse:
    """Create a new system prompt. If is_default=True, clears other defaults."""
    user_id = _get_user_id(payload)

    if body.is_default:
        await db.execute(
            update(SystemPrompt)
            .where(
                SystemPrompt.user_id == user_id,
                SystemPrompt.is_default == True,  # noqa: E712
                SystemPrompt.is_deleted == False,  # noqa: E712
            )
            .values(is_default=False)
        )

    prompt = SystemPrompt(
        user_id=user_id,
        name=body.name,
        content=body.content,
        description=body.description,
        is_default=body.is_default,
    )
    db.add(prompt)
    await db.commit()
    await db.refresh(prompt)

    return _prompt_to_response(prompt)


@router.get("/{prompt_id}", response_model=SystemPromptResponse)
async def get_system_prompt(
    prompt_id: UUID,
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
) -> SystemPromptResponse:
    """Get a single system prompt by ID."""
    user_id = _get_user_id(payload)

    result = await db.execute(
        select(SystemPrompt).where(
            SystemPrompt.id == prompt_id,
            SystemPrompt.user_id == user_id,
            SystemPrompt.is_deleted == False,  # noqa: E712
        )
    )
    prompt = result.scalar_one_or_none()
    if prompt is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"System prompt '{prompt_id}' not found",
        )

    return _prompt_to_response(prompt)


@router.put("/{prompt_id}", response_model=SystemPromptResponse)
async def update_system_prompt(
    prompt_id: UUID,
    body: SystemPromptUpdateRequest,
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
) -> SystemPromptResponse:
    """Update a system prompt."""
    user_id = _get_user_id(payload)

    result = await db.execute(
        select(SystemPrompt).where(
            SystemPrompt.id == prompt_id,
            SystemPrompt.user_id == user_id,
            SystemPrompt.is_deleted == False,  # noqa: E712
        )
    )
    prompt = result.scalar_one_or_none()
    if prompt is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"System prompt '{prompt_id}' not found",
        )

    if body.is_default is True:
        await db.execute(
            update(SystemPrompt)
            .where(
                SystemPrompt.user_id == user_id,
                SystemPrompt.is_default == True,  # noqa: E712
                SystemPrompt.is_deleted == False,  # noqa: E712
                SystemPrompt.id != prompt_id,
            )
            .values(is_default=False)
        )

    update_data = body.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(prompt, field, value)

    await db.commit()
    await db.refresh(prompt)

    return _prompt_to_response(prompt)


@router.delete("/{prompt_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_system_prompt(
    prompt_id: UUID,
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
) -> None:
    """Soft-delete a system prompt and clear FK references."""
    user_id = _get_user_id(payload)

    result = await db.execute(
        select(SystemPrompt).where(
            SystemPrompt.id == prompt_id,
            SystemPrompt.user_id == user_id,
            SystemPrompt.is_deleted == False,  # noqa: E712
        )
    )
    prompt = result.scalar_one_or_none()
    if prompt is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"System prompt '{prompt_id}' not found",
        )

    await db.execute(
        update(Chat)
        .where(Chat.system_prompt_id == prompt.id)
        .values(system_prompt_id=None)
    )
    await db.execute(
        update(Project)
        .where(Project.system_prompt_id == prompt.id)
        .values(system_prompt_id=None)
    )

    prompt.soft_delete()
    await db.commit()
