"""Pydantic schemas for Drupal MCP site management."""

from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class DrupalConnectRequest(BaseModel):
    """Request to connect a Drupal site to a project."""

    site_url: str = Field(..., min_length=1, description="Remote Drupal site URL")
    api_key: str = Field(..., min_length=1, description="API key for the remote site")
    site_name: Optional[str] = Field(None, description="Friendly name for the site")


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

    drupal_version: Optional[str] = None
    content_types: List[str] = Field(default_factory=list)
    modules: List[str] = Field(default_factory=list)
    themes: List[str] = Field(default_factory=list)
    site_name: Optional[str] = None


class DrushCommandRequest(BaseModel):
    """Request to execute a Drush command remotely."""

    command: str = Field(..., min_length=1, description="Drush command to run")


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
