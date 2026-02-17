"""Pydantic schemas for project import and container portability."""

import ipaddress
import re
import socket
from datetime import datetime
from typing import Any, Dict, List, Literal, Optional
from urllib.parse import urlparse

from pydantic import BaseModel, Field, field_validator


# -------------------------------------------------------------------------
# Git Import
# -------------------------------------------------------------------------


class GitImportRequest(BaseModel):
    """Request to import a project from a Git repository."""

    name: str = Field(..., min_length=1, max_length=255)
    git_url: str = Field(..., min_length=1)
    branch: Optional[str] = Field(None, max_length=255)
    install_deps: bool = Field(True)
    path: Optional[str] = Field(None, max_length=500)

    @field_validator("git_url")
    @classmethod
    def validate_git_url(cls, v: str) -> str:
        v = v.strip()
        if not v.startswith("https://"):
            raise ValueError("Only HTTPS Git URLs are allowed")
        if not re.match(r"^https://[a-zA-Z0-9._\-]+/", v):
            raise ValueError("Invalid Git URL format")
        # SSRF protection: block localhost and private IP ranges
        parsed = urlparse(v)
        hostname = parsed.hostname or ""
        blocked = {"localhost", "127.0.0.1", "::1", "0.0.0.0"}
        if hostname in blocked:
            raise ValueError("Git URLs pointing to localhost are not allowed")
        try:
            addr = ipaddress.ip_address(hostname)
            if addr.is_private or addr.is_loopback or addr.is_link_local or addr.is_reserved or addr.is_multicast:
                raise ValueError("Git URLs pointing to private networks are not allowed")
        except ValueError as exc:
            if "not allowed" in str(exc):
                raise
            # hostname is not an IP address — resolve it and check the IPs
            try:
                resolved = socket.getaddrinfo(hostname, None, socket.AF_UNSPEC, socket.SOCK_STREAM)
                for family, _, _, _, sockaddr in resolved:
                    ip_str = sockaddr[0]
                    addr = ipaddress.ip_address(ip_str)
                    if addr.is_private or addr.is_loopback or addr.is_link_local or addr.is_reserved or addr.is_multicast:
                        raise ValueError("Git URLs pointing to private networks are not allowed")
            except socket.gaierror:
                pass  # DNS resolution failed — let the clone attempt handle it
            except ValueError as inner_exc:
                if "not allowed" in str(inner_exc):
                    raise
        return v


class GitImportResponse(BaseModel):
    """Response after starting a Git import."""

    import_id: str
    project_id: str
    status: str
    message: str


# -------------------------------------------------------------------------
# Website Import
# -------------------------------------------------------------------------


class WebsiteImportRequest(BaseModel):
    """Request to mirror a website into a new project."""

    name: str = Field(..., min_length=1, max_length=255)
    website_url: str = Field(..., min_length=1)
    depth: int = Field(default=2, ge=1, le=5)
    include_assets: bool = Field(default=True)
    same_domain_only: bool = Field(default=True)
    install_deps: bool = Field(default=False)
    max_pages: int = Field(default=30, ge=1, le=200)
    strategy: Literal["auto", "rendered"] = Field(default="auto")
    path: Optional[str] = Field(None, max_length=500)

    @field_validator("website_url")
    @classmethod
    def validate_website_url(cls, v: str) -> str:
        v = v.strip()
        parsed = urlparse(v)
        if parsed.scheme not in {"http", "https"}:
            raise ValueError("Only HTTP/HTTPS URLs are allowed")
        hostname = parsed.hostname or ""
        if not hostname:
            raise ValueError("Invalid website URL")
        blocked = {"localhost", "127.0.0.1", "::1", "0.0.0.0"}
        if hostname in blocked:
            raise ValueError("Website URLs pointing to localhost are not allowed")
        try:
            addr = ipaddress.ip_address(hostname)
            if addr.is_private or addr.is_loopback or addr.is_link_local or addr.is_reserved or addr.is_multicast:
                raise ValueError("Website URLs pointing to private networks are not allowed")
        except ValueError as exc:
            if "not allowed" in str(exc):
                raise
            try:
                resolved = socket.getaddrinfo(hostname, None, socket.AF_UNSPEC, socket.SOCK_STREAM)
                for _, _, _, _, sockaddr in resolved:
                    ip_str = sockaddr[0]
                    addr = ipaddress.ip_address(ip_str)
                    if addr.is_private or addr.is_loopback or addr.is_link_local or addr.is_reserved or addr.is_multicast:
                        raise ValueError("Website URLs pointing to private networks are not allowed")
            except socket.gaierror:
                pass
            except ValueError as inner_exc:
                if "not allowed" in str(inner_exc):
                    raise
        return v


class WebsiteImportResponse(BaseModel):
    """Response after starting a website mirror import."""

    import_id: str
    project_id: str
    status: str
    message: str


# -------------------------------------------------------------------------
# Archive Upload
# -------------------------------------------------------------------------


class ArchiveUploadResponse(BaseModel):
    """Response after starting an archive import."""

    import_id: str
    project_id: str
    status: str
    message: str


# -------------------------------------------------------------------------
# Import Status
# -------------------------------------------------------------------------


class ImportStatusResponse(BaseModel):
    """Full import job state for polling."""

    import_id: str
    project_id: str
    import_type: str
    source_url: Optional[str] = None
    status: str
    detected_type: Optional[str] = None
    detected_template_id: Optional[str] = None
    progress_message: Optional[str] = None
    error_message: Optional[str] = None
    import_options: Dict[str, Any] = Field(default_factory=dict)
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


# -------------------------------------------------------------------------
# Clone
# -------------------------------------------------------------------------


class CloneProjectRequest(BaseModel):
    """Request to clone a project."""

    name: str = Field(..., min_length=1, max_length=255)
    path: Optional[str] = Field(None, max_length=500)


class CloneProjectResponse(BaseModel):
    """Response after cloning a project."""

    project_id: str
    name: str
    message: str


# -------------------------------------------------------------------------
# Snapshots
# -------------------------------------------------------------------------


class SnapshotCreateRequest(BaseModel):
    """Request to create a container snapshot."""

    name: str = Field(..., min_length=1, max_length=100)

    @field_validator("name")
    @classmethod
    def sanitize_name(cls, v: str) -> str:
        return re.sub(r"[^a-zA-Z0-9_-]", "-", v.strip())


class SnapshotInfo(BaseModel):
    """Information about a single snapshot."""

    name: str
    image_id: str
    created_at: Optional[str] = None
    size: Optional[int] = None


class SnapshotListResponse(BaseModel):
    """List of snapshots for a project."""

    project_id: str
    snapshots: List[SnapshotInfo] = Field(default_factory=list)


class SnapshotRestoreResponse(BaseModel):
    """Response after restoring a snapshot."""

    project_id: str
    snapshot_name: str
    container_id: str
    message: str


# -------------------------------------------------------------------------
# Detection
# -------------------------------------------------------------------------


class DetectionResultResponse(BaseModel):
    """Project type detection result."""

    project_type: str
    framework: Optional[str] = None
    suggested_template_id: Optional[str] = None
    confidence: float = 0.0
