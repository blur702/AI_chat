"""
Event management API endpoints.

Provides REST API endpoints for querying persisted events and publishing
new events through the EventBus.
"""

import logging
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import select, func, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db_session as get_db
from app.kernel.event_bus import EventBus
from app.models.event import Event
from app.schemas.event import (
    EventBroadcastResponse,
    EventCreate,
    EventResponse,
    EventListResponse,
)

logger = logging.getLogger("workstation.api.events")

router = APIRouter(prefix="/events", tags=["events"])


def get_event_bus(request: Request) -> EventBus:
    """
    Dependency to get the EventBus from the kernel.

    Raises:
        HTTPException: 503 if EventBus is not available
    """
    kernel = getattr(request.app.state, "kernel", None)
    if kernel is None:
        raise HTTPException(status_code=503, detail="Kernel not initialized")

    event_bus = kernel.get_service("event_bus")
    if event_bus is None or not event_bus.is_running:
        raise HTTPException(status_code=503, detail="EventBus service not available")

    return event_bus


@router.get("/", response_model=EventListResponse)
async def list_events(
    event_type: Optional[str] = Query(None, description="Filter by event type"),
    severity: Optional[str] = Query(None, description="Filter by severity level"),
    user_id: Optional[UUID] = Query(None, description="Filter by user ID"),
    chat_id: Optional[UUID] = Query(None, description="Filter by chat ID"),
    resource_id: Optional[str] = Query(None, description="Filter by resource ID"),
    limit: int = Query(20, ge=1, le=100, description="Maximum events to return"),
    offset: int = Query(0, ge=0, description="Offset for pagination"),
    db: AsyncSession = Depends(get_db),
):
    """
    List events with optional filtering and pagination.

    Events are returned in reverse chronological order (newest first).
    """
    # Build query
    query = select(Event)

    # Apply filters
    if event_type:
        query = query.where(Event.event_type == event_type)
    if severity:
        query = query.where(Event.severity == severity)
    if user_id:
        query = query.where(Event.user_id == user_id)
    if chat_id:
        query = query.where(Event.chat_id == chat_id)
    if resource_id:
        query = query.where(Event.resource_id == resource_id)

    # Get total count
    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    # Apply ordering and pagination
    query = query.order_by(desc(Event.created_at)).offset(offset).limit(limit)

    # Execute query
    result = await db.execute(query)
    events = result.scalars().all()

    return EventListResponse(
        events=[
            EventResponse(
                id=event.id,
                event_type=event.event_type,
                event_data=event.event_data,
                severity=event.severity,
                source=event.source,
                user_id=event.user_id,
                chat_id=event.chat_id,
                resource_id=event.resource_id,
                created_at=event.created_at,
            )
            for event in events
        ],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get("/{event_id}", response_model=EventResponse)
async def get_event(
    event_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    """
    Get a single event by ID.

    Raises:
        HTTPException: 404 if event not found
    """
    result = await db.execute(select(Event).where(Event.id == event_id))
    event = result.scalar_one_or_none()

    if event is None:
        raise HTTPException(status_code=404, detail="Event not found")

    return EventResponse(
        id=event.id,
        event_type=event.event_type,
        event_data=event.event_data,
        severity=event.severity,
        source=event.source,
        user_id=event.user_id,
        chat_id=event.chat_id,
        resource_id=event.resource_id,
        created_at=event.created_at,
    )


from fastapi.responses import JSONResponse


@router.post(
    "/",
    response_model=EventResponse,
    status_code=201,
    responses={
        201: {"model": EventResponse, "description": "Event persisted to database"},
        202: {"model": EventBroadcastResponse, "description": "Event broadcast only (not persisted)"},
    },
)
async def create_event(
    event_create: EventCreate,
    event_bus: EventBus = Depends(get_event_bus),
    db: AsyncSession = Depends(get_db),
):
    """
    Publish a new event through the EventBus.

    The event is published to all subscribers via Redis pub/sub and WebSocket.
    If persist=True, the event is also saved to the database and returns 201.
    If persist=False, the event is only broadcast and returns 202 without an ID.
    """
    from datetime import datetime, timezone

    event_id = await event_bus.publish_event(
        event_type=event_create.event_type,
        event_data=event_create.event_data,
        severity=event_create.severity.value,
        source=event_create.source,
        persist=event_create.persist,
        user_id=event_create.user_id,
        chat_id=event_create.chat_id,
        resource_id=event_create.resource_id,
    )

    # If persisted, fetch the created event and return 201
    if event_id:
        result = await db.execute(select(Event).where(Event.id == event_id))
        event = result.scalar_one_or_none()

        if event:
            return EventResponse(
                id=event.id,
                event_type=event.event_type,
                event_data=event.event_data,
                severity=event.severity,
                source=event.source,
                user_id=event.user_id,
                chat_id=event.chat_id,
                resource_id=event.resource_id,
                created_at=event.created_at,
            )

    # Event was broadcast but not persisted - return 202 Accepted without an ID
    broadcast_response = EventBroadcastResponse(
        event_type=event_create.event_type,
        event_data=event_create.event_data,
        severity=event_create.severity.value,
        source=event_create.source,
        user_id=event_create.user_id,
        chat_id=event_create.chat_id,
        resource_id=event_create.resource_id,
        persisted=False,
        broadcast_at=datetime.now(timezone.utc),
    )
    return JSONResponse(
        status_code=202,
        content=broadcast_response.model_dump(mode="json"),
    )


@router.get("/types/list", response_model=List[str])
async def list_event_types(
    db: AsyncSession = Depends(get_db),
):
    """
    List all distinct event types that have been recorded.

    Useful for discovering available event types for filtering.
    """
    result = await db.execute(
        select(Event.event_type).distinct().order_by(Event.event_type)
    )
    event_types = result.scalars().all()
    return list(event_types)


@router.get("/stats/summary")
async def get_event_stats(
    db: AsyncSession = Depends(get_db),
):
    """
    Get summary statistics about events.

    Returns counts by event type and severity level.
    """
    # Count by event type
    type_query = select(
        Event.event_type, func.count(Event.id).label("count")
    ).group_by(Event.event_type)
    type_result = await db.execute(type_query)
    by_type = {row.event_type: row.count for row in type_result}

    # Count by severity
    severity_query = select(
        Event.severity, func.count(Event.id).label("count")
    ).group_by(Event.severity)
    severity_result = await db.execute(severity_query)
    by_severity = {row.severity: row.count for row in severity_result}

    # Total count
    total_query = select(func.count(Event.id))
    total_result = await db.execute(total_query)
    total = total_result.scalar() or 0

    return {
        "total": total,
        "by_type": by_type,
        "by_severity": by_severity,
    }
