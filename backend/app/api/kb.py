"""
Knowledge base API endpoints.

Provides REST endpoints for:
- Document upload and ingestion
- Source listing and status
- Source deletion
"""

import json
import logging
import os
import re as _re
import uuid as _uuid_mod
from typing import List, Optional
from uuid import UUID

import httpx
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
    KBBulkFileStatus,
    KBBulkIngestRequest,
    KBBulkIngestResponse,
    KBBulkStatusResponse,
    KBBulkUploadFileInfo,
    KBBulkUploadResponse,
    KBChunkPreviewItem,
    KBChunkPreviewRequest,
    KBChunkPreviewResponse,
    KBChunkResponse,
    KBEmbeddingModelInfo,
    KBEmbeddingModelsResponse,
    KBExtractPreviewResponse,
    KBSearchRequest,
    KBSearchResponse,
    KBSearchResult,
    KBSourceListResponse,
    KBSourceResponse,
)
from app.services.embedding_service import DEFAULT_EMBEDDING_MODEL, EmbeddingService
from app.worker import get_redis_settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/kb", tags=["kb"])

UPLOAD_DIR = os.getenv("KB_UPLOAD_DIR", "/tmp/kb_uploads")
MAX_FILE_SIZE = 50 * 1024 * 1024  # 50 MB
ALLOWED_EXTENSIONS = {".pdf", ".txt", ".md", ".html", ".htm", ".csv", ".jpg", ".jpeg", ".png"}
EXT_TO_TYPE = {
    ".pdf": "pdf", ".txt": "text", ".md": "markdown",
    ".html": "html", ".htm": "html", ".csv": "csv",
    ".jpg": "image", ".jpeg": "image", ".png": "image",
}
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png"}


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
            detail=f"Failed to save uploaded file: {e}",
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
        body.query, model=body.model or DEFAULT_EMBEDDING_MODEL
    )

    # Vector search using pgvector cosine distance (column method in pgvector >=0.4)
    distance_expr = KBChunk.embedding.cosine_distance(query_embedding)
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


# -------------------------------------------------------------------------
# KB Builder Wizard Endpoints
# -------------------------------------------------------------------------


