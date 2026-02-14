"""
Image generation API endpoints.

Provides REST endpoints for:
- Submitting image generation jobs to ComfyUI
- Checking job status
- Retrieving results and downloading images
- Listing and deleting generations
"""

import base64
import hashlib
import hmac
import json
import logging
import os
import shutil
import time
from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

from arq import create_pool
from fastapi import (
    APIRouter,
    Depends,
    Header,
    HTTPException,
    Query,
    Request,
    status,
)
from fastapi.responses import FileResponse
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import SECRET_KEY, get_current_user_payload
from app.api.context_deps import validate_project_access
from app.database import get_db_session
from app.models.image_generation import ImageGeneration
from app.schemas.image import (
    ImageGenerationListResponse,
    ImageGenerationRequest,
    ImageGenerationResponse,
)
from app.services.comfyui_client import COMFYUI_OUTPUT_DIR, ComfyUIClient
from app.worker import get_redis_settings

logger = logging.getLogger(__name__)

# Derive a separate signing key for image tokens so a JWT compromise
# does not automatically compromise image token signing and vice versa.
_IMAGE_TOKEN_KEY = hmac.new(
    SECRET_KEY.encode(), b"image-token-v1", hashlib.sha256
).digest()

router = APIRouter(prefix="/image", tags=["image"])


# -------------------------------------------------------------------------
# Helpers
# -------------------------------------------------------------------------


def _get_comfyui_client(request: Request) -> ComfyUIClient:
    """Dependency to get ComfyUIClient from kernel."""
    kernel = getattr(request.app.state, "kernel", None)
    if kernel is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Kernel not initialized",
        )

    svc = kernel.get_service("comfyui_client")
    if svc is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="ComfyUIClient not available",
        )

    return svc


def _create_image_token(generation_id: str, filename: str, ttl: int = 3600) -> str:
    """Create an HMAC-signed token for unauthenticated image download."""
    payload = json.dumps(
        {"gid": generation_id, "fn": filename, "exp": int(time.time()) + ttl},
        separators=(",", ":"),
    )
    payload_b64 = base64.urlsafe_b64encode(payload.encode()).decode()
    sig = hmac.new(_IMAGE_TOKEN_KEY, payload_b64.encode(), hashlib.sha256).digest()
    sig_b64 = base64.urlsafe_b64encode(sig).decode()
    return f"{payload_b64}.{sig_b64}"


def _verify_image_token(token: str, generation_id: str, filename: str) -> bool:
    """Verify an HMAC-signed image download token."""
    try:
        payload_b64, sig_b64 = token.split(".", 1)
        expected_sig = hmac.new(
            _IMAGE_TOKEN_KEY, payload_b64.encode(), hashlib.sha256
        ).digest()
        actual_sig = base64.urlsafe_b64decode(sig_b64)
        if not hmac.compare_digest(expected_sig, actual_sig):
            return False
        payload = json.loads(base64.urlsafe_b64decode(payload_b64))
        if payload.get("gid") != generation_id or payload.get("fn") != filename:
            return False
        if int(time.time()) > payload.get("exp", 0):
            return False
        return True
    except Exception:
        return False


def _generation_to_response(gen: ImageGeneration, request: Request) -> ImageGenerationResponse:
    """Convert an ImageGeneration ORM instance to a response schema.

    result_images are stored as bare filenames. Convert them to
    downloadable URLs using the /api/image/download endpoint.
    """
    generation_id = str(gen.id)
    base_url = str(request.base_url).rstrip("/")
    download_urls = []
    for fname in gen.result_images or []:
        token = _create_image_token(generation_id, fname)
        download_urls.append(
            f"{base_url}/api/image/download/{generation_id}/{fname}?token={token}"
        )

    return ImageGenerationResponse(
        id=generation_id,
        user_id=str(gen.user_id),
        project_id=str(gen.project_id) if gen.project_id else None,
        workflow_type=gen.workflow_type,
        prompt=gen.prompt,
        negative_prompt=gen.negative_prompt,
        status=gen.status,
        result_images=download_urls,
        error_message=gen.error_message,
        comfyui_job_id=gen.comfyui_job_id,
        created_at=str(gen.created_at) if gen.created_at else None,
        updated_at=str(gen.updated_at) if gen.updated_at else None,
    )


# -------------------------------------------------------------------------
# Generate
# -------------------------------------------------------------------------


