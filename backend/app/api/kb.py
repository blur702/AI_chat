"""
Knowledge base API endpoints.

Provides REST endpoints for:
- Document upload and ingestion
- Source listing and status
- Source deletion
"""

import logging
import os
from uuid import UUID

from arq import create_pool
from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Query,
    Request,
    UploadFile,
    status,
)
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user_payload
from app.api.context_deps import validate_project_access
from app.database import get_db_session
from app.models.kb_chunk import KBChunk
from app.models.kb_source import KBSource
from app.schemas.kb import (
    KBChunkResponse,
    KBSearchRequest,
    KBSearchResponse,
    KBSearchResult,
    KBSourceListResponse,
    KBSourceResponse,
)
from app.services.embedding_service import EmbeddingService
from app.worker import get_redis_settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/kb", tags=["kb"])

UPLOAD_DIR = os.getenv("KB_UPLOAD_DIR", "/var/lib/app/kb_uploads")
MAX_FILE_SIZE = 50 * 1024 * 1024  # 50 MB
ALLOWED_EXTENSIONS = {".pdf", ".txt", ".md"}
EXT_TO_TYPE = {".pdf": "pdf", ".txt": "text", ".md": "markdown"}


# -------------------------------------------------------------------------
# Upload and Ingest
# -------------------------------------------------------------------------


@router.post(
    "/sources",
    response_model=KBSourceResponse,
    status_code=status.HTTP_201_CREATED,
)
async def upload_source(
    project_id: UUID = Form(...),
    file: UploadFile = File(...),
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
) -> KBSourceResponse:
    """Upload a document and enqueue it for ingestion."""
    user_id = payload.get("user_id") or payload.get("sub", "")
    await validate_project_access(project_id, user_id, db)

    # Validate file extension
    filename = file.filename or ""
    ext = os.path.splitext(filename)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported file type '{ext}'. Allowed: {', '.join(ALLOWED_EXTENSIONS)}",
        )

    # Read file content and check size
    file_bytes = await file.read()
    if len(file_bytes) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File too large. Maximum size is {MAX_FILE_SIZE // (1024 * 1024)}MB",
        )

    # Create KBSource record (commit deferred until file write succeeds)
    source_type = EXT_TO_TYPE[ext]
    source = KBSource(
        project_id=project_id,
        source_type=source_type,
        source_path="",  # Will update after saving file
        status="pending",
        chunk_count=0,
    )
    db.add(source)
    await db.flush()  # Assigns ID without committing
    source_id = str(source.id)

    # Save file to disk with restrictive permissions
    os.makedirs(UPLOAD_DIR, mode=0o700, exist_ok=True)
    # Sanitize: strip path components and remove non-alphanumeric chars except .-_
    import re as _re
    clean_name = os.path.basename(filename)
    clean_name = _re.sub(r"[^\w.\-]", "_", clean_name)
    if not clean_name or clean_name.startswith("."):
        clean_name = "upload"
    safe_filename = f"{source_id}_{clean_name}"
    file_path = os.path.join(UPLOAD_DIR, safe_filename)
    try:
        fd = os.open(file_path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        try:
            os.write(fd, file_bytes)
        finally:
            os.close(fd)
    except OSError as e:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to save uploaded file",
        ) from e

    # Commit DB record only after file is safely written
    source.source_path = file_path
    await db.commit()

    # Enqueue worker task
    redis = None
    try:
        redis = await create_pool(get_redis_settings())
        await redis.enqueue_job("ingest_kb_source_task", source_id)
        logger.info("Enqueued ingestion task for source %s", source_id)
    except Exception as exc:
        logger.error("Failed to enqueue ingestion task: %s", exc)
        source.status = "failed"
        await db.commit()
    finally:
        if redis is not None:
            await redis.close()

    return KBSourceResponse(
        id=source_id,
        project_id=str(project_id),
        source_type=source_type,
        source_path=file_path,
        status=source.status,
        chunk_count=0,
        created_at=str(source.created_at) if source.created_at else None,
        updated_at=str(source.updated_at) if source.updated_at else None,
    )


# -------------------------------------------------------------------------
# List Sources
# -------------------------------------------------------------------------


@router.get(
    "/sources/{project_id}",
    response_model=KBSourceListResponse,
)
async def list_sources(
    project_id: UUID,
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
) -> KBSourceListResponse:
    """List all KB sources for a project."""
    user_id = payload.get("user_id") or payload.get("sub", "")
    await validate_project_access(project_id, user_id, db)

    result = await db.execute(
        select(KBSource)
        .where(KBSource.project_id == project_id)
        .order_by(KBSource.created_at.desc())
    )
    sources = result.scalars().all()

    return KBSourceListResponse(
        sources=[
            KBSourceResponse(
                id=str(s.id),
                project_id=str(s.project_id),
                source_type=s.source_type,
                source_path=s.source_path,
                status=s.status,
                chunk_count=s.chunk_count,
                created_at=str(s.created_at) if s.created_at else None,
                updated_at=str(s.updated_at) if s.updated_at else None,
            )
            for s in sources
        ],
        count=len(sources),
    )


# -------------------------------------------------------------------------
# Source Status
# -------------------------------------------------------------------------