@router.post("/bulk-upload", response_model=KBBulkUploadResponse)
async def bulk_upload(
    files: List[UploadFile] = File(...),
    payload: dict = Depends(get_current_user_payload),
) -> KBBulkUploadResponse:
    """Accept multiple files for the KB builder wizard, save to temp dir."""
    uploaded = []
    os.makedirs(UPLOAD_DIR, mode=0o700, exist_ok=True)

    for file in files:
        filename = file.filename or "upload"
        ext = os.path.splitext(filename)[1].lower()
        if ext not in ALLOWED_EXTENSIONS:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Unsupported file type '{ext}'. Allowed: {', '.join(ALLOWED_EXTENSIONS)}",
            )

        file_bytes = await file.read()
        if len(file_bytes) > MAX_FILE_SIZE:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=f"File '{filename}' too large. Max {MAX_FILE_SIZE // (1024 * 1024)}MB.",
            )

        file_id = str(_uuid_mod.uuid4())
        clean_name = os.path.basename(filename)
        clean_name = _re.sub(r"[^\w.\-]", "_", clean_name)
        if not clean_name or clean_name.startswith("."):
            clean_name = "upload"
        safe_filename = f"{file_id}_{clean_name}"
        file_path = os.path.join(UPLOAD_DIR, safe_filename)

        fd = os.open(file_path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        try:
            os.write(fd, file_bytes)
        except OSError as e:
            os.close(fd)
            logger.error("Failed to write KB upload file %s: %s", file_path, e)
            try:
                if os.path.exists(file_path):
                    os.unlink(file_path)
            except OSError as unlink_err:
                logger.error("Failed to remove partial KB upload file %s: %s", file_path, unlink_err)
            raise
        else:
            os.close(fd)

        source_type = EXT_TO_TYPE.get(ext, "text")
        uploaded.append(KBBulkUploadFileInfo(
            file_id=file_id,
            filename=filename,
            size=len(file_bytes),
            type=source_type,
        ))

    return KBBulkUploadResponse(files=uploaded)


@router.post("/extract-preview", response_model=KBExtractPreviewResponse)
async def extract_preview(
    file: UploadFile = File(...),
    method: Optional[str] = Query(default=None, pattern="^(ocr|vision)$"),
    payload: dict = Depends(get_current_user_payload),
) -> KBExtractPreviewResponse:
    """Extract text from a single file for preview (no DB writes)."""
    from app.services.kb_ingestion import KBIngestionService

    filename = file.filename or "upload"
    ext = os.path.splitext(filename)[1].lower()

    file_bytes = await file.read()
    if len(file_bytes) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="File too large",
        )

    # Write to temp file
    import tempfile
    with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as tmp:
        tmp.write(file_bytes)
        tmp_path = tmp.name

    svc = KBIngestionService()
    extraction_method = "text"
    try:
        if ext in IMAGE_EXTENSIONS:
            if method == "vision":
                extraction_method = "vision"
                text = await svc.extract_text_from_image_vision(
                    tmp_path,
                    ollama_url=os.getenv("OLLAMA_BASE_URL", "http://ollama:11434"),
                )
            else:
                extraction_method = "ocr"
                text = svc.extract_text_from_image_ocr(tmp_path)
        elif ext == ".pdf":
            extraction_method = "pdf"
            text = svc.extract_text_from_pdf(tmp_path)
        elif ext in {".html", ".htm"}:
            extraction_method = "html"
            text = svc.extract_text_from_html(tmp_path)
        elif ext == ".csv":
            extraction_method = "csv"
            text = svc.extract_text_from_csv(tmp_path)
        else:
            extraction_method = "plaintext"
            text = svc.extract_text_from_txt(tmp_path)
    finally:
        try:
            os.remove(tmp_path)
        except OSError:
            pass

    source_type = EXT_TO_TYPE.get(ext, "text")
    return KBExtractPreviewResponse(
        filename=filename,
        source_type=source_type,
        extracted_text=text,
        char_count=len(text),
        extraction_method=extraction_method,
    )


@router.post("/chunk-preview", response_model=KBChunkPreviewResponse)
async def chunk_preview(
    body: KBChunkPreviewRequest,
    payload: dict = Depends(get_current_user_payload),
) -> KBChunkPreviewResponse:
    """Preview chunking with custom parameters (no DB writes)."""
    from app.services.kb_ingestion import KBIngestionService

    svc = KBIngestionService()
    chunks = svc.chunk_text(
        text=body.text,
        chunk_size=body.chunk_size,
        chunk_overlap=body.chunk_overlap,
        separators=body.separators,
    )

    items = [
        KBChunkPreviewItem(
            content=c["content"],
            index=c["index"],
            char_count=len(c["content"]),
        )
        for c in chunks
    ]
    total = len(items)
    avg_size = sum(i.char_count for i in items) / max(total, 1)

    return KBChunkPreviewResponse(
        chunks=items,
        total_chunks=total,
        avg_chunk_size=round(avg_size, 1),
    )


@router.get("/embedding-models", response_model=KBEmbeddingModelsResponse)
async def list_embedding_models(
    payload: dict = Depends(get_current_user_payload),
) -> KBEmbeddingModelsResponse:
    """Query Ollama for available embedding models."""
    ollama_url = os.getenv("OLLAMA_BASE_URL", "http://ollama:11434")
    models = []
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(f"{ollama_url}/api/tags")
            resp.raise_for_status()
            data = resp.json()
            for model in data.get("models", []):
                name = model.get("name", "")
                details = model.get("details", {})
                # Include models that are commonly used for embeddings
                # or have "embed" in the name
                if "embed" in name.lower() or details.get("family", "").lower() in (
                    "nomic-bert", "bert", "snowflake-arctic",
                ):
                    models.append(KBEmbeddingModelInfo(
                        name=name,
                        size=model.get("size"),
                        parameter_size=details.get("parameter_size"),
                        embedding_length=details.get("embedding_length"),
                    ))
            # If no embedding models found, still return all models
            # so the user can pick one
            if not models:
                for model in data.get("models", []):
                    models.append(KBEmbeddingModelInfo(
                        name=model.get("name", ""),
                        size=model.get("size"),
                        parameter_size=model.get("details", {}).get("parameter_size"),
                        embedding_length=model.get("details", {}).get("embedding_length"),
                    ))
    except Exception as exc:
        logger.warning("Failed to query Ollama for models: %s", exc)
        # Return default model as fallback
        models = [KBEmbeddingModelInfo(name="nomic-embed-text")]

    return KBEmbeddingModelsResponse(models=models)