@router.post(
    "/generate",
    response_model=ImageGenerationResponse,
    status_code=status.HTTP_201_CREATED,
)
async def generate_image(
    request: Request,
    body: ImageGenerationRequest,
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
) -> ImageGenerationResponse:
    """Submit an image generation job to ComfyUI via the background worker."""
    user_id = payload.get("user_id") or payload.get("sub", "")

    # Check ComfyUI availability before doing any work
    comfyui = _get_comfyui_client(request)
    healthy, message = await comfyui.health_check()
    if not healthy:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"ComfyUI is not available: {message}",
        )

    if body.project_id:
        await validate_project_access(body.project_id, user_id, db)

    # Build workflow JSON based on workflow_type
    if body.workflow_type == "image-to-image":
        workflow_data = ComfyUIClient.get_image_to_image_workflow(
            prompt=body.prompt,
            input_image_path=body.input_image,
            negative_prompt=body.negative_prompt or "",
            denoise=body.denoise,
            steps=body.steps,
            cfg_scale=body.cfg_scale,
        )
    else:
        workflow_data = ComfyUIClient.get_text_to_image_workflow(
            prompt=body.prompt,
            negative_prompt=body.negative_prompt or "",
            width=body.width,
            height=body.height,
            steps=body.steps,
            cfg_scale=body.cfg_scale,
        )

    # Create database record
    generation = ImageGeneration(
        user_id=UUID(user_id),
        project_id=body.project_id,
        workflow_type=body.workflow_type,
        prompt=body.prompt,
        negative_prompt=body.negative_prompt,
        status="pending",
        workflow_data=workflow_data,
        result_images=[],
    )
    db.add(generation)
    await db.commit()
    generation_id = str(generation.id)

    # Enqueue worker task — raise 502 on failure
    redis = None
    try:
        redis = await create_pool(get_redis_settings())
        await redis.enqueue_job("generate_image_task", generation_id)
        logger.info("Enqueued image generation task for %s", generation_id)
    except Exception as exc:
        logger.exception("Failed to enqueue image generation task: %s", exc)
        generation.status = "failed"
        generation.error_message = f"Failed to enqueue task: {exc}"
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to enqueue image generation task. Please try again later.",
        ) from exc
    finally:
        if redis is not None:
            await redis.close()

    return _generation_to_response(generation, request)


# -------------------------------------------------------------------------
# Status
# -------------------------------------------------------------------------


@router.get(
    "/status/{job_id}",
    response_model=ImageGenerationResponse,
)
async def get_generation_status(
    request: Request,
    job_id: UUID,
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
) -> ImageGenerationResponse:
    """Get the current status of an image generation job."""
    user_id = payload.get("user_id") or payload.get("sub", "")

    result = await db.execute(
        select(ImageGeneration).where(
            ImageGeneration.id == job_id,
            ImageGeneration.is_deleted == False,
        )
    )
    generation = result.scalar_one_or_none()
    if generation is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Generation '{job_id}' not found",
        )

    if str(generation.user_id) != str(user_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied",
        )

    return _generation_to_response(generation, request)


# -------------------------------------------------------------------------
# Result
# -------------------------------------------------------------------------


@router.get(
    "/result/{job_id}",
    response_model=ImageGenerationResponse,
)
async def get_generation_result(
    request: Request,
    job_id: UUID,
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
) -> ImageGenerationResponse:
    """Get the result of a completed image generation job."""
    user_id = payload.get("user_id") or payload.get("sub", "")

    result = await db.execute(
        select(ImageGeneration).where(
            ImageGeneration.id == job_id,
            ImageGeneration.is_deleted == False,
        )
    )
    generation = result.scalar_one_or_none()
    if generation is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Generation '{job_id}' not found",
        )

    if str(generation.user_id) != str(user_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied",
        )

    if generation.status != "completed":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Generation is not completed (status: {generation.status})",
        )

    return _generation_to_response(generation, request)


# -------------------------------------------------------------------------
# Download
# -------------------------------------------------------------------------


