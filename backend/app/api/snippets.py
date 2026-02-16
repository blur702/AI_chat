"""Context snippet library CRUD endpoints."""

import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.context_deps import (
    get_current_user_payload,
    get_db_session,
)
from app.models.context_snippet import ContextSnippet
from app.schemas.context import (
    ContextSnippetCreateRequest,
    ContextSnippetListResponse,
    ContextSnippetResponse,
    ContextSnippetUpdateRequest,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/context/snippets", tags=["context"])

# Maximum snippets a single user may own
MAX_SNIPPETS_PER_USER = 500


def _get_user_id(payload: dict) -> UUID:
    """Extract and validate user_id from an auth payload dict."""
    raw = payload.get("user_id")
    if not raw:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing user_id in token",
        )
    try:
        return UUID(str(raw))
    except (TypeError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid user_id in token",
        ) from None


def _snippet_to_response(s: ContextSnippet) -> ContextSnippetResponse:
    return ContextSnippetResponse(
        id=str(s.id),
        name=s.name,
        content=s.content,
        description=s.description,
        tags=s.tags or [],
        created_at=s.created_at.isoformat() if s.created_at else None,
        updated_at=s.updated_at.isoformat() if s.updated_at else None,
    )


@router.get("", response_model=ContextSnippetListResponse)
async def list_snippets(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
) -> ContextSnippetListResponse:
    """List non-deleted context snippets for the current user (paginated)."""
    user_id = _get_user_id(payload)

    base_filter = select(ContextSnippet).where(
        ContextSnippet.user_id == user_id,
        ContextSnippet.is_deleted == False,  # noqa: E712
    )

    # Total count for pagination metadata
    count_result = await db.execute(
        select(func.count()).select_from(base_filter.subquery())
    )
    total_count = count_result.scalar() or 0

    result = await db.execute(
        base_filter
        .order_by(ContextSnippet.updated_at.desc())
        .limit(limit)
        .offset(offset)
    )
    snippets = result.scalars().all()

    return ContextSnippetListResponse(
        snippets=[_snippet_to_response(s) for s in snippets],
        count=total_count,
    )


@router.post(
    "",
    response_model=ContextSnippetResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_snippet(
    body: ContextSnippetCreateRequest,
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
) -> ContextSnippetResponse:
    """Create a new context snippet."""
    user_id = _get_user_id(payload)

    # Enforce per-user snippet limit
    count_result = await db.execute(
        select(func.count()).select_from(
            select(ContextSnippet.id).where(
                ContextSnippet.user_id == user_id,
                ContextSnippet.is_deleted == False,  # noqa: E712
            ).subquery()
        )
    )
    current_count = count_result.scalar() or 0
    if current_count >= MAX_SNIPPETS_PER_USER:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Snippet limit reached ({MAX_SNIPPETS_PER_USER}). Delete unused snippets first.",
        )

    snippet = ContextSnippet(
        user_id=user_id,
        name=body.name,
        content=body.content,
        description=body.description,
        tags=body.tags or [],
    )
    db.add(snippet)
    await db.commit()
    await db.refresh(snippet)

    return _snippet_to_response(snippet)


@router.get("/{snippet_id}", response_model=ContextSnippetResponse)
async def get_snippet(
    snippet_id: UUID,
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
) -> ContextSnippetResponse:
    """Get a single context snippet by ID."""
    user_id = _get_user_id(payload)

    result = await db.execute(
        select(ContextSnippet).where(
            ContextSnippet.id == snippet_id,
            ContextSnippet.user_id == user_id,
            ContextSnippet.is_deleted == False,  # noqa: E712
        )
    )
    snippet = result.scalar_one_or_none()
    if snippet is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Context snippet not found",
        )

    return _snippet_to_response(snippet)


@router.put("/{snippet_id}", response_model=ContextSnippetResponse)
async def update_snippet(
    snippet_id: UUID,
    body: ContextSnippetUpdateRequest,
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
) -> ContextSnippetResponse:
    """Update a context snippet."""
    user_id = _get_user_id(payload)

    result = await db.execute(
        select(ContextSnippet).where(
            ContextSnippet.id == snippet_id,
            ContextSnippet.user_id == user_id,
            ContextSnippet.is_deleted == False,  # noqa: E712
        )
    )
    snippet = result.scalar_one_or_none()
    if snippet is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Context snippet not found",
        )

    update_data = body.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(snippet, field, value)

    await db.commit()
    await db.refresh(snippet)

    return _snippet_to_response(snippet)


@router.delete("/{snippet_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_snippet(
    snippet_id: UUID,
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
) -> None:
    """Soft-delete a context snippet."""
    user_id = _get_user_id(payload)

    result = await db.execute(
        select(ContextSnippet).where(
            ContextSnippet.id == snippet_id,
            ContextSnippet.user_id == user_id,
            ContextSnippet.is_deleted == False,  # noqa: E712
        )
    )
    snippet = result.scalar_one_or_none()
    if snippet is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Context snippet not found",
        )

    snippet.soft_delete()
    await db.commit()
