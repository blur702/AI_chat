"""Project CRUD endpoints."""

import logging
import os
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.context_deps import (
    PROJECTS_ROOT,
    get_context_manager,
    get_current_user_payload,
    get_db_session,
    get_sandbox_manager,
    validate_project_access,
)
from app.kernel.context_manager import ContextManager
from app.models.project import Project
from app.models.system_prompt import SystemPrompt
from app.schemas.context import (
    ProjectCreateRequest,
    ProjectCreateResponse,
    ProjectListResponse,
    ProjectSummary,
    ProjectUpdateRequest,
    ProjectUpdateResponse,
)
from app.services.sandbox_manager import SandboxManager
from app.services.templates import TemplateRegistry

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/projects", tags=["projects"])

# Backward-compatible alias router under /context/projects
context_projects_router = APIRouter(prefix="/context", tags=["context"])


def _normalize_project_path(path: str) -> str:
    """Normalize and validate user-provided project paths."""
    norm = os.path.normpath(path).replace("\\", "/")
    if os.path.isabs(norm):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid project path: must be relative to project root",
        )

    segments = [seg for seg in norm.split("/") if seg and seg != "."]
    if ".." in segments or norm.startswith("../"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid project path: path traversal is not allowed",
        )

    resolved_path = os.path.realpath(os.path.abspath(os.path.join(PROJECTS_ROOT, norm)))
    try:
        common = os.path.commonpath([PROJECTS_ROOT, resolved_path])
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid project path",
        ) from exc

    if common != PROJECTS_ROOT:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid project path: outside allowed project root",
        )

    return norm


# -------------------------------------------------------------------------
# Shared handler functions
# -------------------------------------------------------------------------


async def _create_project_handler(
    body: ProjectCreateRequest,
    payload: dict,
    db: AsyncSession,
    sandbox_manager: Optional[SandboxManager] = None,
) -> ProjectCreateResponse:
    user_id = payload.get("user_id", "")
    try:
        user_uuid = UUID(user_id)
    except (ValueError, TypeError) as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid user_id in token",
        ) from exc

    normalized_path = _normalize_project_path(body.path)

    # Validate template_id against the template registry
    if body.template_id:
        registry = TemplateRegistry()
        if registry.get(body.template_id) is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Unknown template_id: '{body.template_id}'",
            )

    project = Project(
        user_id=user_uuid,
        name=body.name,
        path=normalized_path,
        type=body.type,
        template_id=body.template_id,
        settings=body.settings,
        custom_context=body.custom_context,
        important_files=body.important_files,
    )
    db.add(project)
    await db.commit()
    await db.refresh(project)

    # Provision a sandbox container with the selected template
    if body.template_id and sandbox_manager and sandbox_manager.is_running:
        try:
            await sandbox_manager.get_or_create_container(
                project.id, template_id=body.template_id
            )
            logger.info(
                "Provisioned sandbox with template '%s' for project %s",
                body.template_id, str(project.id)[:12],
            )
        except Exception:
            logger.exception(
                "Failed to provision sandbox for project %s with template '%s'",
                str(project.id)[:12], body.template_id,
            )

    return ProjectCreateResponse(
        id=str(project.id),
        name=project.name,
        path=project.path,
        type=project.type,
        template_id=project.template_id,
        created_at=project.created_at.isoformat() if project.created_at else None,
    )


async def _list_projects_handler(
    payload: dict,
    db: AsyncSession,
) -> ProjectListResponse:
    user_id = payload.get("user_id", "")
    try:
        user_uuid = UUID(user_id) if user_id else None
    except (ValueError, TypeError):
        return ProjectListResponse(projects=[], count=0)

    if user_uuid is None:
        return ProjectListResponse(projects=[], count=0)

    result = await db.execute(
        select(Project)
        .where(Project.user_id == user_uuid, Project.is_deleted == False)  # noqa: E712
        .order_by(Project.created_at.desc())
    )
    projects = result.scalars().all()

    summaries = [
        ProjectSummary(
            id=str(p.id),
            name=p.name,
            path=p.path,
            type=p.type,
            template_id=p.template_id,
            created_at=p.created_at.isoformat() if p.created_at else None,
            updated_at=p.updated_at.isoformat() if p.updated_at else None,
        )
        for p in projects
    ]

    return ProjectListResponse(projects=summaries, count=len(summaries))


