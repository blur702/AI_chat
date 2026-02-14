"""
Sandbox file system API endpoints.

Provides REST endpoints for file tree listing, file read/write,
and directory/file CRUD operations inside Docker sandbox containers.
"""

import difflib
import logging
import os
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user_payload
from app.api.context_deps import get_sandbox_manager, validate_project_access_with_template
from app.database import get_db_session
from app.models.yolo_edit import YoloEdit
from app.schemas.sandbox import (
    DirectoryCreateRequest,
    FileContentResponse,
    FileCreateRequest,
    FileNodeResponse,
    FileRenameRequest,
    FileTreeResponse,
    FileUpdateRequest,
    SandboxStopResponse,
)
from app.services.sandbox_manager import SandboxManager

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/sandbox", tags=["sandbox"])

# File extension -> Monaco language mapping
EXTENSION_LANGUAGE_MAP = {
    ".py": "python",
    ".js": "javascript",
    ".jsx": "javascript",
    ".ts": "typescript",
    ".tsx": "typescript",
    ".json": "json",
    ".html": "html",
    ".htm": "html",
    ".css": "css",
    ".scss": "scss",
    ".less": "less",
    ".md": "markdown",
    ".yaml": "yaml",
    ".yml": "yaml",
    ".xml": "xml",
    ".sql": "sql",
    ".sh": "shell",
    ".bash": "shell",
    ".zsh": "shell",
    ".rs": "rust",
    ".go": "go",
    ".java": "java",
    ".c": "c",
    ".cpp": "cpp",
    ".h": "c",
    ".hpp": "cpp",
    ".rb": "ruby",
    ".php": "php",
    ".swift": "swift",
    ".kt": "kotlin",
    ".r": "r",
    ".lua": "lua",
    ".toml": "toml",
    ".ini": "ini",
    ".cfg": "ini",
    ".env": "shell",
    ".dockerfile": "dockerfile",
    ".graphql": "graphql",
    ".vue": "html",
    ".svelte": "html",
}


def _detect_language(file_path: str) -> str:
    """Detect editor language from file extension."""
    name = file_path.lower()
    # Handle special filenames
    basename = os.path.basename(name)
    if basename in ("dockerfile", "makefile", "jenkinsfile"):
        return "dockerfile" if basename == "dockerfile" else "plaintext"
    _, ext = os.path.splitext(name)
    return EXTENSION_LANGUAGE_MAP.get(ext, "plaintext")


def _sanitize_path(path: str) -> str:
    """Sanitize a file path to prevent directory traversal and shell injection.

    Raises HTTPException if the path is unsafe.
    Returns the cleaned path.
    """
    # Normalize the path
    clean = os.path.normpath(path).replace("\\", "/")
    # Strip leading slashes
    clean = clean.lstrip("/")
    # Check for directory traversal
    if ".." in clean.split("/"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Path traversal not allowed",
        )
    if not clean or clean == ".":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid path",
        )
    # Reject null bytes and control characters
    if "\x00" in clean or any(ord(c) < 32 for c in clean):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Path contains invalid characters",
        )
    return clean


def _build_tree(flat_items: list[dict]) -> list[FileNodeResponse]:
    """Build a hierarchical file tree from a flat list of file entries."""
    # Build a lookup of path -> node
    nodes: dict[str, FileNodeResponse] = {}
    roots: list[FileNodeResponse] = []

    # Sort by path to ensure parents are processed before children
    flat_items.sort(key=lambda x: x["path"])

    for item in flat_items:
        node = FileNodeResponse(
            name=item["name"],
            type=item["type"],
            path=item["path"],
            size=item.get("size"),
            modified_at=item.get("modified_at"),
            children=[] if item["type"] == "directory" else None,
        )
        nodes[item["path"]] = node

        # Find parent path
        parent_path = item["path"].rsplit("/", 1)[0] if "/" in item["path"] else ""

        if parent_path and parent_path in nodes:
            parent = nodes[parent_path]
            if parent.children is not None:
                parent.children.append(node)
        else:
            roots.append(node)

    return roots


