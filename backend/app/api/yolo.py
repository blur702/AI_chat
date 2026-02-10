"""
YOLO edit tracking API endpoints.

Provides REST endpoints for:
- Recording file edits with undo data
- Listing edit history per project
- Undoing file modifications
"""

import logging
import os
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user_payload
from app.api.context_deps import validate_project_access
from app.database import get_db_session
from app.models.yolo_edit import YoloEdit
from app.schemas.yolo import (
    YoloEditCreateRequest,
    YoloEditListResponse,
    YoloEditResponse,
    YoloEditUndoResponse,
)
from app.services.sandbox_manager import SandboxManager

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/yolo", tags=["yolo"])


# -------------------------------------------------------------------------
# Helpers
# -------------------------------------------------------------------------


def _edit_to_response(edit: YoloEdit, include_undo_data: bool = False) -> YoloEditResponse:
    """Convert a YoloEdit model to a response schema."""
    return YoloEditResponse(
        id=str(edit.id),
        project_id=str(edit.project_id),
        chat_id=str(edit.chat_id) if edit.chat_id else None,
        files_modified=edit.files_modified or [],
        undo_performed=edit.undo_performed,
        undo_data=edit.undo_data if include_undo_data else None,
        created_at=str(edit.created_at) if edit.created_at else None,
        updated_at=str(edit.updated_at) if edit.updated_at else None,
    )


async def _get_edit_with_access(
    edit_id: UUID,
    user_id: str,
    db: AsyncSession,
) -> YoloEdit:
    """Load a YOLO edit and validate user has project access."""
    result = await db.execute(
        select(YoloEdit).where(YoloEdit.id == edit_id)
    )
    edit = result.scalar_one_or_none()
    if edit is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Edit '{edit_id}' not found",
        )
    await validate_project_access(edit.project_id, user_id, db)
    return edit


def _get_sandbox_manager(request: Request) -> SandboxManager:
    """Dependency to get SandboxManager from kernel."""
    kernel = getattr(request.app.state, "kernel", None)
    if kernel is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Kernel not initialized",
        )
    sm = kernel.get_service("sandbox_manager")
    if sm is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="SandboxManager service not available",
        )
    return sm


def _sanitize_undo_path(path: str) -> str:
    """Sanitize a file path from undo_data to prevent directory traversal.

    Raises HTTPException if the path is unsafe.
    Returns the cleaned path.
    """
    clean = os.path.normpath(path).replace("\\", "/")
    clean = clean.lstrip("/")
    if ".." in clean.split("/"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Path traversal not allowed in undo path: {path}",
        )
    if not clean or clean == ".":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid undo path: {path}",
        )
    if "\x00" in clean or any(ord(c) < 32 for c in clean):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Undo path contains invalid characters: {path}",
        )
    return clean


# -------------------------------------------------------------------------
# Create Edit
# -------------------------------------------------------------------------


@router.post(
    "/edits",
    response_model=YoloEditResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_edit(
    body: YoloEditCreateRequest,
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
) -> YoloEditResponse:
    """Record a new file edit for a project."""
    user_id = payload.get("user_id") or payload.get("sub", "")
    project_id = UUID(body.project_id)
    await validate_project_access(project_id, user_id, db)

    edit = YoloEdit(
        project_id=project_id,
        chat_id=UUID(body.chat_id) if body.chat_id else None,
        files_modified=body.files_modified,
        undo_data=body.undo_data,
        undo_performed=False,
    )
    db.add(edit)
    await db.commit()
    await db.refresh(edit)

    return _edit_to_response(edit)


# -------------------------------------------------------------------------
# List Edits
# -------------------------------------------------------------------------


@router.get(
    "/edits/{project_id}",
    response_model=YoloEditListResponse,
)
async def list_edits(
    project_id: UUID,
    limit: int = 50,
    offset: int = 0,
    undo_performed: bool | None = None,
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
) -> YoloEditListResponse:
    """List edit history for a project."""
    user_id = payload.get("user_id") or payload.get("sub", "")
    await validate_project_access(project_id, user_id, db)

    base = select(YoloEdit).where(YoloEdit.project_id == project_id)

    if undo_performed is not None:
        base = base.where(YoloEdit.undo_performed == undo_performed)

    # Total count (independent of pagination)
    count_result = await db.execute(
        select(func.count()).select_from(base.subquery())
    )
    total = count_result.scalar() or 0

    stmt = base.order_by(YoloEdit.created_at.desc()).offset(offset).limit(limit)

    result = await db.execute(stmt)
    edits = result.scalars().all()

    return YoloEditListResponse(
        edits=[_edit_to_response(e) for e in edits],
        count=total,
    )


# -------------------------------------------------------------------------
# Get Edit Detail
# -------------------------------------------------------------------------


@router.get(
    "/edits/{edit_id}/detail",
    response_model=YoloEditResponse,
)
async def get_edit_detail(
    edit_id: UUID,
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
) -> YoloEditResponse:
    """Get details for a single edit including undo data."""
    user_id = payload.get("user_id") or payload.get("sub", "")
    edit = await _get_edit_with_access(edit_id, user_id, db)
    return _edit_to_response(edit, include_undo_data=True)


# -------------------------------------------------------------------------
# Undo Edit
# -------------------------------------------------------------------------


@router.post(
    "/edits/{edit_id}/undo",
    response_model=YoloEditUndoResponse,
)
async def undo_edit(
    edit_id: UUID,
    request: Request,
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
) -> YoloEditUndoResponse:
    """Revert file changes by restoring previous content."""
    user_id = payload.get("user_id") or payload.get("sub", "")
    edit = await _get_edit_with_access(edit_id, user_id, db)

    if edit.undo_performed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Edit has already been undone",
        )

    if not edit.undo_data or "files" not in edit.undo_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No undo data available for this edit",
        )

    # Sanitize all paths before proceeding
    sanitized_files: list[tuple[str, str]] = []  # (sanitized_path, old_content)
    for raw_path, file_data in edit.undo_data["files"].items():
        clean_path = _sanitize_undo_path(raw_path)
        old_content = file_data.get("old_content")
        if old_content is None:
            continue
        sanitized_files.append((clean_path, old_content))

    if not sanitized_files:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No restorable files found in undo data (all missing old_content)",
        )

    sm = _get_sandbox_manager(request)
    container_id = await sm.get_or_create_container(edit.project_id)

    files_restored: list[str] = []
    files_failed: list[str] = []
    for clean_path, old_content in sanitized_files:
        try:
            abs_path = f"/workspace/{clean_path}"
            await sm.write_file(container_id, abs_path, old_content)
            files_restored.append(clean_path)
        except Exception as exc:
            logger.warning("Failed to restore file %s: %s", clean_path, exc)
            files_failed.append(clean_path)

    if not files_restored:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to restore any files: {', '.join(files_failed)}",
        )

    if files_failed:
        # Partial success: mark undone but surface failures in response
        edit.undo_performed = True
        await db.commit()
        return YoloEditUndoResponse(
            id=str(edit.id),
            status=f"partial (failed: {', '.join(files_failed)})",
            files_restored=files_restored,
        )

    edit.undo_performed = True
    await db.commit()

    return YoloEditUndoResponse(
        id=str(edit.id),
        status="restored",
        files_restored=files_restored,
    )
