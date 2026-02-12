"""API endpoints for Drupal MCP site management."""

import logging
from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.context_deps import (
    get_current_user_payload,
    get_db_session,
    get_drupal_mcp,
    get_sandbox_manager,
    validate_project_access,
)
from app.auth import get_user_id_from_token
from app.models.drupal_site import DrupalSite
from app.schemas.drupal import (
    DrupalConnectRequest,
    DrupalConnectResponse,
    DrupalSiteConfig,
    DrupalSiteResponse,
    DrushCommandRequest,
    DrushCommandResponse,
    SyncResponse,
    SyncStatusResponse,
)
from app.services.drupal_mcp import DrupalMCPService
from app.services.sandbox_manager import SandboxManager

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/drupal")


async def _get_drupal_site(
    project_id: UUID, db: AsyncSession
) -> DrupalSite:
    """Fetch the connected DrupalSite for a project, or raise 404."""
    result = await db.execute(
        select(DrupalSite).where(DrupalSite.project_id == project_id)
    )
    site = result.scalar_one_or_none()
    if site is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No Drupal site connected to this project",
        )
    return site


@router.post("/{project_id}/connect", response_model=DrupalConnectResponse)
async def connect_site(
    project_id: UUID,
    body: DrupalConnectRequest,
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
    drupal: DrupalMCPService = Depends(get_drupal_mcp),
):
    """Connect a remote Drupal site to a project."""
    user_id = get_user_id_from_token(payload)
    await validate_project_access(project_id, str(user_id), db)

    # Test connection first
    ok, msg = await drupal.test_connection(body.site_url, body.api_key)
    if not ok:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Connection test failed: {msg}",
        )

    # Check if already connected
    result = await db.execute(
        select(DrupalSite).where(DrupalSite.project_id == project_id)
    )
    existing = result.scalar_one_or_none()
    if existing:
        # Update existing connection
        existing.site_url = body.site_url
        existing.api_key_encrypted = drupal.encrypt_api_key(body.api_key)
        existing.site_name = body.site_name
        await db.commit()
        await db.refresh(existing)
        return DrupalConnectResponse(
            id=str(existing.id),
            project_id=str(existing.project_id),
            site_url=existing.site_url,
            site_name=existing.site_name,
            message="Site connection updated",
        )

    # Create new connection
    site = DrupalSite(
        project_id=project_id,
        site_url=body.site_url,
        api_key_encrypted=drupal.encrypt_api_key(body.api_key),
        site_name=body.site_name,
    )
    db.add(site)
    await db.commit()
    await db.refresh(site)

    return DrupalConnectResponse(
        id=str(site.id),
        project_id=str(site.project_id),
        site_url=site.site_url,
        site_name=site.site_name,
    )


@router.get("/{project_id}/site", response_model=DrupalSiteResponse)
async def get_site(
    project_id: UUID,
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
):
    """Get the connected Drupal site info for a project."""
    user_id = get_user_id_from_token(payload)
    await validate_project_access(project_id, str(user_id), db)

    site = await _get_drupal_site(project_id, db)
    return DrupalSiteResponse(
        id=str(site.id),
        project_id=str(site.project_id),
        site_url=site.site_url,
        site_name=site.site_name,
        last_sync_at=site.last_sync_at,
        sync_config=site.sync_config,
        created_at=site.created_at,
        updated_at=site.updated_at,
    )


@router.delete("/{project_id}/site", status_code=status.HTTP_204_NO_CONTENT)
async def disconnect_site(
    project_id: UUID,
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
):
    """Disconnect the Drupal site from a project."""
    user_id = get_user_id_from_token(payload)
    await validate_project_access(project_id, str(user_id), db)

    site = await _get_drupal_site(project_id, db)
    await db.delete(site)
    await db.commit()


@router.get("/{project_id}/config", response_model=DrupalSiteConfig)
async def get_config(
    project_id: UUID,
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
    drupal: DrupalMCPService = Depends(get_drupal_mcp),
):
    """Read remote Drupal site configuration."""
    user_id = get_user_id_from_token(payload)
    await validate_project_access(project_id, str(user_id), db)

    site = await _get_drupal_site(project_id, db)
    api_key = drupal.decrypt_api_key(site.api_key_encrypted)
    config = await drupal.get_site_config(site.site_url, api_key)
    return DrupalSiteConfig(**config)


@router.post("/{project_id}/drush", response_model=DrushCommandResponse)
async def run_drush(
    project_id: UUID,
    body: DrushCommandRequest,
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
    drupal: DrupalMCPService = Depends(get_drupal_mcp),
):
    """Execute a Drush command on the remote Drupal site."""
    user_id = get_user_id_from_token(payload)
    await validate_project_access(project_id, str(user_id), db)

    site = await _get_drupal_site(project_id, db)
    api_key = drupal.decrypt_api_key(site.api_key_encrypted)
    result = await drupal.run_drush(site.site_url, api_key, body.command)
    return DrushCommandResponse(**result)


@router.post("/{project_id}/pull", response_model=SyncResponse)
async def pull_site(
    project_id: UUID,
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
    drupal: DrupalMCPService = Depends(get_drupal_mcp),
    sandbox_mgr: SandboxManager = Depends(get_sandbox_manager),
):
    """Pull database and files from remote Drupal into sandbox."""
    user_id = get_user_id_from_token(payload)
    await validate_project_access(project_id, str(user_id), db)

    site = await _get_drupal_site(project_id, db)
    api_key = drupal.decrypt_api_key(site.api_key_encrypted)

    db_result = await drupal.pull_database(
        site.site_url, api_key, str(project_id), sandbox_mgr
    )
    files_result = await drupal.pull_files(
        site.site_url, api_key, str(project_id), sandbox_mgr
    )

    success = db_result.get("success", False) and files_result.get("success", False)

    if success:
        site.last_sync_at = datetime.now(timezone.utc)
        await db.commit()

    return SyncResponse(
        success=success,
        message="Pull completed" if success else "Pull completed with errors",
        details={"database": db_result, "files": files_result},
    )


@router.post("/{project_id}/push", response_model=SyncResponse)
async def push_config(
    project_id: UUID,
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
    drupal: DrupalMCPService = Depends(get_drupal_mcp),
    sandbox_mgr: SandboxManager = Depends(get_sandbox_manager),
):
    """Push local config to remote Drupal site."""
    user_id = get_user_id_from_token(payload)
    await validate_project_access(project_id, str(user_id), db)

    site = await _get_drupal_site(project_id, db)
    api_key = drupal.decrypt_api_key(site.api_key_encrypted)

    result = await drupal.push_config(
        site.site_url, api_key, str(project_id), sandbox_mgr
    )

    if result.get("success"):
        site.last_sync_at = datetime.now(timezone.utc)
        await db.commit()

    return SyncResponse(
        success=result.get("success", False),
        message=result.get("message", ""),
    )


@router.get("/{project_id}/sync-status", response_model=SyncStatusResponse)
async def sync_status(
    project_id: UUID,
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
):
    """Check sync status for a connected Drupal site."""
    user_id = get_user_id_from_token(payload)
    await validate_project_access(project_id, str(user_id), db)

    result = await db.execute(
        select(DrupalSite).where(DrupalSite.project_id == project_id)
    )
    site = result.scalar_one_or_none()

    if site is None:
        return SyncStatusResponse(connected=False)

    return SyncStatusResponse(
        connected=True,
        last_sync_at=site.last_sync_at,
        site_url=site.site_url,
        site_name=site.site_name,
    )
