"""UI Component CRUD API endpoints."""

import logging
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user_payload, require_admin
from app.database import get_db_session as get_session
from app.models.ui_component import UIComponent
from app.schemas.ui_component import (
    UIComponentCreateRequest,
    UIComponentUpdateRequest,
    UIComponentResponse,
    UIComponentListResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ui-components", tags=["ui-components"])


def _component_to_response(c: UIComponent) -> UIComponentResponse:
    return UIComponentResponse(
        id=str(c.id),
        name=c.name,
        category=c.category,
        description=c.description,
        is_framework_specific=c.is_framework_specific,
        framework=c.framework,
        html_template=c.html_template,
        framework_code=c.framework_code,
        props_schema=c.props_schema or {},
        preview_image=c.preview_image,
        tags=c.tags or [],
        is_mobile_responsive=c.is_mobile_responsive,
        created_at=c.created_at.isoformat() if c.created_at else None,
    )


@router.get("", response_model=UIComponentListResponse)
async def list_ui_components(
    category: Optional[str] = None,
    framework: Optional[str] = None,
    tags: Optional[str] = None,
    session: AsyncSession = Depends(get_session),
    _payload: dict = Depends(get_current_user_payload),
) -> UIComponentListResponse:
    """List UI components with optional filtering."""
    query = select(UIComponent)

    if category:
        query = query.where(UIComponent.category == category)
    if framework:
        query = query.where(UIComponent.framework == framework)
    if tags:
        tag_list = [t.strip() for t in tags.split(",") if t.strip()]
        if tag_list:
            query = query.where(UIComponent.tags.overlap(tag_list))

    query = query.order_by(UIComponent.category, UIComponent.name)
    result = await session.execute(query)
    components = result.scalars().all()

    # Get distinct categories
    cat_result = await session.execute(
        select(UIComponent.category).distinct().order_by(UIComponent.category)
    )
    categories = [row[0] for row in cat_result.all()]

    return UIComponentListResponse(
        components=[_component_to_response(c) for c in components],
        categories=categories,
        count=len(components),
    )


@router.get("/{component_id}", response_model=UIComponentResponse)
async def get_ui_component(
    component_id: str,
    session: AsyncSession = Depends(get_session),
    _payload: dict = Depends(get_current_user_payload),
) -> UIComponentResponse:
    """Get a single UI component by ID."""
    try:
        uid = UUID(component_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid component ID")

    result = await session.execute(
        select(UIComponent).where(UIComponent.id == uid)
    )
    component = result.scalar_one_or_none()
    if not component:
        raise HTTPException(status_code=404, detail="Component not found")
    return _component_to_response(component)


@router.post("", response_model=UIComponentResponse, status_code=status.HTTP_201_CREATED)
async def create_ui_component(
    data: UIComponentCreateRequest,
    session: AsyncSession = Depends(get_session),
    _payload: dict = Depends(require_admin),
) -> UIComponentResponse:
    """Create a new UI component (admin only)."""
    component = UIComponent(
        name=data.name,
        category=data.category,
        description=data.description,
        is_framework_specific=data.is_framework_specific,
        framework=data.framework,
        html_template=data.html_template,
        framework_code=data.framework_code,
        props_schema=data.props_schema,
        preview_image=data.preview_image,
        tags=data.tags,
        is_mobile_responsive=data.is_mobile_responsive,
    )
    session.add(component)
    await session.commit()
    await session.refresh(component)
    return _component_to_response(component)


@router.put("/{component_id}", response_model=UIComponentResponse)
async def update_ui_component(
    component_id: str,
    data: UIComponentUpdateRequest,
    session: AsyncSession = Depends(get_session),
    _payload: dict = Depends(require_admin),
) -> UIComponentResponse:
    """Update a UI component (admin only)."""
    try:
        uid = UUID(component_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid component ID")

    result = await session.execute(
        select(UIComponent).where(UIComponent.id == uid)
    )
    component = result.scalar_one_or_none()
    if not component:
        raise HTTPException(status_code=404, detail="Component not found")

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(component, key, value)

    await session.commit()
    await session.refresh(component)
    return _component_to_response(component)


@router.delete("/{component_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_ui_component(
    component_id: str,
    session: AsyncSession = Depends(get_session),
    _payload: dict = Depends(require_admin),
) -> None:
    """Delete a UI component (admin only)."""
    try:
        uid = UUID(component_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid component ID")

    result = await session.execute(
        select(UIComponent).where(UIComponent.id == uid)
    )
    component = result.scalar_one_or_none()
    if not component:
        raise HTTPException(status_code=404, detail="Component not found")

    await session.delete(component)
    await session.commit()
