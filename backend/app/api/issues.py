"""Issues CRUD and workflow endpoints."""

import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.context_deps import get_current_user_payload, get_db_session
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

def _issue_to_response(i: Issue) -> IssueResponse:
    return IssueResponse(
        id=str(i.id),
        project_id=str(i.project_id),
        project_name=i.project.name if i.project else None,
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
    project_id: str | None = Query(default=None),
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


@router.post("", response_model=IssueResponse, status_code=status.HTTP_201_CREATED)
async def create_issue(
    body: IssueCreateRequest,
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
) -> IssueResponse:
    user_id = get_user_id(payload)
    row = Issue(
        user_id=user_id,
        project_id=body.project_id,
        note_id=body.note_id if body.note_id else None,
        title=body.title.strip(),
        description=body.description,
        severity=body.severity,
        reproduction_steps=body.reproduction_steps,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
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
    for field in (
        "title", "description", "severity", "status",
        "reproduction_steps", "fix_branch", "fix_pr_url", "coderabbit_review_url",
    ):
        if field in data:
            setattr(row, field, data[field])

    await db.commit()
    await db.refresh(row)
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

    # Try to create git branch via sandbox
    kernel = getattr(request.app.state, "kernel", None)
    if kernel:
        sandbox_mgr = kernel.get_service("sandbox_manager")
        if sandbox_mgr:
            try:
                container = await sandbox_mgr.get_or_create_container(
                    str(issue.project_id)
                )
                if container:
                    await sandbox_mgr.exec_in_container(
                        container.id,
                        f"git checkout -b {branch_name}",
                    )
            except Exception as e:
                logger.warning("Failed to create fix branch in sandbox: %s", e)

    issue.status = "in_progress"
    issue.fix_branch = branch_name
    await db.commit()
    await db.refresh(issue)

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
