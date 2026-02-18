"""API endpoints for Drupal MCP site management."""

import ipaddress
import json as json_mod
import logging
import os
import re
import shlex
import socket
import tempfile
from datetime import datetime, timezone
from typing import List, Optional
from urllib.parse import urlparse
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.context_deps import (
    get_current_user_payload,
    get_db_session,
    get_drupal_mcp,
    get_sandbox_manager,
    get_ssh_client,
    validate_project_access,
)
from app.auth import get_user_id
from app.models.drupal_site import DrupalSite
from app.schemas.drupal import (
    BlockContentCreateRequest,
    BlockContentListResponse,
    BlockContentResponse,
    BlockContentUpdateRequest,
    CloneRequest,
    CloneResponse,
    ComposerOperationResponse,
    ComposerRemoveRequest,
    ComposerRequireRequest,
    ComposerUpdateRequest,
    ContentTypeCreateRequest,
    ContentTypeCreateResponse,
    DrupalConnectRequest,
    DrupalConnectResponse,
    DrupalContentType,
    DrupalNode,
    DrupalNodeCreateRequest,
    DrupalNodeListResponse,
    DrupalNodeUpdateRequest,
    DrupalSiteConfig,
    DrupalSiteResponse,
    DrushCommandRequest,
    DrushCommandResponse,
    DrushOperationResponse,
    ModuleDisableRequest,
    ModuleEnableRequest,
    ModuleThemeListItem,
    ModuleThemeListResponse,
    PushRequest,
    PushResponse,
    StagingStatusResponse as StagingStatusSchema,
    SyncResponse,
    SyncStatusResponse,
    ThemeDisableRequest,
    ThemeEnableRequest,
    ThemeScaffoldRequest,
    ThemeScaffoldResponse,
)
from app.services.drupal_mcp import DrupalMCPService
from app.services.sandbox_manager import SandboxManager
from app.services.ssh_client import SSHClient

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/drupal")

# Dangerous Drush commands that should not be executed remotely
ALLOWED_DRUSH_COMMANDS = frozenset({
    "status", "st",
    "core:status", "core-status",
    "config:get", "config-get", "cget",
    "config:set", "config-set", "cset",
    "config:export", "config-export", "cex",
    "config:import", "config-import", "cim",
    "cache:rebuild", "cache-rebuild", "cr",
    "pm:list", "pm-list", "pml",
    "pm:info", "pm-info", "pmi",
    "pm:enable", "pm-enable", "en",
    "pm:uninstall", "pm-uninstall", "pmu",
    "updatedb", "updb",
    "watchdog:show", "watchdog-show", "wd-show", "ws",
    "cron",
    "queue:list", "queue-list",
    "queue:run", "queue-run",
    "deploy:hook", "deploy-hook",
    "locale:check", "locale-check",
    "locale:update", "locale-update",
    "theme:enable", "theme-enable",
    "theme:uninstall", "theme-uninstall",
    "state:get", "state-get", "sget",
    "state:set", "state-set", "sset",
    "role:list", "role-list",
    "user:information", "user-information", "uinf",
    "views:list", "views-list",
})

# Shell metacharacters that must never appear in drush commands
_SHELL_METACHARS = re.compile(r'[;|&`$(){}<>\\]')

# Composer package name: vendor/package
_COMPOSER_PACKAGE_RE = re.compile(
    r'^[a-z0-9]([_.\-]?[a-z0-9]+)*/[a-z0-9](([_.]|\-{1,2})?[a-z0-9]+)*$'
)

# Composer version constraint (digits, dots, ^, ~, >=, <=, >, <, *, |, space, @, -)
_COMPOSER_VERSION_RE = re.compile(r'^[a-zA-Z0-9.\^~><= *|@\-#]+$')

# Drupal machine name (modules, themes, content types)
_MACHINE_NAME_RE = re.compile(r'^[a-z][a-z0-9_]{0,127}$')


def _validate_composer_package(name: str) -> None:
    """Validate a Composer package name (vendor/package format)."""
    if not _COMPOSER_PACKAGE_RE.match(name):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid composer package name: {name}",
        )


def _validate_composer_version(version: str) -> None:
    """Validate a Composer version constraint (no shell injection)."""
    if not version:
        return
    if _SHELL_METACHARS.search(version):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Version constraint contains prohibited characters",
        )
    if not _COMPOSER_VERSION_RE.match(version):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid version constraint: {version}",
        )


def _validate_machine_name(name: str) -> None:
    """Validate a Drupal machine name (module, theme, content type)."""
    if not _MACHINE_NAME_RE.match(name):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid machine name: {name}. Must match [a-z][a-z0-9_]*",
        )


def _validate_url_safe(url: str) -> None:
    """Block private IPs, localhost, and non-http(s) schemes."""
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported URL scheme: {parsed.scheme}",
        )
    hostname = parsed.hostname
    if not hostname:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="URL must include a hostname",
        )
    if hostname in ("localhost", "127.0.0.1", "::1", "0.0.0.0"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Localhost URLs are not allowed",
        )
    try:
        resolved = socket.getaddrinfo(hostname, None, socket.AF_UNSPEC, socket.SOCK_STREAM)
    except socket.gaierror:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot resolve hostname: {hostname}",
        )
    for family, _type, _proto, _canonname, sockaddr in resolved:
        ip = ipaddress.ip_address(sockaddr[0])
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="URLs pointing to private or reserved IP addresses are not allowed",
            )


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


def _get_credentials(drupal: DrupalMCPService, site: DrupalSite):
    """Decrypt stored credentials and return (username, password)."""
    return drupal.decrypt_credentials(site.credentials_encrypted)


