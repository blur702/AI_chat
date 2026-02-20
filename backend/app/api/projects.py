"""Project CRUD endpoints."""

import logging
import os
from pathlib import Path
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.context_deps import (
    PROJECTS_ROOT,
    get_context_manager,
    get_current_user_payload,
    get_db_session,
    get_sandbox_manager,
    validate_project_access,
)
from app.auth import get_user_id
from app.kernel.context_manager import ContextManager
from app.models.chat import Chat
from app.models.project import Project
from app.models.system_prompt import SystemPrompt
from app.schemas.context import (
    ChatSummary,
    ProjectCreateRequest,
    ProjectCreateResponse,
    ProjectDetailResponse,
    ProjectListResponse,
    ProjectSummary,
    ProjectUpdateRequest,
    ProjectUpdateResponse,
)
from app.services.sandbox_manager import SandboxManager
from app.services.templates import TemplateRegistry

logger = logging.getLogger(__name__)

# Module-level cached registry to avoid re-reading JSON files on every request
_registry_cache: TemplateRegistry | None = None


def _get_registry() -> TemplateRegistry:
    global _registry_cache
    if _registry_cache is None:
        _registry_cache = TemplateRegistry()
    return _registry_cache


router = APIRouter(prefix="/projects", tags=["projects"])

# Backward-compatible alias router under /context/projects
context_projects_router = APIRouter(prefix="/context", tags=["context"])


def _normalize_project_path(path: str) -> str:
    """Normalize and validate user-provided project paths."""
    norm = os.path.normpath(path).replace("\\", "/")
    if Path(norm).is_absolute():
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

    resolved_path = str(Path(PROJECTS_ROOT, norm).resolve())
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
    sandbox_manager: SandboxManager | None = None,
) -> ProjectCreateResponse:
    user_uuid = get_user_id(payload)

    normalized_path = _normalize_project_path(body.path)

    # Validate: cannot provide both template_id and selected_technologies
    if body.template_id is not None and body.selected_technologies is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot specify both 'template_id' and 'selected_technologies'. Use one or the other.",
        )

    # Validate template_id against the template registry
    if body.template_id is not None:
        registry = _get_registry()
        if registry.get(body.template_id) is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Unknown template_id: '{body.template_id}'",
            )

    # Validate selected_technologies against the registry
    if body.selected_technologies:
        registry = _get_registry()
        for tech_id in body.selected_technologies:
            if registry.get_technology(tech_id) is None:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Unknown technology: '{tech_id}'",
                )

    # Store selected_technologies in settings JSONB field (Option A: no migration needed)
    project_settings = body.settings or {}
    if body.selected_technologies:
        project_settings["selected_technologies"] = body.selected_technologies

    project = Project(
        user_id=user_uuid,
        name=body.name,
        path=normalized_path,
        type=body.type,
        template_id=body.template_id,
        settings=project_settings if project_settings else body.settings,
        custom_context=body.custom_context,
        important_files=body.important_files,
    )
    db.add(project)
    await db.commit()
    await db.refresh(project)

    # Provision a sandbox container
    if sandbox_manager and sandbox_manager.is_running:
        if body.selected_technologies:
            try:
                await sandbox_manager.get_or_create_container(
                    project.id, selected_technologies=body.selected_technologies
                )
                logger.info(
                    "Provisioned sandbox with technologies %s for project %s",
                    body.selected_technologies,
                    str(project.id)[:12],
                )
            except ValueError as ve:
                logger.warning(
                    "Technology validation failed for project %s: %s",
                    str(project.id)[:12],
                    ve,
                )
            except Exception:
                logger.exception(
                    "Failed to provision sandbox for project %s with technologies %s",
                    str(project.id)[:12],
                    body.selected_technologies,
                )
        elif body.template_id:
            try:
                await sandbox_manager.get_or_create_container(project.id, template_id=body.template_id)
                logger.info(
                    "Provisioned sandbox with template '%s' for project %s",
                    body.template_id,
                    str(project.id)[:12],
                )
            except Exception:
                logger.exception(
                    "Failed to provision sandbox for project %s with template '%s'",
                    str(project.id)[:12],
                    body.template_id,
                )

    # Extract selected_technologies from settings for response
    resp_technologies = None
    if project.settings and "selected_technologies" in project.settings:
        resp_technologies = project.settings["selected_technologies"]

    return ProjectCreateResponse(
        id=str(project.id),
        name=project.name,
        path=project.path,
        type=project.type,
        template_id=project.template_id,
        selected_technologies=resp_technologies,
        created_at=project.created_at.isoformat() if project.created_at else None,
    )


async def _list_projects_handler(
    payload: dict,
    db: AsyncSession,
    limit: int = 50,
    offset: int = 0,
) -> ProjectListResponse:
    user_uuid = get_user_id(payload)

    base_query = select(Project).where(
        Project.user_id == user_uuid,
        Project.is_deleted == False,  # noqa: E712
    )

    # Total count
    count_result = await db.execute(select(func.count()).select_from(base_query.subquery()))
    total = count_result.scalar() or 0

    # Paginated results
    result = await db.execute(base_query.order_by(Project.created_at.desc()).offset(offset).limit(limit))
    projects = result.scalars().all()

    summaries = [
        ProjectSummary(
            id=str(p.id),
            name=p.name,
            path=p.path,
            type=p.type,
            template_id=p.template_id,
            selected_technologies=(p.settings or {}).get("selected_technologies"),
            created_at=p.created_at.isoformat() if p.created_at else None,
            updated_at=p.updated_at.isoformat() if p.updated_at else None,
        )
        for p in projects
    ]

    return ProjectListResponse(projects=summaries, count=len(summaries), total=total, limit=limit, offset=offset)


