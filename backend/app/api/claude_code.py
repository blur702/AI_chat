"""API routes for Claude Code remote chat."""

import logging
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.context_deps import get_current_user_payload, get_db_session
from app.auth import get_user_id
from app.models.claude_code_message import ClaudeCodeMessage
from app.schemas.claude_code import (
    ClaudeCodeMessageCreate,
    ClaudeCodeMessageList,
    ClaudeCodeMessageResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/claude-code", tags=["claude-code"])


def _to_response(m: ClaudeCodeMessage) -> ClaudeCodeMessageResponse:
    return ClaudeCodeMessageResponse(
        id=str(m.id),
        role=m.role,
        content=m.content,
        page_url=m.page_url,
        console_logs=m.console_logs,
        created_at=m.created_at.isoformat() if m.created_at else None,
    )


@router.get("", response_model=ClaudeCodeMessageList)
async def list_messages(
    limit: int = Query(default=50, ge=1, le=200),
    since_id: UUID | None = Query(default=None),
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
) -> ClaudeCodeMessageList:
    """List messages, optionally only newer than since_id."""
    user_id = get_user_id(payload)

    q = select(ClaudeCodeMessage).where(ClaudeCodeMessage.user_id == user_id)

    if since_id:
        # Get the created_at of the reference message
        ref = await db.execute(select(ClaudeCodeMessage.created_at).where(ClaudeCodeMessage.id == since_id))
        ref_ts = ref.scalar_one_or_none()
        if ref_ts:
            q = q.where(
                (ClaudeCodeMessage.created_at > ref_ts)
                | ((ClaudeCodeMessage.created_at == ref_ts) & (ClaudeCodeMessage.id > since_id))
            )

    q = q.order_by(ClaudeCodeMessage.created_at.asc()).limit(limit)

    result = await db.execute(q)
    rows = result.scalars().all()

    return ClaudeCodeMessageList(
        messages=[_to_response(m) for m in rows],
        count=len(rows),
    )


@router.post("", response_model=ClaudeCodeMessageResponse, status_code=status.HTTP_201_CREATED)
async def create_message(
    body: ClaudeCodeMessageCreate,
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
) -> ClaudeCodeMessageResponse:
    """Send a message (from website user or Claude Code assistant)."""
    user_id = get_user_id(payload)

    row = ClaudeCodeMessage(
        user_id=user_id,
        role=body.role,
        content=body.content,
        page_url=body.page_url,
        console_logs=body.console_logs,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)

    logger.info("Claude Code message created: role=%s, user=%s", body.role, user_id)
    return _to_response(row)


@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
async def clear_messages(
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
) -> None:
    """Clear all messages for the current user."""
    user_id = get_user_id(payload)
    from sqlalchemy import delete

    await db.execute(delete(ClaudeCodeMessage).where(ClaudeCodeMessage.user_id == user_id))
    await db.commit()


@router.get("/pending", response_model=ClaudeCodeMessageList)
async def get_pending_user_messages(
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
) -> ClaudeCodeMessageList:
    """Get recent user messages (for Claude Code to poll)."""
    user_id = get_user_id(payload)

    q = (
        select(ClaudeCodeMessage)
        .where(
            ClaudeCodeMessage.user_id == user_id,
            ClaudeCodeMessage.role == "user",
        )
        .order_by(ClaudeCodeMessage.created_at.asc())
        .limit(50)
    )

    result = await db.execute(q)
    rows = result.scalars().all()

    return ClaudeCodeMessageList(
        messages=[_to_response(m) for m in rows],
        count=len(rows),
    )