@router.post("/{project_id}/connect", response_model=DrupalConnectResponse)
async def connect_site(
    project_id: UUID,
    body: DrupalConnectRequest,
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
    drupal: DrupalMCPService = Depends(get_drupal_mcp),
):
    """Connect a remote Drupal site to a project."""
    user_id = get_user_id(payload)
    await validate_project_access(project_id, user_id, db)

    _validate_url_safe(body.site_url)

    # Test connection first
    ok, msg = await drupal.test_connection(body.site_url, body.username, body.password)
    if not ok:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Connection test failed: {msg}",
        )

    encrypted = drupal.encrypt_credentials(body.username, body.password)

    # Check if already connected
    result = await db.execute(
        select(DrupalSite).where(DrupalSite.project_id == project_id)
    )
    existing = result.scalar_one_or_none()
    if existing:
        existing.site_url = body.site_url
        existing.credentials_encrypted = encrypted
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
        credentials_encrypted=encrypted,
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
    user_id = get_user_id(payload)
    await validate_project_access(project_id, user_id, db)

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
    user_id = get_user_id(payload)
    await validate_project_access(project_id, user_id, db)

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
    user_id = get_user_id(payload)
    await validate_project_access(project_id, user_id, db)

    site = await _get_drupal_site(project_id, db)
    username, password = _get_credentials(drupal, site)
    config = await drupal.get_site_config(site.site_url, username, password)
    return DrupalSiteConfig(**config)


# --- Content CRUD ---


@router.get(
    "/{project_id}/content-types",
    response_model=List[DrupalContentType],
)
async def list_content_types(
    project_id: UUID,
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
    drupal: DrupalMCPService = Depends(get_drupal_mcp),
):
    """List all content types (node bundles) from the remote Drupal site."""
    user_id = get_user_id(payload)
    await validate_project_access(project_id, user_id, db)

    site = await _get_drupal_site(project_id, db)
    username, password = _get_credentials(drupal, site)
    items = await drupal.list_content_types(site.site_url, username, password)
    return [DrupalContentType(**ct) for ct in items]


@router.get(
    "/{project_id}/content/{bundle}",
    response_model=DrupalNodeListResponse,
)
async def list_content(
    project_id: UUID,
    bundle: str,
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
    drupal: DrupalMCPService = Depends(get_drupal_mcp),
):
    """List nodes for a given content type bundle."""
    user_id = get_user_id(payload)
    await validate_project_access(project_id, user_id, db)

    site = await _get_drupal_site(project_id, db)
    username, password = _get_credentials(drupal, site)
    nodes = await drupal.list_nodes(site.site_url, username, password, bundle)
    return DrupalNodeListResponse(
        nodes=[DrupalNode(**n) for n in nodes],
        total=len(nodes),
    )


@router.post(
    "/{project_id}/content/{bundle}",
    response_model=DrupalNode,
    status_code=status.HTTP_201_CREATED,
)
async def create_content(
    project_id: UUID,
    bundle: str,
    body: DrupalNodeCreateRequest,
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
    drupal: DrupalMCPService = Depends(get_drupal_mcp),
):
    """Create a new node of the given bundle type."""
    user_id = get_user_id(payload)
    await validate_project_access(project_id, user_id, db)

    site = await _get_drupal_site(project_id, db)
    username, password = _get_credentials(drupal, site)
    try:
        node = await drupal.create_node(
            site.site_url,
            username,
            password,
            bundle,
            body.title,
            body.body,
            body.body_format,
            body.status,
        )
        return DrupalNode(**node)
    except Exception as e:
        logger.exception("Failed to create node for project %s: %s", project_id, e)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to create node",
        )


@router.patch(
    "/{project_id}/content/{bundle}/{node_uuid}",
    response_model=DrupalNode,
)
async def update_content(
    project_id: UUID,
    bundle: str,
    node_uuid: str,
    body: DrupalNodeUpdateRequest,
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
    drupal: DrupalMCPService = Depends(get_drupal_mcp),
):
    """Update an existing node."""
    user_id = get_user_id(payload)
    await validate_project_access(project_id, user_id, db)

    site = await _get_drupal_site(project_id, db)
    username, password = _get_credentials(drupal, site)
    try:
        node = await drupal.update_node(
            site.site_url,
            username,
            password,
            bundle,
            node_uuid,
            body.title,
            body.body,
            body.body_format,
            body.status,
        )
        return DrupalNode(**node)
    except Exception as e:
        logger.exception("Failed to update node for project %s: %s", project_id, e)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to update node",
        )


# --- Drush / Sync (legacy, will 404 on standard Drupal sites) ---


