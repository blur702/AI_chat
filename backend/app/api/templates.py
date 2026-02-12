"""Template listing endpoints."""

import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field

from app.auth import get_current_user_payload

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/templates", tags=["templates"])


# -- Response schemas --------------------------------------------------------


class SidecarServiceInfo(BaseModel):
    name: str
    image: str
    exposed_ports: List[int] = Field(default_factory=list)


class TemplateInfo(BaseModel):
    id: str
    name: str
    description: str
    category: str
    docker_image: Optional[str] = None
    exposed_ports: List[int] = Field(default_factory=list)
    sidecar_services: List[SidecarServiceInfo] = Field(default_factory=list)
    memory_limit: str = "512m"
    cpu_quota: int = 50000


class TemplateListResponse(BaseModel):
    templates: List[TemplateInfo] = Field(default_factory=list)
    categories: List[str] = Field(default_factory=list)
    count: int = 0


# -- Helpers -----------------------------------------------------------------


def _get_template_registry(request: Request):
    """Retrieve the TemplateRegistry from the SandboxManager on the kernel."""
    kernel = getattr(request.app.state, "kernel", None)
    if kernel is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Kernel not initialized",
        )
    sandbox = kernel.get_service("sandbox_manager")
    if sandbox is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="SandboxManager not available",
        )
    return sandbox.template_registry


# -- Endpoints ---------------------------------------------------------------


@router.get("", response_model=TemplateListResponse)
async def list_templates(
    request: Request,
    category: Optional[str] = None,
    _payload: dict = Depends(get_current_user_payload),
) -> TemplateListResponse:
    """List all available project templates, optionally filtered by category."""
    registry = _get_template_registry(request)

    if category:
        templates = registry.list_by_category(category)
    else:
        templates = registry.list_all()

    items = [
        TemplateInfo(
            id=t.id,
            name=t.name,
            description=t.description,
            category=t.category,
            docker_image=t.docker_image,
            exposed_ports=t.exposed_ports,
            sidecar_services=[
                SidecarServiceInfo(
                    name=s.name,
                    image=s.image,
                    exposed_ports=s.exposed_ports,
                )
                for s in t.sidecar_services
            ],
            memory_limit=t.memory_limit,
            cpu_quota=t.cpu_quota,
        )
        for t in templates
    ]

    return TemplateListResponse(
        templates=items,
        categories=registry.categories,
        count=len(items),
    )


@router.get("/{template_id}", response_model=TemplateInfo)
async def get_template(
    template_id: str,
    request: Request,
    _payload: dict = Depends(get_current_user_payload),
) -> TemplateInfo:
    """Get details of a specific template."""
    registry = _get_template_registry(request)
    t = registry.get(template_id)
    if t is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Template '{template_id}' not found",
        )
    return TemplateInfo(
        id=t.id,
        name=t.name,
        description=t.description,
        category=t.category,
        docker_image=t.docker_image,
        exposed_ports=t.exposed_ports,
        sidecar_services=[
            SidecarServiceInfo(
                name=s.name,
                image=s.image,
                exposed_ports=s.exposed_ports,
            )
            for s in t.sidecar_services
        ],
        memory_limit=t.memory_limit,
        cpu_quota=t.cpu_quota,
    )
