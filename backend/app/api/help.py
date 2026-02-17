"""Help topics CRUD and semantic search endpoints."""

import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import String, cast, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user_payload, require_admin
from app.database import get_db_session
from app.models.help_topic import HelpTopic
from app.schemas.help import (
    HelpSearchRequest,
    HelpSearchResponse,
    HelpSearchResult,
    HelpTopicCreateRequest,
    HelpTopicListResponse,
    HelpTopicResponse,
    HelpTopicUpdateRequest,
)
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/help", tags=["help"])


# -------------------------------------------------------------------------
# Helpers
# -------------------------------------------------------------------------


def _topic_to_response(t: HelpTopic) -> HelpTopicResponse:
    return HelpTopicResponse(
        id=str(t.id),
        slug=t.slug,
        section_id=t.section_id,
        title=t.title,
        body=t.body,
        tags=t.tags or [],
        has_embedding=t.embedding is not None,
        created_at=t.created_at.isoformat() if t.created_at else None,
        updated_at=t.updated_at.isoformat() if t.updated_at else None,
    )


# -------------------------------------------------------------------------
# List / Read (any authenticated user)
# -------------------------------------------------------------------------


@router.get("", response_model=HelpTopicListResponse)
async def list_help_topics(
    section_id: str | None = Query(default=None),
    tag: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
) -> HelpTopicListResponse:
    """List help topics with optional section/tag filters."""
    stmt = select(HelpTopic)

    if section_id is not None:
        stmt = stmt.where(HelpTopic.section_id == section_id)
    if tag is not None:
        stmt = stmt.where(HelpTopic.tags.contains([tag]))

    count_result = await db.execute(
        select(func.count()).select_from(stmt.subquery())
    )
    total = count_result.scalar() or 0

    result = await db.execute(
        stmt.order_by(HelpTopic.section_id, HelpTopic.title)
        .limit(limit)
        .offset(offset)
    )
    topics = result.scalars().all()

    return HelpTopicListResponse(
        topics=[_topic_to_response(t) for t in topics],
        count=total,
    )


@router.get("/anchors")
async def list_section_anchors(
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
) -> list[dict]:
    """Return minimal anchor data (slug, section_id, title) for deep-linking."""
    result = await db.execute(
        select(HelpTopic.slug, HelpTopic.section_id, HelpTopic.title)
        .order_by(HelpTopic.section_id, HelpTopic.title)
    )
    return [
        {"slug": row.slug, "section_id": row.section_id, "title": row.title}
        for row in result.all()
    ]


@router.get("/{slug_or_id}", response_model=HelpTopicResponse)
async def get_help_topic(
    slug_or_id: str,
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
) -> HelpTopicResponse:
    """Get a help topic by slug or UUID."""
    # Try UUID first
    try:
        topic_uuid = UUID(slug_or_id)
        result = await db.execute(
            select(HelpTopic).where(HelpTopic.id == topic_uuid)
        )
    except ValueError:
        result = await db.execute(
            select(HelpTopic).where(HelpTopic.slug == slug_or_id)
        )

    topic = result.scalar_one_or_none()
    if topic is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Help topic not found",
        )
    return _topic_to_response(topic)


# -------------------------------------------------------------------------
# Semantic Search
# -------------------------------------------------------------------------


@router.post("/search", response_model=HelpSearchResponse)
async def search_help(
    body: HelpSearchRequest,
    request: Request,
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
) -> HelpSearchResponse:
    """Search help topics. Uses semantic search when embeddings exist, falls back to text search."""
    # Check if any topics have embeddings
    embed_count = await db.execute(
        select(func.count()).select_from(
            select(HelpTopic.id).where(HelpTopic.embedding.isnot(None)).subquery()
        )
    )
    has_embeddings = (embed_count.scalar() or 0) > 0

    # Try semantic search if embeddings exist and embedding service is available
    if has_embeddings:
        try:
            kernel = getattr(request.app.state, "kernel", None)
            embedding_svc = kernel.get_service("embedding_service") if kernel else None
            if embedding_svc:
                query_embedding = await embedding_svc.generate_embedding(body.query)
                from pgvector.sqlalchemy import cosine_distance

                distance_expr = cosine_distance(HelpTopic.embedding, query_embedding)
                similarity_expr = (1 - distance_expr).label("similarity")

                stmt = (
                    select(HelpTopic, similarity_expr)
                    .where(HelpTopic.embedding.isnot(None))
                    .order_by(distance_expr)
                    .limit(body.top_k)
                )

                result = await db.execute(stmt)
                rows = result.all()

                results = [
                    HelpSearchResult(
                        id=str(topic.id),
                        slug=topic.slug,
                        section_id=topic.section_id,
                        title=topic.title,
                        body=topic.body,
                        tags=topic.tags or [],
                        similarity=float(sim),
                    )
                    for topic, sim in rows
                ]

                return HelpSearchResponse(results=results, query=body.query, count=len(results))
        except Exception:
            logger.warning("Semantic search failed, falling back to text search", exc_info=True)

    # Fallback: ILIKE text search on title, body, and tags
    # Escape LIKE wildcards to prevent wildcard injection
    escaped_query = body.query.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    pattern = f"%{escaped_query}%"
    stmt = (
        select(HelpTopic)
        .where(
            or_(
                HelpTopic.title.ilike(pattern),
                HelpTopic.body.ilike(pattern),
                cast(HelpTopic.tags, String).ilike(pattern),
            )
        )
        .order_by(HelpTopic.section_id, HelpTopic.title)
        .limit(body.top_k)
    )

    result = await db.execute(stmt)
    topics = result.scalars().all()

    results = [
        HelpSearchResult(
            id=str(t.id),
            slug=t.slug,
            section_id=t.section_id,
            title=t.title,
            body=t.body,
            tags=t.tags or [],
            similarity=1.0 if body.query.lower() in (t.title or "").lower() else 0.8,
        )
        for t in topics
    ]

    return HelpSearchResponse(results=results, query=body.query, count=len(results))


