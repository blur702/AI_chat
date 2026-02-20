"""Help topics CRUD and semantic search endpoints."""

import logging
import re
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import String, cast, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_optional_user_payload, require_admin
from app.database import get_db_session
from app.models.help_topic import HelpTopic
from app.models.help_topic_feedback import HelpTopicFeedback
from app.schemas.help import (
    HelpFeedbackSubmitRequest,
    HelpFeedbackSubmitResponse,
    HelpFeedbackSummary,
    HelpFeedbackSummaryListResponse,
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


_HELP_QUERY_SYNONYMS: dict[str, tuple[str, ...]] = {
    "login": ("auth", "authentication", "signin", "sign", "session", "401"),
    "auth": ("login", "token", "session", "credential"),
    "401": ("unauthorized", "token", "login", "auth"),
    "502": ("gateway", "upstream", "backend", "proxy", "nginx"),
    "websocket": ("ws", "socket", "events", "realtime", "real-time"),
    "stream": ("sse", "streaming", "token", "messages"),
    "drupal": ("mcp", "drush", "staging", "site"),
    "tool": ("tools", "agent", "approval", "execute"),
    "workspace": ("ide", "files", "terminal", "project"),
    "vram": ("gpu", "memory", "offload", "model"),
    "embedding": ("vector", "semantic", "similarity", "search"),
}


# -------------------------------------------------------------------------
# Helpers
# -------------------------------------------------------------------------


def _feedback_summary_from_counts(topic_id: UUID, helpful_count: int, unhelpful_count: int) -> HelpFeedbackSummary:
    total = helpful_count + unhelpful_count
    ratio = (helpful_count / total) if total else None
    return HelpFeedbackSummary(
        topic_id=str(topic_id),
        helpful_count=helpful_count,
        unhelpful_count=unhelpful_count,
        total_feedback_count=total,
        helpful_ratio=ratio,
    )


def _topic_to_response(
    t: HelpTopic,
    helpful_count: int = 0,
    unhelpful_count: int = 0,
) -> HelpTopicResponse:
    total_feedback_count = helpful_count + unhelpful_count
    helpful_ratio = (helpful_count / total_feedback_count) if total_feedback_count else None
    return HelpTopicResponse(
        id=str(t.id),
        slug=t.slug,
        section_id=t.section_id,
        title=t.title,
        body=t.body,
        tags=t.tags or [],
        has_embedding=t.embedding is not None,
        helpful_count=helpful_count,
        unhelpful_count=unhelpful_count,
        total_feedback_count=total_feedback_count,
        helpful_ratio=helpful_ratio,
        created_at=t.created_at.isoformat() if t.created_at else None,
        updated_at=t.updated_at.isoformat() if t.updated_at else None,
    )


def _escape_like(value: str) -> str:
    """Escape SQL LIKE wildcard characters."""
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def _expand_query_terms(query: str) -> list[str]:
    """Expand query terms with common help-system synonyms."""
    raw_tokens = [token for token in re.findall(r"[a-z0-9]+", query.lower()) if token]
    expanded: list[str] = []
    seen: set[str] = set()

    for token in raw_tokens:
        if token not in seen:
            expanded.append(token)
            seen.add(token)
        for synonym in _HELP_QUERY_SYNONYMS.get(token, ()):
            if synonym not in seen:
                expanded.append(synonym)
                seen.add(synonym)

    if not expanded and query.strip():
        expanded.append(query.strip().lower())

    return expanded[:20]


def _lexical_score(topic: HelpTopic, terms: list[str], raw_query: str) -> float:
    """Heuristic lexical relevance score normalized to 0..1."""
    title = (topic.title or "").lower()
    body = (topic.body or "").lower()
    tags = " ".join(topic.tags or []).lower()
    query = raw_query.lower().strip()

    score = 0.0
    max_score = 0.0

    for term in terms:
        max_score += 3.0
        if term in title:
            score += 1.8
        if term in body:
            score += 0.8
        if term in tags:
            score += 0.4

    if query:
        max_score += 2.0
        if query in title:
            score += 1.5
        if query in body:
            score += 0.5

    if max_score <= 0:
        return 0.0
    return max(0.0, min(1.0, score / max_score))


async def _feedback_map_for_topics(
    db: AsyncSession,
    topic_ids: list[UUID],
) -> dict[UUID, tuple[int, int]]:
    """Return {topic_id: (helpful_count, unhelpful_count)} for provided topics."""
    if not topic_ids:
        return {}

    rows = await db.execute(
        select(
            HelpTopicFeedback.help_topic_id,
            func.count().filter(HelpTopicFeedback.helpful.is_(True)).label("helpful_count"),
            func.count().filter(HelpTopicFeedback.helpful.is_(False)).label("unhelpful_count"),
        )
        .where(HelpTopicFeedback.help_topic_id.in_(topic_ids))
        .group_by(HelpTopicFeedback.help_topic_id)
    )

    out: dict[UUID, tuple[int, int]] = {}
    for row in rows.all():
        out[row.help_topic_id] = (int(row.helpful_count or 0), int(row.unhelpful_count or 0))
    return out


async def _feedback_summary_for_topic(db: AsyncSession, topic_id: UUID) -> HelpFeedbackSummary:
    counts = await _feedback_map_for_topics(db, [topic_id])
    helpful_count, unhelpful_count = counts.get(topic_id, (0, 0))
    return _feedback_summary_from_counts(topic_id, helpful_count, unhelpful_count)


# -------------------------------------------------------------------------
# List / Read (any authenticated user)
# -------------------------------------------------------------------------


@router.get("", response_model=HelpTopicListResponse)
async def list_help_topics(
    section_id: str | None = Query(default=None),
    tag: str | None = Query(default=None),
    limit: int = Query(default=500, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    payload: dict | None = Depends(get_optional_user_payload),
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
    feedback_map = await _feedback_map_for_topics(db, [t.id for t in topics])

    return HelpTopicListResponse(
        topics=[
            _topic_to_response(
                t,
                helpful_count=feedback_map.get(t.id, (0, 0))[0],
                unhelpful_count=feedback_map.get(t.id, (0, 0))[1],
            )
            for t in topics
        ],
        count=total,
    )


@router.get("/anchors")
async def list_section_anchors(
    payload: dict | None = Depends(get_optional_user_payload),
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


@router.get("/feedback/summary", response_model=HelpFeedbackSummaryListResponse)
async def get_help_feedback_summary(
    section_id: str | None = Query(default=None),
    limit: int = Query(default=200, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    payload: dict | None = Depends(get_optional_user_payload),
    db: AsyncSession = Depends(get_db_session),
) -> HelpFeedbackSummaryListResponse:
    """Return aggregated feedback stats grouped by topic."""
    topic_stmt = select(HelpTopic.id).order_by(HelpTopic.section_id, HelpTopic.title).limit(limit).offset(offset)
    if section_id:
        topic_stmt = topic_stmt.where(HelpTopic.section_id == section_id)
    topic_rows = await db.execute(topic_stmt)
    topic_ids = [row.id for row in topic_rows.all()]

    counts = await _feedback_map_for_topics(db, topic_ids)
    summaries = []
    for topic_id in topic_ids:
        helpful_count, unhelpful_count = counts.get(topic_id, (0, 0))
        summaries.append(_feedback_summary_from_counts(topic_id, helpful_count, unhelpful_count))

    return HelpFeedbackSummaryListResponse(summaries=summaries, count=len(summaries))


@router.get("/{slug_or_id}", response_model=HelpTopicResponse)
async def get_help_topic(
    slug_or_id: str,
    payload: dict | None = Depends(get_optional_user_payload),
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
    summary = await _feedback_summary_for_topic(db, topic.id)
    return _topic_to_response(
        topic,
        helpful_count=summary.helpful_count,
        unhelpful_count=summary.unhelpful_count,
    )


@router.post("/{topic_id}/feedback", response_model=HelpFeedbackSubmitResponse)
async def submit_help_feedback(
    topic_id: UUID,
    body: HelpFeedbackSubmitRequest,
    payload: dict | None = Depends(get_optional_user_payload),
    db: AsyncSession = Depends(get_db_session),
) -> HelpFeedbackSubmitResponse:
    """Record user feedback on a help topic."""
    topic_exists = await db.execute(
        select(HelpTopic.id).where(HelpTopic.id == topic_id)
    )
    if topic_exists.scalar_one_or_none() is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Help topic not found",
        )

    user_id = None
    if payload and payload.get("user_id"):
        try:
            user_id = UUID(str(payload["user_id"]))
        except (ValueError, TypeError):
            user_id = None

    feedback = HelpTopicFeedback(
        help_topic_id=topic_id,
        user_id=user_id,
        helpful=body.helpful,
        context_slug=body.context_slug,
        query=body.query,
        source=(body.source or "help-modal")[:50],
    )
    db.add(feedback)
    await db.commit()

    summary = await _feedback_summary_for_topic(db, topic_id)
    return HelpFeedbackSubmitResponse(
        topic_id=summary.topic_id,
        helpful_count=summary.helpful_count,
        unhelpful_count=summary.unhelpful_count,
        total_feedback_count=summary.total_feedback_count,
        helpful_ratio=summary.helpful_ratio,
        helpful=body.helpful,
    )


@router.get("/{topic_id}/feedback", response_model=HelpFeedbackSummary)
async def get_topic_feedback_summary(
    topic_id: UUID,
    payload: dict | None = Depends(get_optional_user_payload),
    db: AsyncSession = Depends(get_db_session),
) -> HelpFeedbackSummary:
    """Get aggregated feedback for a single help topic."""
    topic_exists = await db.execute(
        select(HelpTopic.id).where(HelpTopic.id == topic_id)
    )
    if topic_exists.scalar_one_or_none() is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Help topic not found",
        )
    return await _feedback_summary_for_topic(db, topic_id)


# -------------------------------------------------------------------------
# Semantic Search
# -------------------------------------------------------------------------


@router.post("/search", response_model=HelpSearchResponse)
async def search_help(
    body: HelpSearchRequest,
    request: Request,
    payload: dict | None = Depends(get_optional_user_payload),
    db: AsyncSession = Depends(get_db_session),
) -> HelpSearchResponse:
    """Search help topics using hybrid semantic + lexical ranking."""
    terms = _expand_query_terms(body.query)
    lexical_topics: list[HelpTopic] = []
    semantic_scores: dict[UUID, float] = {}

    # Lexical retrieval with synonym expansion
    lexical_filters = []
    for term in terms[:10]:
        escaped = _escape_like(term)
        pattern = f"%{escaped}%"
        lexical_filters.extend(
            [
                HelpTopic.title.ilike(pattern, escape="\\"),
                HelpTopic.body.ilike(pattern, escape="\\"),
                cast(HelpTopic.tags, String).ilike(pattern, escape="\\"),
            ]
        )

    if lexical_filters:
        lexical_stmt = (
            select(HelpTopic)
            .where(or_(*lexical_filters))
            .order_by(HelpTopic.section_id, HelpTopic.title)
            .limit(min(500, body.top_k * 12))
        )
        lexical_result = await db.execute(lexical_stmt)
        lexical_topics = lexical_result.scalars().all()

    # Semantic retrieval (if available)
    embed_count = await db.execute(
        select(func.count()).select_from(
            select(HelpTopic.id).where(HelpTopic.embedding.isnot(None)).subquery()
        )
    )
    has_embeddings = (embed_count.scalar() or 0) > 0
    semantic_topics: dict[UUID, HelpTopic] = {}

    if has_embeddings:
        try:
            kernel = getattr(request.app.state, "kernel", None)
            embedding_svc = kernel.get_service("embedding_service") if kernel else None
            if embedding_svc:
                query_embedding = await embedding_svc.generate_embedding(body.query)
                from pgvector.sqlalchemy import cosine_distance

                distance_expr = cosine_distance(HelpTopic.embedding, query_embedding)
                similarity_expr = (1 - distance_expr).label("similarity")

                semantic_stmt = (
                    select(HelpTopic, similarity_expr)
                    .where(HelpTopic.embedding.isnot(None))
                    .order_by(distance_expr)
                    .limit(min(500, body.top_k * 12))
                )
                semantic_result = await db.execute(semantic_stmt)
                for topic, similarity in semantic_result.all():
                    semantic_topics[topic.id] = topic
                    semantic_scores[topic.id] = max(0.0, min(1.0, float(similarity)))
        except Exception:
            logger.warning("Semantic search failed, continuing with lexical ranking", exc_info=True)

    # Merge and rank
    merged: dict[UUID, tuple[HelpTopic, float]] = {}

    for topic in lexical_topics:
        lex = _lexical_score(topic, terms, body.query)
        sem = semantic_scores.get(topic.id, 0.0)
        score = (sem * 0.7) + (lex * 0.3) if topic.id in semantic_scores else lex
        merged[topic.id] = (topic, score)

    for topic_id, topic in semantic_topics.items():
        if topic_id in merged:
            continue
        sem = semantic_scores.get(topic_id, 0.0)
        lex = _lexical_score(topic, terms, body.query)
        score = (sem * 0.85) + (lex * 0.15)
        merged[topic_id] = (topic, score)

    # If neither lexical nor semantic produced results, do one strict raw query pass
    if not merged:
        escaped_query = _escape_like(body.query.strip())
        pattern = f"%{escaped_query}%"
        strict_stmt = (
            select(HelpTopic)
            .where(
                or_(
                    HelpTopic.title.ilike(pattern, escape="\\"),
                    HelpTopic.body.ilike(pattern, escape="\\"),
                    cast(HelpTopic.tags, String).ilike(pattern, escape="\\"),
                )
            )
            .order_by(HelpTopic.section_id, HelpTopic.title)
            .limit(body.top_k)
        )
        strict_result = await db.execute(strict_stmt)
        strict_topics = strict_result.scalars().all()
        merged = {
            t.id: (t, _lexical_score(t, [body.query.lower()], body.query))
            for t in strict_topics
        }

    ranked = sorted(
        merged.values(),
        key=lambda item: (-item[1], item[0].section_id, item[0].title),
    )[: body.top_k]

    feedback_map = await _feedback_map_for_topics(db, [topic.id for topic, _ in ranked])
    results = []
    for topic, score in ranked:
        helpful_count, unhelpful_count = feedback_map.get(topic.id, (0, 0))
        feedback_bonus = 0.02 if helpful_count > unhelpful_count else 0.0
        final_score = max(0.0, min(1.0, score + feedback_bonus))
        results.append(
            HelpSearchResult(
                id=str(topic.id),
                slug=topic.slug,
                section_id=topic.section_id,
                title=topic.title,
                body=topic.body,
                tags=topic.tags or [],
                similarity=final_score,
            )
        )

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
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Help topic with slug '{body.slug}' already exists",
        )
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

    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Help topic with slug '{topic.slug}' already exists",
        )
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
