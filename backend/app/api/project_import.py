"""API endpoints for project import, export, clone, and snapshots."""

import logging
import os
import tempfile
from typing import Optional
from uuid import UUID

from arq import create_pool
from pydantic import BaseModel
from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    UploadFile,
    status,
)
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.context_deps import (
    get_current_user_payload,
    get_sandbox_manager,
    validate_project_access,
    validate_project_access_with_template,
)
from app.auth import get_user_id
from app.database import get_db_session
from app.models.project import Project
from app.models.project_import import ProjectImport
from app.schemas.project_import import (
    ArchiveUploadResponse,
    CloneProjectRequest,
    CloneProjectResponse,
    DetectionResultResponse,
    GitImportRequest,
    GitImportResponse,
    ImportStatusResponse,
    SnapshotCreateRequest,
    SnapshotInfo,
    SnapshotListResponse,
    SnapshotRestoreResponse,
    WebsiteImportRequest,
    WebsiteImportResponse,
)
from app.services.project_detector import ProjectDetector
from app.services.sandbox_manager import SandboxManager
from app.worker import get_redis_settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/projects", tags=["projects"])

UPLOAD_DIR = os.getenv("IMPORT_UPLOAD_DIR", "/var/lib/app/import_uploads")
ALLOWED_ARCHIVE_EXTENSIONS = {".zip", ".tar", ".tar.gz", ".tgz", ".tar.bz2"}


# -------------------------------------------------------------------------
# Git Import
# -------------------------------------------------------------------------


@router.post(
    "/import/git",
    response_model=GitImportResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def import_from_git(
    data: GitImportRequest,
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
) -> GitImportResponse:
    """Start an async git clone import."""
    user_id = get_user_id(payload)

    # Create project
    project = Project(
        name=data.name,
        path=data.path or data.name.lower().replace(" ", "-"),
        user_id=user_id,
        type="importing",
    )
    db.add(project)
    await db.flush()

    # Create import record
    import_record = ProjectImport(
        user_id=user_id,
        project_id=project.id,
        import_type="git",
        source_url=data.git_url,
        status="pending",
        progress_message="Queued for import",
        import_options={
            "branch": data.branch,
            "install_deps": data.install_deps,
        },
    )
    db.add(import_record)
    await db.commit()
    await db.refresh(import_record)
    await db.refresh(project)

    # Enqueue ARQ task
    try:
        pool = await create_pool(get_redis_settings())
        try:
            await pool.enqueue_job("import_git_project_task", str(import_record.id))
        finally:
            await pool.close()
    except Exception as exc:
        logger.error("Failed to enqueue git import: %s", exc)
        import_record.status = "failed"
        import_record.error_message = f"Failed to enqueue task: {exc}"
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to start import job",
        )

    return GitImportResponse(
        import_id=str(import_record.id),
        project_id=str(project.id),
        status="pending",
        message="Git import queued",
    )


# -------------------------------------------------------------------------
# Archive Upload Import
# -------------------------------------------------------------------------


