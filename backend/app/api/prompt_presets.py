"""Prompt preset API endpoints for image generation."""

import logging
from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user_payload
from app.database import get_db_session
from app.models.prompt_preset import PromptPreset
from app.schemas.prompt_preset import (
    PromptPresetCreate,
    PromptPresetListResponse,
    PromptPresetResponse,
    PromptPresetUpdate,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/prompt-presets", tags=["image"])


def _preset_to_response(preset: PromptPreset) -> PromptPresetResponse:
    return PromptPresetResponse(
        id=str(preset.id),
        user_id=str(preset.user_id),
        name=preset.name,
        prompt_text=preset.prompt_text,
        negative_prompt_text=preset.negative_prompt_text,
        category=preset.category,
        tags=preset.tags,
        workflow_settings=preset.workflow_settings,
        is_public=preset.is_public,
        created_at=preset.created_at.isoformat() if preset.created_at else None,
        updated_at=preset.updated_at.isoformat() if preset.updated_at else None,
    )


@router.post("", response_model=PromptPresetResponse, status_code=status.HTTP_201_CREATED)
async def create_preset(
    body: PromptPresetCreate,
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
):
    """Create a new prompt preset."""
    raw_user_id = payload.get("user_id")
    if not raw_user_id:
        raise HTTPException(status_code=401, detail="Missing user_id in token")
    user_id = UUID(raw_user_id)

    preset = PromptPreset(
        user_id=user_id,
        name=body.name,
        prompt_text=body.prompt_text,
        negative_prompt_text=body.negative_prompt_text,
        category=body.category,
        tags=body.tags or [],
        workflow_settings=body.workflow_settings,
        is_public=body.is_public,
    )
    db.add(preset)
    await db.commit()

    # Re-query to get server defaults
    result = await db.execute(
        select(PromptPreset).where(PromptPreset.id == preset.id)
    )
    preset = result.scalar_one()
    return _preset_to_response(preset)


@router.get("", response_model=PromptPresetListResponse)
async def list_presets(
    category: Optional[str] = Query(default=None),
    search: Optional[str] = Query(default=None, max_length=200),
    mine_only: bool = Query(default=False),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=100),
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
):
    """List prompt presets (own + public)."""
    raw_user_id = payload.get("user_id")
    if not raw_user_id:
        raise HTTPException(status_code=401, detail="Missing user_id in token")
    user_id = UUID(raw_user_id)

    base_filter = (
        or_(PromptPreset.user_id == user_id, PromptPreset.is_public == True)  # noqa: E712
        if not mine_only
        else PromptPreset.user_id == user_id
    )

    query = select(PromptPreset).where(base_filter, PromptPreset.is_deleted == False)  # noqa: E712
    count_query = select(func.count()).select_from(PromptPreset).where(base_filter, PromptPreset.is_deleted == False)  # noqa: E712

    if category:
        query = query.where(PromptPreset.category == category)
        count_query = count_query.where(PromptPreset.category == category)

    if search:
        search_filter = or_(
            PromptPreset.name.ilike(f"%{search}%"),
            PromptPreset.prompt_text.ilike(f"%{search}%"),
        )
        query = query.where(search_filter)
        count_query = count_query.where(search_filter)

    total = (await db.execute(count_query)).scalar() or 0
    query = query.order_by(PromptPreset.created_at.desc()).offset(skip).limit(limit)
    result = await db.execute(query)
    presets = list(result.scalars().all())

    return PromptPresetListResponse(
        presets=[_preset_to_response(p) for p in presets],
        count=total,
    )


@router.get("/{preset_id}", response_model=PromptPresetResponse)
async def get_preset(
    preset_id: UUID,
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
):
    """Get a single prompt preset."""
    raw_user_id = payload.get("user_id")
    if not raw_user_id:
        raise HTTPException(status_code=401, detail="Missing user_id in token")
    user_id = UUID(raw_user_id)
    result = await db.execute(
        select(PromptPreset).where(
            PromptPreset.id == preset_id,
            PromptPreset.is_deleted == False,  # noqa: E712
        )
    )
    preset = result.scalar_one_or_none()
    if preset is None:
        raise HTTPException(status_code=404, detail="Preset not found")
    if not preset.is_public and preset.user_id != user_id:
        raise HTTPException(status_code=403, detail="Not authorized to view this preset")
    return _preset_to_response(preset)


@router.put("/{preset_id}", response_model=PromptPresetResponse)
async def update_preset(
    preset_id: UUID,
    body: PromptPresetUpdate,
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
):
    """Update a prompt preset (owner only)."""
    raw_user_id = payload.get("user_id")
    if not raw_user_id:
        raise HTTPException(status_code=401, detail="Missing user_id in token")
    user_id = UUID(raw_user_id)
    result = await db.execute(
        select(PromptPreset).where(
            PromptPreset.id == preset_id,
            PromptPreset.is_deleted == False,  # noqa: E712
        )
    )
    preset = result.scalar_one_or_none()
    if preset is None:
        raise HTTPException(status_code=404, detail="Preset not found")
    if preset.user_id != user_id:
        raise HTTPException(status_code=403, detail="Not authorized to modify this preset")

    update_data = body.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(preset, field, value)

    await db.commit()

    # Re-query for fresh data
    result = await db.execute(
        select(PromptPreset).where(PromptPreset.id == preset_id)
    )
    preset = result.scalar_one()
    return _preset_to_response(preset)


@router.delete("/{preset_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_preset(
    preset_id: UUID,
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
):
    """Delete a prompt preset (owner only)."""
    raw_user_id = payload.get("user_id")
    if not raw_user_id:
        raise HTTPException(status_code=401, detail="Missing user_id in token")
    user_id = UUID(raw_user_id)
    result = await db.execute(
        select(PromptPreset).where(
            PromptPreset.id == preset_id,
            PromptPreset.is_deleted == False,  # noqa: E712
        )
    )
    preset = result.scalar_one_or_none()
    if preset is None:
        raise HTTPException(status_code=404, detail="Preset not found")
    if preset.user_id != user_id:
        raise HTTPException(status_code=403, detail="Not authorized to delete this preset")

    preset.is_deleted = True
    preset.deleted_at = datetime.now(timezone.utc)
    db.add(preset)
    await db.commit()
