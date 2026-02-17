"""
Image generation API endpoints.

Provides REST endpoints for:
- Submitting image generation jobs to ComfyUI
- Checking job status
- Retrieving results and downloading images
- Listing and deleting generations
"""

import asyncio
import base64
import hashlib
import hmac
import json
import logging
import mimetypes
import os
import shutil
import time
from datetime import datetime, timezone
from typing import Optional
import uuid as uuid_mod
from uuid import UUID

import docker
from arq import create_pool
from docker.errors import DockerException, NotFound
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

from app.auth import SECRET_KEY, validate_bearer_token
from app.api.context_deps import get_current_user_payload, validate_project_access
from app.auth import get_user_id
from app.database import get_db_session
from app.models.image_generation import ImageGeneration
from app.models.project import Project
from app.models.user_preference import UserPreference
from app.schemas.image import (
    ComfyUIStartResponse,
    ImageGenerationOptionsResponse,
    ImageGenerationListResponse,
    ImageGenerationProgress,
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

_ALLOWED_STATUSES = frozenset({"pending", "processing", "completed", "failed"})
_COMFYUI_CONTAINER_NAME = os.getenv("COMFYUI_CONTAINER_NAME", "workstation-comfyui")
_COMFYUI_COMPOSE_SERVICE = os.getenv("COMFYUI_DOCKER_SERVICE", "comfyui")


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


def _generation_to_response(
    gen: ImageGeneration,
    request: Request,
    progress: Optional[ImageGenerationProgress] = None,
) -> ImageGenerationResponse:
    """Convert an ImageGeneration ORM instance to a response schema.

    result_images are stored as bare filenames. Convert them to
    downloadable URLs using the /api/image/download endpoint.
    """
    generation_id = str(gen.id)
    base_url = str(request.base_url).rstrip("/")
    # Respect X-Forwarded-Proto from nginx (SSL termination)
    forwarded_proto = request.headers.get("x-forwarded-proto")
    if forwarded_proto and base_url.startswith("http://") and forwarded_proto == "https":
        base_url = "https://" + base_url[len("http://"):]
    download_urls = []
    for fname in gen.result_images or []:
        token = _create_image_token(generation_id, fname)
        download_urls.append(
            f"{base_url}/api/image/download/{generation_id}/{fname}?token={token}"
        )

    # Extract seed_used from workflow_data if available
    seed_used = None
    if gen.workflow_data:
        for node in gen.workflow_data.values():
            inputs = node.get("inputs", {}) if isinstance(node, dict) else {}
            if "seed" in inputs and node.get("class_type") == "KSampler":
                seed_used = inputs["seed"]
                break

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
        progress=progress,
        seed_used=seed_used,
        is_favorite=gen.is_favorite,
        generation_metadata=gen.generation_metadata,
        source_generation_id=str(gen.source_generation_id) if gen.source_generation_id else None,
        created_at=str(gen.created_at) if gen.created_at else None,
        updated_at=str(gen.updated_at) if gen.updated_at else None,
    )


async def _resolve_comfyui_container(client: docker.DockerClient):
    """Find the ComfyUI container by explicit name or compose service label."""
    try:
        return await asyncio.to_thread(client.containers.get, _COMFYUI_CONTAINER_NAME)
    except NotFound:
        pass

    compose_matches = await asyncio.to_thread(
        client.containers.list,
        all=True,
        filters={"label": f"com.docker.compose.service={_COMFYUI_COMPOSE_SERVICE}"},
    )
    if compose_matches:
        return compose_matches[0]

    name_matches = await asyncio.to_thread(
        client.containers.list,
        all=True,
        filters={"name": "comfyui"},
    )
    if name_matches:
        return name_matches[0]

    raise NotFound("ComfyUI container not found")


# -------------------------------------------------------------------------
# ComfyUI Startup
# -------------------------------------------------------------------------