@router.get(
    "/sources/{source_id}/status",
    response_model=KBSourceResponse,
)
async def get_source_status(
    source_id: UUID,
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
) -> KBSourceResponse:
    """Get ingestion status for a specific source."""
    user_id = payload.get("user_id") or payload.get("sub", "")

    result = await db.execute(
        select(KBSource).where(KBSource.id == source_id)
    )
    source = result.scalar_one_or_none()
    if source is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Source '{source_id}' not found",
        )

    await validate_project_access(source.project_id, user_id, db)

    return KBSourceResponse(
        id=str(source.id),
        project_id=str(source.project_id),
        source_type=source.source_type,
        source_path=source.source_path,
        status=source.status,
        chunk_count=source.chunk_count,
        created_at=str(source.created_at) if source.created_at else None,
        updated_at=str(source.updated_at) if source.updated_at else None,
    )


# -------------------------------------------------------------------------
# Delete Source
# -------------------------------------------------------------------------


@router.delete(
    "/sources/{source_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_source(
    source_id: UUID,
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
) -> None:
    """Delete a KB source and its chunks (cascaded)."""
    user_id = payload.get("user_id") or payload.get("sub", "")

    result = await db.execute(
        select(KBSource).where(KBSource.id == source_id)
    )
    source = result.scalar_one_or_none()
    if source is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Source '{source_id}' not found",
        )

    await validate_project_access(source.project_id, user_id, db)

    # Clean up file on disk (only within configured upload directory)
    if source.source_path and os.path.exists(source.source_path):
        upload_dir_real = os.path.realpath(os.path.abspath(UPLOAD_DIR))
        source_path_real = os.path.realpath(os.path.abspath(source.source_path))
        try:
            if os.path.commonpath([upload_dir_real, source_path_real]) == upload_dir_real:
                try:
                    os.remove(source.source_path)
                except OSError:
                    logger.warning("Failed to remove file %s", source.source_path)
            else:
                logger.warning(
                    "Skipping delete for path outside upload dir: %s (UPLOAD_DIR=%s)",
                    source.source_path,
                    UPLOAD_DIR,
                )
        except ValueError:
            logger.warning(
                "Skipping delete for invalid path comparison: %s (UPLOAD_DIR=%s)",
                source.source_path,
                UPLOAD_DIR,
            )

    await db.delete(source)
    await db.commit()


# -------------------------------------------------------------------------
# Helpers
# -------------------------------------------------------------------------


def _get_embedding_service(request: Request) -> EmbeddingService:
    """Dependency to get EmbeddingService from kernel."""
    kernel = getattr(request.app.state, "kernel", None)
    if kernel is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Kernel not initialized",
        )

    svc = kernel.get_service("embedding_service")
    if svc is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="EmbeddingService not available",
        )

    return svc


# -------------------------------------------------------------------------
# Semantic Search
# -------------------------------------------------------------------------


@router.post("/search", response_model=KBSearchResponse)
async def search_kb(
    body: KBSearchRequest,
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
    embedding_svc: EmbeddingService = Depends(_get_embedding_service),
) -> KBSearchResponse:
    """Semantic search across KB chunks for a project using cosine similarity."""
    user_id = payload.get("user_id") or payload.get("sub", "")
    await validate_project_access(body.project_id, user_id, db)

    # Generate query embedding
    query_embedding = await embedding_svc.generate_embedding(
        body.query, model=body.model or "nomic-embed-text"
    )

    # Vector search using pgvector cosine distance
    from pgvector.sqlalchemy import cosine_distance

    distance_expr = cosine_distance(KBChunk.embedding, query_embedding)
    similarity_expr = (1 - distance_expr).label("similarity")

    stmt = (
        select(KBChunk, similarity_expr)
        .where(
            KBChunk.project_id == body.project_id,
            KBChunk.embedding.isnot(None),
        )
        .order_by(distance_expr)
        .limit(body.top_k)
    )

    result = await db.execute(stmt)
    rows = result.all()

    results = [
        KBSearchResult(
            chunk_id=str(chunk.id),
            source_id=str(chunk.source_id),
            content=chunk.content,
            similarity=float(sim),
            metadata=chunk.chunk_metadata,
        )
        for chunk, sim in rows
    ]

    return KBSearchResponse(
        results=results,
        query=body.query,
        count=len(results),
    )


# -------------------------------------------------------------------------
# Chunk Retrieval
# -------------------------------------------------------------------------


@router.get("/chunks/{source_id}", response_model=list[KBChunkResponse])
async def get_chunks(
    source_id: UUID,
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
) -> list[KBChunkResponse]:
    """Retrieve paginated chunks for a specific KB source."""
    user_id = payload.get("user_id") or payload.get("sub", "")

    # Validate source exists
    src_result = await db.execute(
        select(KBSource).where(KBSource.id == source_id)
    )
    source = src_result.scalar_one_or_none()
    if source is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Source '{source_id}' not found",
        )

    await validate_project_access(source.project_id, user_id, db)

    stmt = (
        select(KBChunk)
        .where(KBChunk.source_id == source_id)
        .order_by(KBChunk.chunk_index)
        .offset(skip)
        .limit(limit)
    )
    result = await db.execute(stmt)
    chunks = result.scalars().all()

    return [
        KBChunkResponse(
            id=str(c.id),
            source_id=str(c.source_id),
            content=c.content,
            chunk_index=c.chunk_index,
            metadata=c.chunk_metadata,
            has_embedding=c.embedding is not None,
        )
        for c in chunks
    ]