@router.post("/{project_id}/drush", response_model=DrushCommandResponse)
async def run_drush(
    project_id: UUID,
    body: DrushCommandRequest,
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
    drupal: DrupalMCPService = Depends(get_drupal_mcp),
):
    """Execute a Drush command on the remote Drupal site."""
    user_id = get_user_id(payload)
    await validate_project_access(project_id, user_id, db)

    base_command = body.command.strip().split()[0] if body.command.strip() else ""
    if not base_command:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Empty command",
        )
    if _SHELL_METACHARS.search(body.command):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Command contains prohibited shell characters",
        )
    if base_command.lower() not in ALLOWED_DRUSH_COMMANDS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Command '{base_command}' is not in the allowed commands list",
        )

    site = await _get_drupal_site(project_id, db)
    username, password = _get_credentials(drupal, site)
    result = await drupal.run_drush(site.site_url, username, password, body.command)
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
    user_id = get_user_id(payload)
    await validate_project_access(project_id, user_id, db)

    site = await _get_drupal_site(project_id, db)
    username, password = _get_credentials(drupal, site)

    db_result = await drupal.pull_database(
        site.site_url, username, password, str(project_id), sandbox_mgr
    )
    files_result = await drupal.pull_files(
        site.site_url, username, password, str(project_id), sandbox_mgr
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
    user_id = get_user_id(payload)
    await validate_project_access(project_id, user_id, db)

    site = await _get_drupal_site(project_id, db)
    username, password = _get_credentials(drupal, site)

    result = await drupal.push_config(
        site.site_url, username, password, str(project_id), sandbox_mgr
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
    user_id = get_user_id(payload)
    await validate_project_access(project_id, user_id, db)

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


# ============================================================
# Staging Environment Endpoints (SSH-based clone/push)
# ============================================================

# VPS Drupal paths (from production server)
_VPS_DRUPAL_ROOT = "/var/www/drupal"
_VPS_DRUSH = "/var/www/drupal/vendor/bin/drush"
_VPS_DB_NAME = os.environ.get("VPS_DB_NAME", "drupal")
_VPS_DB_USER = os.environ.get("VPS_DB_USER", "drupal")
_VPS_DB_PASS = os.environ.get("VPS_DB_PASS", "")  # Must be set in environment


def _validate_mysql_identifier(value: str, env_name: str) -> str:
    if not re.fullmatch(r"[A-Za-z0-9_]+", value or ""):
        raise RuntimeError(f"{env_name} contains invalid characters")
    return value


def _validate_vps_db_config() -> None:
    if not _VPS_DB_PASS:
        raise RuntimeError("VPS_DB_PASS environment variable is required")
    _validate_mysql_identifier(_VPS_DB_USER, "VPS_DB_USER")
    _validate_mysql_identifier(_VPS_DB_NAME, "VPS_DB_NAME")


def _build_mysql_defaults_file(user: str, password: str) -> str:
    return f"[client]\nuser={user}\npassword={password}\n"


@router.get("/{project_id}/staging-status", response_model=StagingStatusSchema)
async def staging_status(
    project_id: UUID,
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
    sandbox_mgr: SandboxManager = Depends(get_sandbox_manager),
):
    """Get the current staging sandbox status for a project."""
    user_id = get_user_id(payload)
    await validate_project_access(project_id, user_id, db)

    site = await _get_drupal_site(project_id, db)

    # Check if sandbox container is running
    container_info = await sandbox_mgr.get_container_info(str(project_id))
    sandbox_running = container_info is not None and container_info.get("running", False)
    container_id = container_info.get("id") if container_info else None

    # Build preview URL from container's exposed port
    preview_url = None
    if sandbox_running and container_info:
        port = container_info.get("port") or container_info.get("exposed_port")
        if port:
            preview_url = f"http://localhost:{port}"

    return StagingStatusSchema(
        sandbox_running=sandbox_running,
        container_id=container_id,
        preview_url=preview_url,
        last_clone_at=site.last_sync_at,
        site_url=site.site_url,
        site_name=site.site_name,
    )


@router.post("/{project_id}/clone", response_model=CloneResponse)
async def clone_production(
    project_id: UUID,
    body: CloneRequest = CloneRequest(),
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
    sandbox_mgr: SandboxManager = Depends(get_sandbox_manager),
    ssh: SSHClient = Depends(get_ssh_client),
):
    """Clone production Drupal site (DB + files) into a local sandbox."""
    user_id = get_user_id(payload)
    await validate_project_access(project_id, user_id, db)

    site = await _get_drupal_site(project_id, db)
    details: dict = {}

    try:
        # Ensure sandbox container exists
        container_id = await sandbox_mgr.get_or_create_container(
            str(project_id), template_id="drupal"
        )

        if not container_id:
            return CloneResponse(
                success=False,
                message="Failed to create sandbox container",
            )

        # 1. Clone database
        if body.include_db:
            _validate_vps_db_config()
            logger.info("Cloning database from production for project %s", project_id)
            with tempfile.NamedTemporaryFile(suffix=".sql.gz", delete=False) as tmp:
                db_dump_path = tmp.name
            with tempfile.NamedTemporaryFile("w", suffix=".cnf", delete=False) as tmp:
                local_opt_path = tmp.name
                tmp.write(_build_mysql_defaults_file(_VPS_DB_USER, _VPS_DB_PASS))
            remote_opt_path = f"/tmp/workstation-db-{project_id.hex}.cnf"

            try:
                await ssh.upload_file(local_opt_path, remote_opt_path)
                await ssh.execute(f"chmod 600 {shlex.quote(remote_opt_path)}", timeout=10)
                dump_cmd = (
                    f"mysqldump --defaults-extra-file={shlex.quote(remote_opt_path)} "
                    f"--single-transaction --quick {_VPS_DB_NAME} | gzip"
                )
                await ssh.download_stream(dump_cmd, db_dump_path)

                # Import into sandbox MariaDB sidecar
                import_cmd = "MYSQL_PWD=drupal gunzip | mysql -u drupal drupal"
                await sandbox_mgr.exec_in_sidecar(
                    str(project_id), "drupal-db", import_cmd, stdin_file=db_dump_path
                )
                details["database"] = "cloned successfully"
            except Exception as e:
                details["database"] = f"error: {e}"
                logger.error("DB clone failed for project %s: %s", project_id, e)
            finally:
                try:
                    await ssh.execute(f"rm -f {shlex.quote(remote_opt_path)}", timeout=10)
                except Exception:
                    pass
                try:
                    os.unlink(local_opt_path)
                except OSError:
                    pass
                try:
                    os.unlink(db_dump_path)
                except OSError:
                    pass

        # 2. Clone files
        if body.include_files:
            logger.info("Cloning files from production for project %s", project_id)
            with tempfile.NamedTemporaryFile(suffix=".tar.gz", delete=False) as tmp:
                files_path = tmp.name

            try:
                tar_cmd = f"tar czf - -C {_VPS_DRUPAL_ROOT} ."
                await ssh.download_stream(tar_cmd, files_path)

                # Extract into sandbox workspace
                await sandbox_mgr.exec_in_container(
                    container_id, "mkdir -p /workspace"
                )
                await sandbox_mgr.upload_and_extract(
                    container_id, files_path, "/workspace"
                )
                details["files"] = "cloned successfully"
            except Exception as e:
                details["files"] = f"error: {e}"
                logger.error("Files clone failed for project %s: %s", project_id, e)
            finally:
                try:
                    os.unlink(files_path)
                except OSError:
                    pass

        # 3. Post-clone: update settings and rebuild cache
        try:
            settings_php = (
                "<?php\n\n"
                "$databases['default']['default'] = [\n"
                "  'database' => 'drupal',\n"
                "  'username' => 'drupal',\n"
                "  'password' => 'drupal',\n"
                "  'host' => 'drupal-db',\n"
                "  'port' => '3306',\n"
                "  'driver' => 'mysql',\n"
                "  'prefix' => '',\n"
                "];\n"
            )
            await sandbox_mgr.write_file_in_container(
                container_id,
                "/workspace/web/sites/default/settings.local.php",
                settings_php,
            )
            # Rebuild Drupal cache
            await sandbox_mgr.exec_in_container(
                container_id,
                "cd /workspace && vendor/bin/drush cr || true",
            )
            details["post_clone"] = "settings updated, cache rebuilt"
        except Exception as e:
            details["post_clone"] = f"warning: {e}"
            logger.warning("Post-clone setup issue for project %s: %s", project_id, e)

        # Check if any step had errors
        has_errors = any(
            str(v).startswith("error:") for v in details.values()
        )

        # Only update last sync timestamp if there were no errors
        if not has_errors:
            site.last_sync_at = datetime.now(timezone.utc)
        await db.commit()

        # Get preview URL
        container_info = await sandbox_mgr.get_container_info(str(project_id))
        preview_url = None
        if container_info:
            port = container_info.get("port") or container_info.get("exposed_port")
            if port:
                preview_url = f"http://localhost:{port}"

        return CloneResponse(
            success=not has_errors,
            message="Production site cloned into staging sandbox" if not has_errors else "Clone completed with errors",
            preview_url=preview_url,
            details=details,
        )

    except Exception as e:
        logger.error("Clone operation failed for project %s: %s", project_id, e, exc_info=True)
        return CloneResponse(
            success=False,
            message="Clone failed due to an internal error",
            details=details,
        )


@router.post("/{project_id}/staging/push", response_model=PushResponse)
async def push_to_production(
    project_id: UUID,
    body: PushRequest,
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
    sandbox_mgr: SandboxManager = Depends(get_sandbox_manager),
    ssh: SSHClient = Depends(get_ssh_client),
):
    """Push sandbox changes back to production VPS."""
    user_id = get_user_id(payload)
    await validate_project_access(project_id, user_id, db)

    if not body.confirm:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You must set confirm=true to push to production",
        )

    site = await _get_drupal_site(project_id, db)
    container_info = await sandbox_mgr.get_container_info(str(project_id))

    if not container_info or not container_info.get("running"):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Staging sandbox is not running",
        )

    container_id = container_info.get("id") or container_info.get("container_id", "")
    details: dict = {}

    try:
        # 1. Push files
        if body.include_files:
            logger.info("Pushing files to production for project %s", project_id)
            with tempfile.NamedTemporaryFile(suffix=".tar.gz", delete=False) as tmp:
                files_path = tmp.name

            try:
                # Tar sandbox files
                await sandbox_mgr.download_archive(
                    container_id, "/workspace", files_path
                )
                # Upload and extract on VPS
                extract_cmd = f"tar xzf - -C {_VPS_DRUPAL_ROOT}"
                await ssh.upload_stream(extract_cmd, files_path)
                details["files"] = "pushed successfully"
            except Exception as e:
                details["files"] = f"error: {e}"
                logger.error("Files push failed for project %s: %s", project_id, e)
            finally:
                try:
                    os.unlink(files_path)
                except OSError:
                    pass

        # 2. Push database
        if body.include_db:
            _validate_vps_db_config()
            logger.info("Pushing database to production for project %s", project_id)
            with tempfile.NamedTemporaryFile(suffix=".sql.gz", delete=False) as tmp:
                db_dump_path = tmp.name
            with tempfile.NamedTemporaryFile("w", suffix=".cnf", delete=False) as tmp:
                local_opt_path = tmp.name
                tmp.write(_build_mysql_defaults_file(_VPS_DB_USER, _VPS_DB_PASS))
            remote_opt_path = f"/tmp/workstation-db-{project_id.hex}.cnf"

            try:
                # Dump from sandbox MariaDB sidecar
                await sandbox_mgr.exec_sidecar_stream(
                    str(project_id), "drupal-db",
                    "mysqldump -u drupal -pdrupal --single-transaction drupal | gzip",
                    db_dump_path,
                )
                # Upload to VPS
                await ssh.upload_file(local_opt_path, remote_opt_path)
                await ssh.execute(f"chmod 600 {shlex.quote(remote_opt_path)}", timeout=10)
                import_cmd = (
                    f"gunzip | mysql --defaults-extra-file={shlex.quote(remote_opt_path)} "
                    f"-u {_VPS_DB_USER} {_VPS_DB_NAME}"
                )
                await ssh.upload_stream(import_cmd, db_dump_path)
                details["database"] = "pushed successfully"
            except Exception as e:
                details["database"] = f"error: {e}"
                logger.error("DB push failed for project %s: %s", project_id, e)
            finally:
                try:
                    await ssh.execute(f"rm -f {shlex.quote(remote_opt_path)}", timeout=10)
                except Exception:
                    pass
                try:
                    os.unlink(local_opt_path)
                except OSError:
                    pass
                try:
                    os.unlink(db_dump_path)
                except OSError:
                    pass

        # 3. Clear production cache
        try:
            await ssh.execute(f"{_VPS_DRUSH} cr", timeout=30)
            details["cache"] = "rebuilt"
        except Exception as e:
            details["cache"] = f"warning: {e}"

        # Update last sync
        site.last_sync_at = datetime.now(timezone.utc)
        await db.commit()

        all_ok = all("error" not in str(v) for v in details.values())
        return PushResponse(
            success=all_ok,
            message="Changes pushed to production" if all_ok else "Push completed with errors",
            details=details,
        )

    except Exception as e:
        logger.error("Push operation failed for project %s: %s", project_id, e, exc_info=True)
        return PushResponse(
            success=False,
            message="Push failed due to an internal error",
            details=details,
        )


