"""Video Studio API endpoints.

Provides REST endpoints for:
- Video project CRUD
- Media asset upload and management
- Screen recording upload
- Export job management
"""

import logging
import mimetypes
import os
import re
import shutil
from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

import aiofiles

from fastapi import (
    APIRouter,
    Depends,
    File,
    HTTPException,
    Query,
    UploadFile,
    status,
)
from fastapi.responses import FileResponse
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.context_deps import get_current_user_payload
from app.auth import get_user_id
from app.database import get_db_session
from app.models.video_project import MediaAsset, VideoExport, VideoProject
from app.schemas.studio import (
    ExportRequest,
    MediaAssetListResponse,
    MediaAssetResponse,
    VideoExportResponse,
    VideoProjectCreate,
    VideoProjectListResponse,
    VideoProjectResponse,
    VideoProjectUpdate,
)
from app.services.ffmpeg_service import (
    STUDIO_MEDIA_DIR,
    extract_thumbnail,
    get_media_type,
    get_project_media_dir,
    probe_media,
)

logger = logging.getLogger(__name__)

MAX_UPLOAD_BYTES = 500 * 1024 * 1024  # 500 MB


def _sanitize_filename(raw: str) -> str:
    """Strip path components and dangerous characters from a user-supplied filename."""
    name = os.path.basename(raw)
    name = re.sub(r"[^\w.\-]", "_", name)
    return name or "upload"