def _extract_user_id(payload: dict) -> str:
    """Extract and validate user_id from JWT payload. Raises 401 if missing."""
    user_id = payload.get("user_id")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token: missing user_id",
        )
    return user_id


# -------------------------------------------------------------------------
# Endpoints
# -------------------------------------------------------------------------


@router.post("/{project_id}/stop", response_model=SandboxStopResponse)
async def stop_sandbox(
    project_id: UUID,
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
    sm: SandboxManager = Depends(get_sandbox_manager),
) -> SandboxStopResponse:
    """Stop and remove the sandbox container for a project."""
    user_id = _extract_user_id(payload)
    await validate_project_access_with_template(project_id, user_id, db)

    if not sm.is_running:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="SandboxManager is not running",
        )

    stopped = await sm.stop_container(project_id)
    return SandboxStopResponse(project_id=str(project_id), stopped=stopped)


@router.get("/{project_id}/files", response_model=FileTreeResponse)
async def list_files(
    project_id: UUID,
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
    sm: SandboxManager = Depends(get_sandbox_manager),
):
    """List the file tree for a project sandbox."""
    user_id = _extract_user_id(payload)
    template_id = await validate_project_access_with_template(project_id, user_id, db)

    container_id = await sm.get_or_create_container(project_id, template_id=template_id)
    flat_items = await sm.list_directory_recursive(container_id)
    tree = _build_tree(flat_items)

    return FileTreeResponse(files=tree, total=len(flat_items))


@router.get("/{project_id}/files/content", response_model=FileContentResponse)
async def get_file_content(
    project_id: UUID,
    path: str = Query(..., description="File path relative to /workspace"),
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
    sm: SandboxManager = Depends(get_sandbox_manager),
):
    """Read the content of a file in the sandbox."""
    user_id = _extract_user_id(payload)
    template_id = await validate_project_access_with_template(project_id, user_id, db)

    clean_path = _sanitize_path(path)
    abs_path = f"/workspace/{clean_path}"

    container_id = await sm.get_or_create_container(project_id, template_id=template_id)

    try:
        content = await sm.read_file(container_id, abs_path)
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"File not found: {clean_path}",
        ) from exc

    language = _detect_language(clean_path)
    return FileContentResponse(path=clean_path, content=content, language=language)


@router.post("/{project_id}/files", response_model=FileNodeResponse, status_code=201)
async def create_file(
    project_id: UUID,
    body: FileCreateRequest,
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
    sm: SandboxManager = Depends(get_sandbox_manager),
):
    """Create a new file in the sandbox."""
    user_id = _extract_user_id(payload)
    template_id = await validate_project_access_with_template(project_id, user_id, db)

    clean_path = _sanitize_path(body.path)
    abs_path = f"/workspace/{clean_path}"

    container_id = await sm.get_or_create_container(project_id, template_id=template_id)

    # Check if file already exists
    if await sm.file_exists(container_id, abs_path):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"File already exists: {clean_path}",
        )

    await sm.write_file(container_id, abs_path, body.content)

    name = clean_path.rsplit("/", 1)[-1] if "/" in clean_path else clean_path
    return FileNodeResponse(name=name, type="file", path=clean_path, size=len(body.content))


@router.post("/{project_id}/directories", response_model=FileNodeResponse, status_code=201)
async def create_directory(
    project_id: UUID,
    body: DirectoryCreateRequest,
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
    sm: SandboxManager = Depends(get_sandbox_manager),
):
    """Create a new directory in the sandbox."""
    user_id = _extract_user_id(payload)
    template_id = await validate_project_access_with_template(project_id, user_id, db)

    clean_path = _sanitize_path(body.path)
    abs_path = f"/workspace/{clean_path}"

    container_id = await sm.get_or_create_container(project_id, template_id=template_id)
    await sm.create_directory(container_id, abs_path)

    name = clean_path.rsplit("/", 1)[-1] if "/" in clean_path else clean_path
    return FileNodeResponse(name=name, type="directory", path=clean_path)


