"""Pydantic schemas for Drupal MCP site management."""

import ipaddress
from datetime import datetime
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

from pydantic import BaseModel, ConfigDict, Field, field_validator


class DrupalConnectRequest(BaseModel):
    """Request to connect a Drupal site to a project."""

    site_url: str = Field(..., min_length=1, max_length=2048, description="Remote Drupal site URL")
    api_key: str = Field(..., min_length=1, max_length=4096, description="API key for the remote site")
    site_name: Optional[str] = Field(None, max_length=255, description="Friendly name for the site")

    @field_validator("site_url")
    @classmethod
    def validate_site_url(cls, v: str) -> str:
        """Validate URL scheme and block private/internal addresses (SSRF protection)."""
        parsed = urlparse(v.strip())
        if parsed.scheme not in ("http", "https"):
            raise ValueError("Site URL must use http or https scheme")
        hostname = parsed.hostname
        if not hostname:
            raise ValueError("Site URL must include a hostname")
        # Block localhost and common internal hostnames
        blocked_hosts = {"localhost", "127.0.0.1", "0.0.0.0", "[::1]"}
        if hostname.lower() in blocked_hosts:
            raise ValueError("Site URL must not point to localhost or loopback addresses")
        # Block private IP ranges
        try:
            addr = ipaddress.ip_address(hostname)
            if addr.is_private or addr.is_loopback or addr.is_link_local or addr.is_reserved:
                raise ValueError("Site URL must not point to private or reserved IP addresses")
        except ValueError as exc:
            # Not a raw IP — that's fine (it's a hostname)
            if "must not" in str(exc):
                raise
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
