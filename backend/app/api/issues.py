"""Bugs (Issues) CRUD and workflow endpoints."""

import logging
import shlex
from uuid import UUID

from arq import create_pool
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.context_deps import get_current_user_payload, get_db_session, validate_project_access
from app.auth import get_user_id
from app.models.issue import Issue
from app.models.note import Note
from app.models.note_category import NoteCategory
from app.schemas.issue import (
    IssueCreateRequest,
    IssueListResponse,
    IssueResponse,
    IssueUpdateRequest,
    StartFixResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/issues", tags=["issues"])
project_issues_router = APIRouter(prefix="/projects", tags=["issues"])


# ---- Helpers ----

async def _enqueue_coderabbit_poll(request: Request, issue_id: str, defer_by: int = 60) -> None:
    """Enqueue the CodeRabbit poll ARQ task."""
    pool = None
    try:
        from app.worker import get_redis_settings
        pool = await create_pool(get_redis_settings())
        await pool.enqueue_job(
            "poll_coderabbit_review",
            issue_id,
            _defer_by=defer_by,
            _job_id=f"coderabbit-{issue_id}-0",
        )
        logger.info("Enqueued coderabbit poll for issue %s (defer %ds)", issue_id, defer_by)
    except Exception as e:
        logger.warning("Failed to enqueue coderabbit poll: %s", e)
    finally:
        if pool:
            await pool.aclose()


def _issue_to_response(i: Issue) -> IssueResponse:
    return IssueResponse(
        id=str(i.id),
        project_id=str(i.project_id) if i.project_id else None,
        project_name=i.project.name if i.project else None,
        is_app_issue=i.is_app_issue,
        note_id=str(i.note_id) if i.note_id else None,
        title=i.title,
        description=i.description,
        severity=i.severity,
        status=i.status,
        reproduction_steps=i.reproduction_steps,
        fix_branch=i.fix_branch,
        fix_pr_url=i.fix_pr_url,
        coderabbit_review_url=i.coderabbit_review_url,
        created_at=i.created_at.isoformat() if i.created_at else None,
        updated_at=i.updated_at.isoformat() if i.updated_at else None,
    )


# ---- CRUD ----

@router.get("", response_model=IssueListResponse)
async def list_issues(
    project_id: UUID | None = Query(default=None),
    is_app_issue: bool | None = Query(default=None),
    issue_status: str | None = Query(default=None, alias="status"),
    severity: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
) -> IssueListResponse:
    user_id = get_user_id(payload)
    base_q = select(Issue).where(
        Issue.user_id == user_id,
        Issue.is_deleted == False,  # noqa: E712
    )
    if project_id is not None:
        base_q = base_q.where(Issue.project_id == project_id)
    if is_app_issue is not None:
        base_q = base_q.where(Issue.is_app_issue == is_app_issue)
    if issue_status is not None:
        base_q = base_q.where(Issue.status == issue_status)
    if severity is not None:
        base_q = base_q.where(Issue.severity == severity)

    count_result = await db.execute(select(func.count()).select_from(base_q.subquery()))
    total = count_result.scalar() or 0
    result = await db.execute(
        base_q.order_by(Issue.created_at.desc()).limit(limit).offset(offset)
    )
    rows = result.scalars().all()
    return IssueListResponse(issues=[_issue_to_response(i) for i in rows], count=total)


# ---- Export ----

@router.get("/export")
async def export_bugs(
    project_id: UUID | None = Query(default=None),
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    """Export open/in-progress bugs as markdown for pasting into Claude Code."""
    user_id = get_user_id(payload)
    base_q = select(Issue).where(
        Issue.user_id == user_id,
        Issue.is_deleted == False,  # noqa: E712
        Issue.status.in_(["open", "in_progress"]),
    )
    if project_id is not None:
        base_q = base_q.where(Issue.project_id == project_id)

    result = await db.execute(base_q.order_by(Issue.created_at.asc()))
    bugs = result.scalars().all()

    if not bugs:
        return {"markdown": "# Bugs to Fix\n\nNo open bugs.\n", "count": 0}

    def _render_bug(idx: int, bug: Issue) -> list[str]:
        title = bug.title or "Untitled"
        severity = bug.severity or "medium"
        created = bug.created_at.strftime("%Y-%m-%d") if bug.created_at else "unknown"
        chunk = [f"## {idx}. [{severity.upper()}] {title}"]
        chunk.append(f"**Created:** {created}  **Status:** {bug.status}")
        if bug.fix_branch:
            chunk.append(f"**Branch:** `{bug.fix_branch}`")
        if bug.description:
            chunk.append(bug.description)
        if bug.reproduction_steps:
            chunk.append(f"\n**Reproduction steps:**\n{bug.reproduction_steps}")
        chunk.append("")
        return chunk

    app_bugs = [b for b in bugs if b.is_app_issue]
    project_bugs = [b for b in bugs if not b.is_app_issue]

    lines = [
        "# Bugs to Fix\n",
        f"{len(bugs)} bug(s) tracked. Fix each one.",
        "Codebase root: `/app`\n",
    ]

    # App-level issues first (skip section if filtering by project_id)
    if app_bugs and project_id is None:
        lines.append("# App Issues\n")
        for i, bug in enumerate(app_bugs, 1):
            lines.extend(_render_bug(i, bug))

    # Per-project issues
    if project_bugs:
        if app_bugs and project_id is None:
            lines.append("# Project Bugs\n")
        for i, bug in enumerate(project_bugs, 1):
            lines.extend(_render_bug(i, bug))

    return {"markdown": "\n".join(lines), "count": len(bugs)}


@router.post("", response_model=IssueResponse, status_code=status.HTTP_201_CREATED)
async def create_issue(
    body: IssueCreateRequest,
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
) -> IssueResponse:
    user_id = get_user_id(payload)
    if body.project_id:
        await validate_project_access(body.project_id, user_id, db)
    row = Issue(
        user_id=user_id,
        project_id=body.project_id,
        note_id=body.note_id if body.note_id else None,
        title=body.title.strip(),
        description=body.description,
        severity=body.severity,
        reproduction_steps=body.reproduction_steps,
        is_app_issue=body.is_app_issue,
    )
    db.add(row)
    await db.commit()
    # Re-fetch with relationships eagerly loaded (selectin on project)
    result = await db.execute(
        select(Issue).where(Issue.id == row.id)
    )
    row = result.scalar_one()
    return _issue_to_response(row)


@router.get("/{issue_id}", response_model=IssueResponse)
async def get_issue(
    issue_id: UUID,
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
) -> IssueResponse:
    user_id = get_user_id(payload)
    result = await db.execute(
        select(Issue).where(
            Issue.id == issue_id,
            Issue.user_id == user_id,
            Issue.is_deleted == False,  # noqa: E712
        )
    )
    row = result.scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Issue not found")
    return _issue_to_response(row)


@router.put("/{issue_id}", response_model=IssueResponse)
async def update_issue(
    issue_id: UUID,
    body: IssueUpdateRequest,
    request: Request,
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
) -> IssueResponse:
    user_id = get_user_id(payload)
    result = await db.execute(
        select(Issue).where(
            Issue.id == issue_id,
            Issue.user_id == user_id,
            Issue.is_deleted == False,  # noqa: E712
        )
    )
    row = result.scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Issue not found")

    data = body.model_dump(exclude_unset=True)
    had_pr_url_before = bool(row.fix_pr_url)
    for field in (
        "title", "description", "severity", "status",
        "reproduction_steps", "fix_branch", "fix_pr_url", "coderabbit_review_url",
        "is_app_issue",
    ):
        if field in data:
            setattr(row, field, data[field])

    await db.commit()
    await db.refresh(row)

    # If fix_pr_url was just set, enqueue CodeRabbit poll with short delay
    if not had_pr_url_before and row.fix_pr_url:
        await _enqueue_coderabbit_poll(request, str(row.id), defer_by=10)

    return _issue_to_response(row)


@router.delete("/{issue_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_issue(
    issue_id: UUID,
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
) -> None:
    user_id = get_user_id(payload)
    result = await db.execute(
        select(Issue).where(
            Issue.id == issue_id,
            Issue.user_id == user_id,
            Issue.is_deleted == False,  # noqa: E712
        )
    )
    row = result.scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Issue not found")
    row.soft_delete()
    await db.commit()


# ---- Workflow ----

@router.post("/{issue_id}/start-fix", response_model=StartFixResponse)
async def start_fix(
    issue_id: UUID,
    request: Request,
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
) -> StartFixResponse:
    user_id = get_user_id(payload)
    result = await db.execute(
        select(Issue).where(
            Issue.id == issue_id,
            Issue.user_id == user_id,
            Issue.is_deleted == False,  # noqa: E712
        )
    )
    issue = result.scalar_one_or_none()
    if issue is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Issue not found")

    branch_name = f"fix/issue-{str(issue.id)[:8]}"

    # Try to create git branch via sandbox (skip for app issues with no project)
    if issue.project_id is not None:
        kernel = getattr(request.app.state, "kernel", None)
        if kernel:
            sandbox_mgr = kernel.get_service("sandbox_manager")
            if sandbox_mgr:
                try:
                    container_id = await sandbox_mgr.get_or_create_container(
                        issue.project_id
                    )
                    if container_id:
                        await sandbox_mgr.exec_in_container(
                            container_id,
                            f"git checkout -b {shlex.quote(branch_name)}",
                        )
                except Exception as e:
                    logger.warning("Failed to create fix branch in sandbox: %s", e)

    issue.status = "in_progress"
    issue.fix_branch = branch_name
    await db.commit()
    await db.refresh(issue)

    # Enqueue CodeRabbit poll (60s delay to allow PR creation)
    await _enqueue_coderabbit_poll(request, str(issue.id), defer_by=60)

    return StartFixResponse(
        issue_id=str(issue.id),
        branch=branch_name,
        message=f"Branch '{branch_name}' created. Issue status set to in_progress.",
    )


@router.get("/{issue_id}/review-status")
async def review_status(
    issue_id: UUID,
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    user_id = get_user_id(payload)
    result = await db.execute(
        select(Issue).where(
            Issue.id == issue_id,
            Issue.user_id == user_id,
            Issue.is_deleted == False,  # noqa: E712
        )
    )
    issue = result.scalar_one_or_none()
    if issue is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Issue not found")

    return {
        "issue_id": str(issue.id),
        "status": issue.status,
        "fix_pr_url": issue.fix_pr_url,
        "coderabbit_review_url": issue.coderabbit_review_url,
        "has_pr": bool(issue.fix_pr_url),
    }


# ---- Project Issues Scan ----

@project_issues_router.get("/{project_id}/issues/scan", response_model=IssueListResponse)
async def scan_project_issues(
    project_id: UUID,
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
) -> IssueListResponse:
    """List open issues for a project (used by workspace auto-scan)."""
    user_id = get_user_id(payload)
    base_q = select(Issue).where(
        Issue.user_id == user_id,
        Issue.project_id == project_id,
        Issue.is_deleted == False,  # noqa: E712
        Issue.status.in_(["open", "in_progress"]),
    )
    count_result = await db.execute(select(func.count()).select_from(base_q.subquery()))
    total = count_result.scalar() or 0
    result = await db.execute(base_q.order_by(Issue.created_at.desc()))
    rows = result.scalars().all()
    return IssueListResponse(issues=[_issue_to_response(i) for i in rows], count=total)