@router.post(
    "/comfyui/start",
    response_model=ComfyUIStartResponse,
)
async def start_comfyui(
    request: Request,
    _payload: dict = Depends(get_current_user_payload),
) -> ComfyUIStartResponse:
    """Attempt to start the ComfyUI Docker container."""
    docker_client = None
    try:
        docker_client = await asyncio.to_thread(docker.from_env)
        container = await _resolve_comfyui_container(docker_client)
        await asyncio.to_thread(container.reload)

        state = container.attrs.get("State", {})
        status_str = str(state.get("Status", "unknown"))

        if status_str == "running":
            comfyui = _get_comfyui_client(request)
            healthy, health_message = await comfyui.health_check()
            return ComfyUIStartResponse(
                started=False,
                already_running=True,
                healthy=healthy,
                message="ComfyUI container is already running",
                container_status=status_str,
                health_status=health_message,
            )

        if status_str == "paused":
            await asyncio.to_thread(container.unpause)
        else:
            await asyncio.to_thread(container.start)

        await asyncio.to_thread(container.reload)
        state = container.attrs.get("State", {})
        status_str = str(state.get("Status", "unknown"))
        health_state = state.get("Health", {}) if isinstance(state.get("Health"), dict) else {}
        health_status = health_state.get("Status")

        return ComfyUIStartResponse(
            started=True,
            already_running=False,
            healthy=False,
            message="ComfyUI startup requested. Waiting for health check...",
            container_status=status_str,
            health_status=str(health_status) if health_status is not None else None,
        )
    except NotFound as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=(
                f"ComfyUI container not found. Looked for '{_COMFYUI_CONTAINER_NAME}' "
                f"and compose service '{_COMFYUI_COMPOSE_SERVICE}'."
            ),
        ) from exc
    except DockerException as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Docker is unavailable: {exc}",
        ) from exc
    except Exception as exc:
        logger.exception("Failed to start ComfyUI container: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to start ComfyUI: {exc}",
        ) from exc
    finally:
        if docker_client is not None:
            await asyncio.to_thread(docker_client.close)


# -------------------------------------------------------------------------
# Options
# -------------------------------------------------------------------------