@router.post("/{project_id}/staging/start")
async def start_staging(
    project_id: UUID,
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
    sandbox_mgr: SandboxManager = Depends(get_sandbox_manager),
):
    """Start or restart the staging sandbox container."""
    user_id = get_user_id(payload)
    await validate_project_access(project_id, user_id, db)

    await _get_drupal_site(project_id, db)

    try:
        container_id = await sandbox_mgr.get_or_create_container(
            str(project_id), template_id="drupal"
        )
        return {
            "success": True,
            "message": "Staging sandbox started",
            "container_id": container_id,
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to start staging: {e}",
        )


@router.post("/{project_id}/staging/stop")
async def stop_staging(
    project_id: UUID,
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
    sandbox_mgr: SandboxManager = Depends(get_sandbox_manager),
):
    """Stop the staging sandbox container."""
    user_id = get_user_id(payload)
    await validate_project_access(project_id, user_id, db)

    try:
        await sandbox_mgr.stop_container(str(project_id))
        return {"success": True, "message": "Staging sandbox stopped"}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to stop staging: {e}",
        )


# ============================================================
# Module & Theme Management (SSH-based VPS operations)
# ============================================================


@router.get("/{project_id}/modules", response_model=ModuleThemeListResponse)
async def list_modules(
    project_id: UUID,
    status_filter: Optional[str] = Query(None, description="Filter: enabled, disabled"),
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
    ssh: SSHClient = Depends(get_ssh_client),
):
    """List installed modules on the remote Drupal site via SSH + drush."""
    user_id = get_user_id(payload)
    await validate_project_access(project_id, user_id, db)
    await _get_drupal_site(project_id, db)

    cmd = f"{_VPS_DRUSH} pm:list --type=module --format=json"
    if status_filter in ("enabled", "disabled"):
        cmd += f" --status={shlex.quote(status_filter)}"

    result = await ssh.execute(cmd, timeout=60)
    items: List[ModuleThemeListItem] = []
    if result["exit_code"] == 0 and result["stdout"].strip():
        try:
            data = json_mod.loads(result["stdout"])
            for key, info in data.items():
                items.append(ModuleThemeListItem(
                    machine_name=key,
                    display_name=info.get("display_name", key),
                    status=info.get("status", "unknown"),
                    version=info.get("version"),
                    package=info.get("package"),
                    type="module",
                ))
        except (json_mod.JSONDecodeError, AttributeError) as e:
            logger.warning("Failed to parse module list: %s", e)

    return ModuleThemeListResponse(items=items, total=len(items))