@router.get("/download/{job_id}/{filename}")
async def download_image(
    job_id: UUID,
    filename: str,
    token: Optional[str] = Query(default=None),
    db: AsyncSession = Depends(get_db_session),
    authorization: Optional[str] = Header(default=None),
) -> FileResponse:
    """Download a specific generated image file by filename.

    Supports two auth modes:
    - Signed token via ``?token=`` query param (used by ``<img>`` tags)
    - JWT via ``Authorization: Bearer`` header (standard API auth)
    """
    generation_id_str = str(job_id)
    generation = None

    if token:
        if _verify_image_token(token, generation_id_str, filename):
            # Token-based access — fetch generation for filename validation only
            result = await db.execute(
                select(ImageGeneration).where(
                    ImageGeneration.id == job_id,
                    ImageGeneration.is_deleted == False,
                )
            )
            generation = result.scalar_one_or_none()
        else:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired image token",
            )
    elif authorization:
        # Fall back to standard JWT auth
        try:
            payload = get_current_user_payload(authorization=authorization)
        except HTTPException:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired token",
            )
        user_id = payload.get("user_id") or payload.get("sub", "")
        result = await db.execute(
            select(ImageGeneration).where(
                ImageGeneration.id == job_id,
                ImageGeneration.is_deleted == False,
            )
        )
        generation = result.scalar_one_or_none()
        if generation is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Generation '{job_id}' not found",
            )
        if str(generation.user_id) != str(user_id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied",
            )
    else:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )

    if generation is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Generation '{job_id}' not found",
        )
    if filename not in (generation.result_images or []):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Image '{filename}' not found in generation results",
        )

    # Resolve to absolute path and verify it stays within the output dir
    generation_dir = os.path.join(COMFYUI_OUTPUT_DIR, str(job_id))
    file_path = os.path.realpath(os.path.join(generation_dir, filename))
    if not file_path.startswith(os.path.realpath(generation_dir)):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid filename",
        )

    if not os.path.isfile(file_path):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Image file not found on disk",
        )

    response = FileResponse(
        path=file_path,
        media_type="image/png",
        filename=filename,
    )
    response.headers["Cache-Control"] = "private, no-store"
    return response


# -------------------------------------------------------------------------
# List
# -------------------------------------------------------------------------


@router.get(
    "/generations",
    response_model=ImageGenerationListResponse,
)
async def list_generations(
    request: Request,
    project_id: UUID = Query(default=None),
    status_filter: Optional[str] = Query(default=None, alias="status", description="Filter by status (pending/processing/completed/failed)"),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=20, ge=1, le=100),
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
) -> ImageGenerationListResponse:
    """List image generation jobs for the current user."""
    user_id = payload.get("user_id") or payload.get("sub", "")

    _allowed_statuses = {"pending", "processing", "completed", "failed"}
    if status_filter is not None and status_filter not in _allowed_statuses:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid status filter. Allowed values: {', '.join(sorted(_allowed_statuses))}",
        )

    filters = [
        ImageGeneration.user_id == UUID(user_id),
        ImageGeneration.is_deleted == False,
    ]

    if project_id:
        await validate_project_access(project_id, user_id, db)
        filters.append(ImageGeneration.project_id == project_id)

    if status_filter is not None:
        filters.append(ImageGeneration.status == status_filter)

    stmt = (
        select(ImageGeneration)
        .order_by(ImageGeneration.created_at.desc())
    )
    for f in filters:
        stmt = stmt.where(f)

    # Get total count with same filters
    count_stmt = select(func.count()).select_from(ImageGeneration)
    for f in filters:
        count_stmt = count_stmt.where(f)
    count_result = await db.execute(count_stmt)
    total_count = count_result.scalar() or 0

    # Paginate
    stmt = stmt.offset(skip).limit(limit)
    result = await db.execute(stmt)
    generations = result.scalars().all()

    return ImageGenerationListResponse(
        generations=[_generation_to_response(g, request) for g in generations],
        count=total_count,
    )


# -------------------------------------------------------------------------
# Delete
# -------------------------------------------------------------------------


@router.delete(
    "/generations/{job_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_generation(
    job_id: UUID,
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
) -> None:
    """Soft-delete an image generation job and clean up result files."""
    user_id = payload.get("user_id") or payload.get("sub", "")

    result = await db.execute(
        select(ImageGeneration).where(
            ImageGeneration.id == job_id,
            ImageGeneration.is_deleted == False,
        )
    )
    generation = result.scalar_one_or_none()
    if generation is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Generation '{job_id}' not found",
        )

    if str(generation.user_id) != str(user_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied",
        )

    generation.is_deleted = True
    generation.deleted_at = datetime.now(timezone.utc)
    await db.commit()

    # Clean up output directory after soft-delete is persisted
    output_dir = os.path.join(COMFYUI_OUTPUT_DIR, str(job_id))
    if os.path.isdir(output_dir):
        try:
            shutil.rmtree(output_dir)
        except OSError:
            logger.warning("Failed to remove output directory %s", output_dir)
