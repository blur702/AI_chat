"""Shared dependencies for context-related API modules."""

import logging
import os
from typing import Callable, Optional, Type, TypeVar
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
from app.services.brevo_client import BrevoClient
from app.services.drupal_mcp import DrupalMCPService
from app.services.sandbox_manager import SandboxManager
from app.services.ssh_client import SSHClient

logger = logging.getLogger(__name__)

PROJECTS_ROOT = os.path.realpath(
    os.path.abspath(os.getenv("PROJECTS_ROOT", "/workspace/projects"))
)

_T = TypeVar("_T")


def _kernel_service_dep(
    service_name: str,
    service_type: Type[_T],
    unavailable_detail: str,
) -> Callable[..., _T]:
    """Return a FastAPI dependency that fetches *service_name* from the kernel."""

    def _dep(request: Request) -> _T:
        kernel = getattr(request.app.state, "kernel", None)
        if kernel is None:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Kernel not initialized",
            )
        svc = kernel.get_service(service_name)
        if svc is None:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=unavailable_detail,
            )
        return svc

    return _dep


get_context_manager = _kernel_service_dep("context_manager", ContextManager, "ContextManager service not available")
get_sandbox_manager = _kernel_service_dep("sandbox_manager", SandboxManager, "SandboxManager service not available")
get_brevo_client = _kernel_service_dep("brevo_client", BrevoClient, "BrevoClient not available (no API key configured)")
get_drupal_mcp = _kernel_service_dep("drupal_mcp", DrupalMCPService, "DrupalMCPService not available")
get_ssh_client = _kernel_service_dep("ssh_client", SSHClient, "SSHClient not available (VPS credentials not configured)")
get_ollama_client = _kernel_service_dep("ollama_client", OllamaClient, "OllamaClient service not available")


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


async def check_project_ownership(
    project_id: UUID,
    user_id,
    db: AsyncSession,
) -> Optional[str]:
    """Low-level project ownership check usable from both HTTP and WebSocket.

    Returns the ``template_id`` on success.

    Raises:
        ValueError: Project not found.
        PermissionError: User does not own the project.
    """
    result = await db.execute(
        select(Project.user_id, Project.template_id)
        .where(Project.id == project_id, Project.is_deleted == False)  # noqa: E712
    )
    row = result.one_or_none()
    if row is None:
        raise ValueError(f"Project '{project_id}' not found")

    owner_id, template_id = row
    if str(owner_id) != str(user_id):
        raise PermissionError("You do not have access to this project")

    return template_id


async def validate_project_access_with_template(
    project_id: UUID,
    user_id: str,
    db: AsyncSession,
) -> Optional[str]:
    """Validate project access and return the project's template_id.

    Raises HTTPException 404 if not found, 403 if not owner.
    Returns the template_id (may be None).
    """
    try:
        return await check_project_ownership(project_id, user_id, db)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Project '{project_id}' not found",
        )
    except PermissionError:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have access to this project",
        )


async def validate_project_access(
    project_id: UUID,
    user_id: str,
    db: AsyncSession,
) -> None:
    """Validate that a project exists and the user owns it."""
    await validate_project_access_with_template(project_id, user_id, db)