router = APIRouter(prefix="/studio", tags=["studio"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _project_to_response(project: VideoProject) -> VideoProjectResponse:
    return VideoProjectResponse(
        id=str(project.id),
        user_id=str(project.user_id),
        name=project.name,
        description=project.description,
        timeline_data=project.timeline_data,
        settings=project.settings or {},
        thumbnail_path=project.thumbnail_path,
        duration_seconds=project.duration_seconds,
        status=project.status,
        created_at=str(project.created_at) if project.created_at else None,
        updated_at=str(project.updated_at) if project.updated_at else None,
    )


def _asset_to_response(asset: MediaAsset) -> MediaAssetResponse:
    return MediaAssetResponse(
        id=str(asset.id),
        user_id=str(asset.user_id),
        video_project_id=str(asset.video_project_id),
        filename=asset.filename,
        media_type=asset.media_type,
        mime_type=asset.mime_type,
        file_size_bytes=asset.file_size_bytes,
        duration_seconds=asset.duration_seconds,
        width=asset.width,
        height=asset.height,
        thumbnail_path=asset.thumbnail_path,
        metadata=asset.asset_metadata,
        created_at=str(asset.created_at) if asset.created_at else None,
    )


def _export_to_response(export: VideoExport) -> VideoExportResponse:
    return VideoExportResponse(
        id=str(export.id),
        video_project_id=str(export.video_project_id),
        user_id=str(export.user_id),
        status=export.status,
        format=export.format,
        resolution=export.resolution,
        file_size_bytes=export.file_size_bytes,
        progress_percent=export.progress_percent,
        error_message=export.error_message,
        export_settings=export.export_settings,
        created_at=str(export.created_at) if export.created_at else None,
        updated_at=str(export.updated_at) if export.updated_at else None,
    )


async def _get_project_for_user(
    project_id: UUID,
    user_id: UUID,
    db: AsyncSession,
) -> VideoProject:
    """Load a project, verify ownership, raise 404/403 as needed."""
    result = await db.execute(
        select(VideoProject).where(
            VideoProject.id == project_id,
            VideoProject.is_deleted == False,  # noqa: E712
        )
    )
    project = result.scalar_one_or_none()
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    if project.user_id != user_id:
        raise HTTPException(status_code=403, detail="Access denied")
    return project


# ---------------------------------------------------------------------------
# Projects
# ---------------------------------------------------------------------------


@router.post("/projects", response_model=VideoProjectResponse, status_code=201)
async def create_project(
    body: VideoProjectCreate,
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
) -> VideoProjectResponse:
    """Create a new video project."""
    user_id = get_user_id(payload)

    project = VideoProject(
        user_id=user_id,
        name=body.name,
        description=body.description,
        settings=body.settings.model_dump(),
        timeline_data={
            "version": 1,
            "settings": body.settings.model_dump(),
            "tracks": [],
        },
        status="draft",
    )
    db.add(project)
    await db.commit()
    await db.refresh(project)

    return _project_to_response(project)


@router.get("/projects", response_model=VideoProjectListResponse)
async def list_projects(
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=20, ge=1, le=100),
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
) -> VideoProjectListResponse:
    """List video projects for the current user."""
    user_id = get_user_id(payload)

    filters = [
        VideoProject.user_id == user_id,
        VideoProject.is_deleted == False,  # noqa: E712
    ]

    count_stmt = select(func.count()).select_from(VideoProject)
    for f in filters:
        count_stmt = count_stmt.where(f)
    total = (await db.execute(count_stmt)).scalar() or 0

    stmt = (
        select(VideoProject)
        .where(*filters)
        .order_by(VideoProject.updated_at.desc())
        .offset(skip)
        .limit(limit)
    )
    result = await db.execute(stmt)
    projects = result.scalars().all()

    return VideoProjectListResponse(
        projects=[_project_to_response(p) for p in projects],
        count=total,
    )


@router.get("/projects/{project_id}", response_model=VideoProjectResponse)
async def get_project(
    project_id: UUID,
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
) -> VideoProjectResponse:
    """Get a video project by ID."""
    user_id = get_user_id(payload)
    project = await _get_project_for_user(project_id, user_id, db)
    return _project_to_response(project)


@router.put("/projects/{project_id}", response_model=VideoProjectResponse)
async def update_project(
    project_id: UUID,
    body: VideoProjectUpdate,
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
) -> VideoProjectResponse:
    """Update a video project (including saving timeline data)."""
    user_id = get_user_id(payload)
    project = await _get_project_for_user(project_id, user_id, db)

    if body.name is not None:
        project.name = body.name
    if body.description is not None:
        project.description = body.description
    if body.timeline_data is not None:
        project.timeline_data = body.timeline_data
    if body.settings is not None:
        project.settings = body.settings.model_dump()
    if body.duration_seconds is not None:
        project.duration_seconds = body.duration_seconds
    if body.status is not None:
        project.status = body.status

    await db.commit()
    await db.refresh(project)
    return _project_to_response(project)


@router.delete("/projects/{project_id}", status_code=204)
async def delete_project(
    project_id: UUID,
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
) -> None:
    """Soft-delete a video project."""
    user_id = get_user_id(payload)
    project = await _get_project_for_user(project_id, user_id, db)

    project.is_deleted = True
    project.deleted_at = datetime.now(timezone.utc)
    await db.commit()


# ---------------------------------------------------------------------------
# Media
# ---------------------------------------------------------------------------


@router.post(
    "/projects/{project_id}/media",
    response_model=MediaAssetResponse,
    status_code=201,
)
async def upload_media(
    project_id: UUID,
    file: UploadFile = File(...),
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
) -> MediaAssetResponse:
    """Upload a media file (video, audio, image) to a project."""
    user_id = get_user_id(payload)
    project = await _get_project_for_user(project_id, user_id, db)

    # Create DB record first to get ID for storage path
    mime = file.content_type or mimetypes.guess_type(file.filename or "file")[0] or "application/octet-stream"
    media_type = get_media_type(mime)
    safe_name = _sanitize_filename(file.filename or "upload")

    asset = MediaAsset(
        user_id=user_id,
        video_project_id=project.id,
        filename=safe_name,
        file_path="",  # set after save
        media_type=media_type,
        mime_type=mime,
    )
    db.add(asset)
    await db.flush()  # get ID

    # Save file to disk in chunks to avoid memory exhaustion
    asset_id = str(asset.id)
    media_dir = get_project_media_dir(str(project_id), asset_id)
    file_path = os.path.join(media_dir, safe_name)

    total_bytes = 0
    async with aiofiles.open(file_path, "wb") as f:
        while chunk := await file.read(1024 * 1024):  # 1 MB chunks
            total_bytes += len(chunk)
            if total_bytes > MAX_UPLOAD_BYTES:
                try:
                    os.remove(file_path)
                except OSError:
                    pass
                raise HTTPException(
                    status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                    detail=f"File exceeds maximum size of {MAX_UPLOAD_BYTES // (1024 * 1024)} MB",
                )
            await f.write(chunk)

    asset.file_path = file_path
    asset.file_size_bytes = total_bytes

    # Probe metadata with ffprobe
    try:
        probe_data = await probe_media(file_path)
        asset.duration_seconds = probe_data.get("duration")
        asset.width = probe_data.get("width")
        asset.height = probe_data.get("height")
        asset.asset_metadata = probe_data
    except Exception as e:
        logger.warning("ffprobe failed for %s: %s", file_path, e)

    # Extract thumbnail for video files
    if media_type == "video":
        thumb_path = os.path.join(media_dir, f"{asset_id}.thumb.jpg")
        try:
            ok = await extract_thumbnail(file_path, thumb_path)
            if ok:
                asset.thumbnail_path = thumb_path
        except Exception as e:
            logger.warning("Thumbnail extraction failed: %s", e)

    await db.commit()
    await db.refresh(asset)
    return _asset_to_response(asset)


@router.get(
    "/projects/{project_id}/media",
    response_model=MediaAssetListResponse,
)
async def list_media(
    project_id: UUID,
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
) -> MediaAssetListResponse:
    """List media assets for a project."""
    user_id = get_user_id(payload)
    await _get_project_for_user(project_id, user_id, db)

    stmt = (
        select(MediaAsset)
        .where(
            MediaAsset.video_project_id == project_id,
            MediaAsset.is_deleted == False,  # noqa: E712
        )
        .order_by(MediaAsset.created_at.desc())
    )
    result = await db.execute(stmt)
    assets = result.scalars().all()

    return MediaAssetListResponse(
        assets=[_asset_to_response(a) for a in assets],
        count=len(assets),
    )


@router.delete("/media/{media_id}", status_code=204)
async def delete_media(
    media_id: UUID,
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
) -> None:
    """Delete a media asset."""
    user_id = get_user_id(payload)

    result = await db.execute(
        select(MediaAsset).where(
            MediaAsset.id == media_id,
            MediaAsset.is_deleted == False,  # noqa: E712
        )
    )
    asset = result.scalar_one_or_none()
    if asset is None:
        raise HTTPException(status_code=404, detail="Media asset not found")
    if asset.user_id != user_id:
        raise HTTPException(status_code=403, detail="Access denied")

    asset.is_deleted = True
    await db.commit()

    # Clean up files
    asset_dir = os.path.dirname(asset.file_path)
    if os.path.isdir(asset_dir):
        try:
            shutil.rmtree(asset_dir)
        except OSError:
            logger.warning("Failed to remove asset directory %s", asset_dir)


@router.get("/media/{media_id}/file")
async def get_media_file(
    media_id: UUID,
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
) -> FileResponse:
    """Stream/download a media file."""
    user_id = get_user_id(payload)

    result = await db.execute(
        select(MediaAsset).where(
            MediaAsset.id == media_id,
            MediaAsset.is_deleted == False,  # noqa: E712
        )
    )
    asset = result.scalar_one_or_none()
    if asset is None:
        raise HTTPException(status_code=404, detail="Media asset not found")
    if asset.user_id != user_id:
        raise HTTPException(status_code=403, detail="Access denied")

    if not os.path.isfile(asset.file_path):
        raise HTTPException(status_code=404, detail="File not found on disk")

    content_type = asset.mime_type or "application/octet-stream"
    return FileResponse(
        path=asset.file_path,
        media_type=content_type,
        filename=asset.filename,
    )


# ---------------------------------------------------------------------------
# Screen Recording (same as media upload, auto-tagged)
# ---------------------------------------------------------------------------


@router.post(
    "/projects/{project_id}/recordings",
    response_model=MediaAssetResponse,
    status_code=201,
)
async def upload_recording(
    project_id: UUID,
    file: UploadFile = File(...),
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
) -> MediaAssetResponse:
    """Upload a screen recording to a project (same as media, auto-tagged as recording)."""
    user_id = get_user_id(payload)
    project = await _get_project_for_user(project_id, user_id, db)

    mime = file.content_type or "video/webm"
    safe_name = _sanitize_filename(file.filename or "recording.webm")

    asset = MediaAsset(
        user_id=user_id,
        video_project_id=project.id,
        filename=safe_name,
        file_path="",
        media_type="video",
        mime_type=mime,
        asset_metadata={"source": "screen_recording"},
    )
    db.add(asset)
    await db.flush()

    asset_id = str(asset.id)
    media_dir = get_project_media_dir(str(project_id), asset_id)
    file_path = os.path.join(media_dir, safe_name)

    total_bytes = 0
    async with aiofiles.open(file_path, "wb") as f:
        while chunk := await file.read(1024 * 1024):
            total_bytes += len(chunk)
            if total_bytes > MAX_UPLOAD_BYTES:
                try:
                    os.remove(file_path)
                except OSError:
                    pass
                raise HTTPException(
                    status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                    detail=f"File exceeds maximum size of {MAX_UPLOAD_BYTES // (1024 * 1024)} MB",
                )
            await f.write(chunk)

    asset.file_path = file_path
    asset.file_size_bytes = total_bytes

    try:
        probe_data = await probe_media(file_path)
        asset.duration_seconds = probe_data.get("duration")
        asset.width = probe_data.get("width")
        asset.height = probe_data.get("height")
        if asset.asset_metadata:
            asset.asset_metadata = {**asset.asset_metadata, **probe_data}
        else:
            asset.asset_metadata = probe_data
    except Exception as e:
        logger.warning("ffprobe failed for recording: %s", e)

    await db.commit()
    await db.refresh(asset)
    return _asset_to_response(asset)


# ---------------------------------------------------------------------------
# Export
# ---------------------------------------------------------------------------


@router.post(
    "/projects/{project_id}/export",
    response_model=VideoExportResponse,
    status_code=201,
)
async def start_export(
    project_id: UUID,
    body: ExportRequest,
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
) -> VideoExportResponse:
    """Start an export job for a video project."""
    from arq import create_pool
    from app.worker import get_redis_settings

    user_id = get_user_id(payload)
    project = await _get_project_for_user(project_id, user_id, db)

    export = VideoExport(
        video_project_id=project.id,
        user_id=user_id,
        status="pending",
        format=body.format,
        resolution=body.resolution,
        export_settings=body.export_settings,
        timeline_snapshot=project.timeline_data,
    )
    db.add(export)
    await db.commit()
    await db.refresh(export)

    export_id = str(export.id)

    # Enqueue worker task
    redis = None
    try:
        redis = await create_pool(get_redis_settings())
        await redis.enqueue_job("export_video_task", export_id)
        logger.info("Enqueued video export task for %s", export_id)
    except Exception as exc:
        logger.exception("Failed to enqueue export task: %s", exc)
        export.status = "failed"
        export.error_message = f"Failed to enqueue task: {exc}"
        await db.commit()
        raise HTTPException(
            status_code=502,
            detail="Failed to enqueue export task.",
        ) from exc
    finally:
        if redis is not None:
            await redis.close()

    return _export_to_response(export)


@router.get("/exports/{export_id}", response_model=VideoExportResponse)
async def get_export_status(
    export_id: UUID,
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
) -> VideoExportResponse:
    """Get export job status."""
    user_id = get_user_id(payload)

    result = await db.execute(
        select(VideoExport).where(VideoExport.id == export_id)
    )
    export = result.scalar_one_or_none()
    if export is None:
        raise HTTPException(status_code=404, detail="Export not found")
    if export.user_id != user_id:
        raise HTTPException(status_code=403, detail="Access denied")

    return _export_to_response(export)


@router.get("/exports/{export_id}/download")
async def download_export(
    export_id: UUID,
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
) -> FileResponse:
    """Download a completed export."""
    user_id = get_user_id(payload)

    result = await db.execute(
        select(VideoExport).where(VideoExport.id == export_id)
    )
    export = result.scalar_one_or_none()
    if export is None:
        raise HTTPException(status_code=404, detail="Export not found")
    if export.user_id != user_id:
        raise HTTPException(status_code=403, detail="Access denied")
    if export.status != "completed":
        raise HTTPException(
            status_code=400,
            detail=f"Export is not completed (status: {export.status})",
        )
    if not export.file_path or not os.path.isfile(export.file_path):
        raise HTTPException(status_code=404, detail="Export file not found on disk")

    if export.format == "html":
        return FileResponse(
            path=export.file_path,
            media_type="text/html",
            filename=f"export-{export_id}.html",
        )

    return FileResponse(
        path=export.file_path,
        media_type="video/mp4",
        filename=f"export-{export_id}.mp4",
    )


# ---------------------------------------------------------------------------
# Transcription (Speech Recognition)
# ---------------------------------------------------------------------------


@router.post("/projects/{project_id}/transcribe")
async def transcribe_media(
    project_id: UUID,
    media_asset_id: UUID = Query(..., description="ID of the audio/video asset to transcribe"),
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
):
    """Transcribe an audio/video media asset using Whisper.

    Returns a list of subtitle segments with start_time, end_time, and text.
    """
    from app.services.ffmpeg_service import transcribe_audio

    user_id = get_user_id(payload)
    await _get_project_for_user(project_id, user_id, db)

    result = await db.execute(
        select(MediaAsset).where(
            MediaAsset.id == media_asset_id,
            MediaAsset.video_project_id == project_id,
            MediaAsset.is_deleted == False,
        )
    )
    asset = result.scalar_one_or_none()
    if asset is None:
        raise HTTPException(status_code=404, detail="Media asset not found")

    if asset.media_type not in ("video", "audio"):
        raise HTTPException(
            status_code=400,
            detail="Transcription requires a video or audio asset",
        )

    if not asset.file_path or not os.path.isfile(asset.file_path):
        raise HTTPException(status_code=404, detail="Media file not found on disk")

    try:
        segments = await transcribe_audio(asset.file_path)
    except Exception as exc:
        logger.exception("Transcription failed for asset %s: %s", media_asset_id, exc)
        raise HTTPException(
            status_code=500,
            detail=f"Transcription failed: {str(exc)[:200]}",
        ) from exc

    return {"segments": segments, "media_asset_id": str(media_asset_id)}