async def _get_project_handler(
    project_id: UUID,
    payload: dict,
    db: AsyncSession,
) -> ProjectDetailResponse:
    user_id = get_user_id(payload)
    await validate_project_access(project_id, user_id, db)

    result = await db.execute(
        select(Project).where(Project.id == project_id, Project.is_deleted == False)  # noqa: E712
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    # Fetch chats for this project
    chat_result = await db.execute(
        select(Chat)
        .where(Chat.project_id == project_id, Chat.is_deleted == False)  # noqa: E712
        .order_by(Chat.created_at.desc())
    )
    chats = chat_result.scalars().all()

    return ProjectDetailResponse(
        project_id=str(project.id),
        user_id=str(project.user_id),
        name=project.name,
        path=project.path,
        type=project.type,
        template_id=project.template_id,
        system_prompt_id=str(project.system_prompt_id) if project.system_prompt_id else None,
        settings=project.settings,
        custom_context=project.custom_context,
        important_files=project.important_files,
        chats=[
            ChatSummary(
                id=str(c.id),
                title=c.title,
                is_pinned=c.is_pinned,
                is_archived=c.is_archived,
                chat_mode=c.chat_mode,
                created_at=c.created_at.isoformat() if c.created_at else None,
                updated_at=c.updated_at.isoformat() if c.updated_at else None,
            )
            for c in chats
        ],
    )


async def _update_project_handler(
    project_id: UUID,
    body: ProjectUpdateRequest,
    cm: ContextManager,
    payload: dict,
    db: AsyncSession,
) -> ProjectUpdateResponse:
    user_id = get_user_id(payload)
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
        registry = _get_registry()
        if registry.get(update_data["template_id"]) is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Unknown template_id: '{update_data['template_id']}'",
            )

    # Validate: cannot provide both template_id and selected_technologies
    if (
        "template_id" in update_data
        and update_data["template_id"] is not None
        and "selected_technologies" in update_data
        and update_data["selected_technologies"] is not None
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot specify both 'template_id' and 'selected_technologies'. Use one or the other.",
        )

    # Handle selected_technologies update: store in settings JSONB
    if "selected_technologies" in update_data:
        selected_tech = update_data.pop("selected_technologies")
        if selected_tech is not None:
            registry = _get_registry()
            for tech_id in selected_tech:
                if registry.get_technology(tech_id) is None:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Unknown technology: '{tech_id}'",
                    )
            # Merge into user-provided settings if present, otherwise into current project settings
            base_settings = update_data.get("settings") or (dict(project.settings) if project.settings else {})
            base_settings["selected_technologies"] = selected_tech
            update_data["settings"] = base_settings

    # Validate system_prompt_id ownership if provided
    if "system_prompt_id" in update_data and update_data["system_prompt_id"] is not None:
        sp_result = await db.execute(
            select(SystemPrompt).where(
                SystemPrompt.id == update_data["system_prompt_id"],
                SystemPrompt.user_id == user_id,
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
        selected_technologies=(project.settings or {}).get("selected_technologies"),
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
    sandbox_manager: SandboxManager | None = None,
) -> None:
    user_id = get_user_id(payload)
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
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
) -> ProjectListResponse:
    """List non-deleted projects for the authenticated user with pagination."""
    return await _list_projects_handler(payload, db, limit=limit, offset=offset)


@router.get("/{project_id}", response_model=ProjectDetailResponse)
async def get_project(
    project_id: UUID,
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
) -> ProjectDetailResponse:
    """Get full project detail including chats."""
    return await _get_project_handler(project_id, payload, db)


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


@context_projects_router.post(
    "/projects",
    response_model=ProjectCreateResponse,
    status_code=status.HTTP_201_CREATED,
    include_in_schema=False,
)
async def create_project_alias(
    body: ProjectCreateRequest,
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
    sandbox_manager: SandboxManager = Depends(get_sandbox_manager),
) -> ProjectCreateResponse:
    """Backward-compatible alias for creating a project at /api/context/projects."""
    return await _create_project_handler(body, payload, db, sandbox_manager)


@context_projects_router.get("/projects", response_model=ProjectListResponse, include_in_schema=False)
async def list_projects_alias(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
) -> ProjectListResponse:
    """Backward-compatible alias for listing projects at /api/context/projects."""
    return await _list_projects_handler(payload, db, limit=limit, offset=offset)


@context_projects_router.get("/projects/{project_id}", response_model=ProjectDetailResponse, include_in_schema=False)
async def get_project_alias(
    project_id: UUID,
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
) -> ProjectDetailResponse:
    """Backward-compatible alias for getting a project at /api/context/projects/{project_id}."""
    return await _get_project_handler(project_id, payload, db)


@context_projects_router.put("/projects/{project_id}", response_model=ProjectUpdateResponse, include_in_schema=False)
async def update_project_alias(
    project_id: UUID,
    body: ProjectUpdateRequest,
    cm: ContextManager = Depends(get_context_manager),
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
) -> ProjectUpdateResponse:
    """Backward-compatible alias for updating a project at /api/context/projects/{project_id}."""
    return await _update_project_handler(project_id, body, cm, payload, db)


@context_projects_router.delete(
    "/projects/{project_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    include_in_schema=False,
)
async def delete_project_alias(
    project_id: UUID,
    cm: ContextManager = Depends(get_context_manager),
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
    sandbox_manager: SandboxManager = Depends(get_sandbox_manager),
) -> None:
    """Backward-compatible alias for deleting a project at /api/context/projects/{project_id}."""
    return await _delete_project_handler(project_id, cm, payload, db, sandbox_manager)