@router.get("/{project_id}/themes", response_model=ModuleThemeListResponse)
async def list_themes(
    project_id: UUID,
    status_filter: Optional[str] = Query(None, description="Filter: enabled, disabled"),
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
    ssh: SSHClient = Depends(get_ssh_client),
):
    """List installed themes on the remote Drupal site via SSH + drush."""
    user_id = get_user_id(payload)
    await validate_project_access(project_id, user_id, db)
    await _get_drupal_site(project_id, db)

    cmd = f"{_VPS_DRUSH} pm:list --type=theme --format=json"
    if status_filter in ("enabled", "disabled"):
        cmd += f" --status={shlex.quote(status_filter)}"

    result = await ssh.execute(cmd, timeout=60)
    items: List[ModuleThemeListItem] = []
    if result["exit_code"] == 0 and result["stdout"].strip():
        try:
            data = json_mod.loads(result["stdout"])
            for key, info in data.items():
                items.append(ModuleThemeListItem(
                    machine_name=key,
                    display_name=info.get("display_name", key),
                    status=info.get("status", "unknown"),
                    version=info.get("version"),
                    package=info.get("package"),
                    type="theme",
                ))
        except (json_mod.JSONDecodeError, AttributeError) as e:
            logger.warning("Failed to parse theme list: %s", e)

    return ModuleThemeListResponse(items=items, total=len(items))


@router.post("/{project_id}/modules/enable", response_model=DrushOperationResponse)
async def enable_modules(
    project_id: UUID,
    body: ModuleEnableRequest,
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
    ssh: SSHClient = Depends(get_ssh_client),
):
    """Enable one or more modules on the remote Drupal site via SSH + drush."""
    user_id = get_user_id(payload)
    await validate_project_access(project_id, user_id, db)
    await _get_drupal_site(project_id, db)

    for m in body.modules:
        _validate_machine_name(m)

    mod_args = " ".join(shlex.quote(m) for m in body.modules)
    cmd = f"{_VPS_DRUSH} pm:enable {mod_args} -y"
    result = await ssh.execute(cmd, timeout=120)
    success = result["exit_code"] == 0

    if success:
        await ssh.execute(f"{_VPS_DRUSH} cr", timeout=30)

    return DrushOperationResponse(
        success=success,
        command=f"drush pm:enable {' '.join(body.modules)}",
        stdout=result["stdout"],
        stderr=result["stderr"],
    )