@router.get(
    "/options",
    response_model=ImageGenerationOptionsResponse,
)
async def get_generation_options(
    request: Request,
    _payload: dict = Depends(get_current_user_payload),
) -> ImageGenerationOptionsResponse:
    """List discoverable model/LoRA/sampler options from ComfyUI."""
    comfyui = _get_comfyui_client(request)
    healthy, message = await comfyui.health_check()
    if not healthy:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"ComfyUI is not available: {message}",
        )
    options = await comfyui.get_generation_options()
    return ImageGenerationOptionsResponse(**options)


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
    user_id = get_user_id(payload)
    user_uuid = user_id

    project_system_context = ""
    if body.project_id:
        await validate_project_access(body.project_id, user_id, db)
        project_result = await db.execute(
            select(Project).where(Project.id == body.project_id, Project.is_deleted == False)  # noqa: E712
        )
        project = project_result.scalar_one_or_none()
        if project and isinstance(project.settings, dict):
            project_system_context = str(project.settings.get("imggen_system_prompt") or "").strip()

    # Resolve dedicated image-system context (request override, then project, then user preference)
    preference_result = await db.execute(
        select(UserPreference).where(UserPreference.user_id == user_uuid)
    )
    pref = preference_result.scalar_one_or_none()
    resolved_system_context = (
        (body.system_context or "").strip()
        or project_system_context
        or ((pref.imggen_system_prompt or "").strip() if pref else "")
    )
    effective_prompt = (
        f"{resolved_system_context}\n\n{body.prompt.strip()}"
        if resolved_system_context
        else body.prompt.strip()
    )

    # Check ComfyUI availability before doing any work
    comfyui = _get_comfyui_client(request)
    healthy, message = await comfyui.health_check()
    if not healthy:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"ComfyUI is not available: {message}",
        )

    async def _resolve_image_value(image_value: Optional[str], prefix: str) -> Optional[str]:
        if not image_value:
            return None
        trimmed = image_value.strip()
        if trimmed.startswith("data:"):
            try:
                return await comfyui.upload_base64_image(trimmed, prefix=prefix)
            except Exception as exc:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Invalid or unreadable uploaded image for '{prefix}': {exc}",
                ) from exc
        return trimmed

    # Resolve optional reference/controlnet images
    reference_image_path = await _resolve_image_value(body.reference_image, "ref")
    controlnet_image_path = await _resolve_image_value(body.controlnet_image, "controlnet")

    # Common kwargs for IPAdapter + ControlNet
    extra_kwargs = {}
    if reference_image_path:
        extra_kwargs["reference_image_path"] = reference_image_path
        extra_kwargs["reference_weight"] = body.reference_weight
        extra_kwargs["reference_noise"] = body.reference_noise
    if controlnet_image_path and body.controlnet_type:
        extra_kwargs["controlnet_image_path"] = controlnet_image_path
        extra_kwargs["controlnet_type"] = body.controlnet_type
        extra_kwargs["controlnet_strength"] = body.controlnet_strength

    # Build workflow JSON based on workflow_type
    if body.workflow_type == "upscale":
        if not body.input_image:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="input_image is required for upscale workflow_type",
            )
        upscale_input = await _resolve_image_value(body.input_image, "upscale")
        workflow_data = ComfyUIClient.get_upscale_workflow(
            input_image_path=upscale_input or "",
            upscale_model=body.upscale_model or "RealESRGAN_x4plus.pth",
        )
    elif body.workflow_type == "image-to-image":
        input_image = await _resolve_image_value(body.input_image, "img2img")
        workflow_data = ComfyUIClient.get_image_to_image_workflow(
            prompt=effective_prompt,
            input_image_path=input_image or "",
            negative_prompt=body.negative_prompt or "",
            denoise=body.denoise,
            steps=body.steps,
            cfg_scale=body.cfg_scale,
            seed=body.seed,
            sampler_name=body.sampler_name,
            scheduler=body.scheduler,
            model_name=body.model_name,
            loras=body.loras,
            **extra_kwargs,
        )
    elif body.workflow_type == "inpainting":
        input_image = await _resolve_image_value(body.input_image, "inpaint-input")
        mask_image = await _resolve_image_value(body.mask_image, "inpaint-mask")
        workflow_data = ComfyUIClient.get_inpainting_workflow(
            prompt=effective_prompt,
            input_image_path=input_image or "",
            mask_image_path=mask_image or "",
            negative_prompt=body.negative_prompt or "",
            denoise=body.denoise,
            steps=body.steps,
            cfg_scale=body.cfg_scale,
            seed=body.seed,
            sampler_name=body.sampler_name,
            scheduler=body.scheduler,
            model_name=body.model_name,
            loras=body.loras,
        )
    elif body.workflow_type == "face-morph":
        source_image = await _resolve_image_value(body.input_image, "morph-source")
        target_image = await _resolve_image_value(body.target_image, "morph-target")
        workflow_data = ComfyUIClient.get_face_morph_workflow(
            prompt=effective_prompt,
            source_image_path=source_image or "",
            target_image_path=target_image or "",
            negative_prompt=body.negative_prompt or "",
            morph_strength=body.morph_strength,
            denoise=body.denoise,
            steps=body.steps,
            cfg_scale=body.cfg_scale,
            seed=body.seed,
            sampler_name=body.sampler_name,
            scheduler=body.scheduler,
            model_name=body.model_name,
            loras=body.loras,
        )
    else:
        workflow_data = ComfyUIClient.get_text_to_image_workflow(
            prompt=effective_prompt,
            negative_prompt=body.negative_prompt or "",
            width=body.width,
            height=body.height,
            steps=body.steps,
            cfg_scale=body.cfg_scale,
            seed=body.seed,
            sampler_name=body.sampler_name,
            scheduler=body.scheduler,
            batch_size=body.batch_size,
            model_name=body.model_name,
            loras=body.loras,
            **extra_kwargs,
        )

    # Inject metadata for worker event publishing (prefixed with _ to avoid ComfyUI conflicts)
    workflow_data["_workflow_type"] = body.workflow_type
    workflow_data["_prompt_preview"] = (body.prompt or "")[:100]
    if resolved_system_context:
        workflow_data["_image_system_context_preview"] = resolved_system_context[:160]

    # Create database record
    generation = ImageGeneration(
        user_id=user_uuid,
        project_id=body.project_id,
        workflow_type=body.workflow_type,
        prompt=body.prompt.strip(),
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
    user_id = get_user_id(payload)

    result = await db.execute(
        select(ImageGeneration).where(
            ImageGeneration.id == job_id,
            ImageGeneration.is_deleted == False,  # noqa: E712
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

    # Fetch live progress from ComfyUI queue for active jobs
    progress = None
    if generation.status in ("pending", "processing") and generation.comfyui_job_id:
        try:
            comfyui = _get_comfyui_client(request)
            queue = await comfyui.get_queue_status()
            running = queue.get("queue_running", [])
            pending = queue.get("queue_pending", [])

            queue_position = None
            prompt_id = generation.comfyui_job_id
            # Check if our job is currently running (position 0)
            for item in running:
                if len(item) >= 2 and item[1] == prompt_id:
                    queue_position = 0
                    break
            # Check pending queue for position
            if queue_position is None:
                for idx, item in enumerate(pending):
                    if len(item) >= 2 and item[1] == prompt_id:
                        queue_position = idx + 1
                        break

            progress = ImageGenerationProgress(
                queue_position=queue_position,
                queue_pending=len(pending),
                queue_running=len(running),
            )
        except Exception:
            pass  # Non-critical — just omit progress

    return _generation_to_response(generation, request, progress=progress)


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
    user_id = get_user_id(payload)

    result = await db.execute(
        select(ImageGeneration).where(
            ImageGeneration.id == job_id,
            ImageGeneration.is_deleted == False,  # noqa: E712
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
    authorization: Optional[str] = Header(None),
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
                    ImageGeneration.is_deleted == False,  # noqa: E712
                )
            )
            generation = result.scalar_one_or_none()
            if generation is not None:
                logger.debug(
                    "Token-based image access: generation=%s file=%s",
                    generation_id_str, filename,
                )
        else:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired image token",
            )
    elif authorization:
        # Fall back to standard JWT auth
        try:
            payload = validate_bearer_token(authorization)
        except HTTPException:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired authorization token",
                headers={"WWW-Authenticate": "Bearer"},
            )
        user_id = get_user_id(payload)
        result = await db.execute(
            select(ImageGeneration).where(
                ImageGeneration.id == job_id,
                ImageGeneration.is_deleted == False,  # noqa: E712
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

    content_type = mimetypes.guess_type(filename)[0] or "image/png"
    response = FileResponse(
        path=file_path,
        media_type=content_type,
        filename=filename,
    )
    # Generated images are immutable — cache aggressively
    response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
    return response


# -------------------------------------------------------------------------
# Favorite Toggle
# -------------------------------------------------------------------------


@router.patch(
    "/generations/{job_id}/favorite",
    response_model=ImageGenerationResponse,
)
async def toggle_favorite(
    request: Request,
    job_id: UUID,
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
) -> ImageGenerationResponse:
    """Toggle the is_favorite flag on an image generation."""
    user_id = get_user_id(payload)

    result = await db.execute(
        select(ImageGeneration).where(
            ImageGeneration.id == job_id,
            ImageGeneration.is_deleted == False,  # noqa: E712
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

    generation.is_favorite = not generation.is_favorite
    await db.commit()
    await db.refresh(generation)
    return _generation_to_response(generation, request)


# -------------------------------------------------------------------------
# Upscale from existing generation
# -------------------------------------------------------------------------


@router.post(
    "/upscale/{job_id}",
    response_model=ImageGenerationResponse,
    status_code=status.HTTP_201_CREATED,
)
async def upscale_generation(
    request: Request,
    job_id: UUID,
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
) -> ImageGenerationResponse:
    """Create an upscale job from an existing completed generation's first image."""
    user_id = get_user_id(payload)
    user_uuid = user_id

    result = await db.execute(
        select(ImageGeneration).where(
            ImageGeneration.id == job_id,
            ImageGeneration.is_deleted == False,  # noqa: E712
        )
    )
    source = result.scalar_one_or_none()
    if source is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Generation '{job_id}' not found",
        )
    if source.user_id != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied",
        )
    if source.status != "completed" or not source.result_images:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Source generation must be completed with at least one result image",
        )

    comfyui = _get_comfyui_client(request)
    healthy, message = await comfyui.health_check()
    if not healthy:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"ComfyUI is not available: {message}",
        )

    # Read the first result image from disk and upload to ComfyUI input
    first_image = source.result_images[0]
    source_dir = os.path.join(COMFYUI_OUTPUT_DIR, str(job_id))
    source_path = os.path.realpath(os.path.join(source_dir, first_image))
    if not source_path.startswith(os.path.realpath(source_dir)) or not os.path.isfile(source_path):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Source image file not found on disk",
        )

    with open(source_path, "rb") as f:
        image_bytes = f.read()
    uploaded_name = await comfyui.upload_image(image_bytes, f"upscale-{uuid_mod.uuid4().hex}.png")

    workflow_data = ComfyUIClient.get_upscale_workflow(
        input_image_path=uploaded_name,
        upscale_model="RealESRGAN_x4plus.pth",
    )
    workflow_data["_workflow_type"] = "upscale"
    workflow_data["_prompt_preview"] = f"Upscale from {str(job_id)[:8]}"

    generation = ImageGeneration(
        user_id=user_uuid,
        project_id=source.project_id,
        workflow_type="upscale",
        prompt=f"Upscale of generation {job_id}",
        status="pending",
        workflow_data=workflow_data,
        result_images=[],
        source_generation_id=job_id,
    )
    db.add(generation)
    await db.commit()
    generation_id = str(generation.id)

    redis = None
    try:
        redis = await create_pool(get_redis_settings())
        await redis.enqueue_job("generate_image_task", generation_id)
        logger.info("Enqueued upscale task for %s (source: %s)", generation_id, job_id)
    except Exception as exc:
        logger.exception("Failed to enqueue upscale task: %s", exc)
        generation.status = "failed"
        generation.error_message = f"Failed to enqueue task: {exc}"
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to enqueue upscale task.",
        ) from exc
    finally:
        if redis is not None:
            await redis.close()

    return _generation_to_response(generation, request)


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
    workflow_type: Optional[str] = Query(default=None, description="Filter by workflow type"),
    is_favorite: Optional[bool] = Query(default=None, description="Filter by favorite status"),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=20, ge=1, le=100),
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
) -> ImageGenerationListResponse:
    """List image generation jobs for the current user."""
    user_id = get_user_id(payload)

    if status_filter is not None and status_filter not in _ALLOWED_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid status filter. Allowed values: {', '.join(sorted(_ALLOWED_STATUSES))}",
        )

    filters = [
        ImageGeneration.user_id == user_id,
        ImageGeneration.is_deleted == False,  # noqa: E712
    ]

    if project_id:
        await validate_project_access(project_id, user_id, db)
        filters.append(ImageGeneration.project_id == project_id)

    if status_filter is not None:
        filters.append(ImageGeneration.status == status_filter)

    if workflow_type is not None:
        filters.append(ImageGeneration.workflow_type == workflow_type)

    if is_favorite is not None:
        filters.append(ImageGeneration.is_favorite == is_favorite)

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
    user_id = get_user_id(payload)

    result = await db.execute(
        select(ImageGeneration).where(
            ImageGeneration.id == job_id,
            ImageGeneration.is_deleted == False,  # noqa: E712
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