@router.post(
    "/import/upload",
    response_model=ArchiveUploadResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def import_from_archive(
    name: str = Form(...),
    file: UploadFile = File(...),
    install_deps: bool = Form(True),
    path: str = Form(None),
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
) -> ArchiveUploadResponse:
    """Upload an archive and start async import."""
    user_id = get_user_id(payload)

    # Validate filename
    filename = file.filename or ""
    ext = _get_archive_ext(filename)
    if ext not in ALLOWED_ARCHIVE_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported archive format. Allowed: {', '.join(sorted(ALLOWED_ARCHIVE_EXTENSIONS))}",
        )

    # Save upload to disk by streaming chunks to avoid loading entire file in memory
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    _fd, temp_path = tempfile.mkstemp(dir=UPLOAD_DIR, suffix=ext)
    os.close(_fd)  # Close the low-level fd; we'll write via aiofiles

    import aiofiles

    CHUNK_SIZE = 64 * 1024  # 64KB
    MAX_UPLOAD_SIZE = 500 * 1024 * 1024  # 500MB
    try:
        total_bytes = 0
        async with aiofiles.open(temp_path, "wb") as out_f:
            while True:
                chunk = await file.read(CHUNK_SIZE)
                if not chunk:
                    break
                total_bytes += len(chunk)
                if total_bytes > MAX_UPLOAD_SIZE:
                    raise HTTPException(
                        status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                        detail=f"File too large. Maximum upload size is {MAX_UPLOAD_SIZE // (1024 * 1024)}MB",
                    )
                await out_f.write(chunk)
        os.chmod(temp_path, 0o600)
    except Exception:
        # Clean up on write or chmod failure
        try:
            os.remove(temp_path)
        except OSError:
            pass
        raise

    # Create project
    project = Project(
        name=name,
        path=path or name.lower().replace(" ", "-"),
        user_id=user_id,
        type="importing",
    )
    db.add(project)
    await db.flush()

    # Create import record
    import_record = ProjectImport(
        user_id=user_id,
        project_id=project.id,
        import_type="upload",
        source_url=filename,
        status="pending",
        progress_message="Queued for import",
        import_options={
            "install_deps": install_deps,
        },
    )
    db.add(import_record)
    await db.commit()
    await db.refresh(import_record)
    await db.refresh(project)

    # Enqueue ARQ task
    try:
        pool = await create_pool(get_redis_settings())
        try:
            await pool.enqueue_job(
                "import_archive_project_task", str(import_record.id), temp_path
            )
        finally:
            await pool.close()
    except Exception as exc:
        logger.error("Failed to enqueue archive import: %s", exc)
        import_record.status = "failed"
        import_record.error_message = f"Failed to enqueue task: {exc}"
        await db.commit()
        # Clean up temp file
        try:
            os.remove(temp_path)
        except OSError:
            pass
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to start import job",
        )

    return ArchiveUploadResponse(
        import_id=str(import_record.id),
        project_id=str(project.id),
        status="pending",
        message="Archive import queued",
    )


# -------------------------------------------------------------------------
# Website Import
# -------------------------------------------------------------------------


@router.post(
    "/import/website",
    response_model=WebsiteImportResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def import_from_website(
    data: WebsiteImportRequest,
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
) -> WebsiteImportResponse:
    """Mirror a website into a new project using an async worker job."""
    user_id = get_user_id(payload)

    project = Project(
        name=data.name,
        path=data.path or data.name.lower().replace(" ", "-"),
        user_id=user_id,
        type="importing",
    )
    db.add(project)
    await db.flush()

    import_record = ProjectImport(
        user_id=user_id,
        project_id=project.id,
        import_type="website",
        source_url=data.website_url,
        status="pending",
        progress_message="Queued for website import",
        import_options={
            "depth": data.depth,
            "include_assets": data.include_assets,
            "same_domain_only": data.same_domain_only,
            "install_deps": data.install_deps,
            "max_pages": data.max_pages,
            "strategy": data.strategy,
        },
    )
    db.add(import_record)
    await db.commit()
    await db.refresh(import_record)
    await db.refresh(project)

    try:
        pool = await create_pool(get_redis_settings())
        try:
            await pool.enqueue_job("import_website_project_task", str(import_record.id))
        finally:
            await pool.close()
    except Exception as exc:
        logger.error("Failed to enqueue website import: %s", exc)
        import_record.status = "failed"
        import_record.error_message = f"Failed to enqueue task: {exc}"
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to start website import job",
        )

    return WebsiteImportResponse(
        import_id=str(import_record.id),
        project_id=str(project.id),
        status="pending",
        message="Website import queued",
    )


# -------------------------------------------------------------------------
# Import Status Polling
# -------------------------------------------------------------------------


@router.get(
    "/import/{import_id}/status",
    response_model=ImportStatusResponse,
)
async def get_import_status(
    import_id: UUID,
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
) -> ImportStatusResponse:
    """Poll the status of an import job."""
    user_id = get_user_id(payload)

    result = await db.execute(
        select(ProjectImport).where(ProjectImport.id == import_id)
    )
    record = result.scalar_one_or_none()
    if record is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Import not found",
        )

    # Verify ownership
    if str(record.user_id) != str(user_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have access to this import",
        )

    return ImportStatusResponse(
        import_id=str(record.id),
        project_id=str(record.project_id),
        import_type=record.import_type,
        source_url=record.source_url,
        status=record.status,
        detected_type=record.detected_type,
        detected_template_id=record.detected_template_id,
        progress_message=record.progress_message,
        error_message=record.error_message,
        import_options=record.import_options or {},
        created_at=record.created_at,
        updated_at=record.updated_at,
    )