@router.post("/{project_id}/modules/disable", response_model=DrushOperationResponse)
async def disable_modules(
    project_id: UUID,
    body: ModuleDisableRequest,
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
    ssh: SSHClient = Depends(get_ssh_client),
):
    """Uninstall one or more modules on the remote Drupal site via SSH + drush."""
    user_id = get_user_id(payload)
    await validate_project_access(project_id, user_id, db)
    await _get_drupal_site(project_id, db)

    if not body.confirm:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Must set confirm=true to uninstall modules",
        )

    for m in body.modules:
        _validate_machine_name(m)

    mod_args = " ".join(shlex.quote(m) for m in body.modules)
    cmd = f"{_VPS_DRUSH} pm:uninstall {mod_args} -y"
    result = await ssh.execute(cmd, timeout=120)
    success = result["exit_code"] == 0

    if success:
        await ssh.execute(f"{_VPS_DRUSH} cr", timeout=30)

    return DrushOperationResponse(
        success=success,
        command=f"drush pm:uninstall {' '.join(body.modules)}",
        stdout=result["stdout"],
        stderr=result["stderr"],
    )


@router.post("/{project_id}/themes/enable", response_model=DrushOperationResponse)
async def enable_theme(
    project_id: UUID,
    body: ThemeEnableRequest,
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
    ssh: SSHClient = Depends(get_ssh_client),
):
    """Enable a theme on the remote Drupal site via SSH + drush."""
    user_id = get_user_id(payload)
    await validate_project_access(project_id, user_id, db)
    await _get_drupal_site(project_id, db)

    _validate_machine_name(body.theme)

    cmd = f"{_VPS_DRUSH} theme:enable {shlex.quote(body.theme)} -y"
    result = await ssh.execute(cmd, timeout=60)
    success = result["exit_code"] == 0

    if success and body.set_default:
        await ssh.execute(
            f"{_VPS_DRUSH} config:set system.theme default {shlex.quote(body.theme)} -y",
            timeout=30,
        )

    if success:
        await ssh.execute(f"{_VPS_DRUSH} cr", timeout=30)

    return DrushOperationResponse(
        success=success,
        command=f"drush theme:enable {body.theme}" + (" (set as default)" if body.set_default else ""),
        stdout=result["stdout"],
        stderr=result["stderr"],
    )


@router.post("/{project_id}/themes/disable", response_model=DrushOperationResponse)
async def disable_theme(
    project_id: UUID,
    body: ThemeDisableRequest,
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
    ssh: SSHClient = Depends(get_ssh_client),
):
    """Uninstall a theme on the remote Drupal site via SSH + drush."""
    user_id = get_user_id(payload)
    await validate_project_access(project_id, user_id, db)
    await _get_drupal_site(project_id, db)

    if not body.confirm:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Must set confirm=true to uninstall theme",
        )

    _validate_machine_name(body.theme)

    cmd = f"{_VPS_DRUSH} theme:uninstall {shlex.quote(body.theme)} -y"
    result = await ssh.execute(cmd, timeout=60)
    success = result["exit_code"] == 0

    if success:
        await ssh.execute(f"{_VPS_DRUSH} cr", timeout=30)

    return DrushOperationResponse(
        success=success,
        command=f"drush theme:uninstall {body.theme}",
        stdout=result["stdout"],
        stderr=result["stderr"],
    )


# ============================================================
# Composer Operations (SSH-based VPS operations)
# ============================================================


@router.post("/{project_id}/composer/require", response_model=ComposerOperationResponse)
async def composer_require(
    project_id: UUID,
    body: ComposerRequireRequest,
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
    ssh: SSHClient = Depends(get_ssh_client),
):
    """Install a Composer package on the remote Drupal site via SSH."""
    user_id = get_user_id(payload)
    await validate_project_access(project_id, user_id, db)
    await _get_drupal_site(project_id, db)

    _validate_composer_package(body.package)
    if body.version:
        _validate_composer_version(body.version)

    pkg_spec = f"{body.package}:{body.version}" if body.version else body.package
    cmd = f"cd {shlex.quote(_VPS_DRUPAL_ROOT)} && composer require {shlex.quote(pkg_spec)} --no-interaction"

    result = await ssh.execute(cmd, timeout=300)
    success = result["exit_code"] == 0

    if success:
        await ssh.execute(f"{_VPS_DRUSH} cr", timeout=30)

    return ComposerOperationResponse(
        success=success,
        command=f"composer require {pkg_spec}",
        output=result["stdout"],
        error=result["stderr"] if not success else None,
    )


@router.post("/{project_id}/composer/remove", response_model=ComposerOperationResponse)
async def composer_remove(
    project_id: UUID,
    body: ComposerRemoveRequest,
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
    ssh: SSHClient = Depends(get_ssh_client),
):
    """Remove a Composer package from the remote Drupal site via SSH."""
    user_id = get_user_id(payload)
    await validate_project_access(project_id, user_id, db)
    await _get_drupal_site(project_id, db)

    if not body.confirm:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Must set confirm=true to remove packages",
        )

    _validate_composer_package(body.package)

    cmd = f"cd {shlex.quote(_VPS_DRUPAL_ROOT)} && composer remove {shlex.quote(body.package)} --no-interaction"
    result = await ssh.execute(cmd, timeout=300)
    success = result["exit_code"] == 0

    if success:
        await ssh.execute(f"{_VPS_DRUSH} cr", timeout=30)

    return ComposerOperationResponse(
        success=success,
        command=f"composer remove {body.package}",
        output=result["stdout"],
        error=result["stderr"] if not success else None,
    )


