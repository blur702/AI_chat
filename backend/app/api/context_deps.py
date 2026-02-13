"""Shared dependencies for context-related API modules."""

import logging
import os
from typing import Optional
from uuid import UUID

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user_payload  # noqa: F401  (re-export)
from app.database import get_db_session  # noqa: F401  (re-export)
from app.kernel.context_manager import ContextManager
from app.models.chat import Chat
from app.models.project import Project
from app.services.ollama_client import OllamaClient
from app.services.drupal_mcp import DrupalMCPService
from app.services.sandbox_manager import SandboxManager

logger = logging.getLogger(__name__)

PROJECTS_ROOT = os.path.realpath(
    os.path.abspath(os.getenv("PROJECTS_ROOT", "/workspace/projects"))
)


def get_context_manager(request: Request) -> ContextManager:
    """Dependency to get ContextManager from kernel."""
    kernel = getattr(request.app.state, "kernel", None)
    if kernel is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Kernel not initialized",
        )

    cm = kernel.get_service("context_manager")
    if cm is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="ContextManager service not available",
        )

    return cm


def get_sandbox_manager(request: Request) -> SandboxManager:
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


def get_drupal_mcp(request: Request) -> DrupalMCPService:
    """Dependency to get DrupalMCPService from kernel."""
    kernel = getattr(request.app.state, "kernel", None)
    if kernel is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Kernel not initialized",
        )

    svc = kernel.get_service("drupal_mcp")
    if svc is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="DrupalMCPService not available",
        )

    return svc


def get_ollama_client(request: Request) -> OllamaClient:
    """Dependency to get OllamaClient from kernel."""
    kernel = getattr(request.app.state, "kernel", None)
    if kernel is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Kernel not initialized",
        )

    client = kernel.get_service("ollama_client")
    if client is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="OllamaClient service not available",
        )

    return client


async def validate_chat_access(
    chat_id: UUID,
    user_id: str,
    db: AsyncSession,
) -> None:
    """Validate that a chat exists and the user has access to it."""
    result = await db.execute(
        select(Chat, Project.user_id)
        .join(Project, Chat.project_id == Project.id)
        .where(Chat.id == chat_id, Chat.is_deleted == False, Project.is_deleted == False)  # noqa: E712
    )
    row = result.one_or_none()
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Chat '{chat_id}' not found",
        )

    _, owner_id = row
    if str(owner_id) != str(user_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have access to this chat",
        )


async def validate_project_access_with_template(
    project_id: UUID,
    user_id: str,
    db: AsyncSession,
) -> Optional[str]:
    """Validate project access and return the project's template_id.

    Raises HTTPException 404 if not found, 403 if not owner.
    Returns the template_id (may be None).
    """
    result = await db.execute(
        select(Project.user_id, Project.template_id)
        .where(Project.id == project_id, Project.is_deleted == False)  # noqa: E712
    )
    row = result.one_or_none()
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Project '{project_id}' not found",
        )

    owner_id, template_id = row
    if str(owner_id) != str(user_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have access to this project",
        )

    return template_id


async def validate_project_access(
    project_id: UUID,
    user_id: str,
    db: AsyncSession,
) -> None:
    """Validate that a project exists and the user owns it."""
    await validate_project_access_with_template(project_id, user_id, db)
