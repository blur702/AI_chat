"""Pydantic schemas for Drupal MCP site management."""

import ipaddress
import os
import socket
from datetime import datetime
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

from pydantic import BaseModel, ConfigDict, Field, field_validator


class DrupalConnectRequest(BaseModel):
    """Request to connect a Drupal site to a project."""

    site_url: str = Field(..., min_length=1, max_length=2048, description="Remote Drupal site URL")
    username: str = Field(..., min_length=1, max_length=255, description="Drupal username")
    password: str = Field(..., min_length=1, max_length=4096, description="Drupal password")
    site_name: Optional[str] = Field(None, max_length=255, description="Friendly name for the site")

    @field_validator("site_url")
    @classmethod
    def validate_site_url(cls, v: str) -> str:
        """Validate URL scheme and block private/internal addresses (SSRF protection)."""
        parsed = urlparse(v.strip())
        if parsed.scheme != "https":
            raise ValueError("Site URL must use https scheme")
        hostname = parsed.hostname
        if not hostname:
            raise ValueError("Site URL must include a hostname")
        # Allow explicitly trusted internal hosts (e.g. local Drupal mirror)
        allowed_hosts = os.getenv("DRUPAL_ALLOWED_HOSTS", "")
        if allowed_hosts:
            allowed_set = {h.strip().lower() for h in allowed_hosts.split(",") if h.strip()}
            if hostname.lower() in allowed_set:
                return v.strip()
        # Block localhost and common internal hostnames
        blocked_hosts = {"localhost", "127.0.0.1", "0.0.0.0", "[::1]"}
        if hostname.lower() in blocked_hosts:
            raise ValueError("Site URL must not point to localhost or loopback addresses")
        # Block private IP ranges
        try:
            addr = ipaddress.ip_address(hostname)
        except ValueError:
            # Not a raw IP — resolve the hostname and check the IPs
            try:
                resolved = socket.getaddrinfo(hostname, None, socket.AF_UNSPEC, socket.SOCK_STREAM)
                for family, _, _, _, sockaddr in resolved:
                    ip_str = sockaddr[0]
                    addr = ipaddress.ip_address(ip_str)
                    if addr.is_private or addr.is_loopback or addr.is_link_local or addr.is_reserved or addr.is_multicast:
                        raise ValueError("Site URL must not point to private or reserved IP addresses")
            except socket.gaierror:
                pass  # DNS resolution failed — let the connection attempt handle it
            except ValueError as inner_exc:
                if "must not point" in str(inner_exc):
                    raise
        else:
            if addr.is_private or addr.is_loopback or addr.is_link_local or addr.is_reserved or addr.is_multicast:
                raise ValueError("Site URL must not point to private or reserved IP addresses")
        return v.strip()


class DrupalConnectResponse(BaseModel):
    """Response after connecting a Drupal site."""

    id: str
    project_id: str
    site_url: str
    site_name: Optional[str] = None
    connected: bool = True
    message: str = "Site connected successfully"


class DrupalSiteResponse(BaseModel):
    """Info about a connected Drupal site."""

    id: str
    project_id: str
    site_url: str
    site_name: Optional[str] = None
    last_sync_at: Optional[datetime] = None
    sync_config: Optional[Dict[str, Any]] = None
    created_at: datetime
    updated_at: datetime


class DrupalSiteConfig(BaseModel):
    """Remote Drupal site configuration snapshot."""

    model_config = ConfigDict(extra="ignore")

    drupal_version: Optional[str] = None
    content_types: List[str] = Field(default_factory=list)
    modules: List[str] = Field(default_factory=list)
    themes: List[str] = Field(default_factory=list)
    site_name: Optional[str] = None
    error: Optional[str] = None


class DrushCommandRequest(BaseModel):
    """Request to execute a Drush command remotely."""

    command: str = Field(..., min_length=1, max_length=1024, description="Drush command to run")


class DrushCommandResponse(BaseModel):
    """Response from a remote Drush command execution."""

    command: str
    output: str
    exit_code: int = 0
    error: Optional[str] = None


class SyncStatusResponse(BaseModel):
    """Sync status for a connected Drupal site."""

    connected: bool
    last_sync_at: Optional[datetime] = None
    site_url: Optional[str] = None
    site_name: Optional[str] = None


class SyncResponse(BaseModel):
    """Response from a pull or push operation."""

    success: bool
    message: str
    details: Optional[Dict[str, Any]] = None


# --- Content CRUD schemas ---


class DrupalContentType(BaseModel):
    """A Drupal content type (node bundle)."""

    id: str
    label: str
    description: Optional[str] = None


class DrupalNode(BaseModel):
    """A Drupal node (content entity)."""

    model_config = ConfigDict(extra="ignore")

    uuid: str
    title: str
    bundle: str
    status: bool = True
    created: Optional[str] = None
    changed: Optional[str] = None
    body: Optional[str] = None
    body_format: Optional[str] = None


class DrupalNodeListResponse(BaseModel):
    """Paginated list of Drupal nodes."""

    nodes: List[DrupalNode] = Field(default_factory=list)
    total: Optional[int] = None


class DrupalNodeCreateRequest(BaseModel):
    """Request to create a Drupal node."""

    title: str = Field(..., min_length=1, max_length=512)
    body: Optional[str] = None
    body_format: str = Field(default="basic_html")
    status: bool = True


class DrupalNodeUpdateRequest(BaseModel):
    """Request to update an existing Drupal node."""

    title: Optional[str] = Field(None, max_length=512)
    body: Optional[str] = None
    body_format: Optional[str] = None
    status: Optional[bool] = None


# --- Staging / Clone / Push schemas ---


class StagingStatusResponse(BaseModel):
    """Status of the Drupal staging sandbox."""

    sandbox_running: bool = False
    container_id: Optional[str] = None
    preview_url: Optional[str] = None
    last_clone_at: Optional[datetime] = None
    site_url: Optional[str] = None
    site_name: Optional[str] = None


class CloneRequest(BaseModel):
    """Request to clone production Drupal into sandbox."""

    include_files: bool = Field(default=True, description="Include files (themes, modules, uploads)")
    include_db: bool = Field(default=True, description="Include database")


class CloneResponse(BaseModel):
    """Response from a clone operation."""

    success: bool
    message: str
    preview_url: Optional[str] = None
    details: Optional[Dict[str, Any]] = None


class PushRequest(BaseModel):
    """Request to push sandbox changes to production."""

    include_files: bool = Field(default=True, description="Push files to production")
    include_db: bool = Field(default=False, description="Push database to production (destructive)")
    confirm: bool = Field(default=False, description="Must be True to proceed")


class PushResponse(BaseModel):
    """Response from a push operation."""

    success: bool
    message: str
    details: Optional[Dict[str, Any]] = None