@router.post("/{project_id}/composer/update", response_model=ComposerOperationResponse)
async def composer_update(
    project_id: UUID,
    body: ComposerUpdateRequest,
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
    ssh: SSHClient = Depends(get_ssh_client),
):
    """Update Composer packages on the remote Drupal site via SSH."""
    user_id = get_user_id(payload)
    await validate_project_access(project_id, user_id, db)
    await _get_drupal_site(project_id, db)

    if not body.confirm:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Must set confirm=true to update packages",
        )

    for pkg in body.packages:
        _validate_composer_package(pkg)

    pkg_list = " ".join(shlex.quote(p) for p in body.packages)
    deps_flag = "--with-dependencies" if body.with_dependencies else ""
    cmd = f"cd {shlex.quote(_VPS_DRUPAL_ROOT)} && composer update {pkg_list} {deps_flag} --no-interaction".strip()

    result = await ssh.execute(cmd, timeout=600)
    success = result["exit_code"] == 0

    if success:
        await ssh.execute(f"{_VPS_DRUSH} updatedb -y", timeout=120)
        await ssh.execute(f"{_VPS_DRUSH} cr", timeout=30)

    return ComposerOperationResponse(
        success=success,
        command=f"composer update {' '.join(body.packages) or '(all)'}",
        output=result["stdout"],
        error=result["stderr"] if not success else None,
    )


# ============================================================
# Content Type Creation (SSH + config import)
# ============================================================


@router.post(
    "/{project_id}/content-types/create",
    response_model=ContentTypeCreateResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_content_type(
    project_id: UUID,
    body: ContentTypeCreateRequest,
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
    ssh: SSHClient = Depends(get_ssh_client),
):
    """Create a new content type on the remote Drupal site via SSH + config import."""
    user_id = get_user_id(payload)
    await validate_project_access(project_id, user_id, db)
    await _get_drupal_site(project_id, db)

    _validate_machine_name(body.machine_name)

    # Check if content type already exists
    check_cmd = f"{_VPS_DRUSH} config:get node.type.{shlex.quote(body.machine_name)} type 2>/dev/null"
    check = await ssh.execute(check_cmd, timeout=15)
    if check["exit_code"] == 0 and check["stdout"].strip():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Content type '{body.machine_name}' already exists",
        )

    # Build YAML config for the new node type
    config_yaml = (
        f"langcode: en\n"
        f"status: true\n"
        f"dependencies: {{}}\n"
        f"name: {shlex.quote(body.label)}\n"
        f"type: {body.machine_name}\n"
        f"description: {shlex.quote(body.description)}\n"
        f"help: ''\n"
        f"new_revision: true\n"
        f"preview_mode: 1\n"
        f"display_submitted: true\n"
    )

    # Create temp directory on VPS and write config
    tmp_dir = f"/tmp/drupal-config-{project_id.hex}"
    safe_tmp = shlex.quote(tmp_dir)
    config_filename = f"node.type.{body.machine_name}.yml"

    try:
        await ssh.execute(f"mkdir -p {safe_tmp}", timeout=10)
        # Write YAML via heredoc
        write_cmd = f"cat > {shlex.quote(f'{tmp_dir}/{config_filename}')} << 'CONFIGEOF'\n{config_yaml}CONFIGEOF"
        await ssh.execute(write_cmd, timeout=10)

        # Import the config
        import_cmd = f"{_VPS_DRUSH} config:import --partial --source={safe_tmp} -y"
        result = await ssh.execute(import_cmd, timeout=60)
        success = result["exit_code"] == 0

        if not success:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Config import failed: {result['stderr'][:500]}",
            )

        # If body field is requested, create it via field storage + field instance config
        if body.has_body:
            # body field is typically auto-created by Drupal for new node types when
            # using the UI, but config import may need it explicitly. Check if it exists.
            body_check = await ssh.execute(
                f"{_VPS_DRUSH} config:get field.field.node.{shlex.quote(body.machine_name)}.body status 2>/dev/null",
                timeout=15,
            )
            if body_check["exit_code"] != 0:
                # Create body field config for this content type
                body_field_yaml = (
                    f"langcode: en\n"
                    f"status: true\n"
                    f"dependencies:\n"
                    f"  config:\n"
                    f"    - field.storage.node.body\n"
                    f"    - node.type.{body.machine_name}\n"
                    f"  module:\n"
                    f"    - text\n"
                    f"id: node.{body.machine_name}.body\n"
                    f"field_name: body\n"
                    f"entity_type: node\n"
                    f"bundle: {body.machine_name}\n"
                    f"label: Body\n"
                    f"description: ''\n"
                    f"required: false\n"
                    f"translatable: true\n"
                    f"default_value: []\n"
                    f"default_value_callback: ''\n"
                    f"settings:\n"
                    f"  display_summary: true\n"
                    f"  required_summary: false\n"
                    f"field_type: text_with_summary\n"
                )
                body_config_file = f"field.field.node.{body.machine_name}.body.yml"
                write_body_cmd = f"cat > {shlex.quote(f'{tmp_dir}/{body_config_file}')} << 'CONFIGEOF'\n{body_field_yaml}CONFIGEOF"
                await ssh.execute(write_body_cmd, timeout=10)
                await ssh.execute(import_cmd, timeout=60)

        await ssh.execute(f"{_VPS_DRUSH} cr", timeout=30)

        return ContentTypeCreateResponse(
            success=True,
            machine_name=body.machine_name,
            label=body.label,
            message=f"Content type '{body.label}' created successfully",
        )
    finally:
        # Clean up temp directory
        await ssh.execute(f"rm -rf {safe_tmp}", timeout=10)


