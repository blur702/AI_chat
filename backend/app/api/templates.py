"""Template and technology listing endpoints."""

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
    selected_technologies: List[str] = Field(default_factory=list)


class TemplateListResponse(BaseModel):
    templates: List[TemplateInfo] = Field(default_factory=list)
    categories: List[str] = Field(default_factory=list)
    count: int = 0


class TechnologyInfo(BaseModel):
    id: str
    name: str
    description: str
    category: str
    requires_technologies: List[str] = Field(default_factory=list)
    conflicts_with: List[str] = Field(default_factory=list)
    exposed_ports: List[int] = Field(default_factory=list)
    sidecar_services: List[SidecarServiceInfo] = Field(default_factory=list)


class TechnologyCategoryGroup(BaseModel):
    category: str
    technologies: List[TechnologyInfo] = Field(default_factory=list)


class TechnologyListResponse(BaseModel):
    groups: List[TechnologyCategoryGroup] = Field(default_factory=list)
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


def _template_to_info(t) -> TemplateInfo:
    """Convert a TemplateDefinition to a TemplateInfo response."""
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
        selected_technologies=t.selected_technologies,
    )


def _technology_to_info(t) -> TechnologyInfo:
    """Convert a TechnologyDefinition to a TechnologyInfo response."""
    return TechnologyInfo(
        id=t.id,
        name=t.name,
        description=t.description,
        category=t.category,
        requires_technologies=t.requires_technologies,
        conflicts_with=t.conflicts_with,
        exposed_ports=t.exposed_ports,
        sidecar_services=[
            SidecarServiceInfo(
                name=s.name,
                image=s.image,
                exposed_ports=s.exposed_ports,
            )
            for s in t.sidecar_services
        ],
    )


# -- Template Endpoints ------------------------------------------------------


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

    items = [_template_to_info(t) for t in templates]

    return TemplateListResponse(
        templates=items,
        categories=registry.categories,
        count=len(items),
    )


@router.get("/technologies", response_model=TechnologyListResponse)
async def list_technologies(
    request: Request,
    category: Optional[str] = None,
    _payload: dict = Depends(get_current_user_payload),
) -> TechnologyListResponse:
    """List all available technologies, optionally filtered by category."""
    registry = _get_template_registry(request)

    if category:
        technologies = registry.list_technologies_by_category(category)
    else:
        technologies = registry.list_all_technologies()

    # Group technologies by category
    groups_dict: Dict[str, List[TechnologyInfo]] = {}
    for t in technologies:
        info = _technology_to_info(t)
        groups_dict.setdefault(t.category, []).append(info)

    groups = [
        TechnologyCategoryGroup(category=cat, technologies=techs)
        for cat, techs in sorted(groups_dict.items())
    ]

    return TechnologyListResponse(
        groups=groups,
        categories=registry.technology_categories,
        count=sum(len(g.technologies) for g in groups),
    )


@router.get("/technologies/{tech_id}", response_model=TechnologyInfo)
async def get_technology(
    tech_id: str,
    request: Request,
    _payload: dict = Depends(get_current_user_payload),
) -> TechnologyInfo:
    """Get details of a specific technology."""
    registry = _get_template_registry(request)
    t = registry.get_technology(tech_id)
    if t is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Technology '{tech_id}' not found",
        )
    return _technology_to_info(t)


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
    return _template_to_info(t)