async def _update_project_handler(
    project_id: UUID,
    body: ProjectUpdateRequest,
    cm: ContextManager,
    payload: dict,
    db: AsyncSession,
) -> ProjectUpdateResponse:
    user_id = payload.get("user_id", "")
    await validate_project_access(project_id, user_id, db)

    result = await db.execute(
        select(Project).where(Project.id == project_id, Project.is_deleted == False)  # noqa: E712
    )
    project = result.scalar_one_or_none()
    if project is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Project '{project_id}' not found",
        )

    update_data = body.model_dump(exclude_unset=True)

    # Validate template_id if provided
    if "template_id" in update_data and update_data["template_id"] is not None:
        registry = TemplateRegistry()
        if registry.get(update_data["template_id"]) is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Unknown template_id: '{update_data['template_id']}'",
            )

    # Validate system_prompt_id ownership if provided
    if "system_prompt_id" in update_data and update_data["system_prompt_id"] is not None:
        sp_result = await db.execute(
            select(SystemPrompt).where(
                SystemPrompt.id == update_data["system_prompt_id"],
                SystemPrompt.user_id == UUID(user_id),
                SystemPrompt.is_deleted == False,  # noqa: E712
            )
        )
        if sp_result.scalar_one_or_none() is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="System prompt not found",
            )

    # Normalize path if provided
    if "path" in update_data and update_data["path"] is not None:
        update_data["path"] = _normalize_project_path(update_data["path"])

    for field, value in update_data.items():
        if hasattr(project, field):
            setattr(project, field, value)

    await db.commit()
    await db.refresh(project)

    await cm.invalidate_project_cache(project_id)

    return ProjectUpdateResponse(
        id=str(project.id),
        name=project.name,
        path=project.path,
        type=project.type,
        template_id=project.template_id,
        system_prompt_id=str(project.system_prompt_id) if project.system_prompt_id else None,
        settings=project.settings,
        custom_context=project.custom_context,
        important_files=project.important_files,
        created_at=project.created_at.isoformat() if project.created_at else None,
        updated_at=project.updated_at.isoformat() if project.updated_at else None,
    )


async def _delete_project_handler(
    project_id: UUID,
    cm: ContextManager,
    payload: dict,
    db: AsyncSession,
    sandbox_manager: Optional[SandboxManager] = None,
) -> None:
    user_id = payload.get("user_id", "")
    await validate_project_access(project_id, user_id, db)

    result = await db.execute(
        select(Project).where(Project.id == project_id, Project.is_deleted == False)  # noqa: E712
    )
    project = result.scalar_one_or_none()
    if project is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Project '{project_id}' not found",
        )

    # Stop sandbox container before deleting
    if sandbox_manager and sandbox_manager.is_running:
        try:
            await sandbox_manager.stop_container(project_id)
        except Exception:
            logger.warning("Failed to stop sandbox for project %s", str(project_id)[:12], exc_info=True)

    project.soft_delete()
    await db.commit()

    await cm.invalidate_project_cache(project_id)


# -------------------------------------------------------------------------
# Primary routes on router → /api/projects
# -------------------------------------------------------------------------


@router.post("", response_model=ProjectCreateResponse, status_code=status.HTTP_201_CREATED)
async def create_project(
    body: ProjectCreateRequest,
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
    sandbox_manager: SandboxManager = Depends(get_sandbox_manager),
) -> ProjectCreateResponse:
    """Create a new project for the authenticated user."""
    return await _create_project_handler(body, payload, db, sandbox_manager)


@router.get("", response_model=ProjectListResponse)
async def list_projects(
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
) -> ProjectListResponse:
    """List all non-deleted projects for the authenticated user."""
    return await _list_projects_handler(payload, db)


@router.put("/{project_id}", response_model=ProjectUpdateResponse)
async def update_project(
    project_id: UUID,
    body: ProjectUpdateRequest,
    cm: ContextManager = Depends(get_context_manager),
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
) -> ProjectUpdateResponse:
    """Update a project's metadata."""
    return await _update_project_handler(project_id, body, cm, payload, db)


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(
    project_id: UUID,
    cm: ContextManager = Depends(get_context_manager),
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
    sandbox_manager: SandboxManager = Depends(get_sandbox_manager),
) -> None:
    """Soft-delete a project."""
    return await _delete_project_handler(project_id, cm, payload, db, sandbox_manager)


# -------------------------------------------------------------------------
# Backward-compatible aliases on context router → /api/context/projects
# -------------------------------------------------------------------------


@context_projects_router.post("/projects", response_model=ProjectCreateResponse, status_code=status.HTTP_201_CREATED, include_in_schema=False)
async def create_project_alias(
    body: ProjectCreateRequest,
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
    sandbox_manager: SandboxManager = Depends(get_sandbox_manager),
) -> ProjectCreateResponse:
    return await _create_project_handler(body, payload, db, sandbox_manager)


@context_projects_router.get("/projects", response_model=ProjectListResponse, include_in_schema=False)
async def list_projects_alias(
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
) -> ProjectListResponse:
    return await _list_projects_handler(payload, db)


@context_projects_router.put("/projects/{project_id}", response_model=ProjectUpdateResponse, include_in_schema=False)
async def update_project_alias(
    project_id: UUID,
    body: ProjectUpdateRequest,
    cm: ContextManager = Depends(get_context_manager),
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
) -> ProjectUpdateResponse:
    return await _update_project_handler(project_id, body, cm, payload, db)


@context_projects_router.delete("/projects/{project_id}", status_code=status.HTTP_204_NO_CONTENT, include_in_schema=False)
async def delete_project_alias(
    project_id: UUID,
    cm: ContextManager = Depends(get_context_manager),
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
    sandbox_manager: SandboxManager = Depends(get_sandbox_manager),
) -> None:
    return await _delete_project_handler(project_id, cm, payload, db, sandbox_manager)