# -------------------------------------------------------------------------
# Admin CRUD (create / update / delete)
# -------------------------------------------------------------------------


@router.post(
    "",
    response_model=HelpTopicResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_help_topic(
    body: HelpTopicCreateRequest,
    request: Request,
    payload: dict = Depends(require_admin),
    db: AsyncSession = Depends(get_db_session),
) -> HelpTopicResponse:
    """Create a new help topic (admin only). Generates embedding automatically."""
    # Check slug uniqueness
    existing = await db.execute(
        select(HelpTopic.id).where(HelpTopic.slug == body.slug)
    )
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Help topic with slug '{body.slug}' already exists",
        )

    topic = HelpTopic(
        slug=body.slug,
        section_id=body.section_id,
        title=body.title,
        body=body.body,
        tags=body.tags or [],
    )

    # Generate embedding from title + body
    try:
        kernel = getattr(request.app.state, "kernel", None)
        if kernel:
            svc = kernel.get_service("embedding_service")
            if svc:
                embed_text = f"{body.title}\n\n{body.body}"
                topic.embedding = await svc.generate_embedding(embed_text)
    except Exception:
        logger.warning("Failed to generate embedding for help topic '%s'", body.slug, exc_info=True)

    db.add(topic)
    await db.commit()
    await db.refresh(topic)

    return _topic_to_response(topic)


@router.put("/{topic_id}", response_model=HelpTopicResponse)
async def update_help_topic(
    topic_id: UUID,
    body: HelpTopicUpdateRequest,
    request: Request,
    payload: dict = Depends(require_admin),
    db: AsyncSession = Depends(get_db_session),
) -> HelpTopicResponse:
    """Update a help topic (admin only). Re-generates embedding on content change."""
    result = await db.execute(
        select(HelpTopic).where(HelpTopic.id == topic_id)
    )
    topic = result.scalar_one_or_none()
    if topic is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Help topic not found",
        )

    update_data = body.model_dump(exclude_unset=True)

    # If slug is being changed, check uniqueness
    if "slug" in update_data and update_data["slug"] != topic.slug:
        dup = await db.execute(
            select(HelpTopic.id).where(HelpTopic.slug == update_data["slug"])
        )
        if dup.scalar_one_or_none() is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Help topic with slug '{update_data['slug']}' already exists",
            )

    for field, value in update_data.items():
        setattr(topic, field, value)

    # Re-generate embedding if title or body changed
    if "title" in update_data or "body" in update_data:
        try:
            kernel = getattr(request.app.state, "kernel", None)
            if kernel:
                svc = kernel.get_service("embedding_service")
                if svc:
                    embed_text = f"{topic.title}\n\n{topic.body}"
                    topic.embedding = await svc.generate_embedding(embed_text)
        except Exception:
            logger.warning("Failed to regenerate embedding for help topic '%s'", topic.slug, exc_info=True)

    await db.commit()
    await db.refresh(topic)

    return _topic_to_response(topic)


@router.delete("/{topic_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_help_topic(
    topic_id: UUID,
    payload: dict = Depends(require_admin),
    db: AsyncSession = Depends(get_db_session),
) -> None:
    """Delete a help topic (admin only)."""
    result = await db.execute(
        select(HelpTopic).where(HelpTopic.id == topic_id)
    )
    topic = result.scalar_one_or_none()
    if topic is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Help topic not found",
        )

    await db.delete(topic)
    await db.commit()