@router.post("/bulk-ingest", response_model=KBBulkIngestResponse)
async def bulk_ingest(
    body: KBBulkIngestRequest,
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
) -> KBBulkIngestResponse:
    """Start batch ingestion with custom parameters."""
    import redis.asyncio as aioredis

    user_id = payload.get("user_id") or payload.get("sub", "")

    # Validate project access if project-scoped
    if body.scope == "project" and body.project_id:
        await validate_project_access(body.project_id, user_id, db)
    elif body.scope == "project" and not body.project_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="project_id required for project scope",
        )

    batch_id = str(_uuid_mod.uuid4())

    # Store batch config in Redis
    redis_url = os.getenv("REDIS_URL", "redis://redis:6379/0")
    redis_client = aioredis.from_url(redis_url, decode_responses=True)
    try:
        batch_data = {
            "batch_id": batch_id,
            "status": "pending",
            "total_files": len(body.file_ids),
            "files_completed": 0,
            "files_failed": 0,
            "total_chunks": 0,
            "chunks_embedded": 0,
            "project_id": str(body.project_id) if body.project_id else "",
            "file_ids": json.dumps(body.file_ids),
            "chunk_size": str(body.chunk_size),
            "chunk_overlap": str(body.chunk_overlap),
            "embedding_model": body.embedding_model,
            "image_processing": json.dumps(body.image_processing or {}),
            "scope": body.scope,
            "file_statuses": json.dumps([]),
        }
        await redis_client.hset(f"kb_batch:{batch_id}", mapping=batch_data)
        await redis_client.expire(f"kb_batch:{batch_id}", 3600)  # 1 hour TTL

        # Enqueue worker task
        pool = await create_pool(get_redis_settings())
        await pool.enqueue_job("bulk_ingest_kb_task", batch_id)
        await pool.close()
    finally:
        await redis_client.aclose()

    return KBBulkIngestResponse(
        batch_id=batch_id,
        total_files=len(body.file_ids),
        status="pending",
    )


@router.get("/bulk-status/{batch_id}", response_model=KBBulkStatusResponse)
async def bulk_status(
    batch_id: str,
    payload: dict = Depends(get_current_user_payload),
) -> KBBulkStatusResponse:
    """Poll batch ingestion progress from Redis."""
    import redis.asyncio as aioredis

    redis_url = os.getenv("REDIS_URL", "redis://redis:6379/0")
    redis_client = aioredis.from_url(redis_url, decode_responses=True)
    try:
        data = await redis_client.hgetall(f"kb_batch:{batch_id}")
        if not data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Batch '{batch_id}' not found",
            )

        file_statuses = []
        try:
            raw = json.loads(data.get("file_statuses", "[]"))
            for fs in raw:
                file_statuses.append(KBBulkFileStatus(**fs))
        except (json.JSONDecodeError, TypeError):
            pass

        return KBBulkStatusResponse(
            batch_id=batch_id,
            status=data.get("status", "unknown"),
            total_files=int(data.get("total_files", 0)),
            files_completed=int(data.get("files_completed", 0)),
            files_failed=int(data.get("files_failed", 0)),
            total_chunks=int(data.get("total_chunks", 0)),
            chunks_embedded=int(data.get("chunks_embedded", 0)),
            file_statuses=file_statuses,
        )
    finally:
        await redis_client.aclose()