# -------------------------------------------------------------------------
# Project Type Detection
# -------------------------------------------------------------------------


@router.post(
    "/{project_id}/detect-type",
    response_model=DetectionResultResponse,
)
async def detect_project_type(
    project_id: UUID,
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
    sandbox: SandboxManager = Depends(get_sandbox_manager),
) -> DetectionResultResponse:
    """Detect the project type from container files."""
    user_id = get_user_id(payload)
    template_id = await validate_project_access_with_template(project_id, user_id, db)

    container_id = await sandbox.get_or_create_container(project_id, template_id=template_id)
    detection = await ProjectDetector.detect_from_container(sandbox, container_id)

    return DetectionResultResponse(
        project_type=detection.project_type,
        framework=detection.framework,
        suggested_template_id=detection.suggested_template_id,
        confidence=detection.confidence,
    )


# -------------------------------------------------------------------------
# Export
# -------------------------------------------------------------------------


@router.post("/{project_id}/export")
async def export_project(
    project_id: UUID,
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
    sandbox: SandboxManager = Depends(get_sandbox_manager),
):
    """Stream the workspace as a tar download."""
    user_id = get_user_id(payload)
    template_id = await validate_project_access_with_template(project_id, user_id, db)

    # Ensure container is running
    await sandbox.get_or_create_container(project_id, template_id=template_id)

    return StreamingResponse(
        sandbox.export_workspace_streaming(project_id),
        media_type="application/x-tar",
        headers={
            "Content-Disposition": f'attachment; filename="project-{str(project_id)[:8]}.tar"'
        },
    )


# -------------------------------------------------------------------------
# Clone
# -------------------------------------------------------------------------


@router.post(
    "/{project_id}/clone",
    response_model=CloneProjectResponse,
    status_code=status.HTTP_201_CREATED,
)
async def clone_project(
    project_id: UUID,
    data: CloneProjectRequest,
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
    sandbox: SandboxManager = Depends(get_sandbox_manager),
) -> CloneProjectResponse:
    """Clone a project with its workspace data."""
    user_id = get_user_id(payload)
    await validate_project_access(project_id, user_id, db)

    # Load source project for type info
    src_result = await db.execute(
        select(Project).where(Project.id == project_id)
    )
    src_project = src_result.scalar_one()

    # Create new project
    new_project = Project(
        name=data.name,
        path=data.path or data.name.lower().replace(" ", "-"),
        user_id=user_id,
        type=src_project.type,
    )
    db.add(new_project)
    await db.commit()
    await db.refresh(new_project)

    # Clone volume data
    try:
        await sandbox.clone_volume(project_id, new_project.id)
    except Exception as exc:
        logger.error("Failed to clone volume for project %s: %s", new_project.id, exc)
        await db.delete(new_project)
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to clone project volume: {exc}",
        ) from exc

    return CloneProjectResponse(
        project_id=str(new_project.id),
        name=new_project.name,
        message="Project cloned successfully",
    )


# -------------------------------------------------------------------------
# Snapshots
# -------------------------------------------------------------------------


@router.post(
    "/{project_id}/snapshots",
    response_model=SnapshotInfo,
    status_code=status.HTTP_201_CREATED,
)
async def create_snapshot(
    project_id: UUID,
    data: SnapshotCreateRequest,
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
    sandbox: SandboxManager = Depends(get_sandbox_manager),
) -> SnapshotInfo:
    """Create a named snapshot of the project container."""
    import re as _re
    user_id = get_user_id(payload)
    await validate_project_access(project_id, user_id, db)

    # Sanitize snapshot_name to prevent Docker image name injection
    safe_name = _re.sub(r"[^a-zA-Z0-9_-]", "-", data.name.strip())
    if not safe_name:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid snapshot name")

    image_id = await sandbox.create_snapshot(project_id, safe_name)

    return SnapshotInfo(
        name=safe_name,
        image_id=image_id,
    )


@router.get(
    "/{project_id}/snapshots",
    response_model=SnapshotListResponse,
)
async def list_snapshots(
    project_id: UUID,
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
    sandbox: SandboxManager = Depends(get_sandbox_manager),
) -> SnapshotListResponse:
    """List all snapshots for a project."""
    user_id = get_user_id(payload)
    await validate_project_access(project_id, user_id, db)

    snapshots = await sandbox.list_snapshots(project_id)
    return SnapshotListResponse(
        project_id=str(project_id),
        snapshots=[SnapshotInfo(**s) for s in snapshots],
    )