# ============================================================
# Theme Scaffolding (SSH-based VPS operations)
# ============================================================


@router.post(
    "/{project_id}/themes/scaffold",
    response_model=ThemeScaffoldResponse,
    status_code=status.HTTP_201_CREATED,
)
async def scaffold_theme(
    project_id: UUID,
    body: ThemeScaffoldRequest,
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
    ssh: SSHClient = Depends(get_ssh_client),
):
    """Scaffold a new custom theme on the remote Drupal site via SSH."""
    user_id = get_user_id(payload)
    await validate_project_access(project_id, user_id, db)
    await _get_drupal_site(project_id, db)

    _validate_machine_name(body.machine_name)
    if body.base_theme:
        _validate_machine_name(body.base_theme)

    theme_dir = f"{_VPS_DRUPAL_ROOT}/web/themes/custom/{body.machine_name}"
    safe_dir = shlex.quote(theme_dir)

    # Check if theme directory already exists
    check = await ssh.execute(f"test -d {safe_dir} && echo exists", timeout=10)
    if "exists" in check["stdout"]:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Theme directory already exists: {body.machine_name}",
        )

    # Create directory structure
    await ssh.execute(
        f"mkdir -p {safe_dir}/css {safe_dir}/js {safe_dir}/templates",
        timeout=10,
    )

    # Generate and write files
    info_yml = (
        f"name: '{body.name}'\n"
        f"type: theme\n"
        f"description: '{body.description}'\n"
        f"base theme: {body.base_theme}\n"
        f"core_version_requirement: ^10 || ^11\n"
        f"libraries:\n"
        f"  - {body.machine_name}/global-styling\n"
    )

    libraries_yml = (
        f"global-styling:\n"
        f"  css:\n"
        f"    theme:\n"
        f"      css/style.css: {{}}\n"
        f"  js:\n"
        f"    js/script.js: {{}}\n"
    )

    files_to_create = {
        f"{theme_dir}/{body.machine_name}.info.yml": info_yml,
        f"{theme_dir}/{body.machine_name}.libraries.yml": libraries_yml,
        f"{theme_dir}/css/style.css": f"/* {body.name} styles */\n",
        f"{theme_dir}/js/script.js": f"// {body.name} scripts\n",
    }

    files_created = []
    for remote_path, content in files_to_create.items():
        write_cmd = f"cat > {shlex.quote(remote_path)} << 'THEMEEOF'\n{content}THEMEEOF"
        await ssh.execute(write_cmd, timeout=10)
        files_created.append(os.path.basename(remote_path))

    # Set ownership to www-data
    await ssh.execute(f"chown -R www-data:www-data {safe_dir}", timeout=10)

    return ThemeScaffoldResponse(
        success=True,
        machine_name=body.machine_name,
        path=f"web/themes/custom/{body.machine_name}",
        files_created=files_created,
        message=f"Theme '{body.name}' scaffolded successfully",
    )


# ============================================================
# Block Content CRUD (JSON:API)
# ============================================================


@router.get(
    "/{project_id}/blocks/{bundle}",
    response_model=BlockContentListResponse,
)
async def list_blocks(
    project_id: UUID,
    bundle: str,
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
    drupal: DrupalMCPService = Depends(get_drupal_mcp),
):
    """List block content entities for a given bundle."""
    user_id = get_user_id(payload)
    await validate_project_access(project_id, user_id, db)

    site = await _get_drupal_site(project_id, db)
    username, password = _get_credentials(drupal, site)
    blocks = await drupal.list_blocks(site.site_url, username, password, bundle)
    return BlockContentListResponse(
        blocks=[BlockContentResponse(**b) for b in blocks],
        total=len(blocks),
    )


@router.post(
    "/{project_id}/blocks/{bundle}",
    response_model=BlockContentResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_block(
    project_id: UUID,
    bundle: str,
    body: BlockContentCreateRequest,
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
    drupal: DrupalMCPService = Depends(get_drupal_mcp),
):
    """Create a new block content entity."""
    user_id = get_user_id(payload)
    await validate_project_access(project_id, user_id, db)

    site = await _get_drupal_site(project_id, db)
    username, password = _get_credentials(drupal, site)
    try:
        block = await drupal.create_block(
            site.site_url, username, password, bundle,
            body.info, body.body, body.body_format,
        )
        return BlockContentResponse(**block)
    except Exception as e:
        logger.exception("Failed to create block for project %s: %s", project_id, e)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to create block content",
        )


@router.patch(
    "/{project_id}/blocks/{bundle}/{block_uuid}",
    response_model=BlockContentResponse,
)
async def update_block(
    project_id: UUID,
    bundle: str,
    block_uuid: str,
    body: BlockContentUpdateRequest,
    payload: dict = Depends(get_current_user_payload),
    db: AsyncSession = Depends(get_db_session),
    drupal: DrupalMCPService = Depends(get_drupal_mcp),
):
    """Update an existing block content entity."""
    user_id = get_user_id(payload)
    await validate_project_access(project_id, user_id, db)

    site = await _get_drupal_site(project_id, db)
    username, password = _get_credentials(drupal, site)
    try:
        block = await drupal.update_block(
            site.site_url, username, password, bundle, block_uuid,
            body.info, body.body, body.body_format, body.status,
        )
        return BlockContentResponse(**block)
    except Exception as e:
        logger.exception("Failed to update block for project %s: %s", project_id, e)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to update block content",
        )
