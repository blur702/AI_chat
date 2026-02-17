"""Reusable color palette CRUD endpoints."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.context_deps import get_current_user_payload, get_db_session
from app.models.color_palette import ColorPalette
from app.schemas.palette import (
    PaletteCreateRequest,
    PaletteListResponse,
    PaletteResponse,
    PaletteUpdateRequest,
)

router = APIRouter(prefix="/palettes", tags=["palettes"])


def _get_user_uuid(payload: dict) -> UUID:
    raw = payload.get("user_id") or payload.get("sub")
    if not raw:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing user_id in token",
        )
    try:
        return UUID(str(raw))
    except (TypeError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid user_id in token",
        ) from exc


def _to_response(p: ColorPalette) -> PaletteResponse:
    return PaletteResponse(
        id=str(p.id),
        name=p.name,
        description=p.description,
        colors=p.colors or [],
        tags=p.tags or [],
        created_at=p.created_at.isoformat() if p.created_at else None,
        updated_at=p.updated_at.isoformat() if p.updated_at else None,
    )


@router.get("", response_model=PaletteListResponse)
async def list_palettes(
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
) -> PaletteListResponse:
    user_id = _get_user_uuid(payload)
    base_q = select(ColorPalette).where(
        ColorPalette.user_id == user_id,
        ColorPalette.is_deleted == False,  # noqa: E712
    )
    count_result = await db.execute(select(func.count()).select_from(base_q.subquery()))
    total = count_result.scalar() or 0
    result = await db.execute(
        base_q.order_by(ColorPalette.updated_at.desc()).limit(limit).offset(offset)
    )
    rows = result.scalars().all()
    return PaletteListResponse(palettes=[_to_response(p) for p in rows], count=total)


@router.post("", response_model=PaletteResponse, status_code=status.HTTP_201_CREATED)
async def create_palette(
    body: PaletteCreateRequest,
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
) -> PaletteResponse:
    user_id = _get_user_uuid(payload)
    row = ColorPalette(
        user_id=user_id,
        name=body.name.strip(),
        description=body.description,
        colors=[c.model_dump() for c in body.colors],
        tags=[t.strip() for t in body.tags if t.strip()],
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return _to_response(row)


@router.put("/{palette_id}", response_model=PaletteResponse)
async def update_palette(
    palette_id: UUID,
    body: PaletteUpdateRequest,
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
) -> PaletteResponse:
    user_id = _get_user_uuid(payload)
    result = await db.execute(
        select(ColorPalette).where(
            ColorPalette.id == palette_id,
            ColorPalette.user_id == user_id,
            ColorPalette.is_deleted == False,  # noqa: E712
        )
    )
    row = result.scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Palette not found")

    data = body.model_dump(exclude_unset=True)
    if "name" in data and data["name"] is not None:
        row.name = str(data["name"]).strip()
    if "description" in data:
        row.description = data["description"]
    if "colors" in data and data["colors"] is not None:
        row.colors = data["colors"]
    if "tags" in data and data["tags"] is not None:
        row.tags = [t.strip() for t in data["tags"] if t.strip()]

    await db.commit()
    await db.refresh(row)
    return _to_response(row)


@router.delete("/{palette_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_palette(
    palette_id: UUID,
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
) -> None:
    user_id = _get_user_uuid(payload)
    result = await db.execute(
        select(ColorPalette).where(
            ColorPalette.id == palette_id,
            ColorPalette.user_id == user_id,
            ColorPalette.is_deleted == False,  # noqa: E712
        )
    )
    row = result.scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Palette not found")
    row.soft_delete()
    await db.commit()
