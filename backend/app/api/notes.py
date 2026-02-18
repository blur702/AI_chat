"""Notes and NoteCategory CRUD endpoints."""

import logging
import re
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.context_deps import get_current_user_payload, get_db_session
from app.auth import get_user_id
from app.models.issue import Issue
from app.models.note import Note
from app.models.note_category import NoteCategory
from app.schemas.issue import IssueResponse
from app.schemas.note import (
    NoteCategoryCreateRequest,
    NoteCategoryListResponse,
    NoteCategoryResponse,
    NoteCategoryUpdateRequest,
    NoteCreateRequest,
    NoteListResponse,
    NoteResponse,
    NoteUpdateRequest,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/notes", tags=["notes"])
categories_router = APIRouter(prefix="/note-categories", tags=["notes"])
admin_notes_router = APIRouter(prefix="/admin/notes", tags=["admin"])


# ---- Helpers ----

def _slugify(name: str) -> str:
    slug = name.lower().strip()
    slug = re.sub(r"[^a-z0-9]+", "-", slug)
    return slug.strip("-")


def _note_to_response(n: Note) -> NoteResponse:
    return NoteResponse(
        id=str(n.id),
        title=n.title,
        body=n.body or "",
        status=n.status,
        pinned=n.pinned,
        project_id=str(n.project_id) if n.project_id else None,
        project_name=n.project.name if n.project else None,
        category_id=str(n.category_id) if n.category_id else None,
        category_name=n.category.name if n.category else None,
        category_color=n.category.color if n.category else None,
        issue_id=str(n.issue_id) if n.issue_id else None,
        completed_at=n.completed_at.isoformat() if n.completed_at else None,
        created_at=n.created_at.isoformat() if n.created_at else None,
        updated_at=n.updated_at.isoformat() if n.updated_at else None,
    )


def _category_to_response(c: NoteCategory) -> NoteCategoryResponse:
    return NoteCategoryResponse(
        id=str(c.id),
        name=c.name,
        slug=c.slug,
        color=c.color,
        is_system=c.is_system,
        sort_order=c.sort_order,
        created_at=c.created_at.isoformat() if c.created_at else None,
        updated_at=c.updated_at.isoformat() if c.updated_at else None,
    )


async def _ensure_default_categories(user_id: UUID, db: AsyncSession) -> None:
    """Create built-in 'Errors' category if the user has no categories yet."""
    result = await db.execute(
        select(func.count()).select_from(
            select(NoteCategory).where(
                NoteCategory.user_id == user_id,
                NoteCategory.is_deleted == False,  # noqa: E712
            ).subquery()
        )
    )
    if (result.scalar() or 0) == 0:
        db.add(NoteCategory(
            user_id=user_id,
            name="Errors",
            slug="errors",
            color="#ef4444",
            is_system=True,
            sort_order=0,
        ))
        await db.flush()


# ---- Note Category Endpoints ----

@categories_router.get("", response_model=NoteCategoryListResponse)
async def list_categories(
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
) -> NoteCategoryListResponse:
    user_id = get_user_id(payload)
    await _ensure_default_categories(user_id, db)
    base_q = select(NoteCategory).where(
        NoteCategory.user_id == user_id,
        NoteCategory.is_deleted == False,  # noqa: E712
    )
    count_result = await db.execute(select(func.count()).select_from(base_q.subquery()))
    total = count_result.scalar() or 0
    result = await db.execute(base_q.order_by(NoteCategory.sort_order, NoteCategory.name))
    rows = result.scalars().all()
    return NoteCategoryListResponse(categories=[_category_to_response(c) for c in rows], count=total)


@categories_router.post("", response_model=NoteCategoryResponse, status_code=status.HTTP_201_CREATED)
async def create_category(
    body: NoteCategoryCreateRequest,
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
) -> NoteCategoryResponse:
    user_id = get_user_id(payload)
    row = NoteCategory(
        user_id=user_id,
        name=body.name.strip(),
        slug=_slugify(body.name),
        color=body.color,
        sort_order=body.sort_order,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return _category_to_response(row)


@categories_router.put("/{category_id}", response_model=NoteCategoryResponse)
async def update_category(
    category_id: UUID,
    body: NoteCategoryUpdateRequest,
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
) -> NoteCategoryResponse:
    user_id = get_user_id(payload)
    result = await db.execute(
        select(NoteCategory).where(
            NoteCategory.id == category_id,
            NoteCategory.user_id == user_id,
            NoteCategory.is_deleted == False,  # noqa: E712
        )
    )
    row = result.scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found")
    if row.is_system:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot modify system category")
    data = body.model_dump(exclude_unset=True)
    if "name" in data and data["name"] is not None:
        row.name = str(data["name"]).strip()
        row.slug = _slugify(row.name)
    if "color" in data:
        row.color = data["color"]
    if "sort_order" in data and data["sort_order"] is not None:
        row.sort_order = data["sort_order"]
    await db.commit()
    await db.refresh(row)
    return _category_to_response(row)


@categories_router.delete("/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_category(
    category_id: UUID,
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
) -> None:
    user_id = get_user_id(payload)
    result = await db.execute(
        select(NoteCategory).where(
            NoteCategory.id == category_id,
            NoteCategory.user_id == user_id,
            NoteCategory.is_deleted == False,  # noqa: E712
        )
    )
    row = result.scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found")
    if row.is_system:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot delete system category")
    row.soft_delete()
    await db.commit()


# ---- Note Endpoints ----

@router.get("", response_model=NoteListResponse)
async def list_notes(
    project_id: str | None = Query(default=None),
    category_id: str | None = Query(default=None),
    note_status: str | None = Query(default=None, alias="status"),
    pinned: bool | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
) -> NoteListResponse:
    user_id = get_user_id(payload)
    base_q = select(Note).where(
        Note.user_id == user_id,
        Note.is_deleted == False,  # noqa: E712
    )
    if project_id is not None:
        base_q = base_q.where(Note.project_id == project_id)
    if category_id is not None:
        base_q = base_q.where(Note.category_id == category_id)
    if note_status is not None:
        base_q = base_q.where(Note.status == note_status)
    if pinned is not None:
        base_q = base_q.where(Note.pinned == pinned)

    count_result = await db.execute(select(func.count()).select_from(base_q.subquery()))
    total = count_result.scalar() or 0
    result = await db.execute(
        base_q.order_by(Note.pinned.desc(), Note.updated_at.desc()).limit(limit).offset(offset)
    )
    rows = result.scalars().all()
    return NoteListResponse(notes=[_note_to_response(n) for n in rows], count=total)


@router.post("", response_model=NoteResponse, status_code=status.HTTP_201_CREATED)
async def create_note(
    body: NoteCreateRequest,
    request: Request,
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
) -> NoteResponse:
    user_id = get_user_id(payload)

    title = body.title
    if body.generate_title and not title and body.body.strip():
        title = await _generate_ai_title(request, body.body)

    if not title:
        title = body.body[:60].strip() if body.body else None

    row = Note(
        user_id=user_id,
        project_id=body.project_id if body.project_id else None,
        category_id=body.category_id if body.category_id else None,
        title=title,
        body=body.body,
        pinned=body.pinned,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return _note_to_response(row)


@router.get("/{note_id}", response_model=NoteResponse)
async def get_note(
    note_id: UUID,
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
) -> NoteResponse:
    user_id = get_user_id(payload)
    result = await db.execute(
        select(Note).where(
            Note.id == note_id,
            Note.user_id == user_id,
            Note.is_deleted == False,  # noqa: E712
        )
    )
    row = result.scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Note not found")
    return _note_to_response(row)


@router.put("/{note_id}", response_model=NoteResponse)
async def update_note(
    note_id: UUID,
    body: NoteUpdateRequest,
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
) -> NoteResponse:
    user_id = get_user_id(payload)
    result = await db.execute(
        select(Note).where(
            Note.id == note_id,
            Note.user_id == user_id,
            Note.is_deleted == False,  # noqa: E712
        )
    )
    row = result.scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Note not found")

    data = body.model_dump(exclude_unset=True)
    if "title" in data:
        row.title = data["title"]
    if "body" in data:
        row.body = data["body"]
    if "project_id" in data:
        row.project_id = data["project_id"] if data["project_id"] else None
    if "category_id" in data:
        row.category_id = data["category_id"] if data["category_id"] else None
    if "status" in data and data["status"] in ("active", "completed", "archived"):
        row.status = data["status"]
    if "pinned" in data and data["pinned"] is not None:
        row.pinned = data["pinned"]

    await db.commit()
    await db.refresh(row)
    return _note_to_response(row)


@router.delete("/{note_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_note(
    note_id: UUID,
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
) -> None:
    user_id = get_user_id(payload)
    result = await db.execute(
        select(Note).where(
            Note.id == note_id,
            Note.user_id == user_id,
            Note.is_deleted == False,  # noqa: E712
        )
    )
    row = result.scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Note not found")
    row.soft_delete()
    await db.commit()


@router.post("/{note_id}/complete", response_model=NoteResponse)
async def complete_note(
    note_id: UUID,
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
) -> NoteResponse:
    user_id = get_user_id(payload)
    result = await db.execute(
        select(Note).where(
            Note.id == note_id,
            Note.user_id == user_id,
            Note.is_deleted == False,  # noqa: E712
        )
    )
    row = result.scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Note not found")
    row.mark_complete()
    await db.commit()
    await db.refresh(row)
    return _note_to_response(row)


@router.post("/{note_id}/archive", response_model=NoteResponse)
async def archive_note(
    note_id: UUID,
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
) -> NoteResponse:
    user_id = get_user_id(payload)
    result = await db.execute(
        select(Note).where(
            Note.id == note_id,
            Note.user_id == user_id,
            Note.is_deleted == False,  # noqa: E712
        )
    )
    row = result.scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Note not found")
    row.archive()
    await db.commit()
    await db.refresh(row)
    return _note_to_response(row)


# ---- Promote to Issue ----

@router.post("/{note_id}/promote-to-issue", response_model=IssueResponse)
async def promote_to_issue(
    note_id: UUID,
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
) -> IssueResponse:
    """Create an Issue from a note, linking them bidirectionally."""
    user_id = get_user_id(payload)
    result = await db.execute(
        select(Note).where(
            Note.id == note_id,
            Note.user_id == user_id,
            Note.is_deleted == False,  # noqa: E712
        )
    )
    note = result.scalar_one_or_none()
    if note is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Note not found")
    if not note.project_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Note must be assigned to a project to promote to issue",
        )
    if note.issue_id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Note is already linked to an issue",
        )

    # Auto-set Errors category if it exists
    errors_cat = await db.execute(
        select(NoteCategory).where(
            NoteCategory.user_id == user_id,
            NoteCategory.slug == "errors",
            NoteCategory.is_deleted == False,  # noqa: E712
        )
    )
    errors_category = errors_cat.scalar_one_or_none()
    if errors_category and not note.category_id:
        note.category_id = errors_category.id

    issue = Issue(
        user_id=user_id,
        project_id=note.project_id,
        note_id=note.id,
        title=note.title or note.body[:100].strip() or "Untitled Issue",
        description=note.body,
    )
    db.add(issue)
    await db.flush()

    note.issue_id = issue.id
    await db.commit()
    await db.refresh(issue)

    return IssueResponse(
        id=str(issue.id),
        project_id=str(issue.project_id),
        project_name=issue.project.name if issue.project else None,
        note_id=str(issue.note_id) if issue.note_id else None,
        title=issue.title,
        description=issue.description,
        severity=issue.severity,
        status=issue.status,
        reproduction_steps=issue.reproduction_steps,
        fix_branch=issue.fix_branch,
        fix_pr_url=issue.fix_pr_url,
        coderabbit_review_url=issue.coderabbit_review_url,
        created_at=issue.created_at.isoformat() if issue.created_at else None,
        updated_at=issue.updated_at.isoformat() if issue.updated_at else None,
    )


# ---- Admin Endpoint ----

@admin_notes_router.get("", response_model=NoteListResponse)
async def admin_list_notes(
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    note_status: str | None = Query(default=None, alias="status"),
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
) -> NoteListResponse:
    """Admin-only: list all notes across all users."""
    role = payload.get("role", "user")
    if role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")

    base_q = select(Note).where(Note.is_deleted == False)  # noqa: E712
    if note_status is not None:
        base_q = base_q.where(Note.status == note_status)

    count_result = await db.execute(select(func.count()).select_from(base_q.subquery()))
    total = count_result.scalar() or 0
    result = await db.execute(
        base_q.order_by(Note.updated_at.desc()).limit(limit).offset(offset)
    )
    rows = result.scalars().all()
    return NoteListResponse(notes=[_note_to_response(n) for n in rows], count=total)


# ---- AI Title Generation ----

async def _generate_ai_title(request: Request, body_text: str) -> str | None:
    """Use OllamaClient to generate a short title from note body."""
    try:
        kernel = getattr(request.app.state, "kernel", None)
        if kernel is None:
            return None
        ollama = kernel.get_service("ollama_client")
        if ollama is None:
            return None
        response = await ollama.chat_completion(
            messages=[
                {
                    "role": "system",
                    "content": "Generate a concise title (max 60 chars) for this note. Reply with ONLY the title, no quotes or punctuation wrapping.",
                },
                {"role": "user", "content": body_text[:500]},
            ],
            model=None,  # use default model
        )
        title = response.get("message", {}).get("content", "").strip()
        return title[:255] if title else None
    except Exception as e:
        logger.warning("AI title generation failed: %s", e)
        return None