@router.post(
    "/{project_id}/snapshots/{snapshot_name}/restore",
    response_model=SnapshotRestoreResponse,
)
async def restore_snapshot(
    project_id: UUID,
    snapshot_name: str,
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
    sandbox: SandboxManager = Depends(get_sandbox_manager),
) -> SnapshotRestoreResponse:
    """Restore a container from a named snapshot."""
    import re as _re
    user_id = get_user_id(payload)
    await validate_project_access(project_id, user_id, db)

    # Sanitize snapshot_name to prevent Docker image name injection
    snapshot_name = _re.sub(r"[^a-zA-Z0-9_-]", "-", snapshot_name.strip())
    if not snapshot_name:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid snapshot name")

    try:
        container_id = await sandbox.restore_snapshot(project_id, snapshot_name)
    except RuntimeError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e),
        )

    return SnapshotRestoreResponse(
        project_id=str(project_id),
        snapshot_name=snapshot_name,
        container_id=container_id,
        message=f"Restored snapshot '{snapshot_name}'",
    )


@router.delete(
    "/{project_id}/snapshots/{snapshot_name}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_snapshot(
    project_id: UUID,
    snapshot_name: str,
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
    sandbox: SandboxManager = Depends(get_sandbox_manager),
) -> None:
    """Delete a named snapshot."""
    import re as _re
    user_id = get_user_id(payload)
    await validate_project_access(project_id, user_id, db)

    # Sanitize snapshot_name to prevent Docker image name injection
    snapshot_name = _re.sub(r"[^a-zA-Z0-9_-]", "-", snapshot_name.strip())
    if not snapshot_name:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid snapshot name")

    try:
        await sandbox.delete_snapshot(project_id, snapshot_name)
    except RuntimeError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e),
        )


# -------------------------------------------------------------------------
# Docker Image Export
# -------------------------------------------------------------------------


class DockerExportRequest(BaseModel):
    image_name: Optional[str] = None
    include_compose: bool = True
    include_tar: bool = False


class DockerExportResponse(BaseModel):
    image_id: str
    image_name: str
    compose_file: Optional[str] = None
    tar_download_url: Optional[str] = None


@router.post(
    "/{project_id}/export-docker",
    response_model=DockerExportResponse,
)
async def export_as_docker_image(
    project_id: UUID,
    data: DockerExportRequest,
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
    sandbox: SandboxManager = Depends(get_sandbox_manager),
) -> DockerExportResponse:
    """Export a project as a portable Docker image with optional compose file."""
    user_id = get_user_id(payload)
    template_id = await validate_project_access_with_template(
        project_id, user_id, db
    )

    try:
        result = await sandbox.export_as_docker_image(
            project_id,
            image_name=data.image_name,
            include_compose=data.include_compose,
            include_tar=data.include_tar,
            template_id=template_id,
        )
    except RuntimeError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )

    return DockerExportResponse(**result)


@router.get("/{project_id}/export-docker/{image_id}/download")
async def download_docker_tar(
    project_id: UUID,
    image_id: str,
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
    sandbox: SandboxManager = Depends(get_sandbox_manager),
):
    """Download a Docker image as a tar archive."""
    import re
    user_id = get_user_id(payload)
    await validate_project_access(project_id, user_id, db)

    # Validate image_id format strictly as sha256 digest
    if not re.fullmatch(r"^sha256:[0-9a-f]+$", image_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid image ID format",
        )

    if not await sandbox.is_exported_image_owned_by_project(project_id, image_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Image not found for this project",
        )

    try:
        return StreamingResponse(
            sandbox.export_docker_tar_streaming(image_id),
            media_type="application/x-tar",
            headers={
                "Content-Disposition": f'attachment; filename="{image_id[:12]}.tar"',
            },
        )
    except RuntimeError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e),
        )


# -------------------------------------------------------------------------
# Helpers
# -------------------------------------------------------------------------


def _get_archive_ext(filename: str) -> str:
    """Extract the archive extension from a filename."""
    lower = filename.lower()
    for ext in (".tar.gz", ".tar.bz2"):
        if lower.endswith(ext):
            return ext
    return os.path.splitext(lower)[1]