@router.put("/{project_id}/files", response_model=FileNodeResponse)
async def update_file(
    project_id: UUID,
    body: FileUpdateRequest,
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
    sm: SandboxManager = Depends(get_sandbox_manager),
):
    """Update the content of a file in the sandbox."""
    user_id = _extract_user_id(payload)
    template_id = await validate_project_access_with_template(project_id, user_id, db)

    clean_path = _sanitize_path(body.path)
    abs_path = f"/workspace/{clean_path}"

    container_id = await sm.get_or_create_container(project_id, template_id=template_id)

    if not await sm.file_exists(container_id, abs_path):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"File not found: {clean_path}",
        )

    # Capture old content for undo tracking
    try:
        old_content = await sm.read_file(container_id, abs_path)
    except Exception:
        old_content = None

    await sm.write_file(container_id, abs_path, body.content)

    # Record edit for undo history (store diff instead of full new_content)
    if old_content is not None:
        try:
            diff = "\n".join(
                difflib.unified_diff(
                    old_content.splitlines(),
                    body.content.splitlines(),
                    fromfile=f"a/{clean_path}",
                    tofile=f"b/{clean_path}",
                    lineterm="",
                )
            )
            edit = YoloEdit(
                project_id=project_id,
                files_modified=[clean_path],
                undo_data={
                    "files": {
                        clean_path: {
                            "old_content": old_content,
                            "diff": diff,
                        }
                    }
                },
                undo_performed=False,
            )
            db.add(edit)
            await db.commit()
        except Exception as exc:
            logger.warning("Failed to record yolo edit for %s: %s", clean_path, exc)
            try:
                await db.rollback()
            except Exception:
                pass

    name = clean_path.rsplit("/", 1)[-1] if "/" in clean_path else clean_path
    return FileNodeResponse(name=name, type="file", path=clean_path, size=len(body.content))


@router.put("/{project_id}/files/rename", response_model=FileNodeResponse)
async def rename_file(
    project_id: UUID,
    body: FileRenameRequest,
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
    sm: SandboxManager = Depends(get_sandbox_manager),
):
    """Rename or move a file/directory in the sandbox."""
    user_id = _extract_user_id(payload)
    template_id = await validate_project_access_with_template(project_id, user_id, db)

    old_clean = _sanitize_path(body.old_path)
    new_clean = _sanitize_path(body.new_path)
    old_abs = f"/workspace/{old_clean}"
    new_abs = f"/workspace/{new_clean}"

    container_id = await sm.get_or_create_container(project_id, template_id=template_id)

    if not await sm.file_exists(container_id, old_abs):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Path not found: {old_clean}",
        )

    try:
        await sm.rename_path(container_id, old_abs, new_abs)
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc

    name = new_clean.rsplit("/", 1)[-1] if "/" in new_clean else new_clean
    node_type = "directory" if await sm.is_directory(container_id, new_abs) else "file"

    return FileNodeResponse(name=name, type=node_type, path=new_clean)


@router.delete("/{project_id}/files", status_code=204)
async def delete_file(
    project_id: UUID,
    path: str = Query(..., description="File path relative to /workspace"),
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
    sm: SandboxManager = Depends(get_sandbox_manager),
):
    """Delete a file or directory from the sandbox."""
    user_id = _extract_user_id(payload)
    template_id = await validate_project_access_with_template(project_id, user_id, db)

    clean_path = _sanitize_path(path)
    abs_path = f"/workspace/{clean_path}"

    container_id = await sm.get_or_create_container(project_id, template_id=template_id)

    if not await sm.file_exists(container_id, abs_path):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Path not found: {clean_path}",
        )

    await sm.delete_path(container_id, abs_path, recursive=True)
    return None
