"""Drupal MCP service for managing remote Drupal site connections."""

import base64
import logging
import os
from typing import Any, Dict, Optional, Tuple

import httpx
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives.hashes import SHA256
from cryptography.hazmat.primitives.kdf.hkdf import HKDF

from app.kernel.base import BaseKernelService

logger = logging.getLogger(__name__)


def _derive_fernet_key(secret: str) -> bytes:
    """Derive a valid 32-byte Fernet key from the app SECRET_KEY using HKDF."""
    hkdf = HKDF(
        algorithm=SHA256(),
        length=32,
        salt=None,
        info=b"drupal-mcp-api-key-encryption",
    )
    key_bytes = hkdf.derive(secret.encode("utf-8"))
    return base64.urlsafe_b64encode(key_bytes)


class DrupalMCPService(BaseKernelService):
    """Manages connections to remote Drupal sites for config/sync operations."""

    def __init__(self, verify_ssl: bool = True) -> None:
        self._running = False
        secret = os.getenv("SECRET_KEY")
        if not secret:
            raise RuntimeError(
                "SECRET_KEY environment variable is required for DrupalMCPService "
                "API key encryption but is not set"
            )
        self._fernet = Fernet(_derive_fernet_key(secret))
        self._verify_ssl = verify_ssl
        self._http_timeout = 30.0
        self._drush_timeout = 60.0
        self._transfer_timeout = 120.0

    @property
    def name(self) -> str:
        return "drupal_mcp"

    @property
    def is_running(self) -> bool:
        return self._running

    async def startup(self) -> None:
        if self._running:
            return
        self._running = True
        logger.info("DrupalMCPService started")

    async def shutdown(self) -> None:
        self._running = False
        logger.info("DrupalMCPService stopped")

    async def health_check(self) -> Tuple[bool, str]:
        if not self._running:
            return False, "service not running"
        return True, "ok"

    # --- Encryption helpers ---

    def encrypt_api_key(self, key: str) -> str:
        return self._fernet.encrypt(key.encode("utf-8")).decode("utf-8")

    def decrypt_api_key(self, encrypted: str) -> str:
        return self._fernet.decrypt(encrypted.encode("utf-8")).decode("utf-8")

    # --- Remote Drupal API calls ---

    @staticmethod
    def _base_url(site_url: str) -> str:
        """Normalize a site URL by stripping trailing slashes."""
        return site_url.rstrip("/")

    def _headers(self, api_key: str) -> Dict[str, str]:
        return {
            "Authorization": f"Bearer {api_key}",
            "Accept": "application/json",
        }

    async def test_connection(self, site_url: str, api_key: str) -> Tuple[bool, str]:
        """Validate that the remote Drupal site is reachable and the key is valid."""
        url = f"{self._base_url(site_url)}/api/status"
        try:
            async with httpx.AsyncClient(timeout=self._http_timeout, verify=self._verify_ssl) as client:
                resp = await client.get(url, headers=self._headers(api_key))
                if resp.status_code == 200:
                    return True, "Connection successful"
                return False, f"Site returned HTTP {resp.status_code}"
        except httpx.ConnectError:
            return False, "Could not connect to the remote site"
        except httpx.TimeoutException:
            return False, "Connection timed out"
        except Exception as e:
            return False, f"Connection error: {str(e)}"

    async def get_site_config(
        self, site_url: str, api_key: str
    ) -> Dict[str, Any]:
        """Read content types, modules, themes from remote Drupal site."""
        url = f"{self._base_url(site_url)}/api/config"
        try:
            async with httpx.AsyncClient(timeout=self._http_timeout, verify=self._verify_ssl) as client:
                resp = await client.get(url, headers=self._headers(api_key))
                resp.raise_for_status()
                return resp.json()
        except Exception as e:
            logger.warning("Failed to fetch Drupal config from %s: %s", site_url, e)
            return {
                "error": str(e),
                "drupal_version": None,
                "content_types": [],
                "modules": [],
                "themes": [],
            }

    async def run_drush(
        self, site_url: str, api_key: str, command: str
    ) -> Dict[str, Any]:
        """Execute a Drush command on the remote Drupal site."""
        url = f"{self._base_url(site_url)}/api/drush"
        try:
            async with httpx.AsyncClient(timeout=self._drush_timeout, verify=self._verify_ssl) as client:
                resp = await client.post(
                    url,
                    headers=self._headers(api_key),
                    json={"command": command},
                )
                resp.raise_for_status()
                return resp.json()
        except Exception as e:
            logger.warning("Drush command failed on %s: %s", site_url, e)
            return {"command": command, "output": "", "exit_code": 1, "error": str(e)}

    async def pull_database(
        self,
        site_url: str,
        api_key: str,
        project_id: str,
        sandbox_mgr: Optional[Any] = None,
    ) -> Dict[str, Any]:
        """Pull database from remote Drupal and import into sandbox."""
        url = f"{self._base_url(site_url)}/api/db/export"
        try:
            async with httpx.AsyncClient(timeout=self._transfer_timeout, verify=self._verify_ssl) as client:
                resp = await client.get(url, headers=self._headers(api_key))
                resp.raise_for_status()
                dump_data = resp.content

            if sandbox_mgr and hasattr(sandbox_mgr, "import_database"):
                await sandbox_mgr.import_database(project_id, dump_data)

            return {
                "success": True,
                "message": f"Database pulled successfully ({len(dump_data)} bytes)",
            }
        except Exception as e:
            logger.warning("Database pull failed from %s: %s", site_url, e)
            return {"success": False, "message": f"Database pull failed: {str(e)}"}

    async def pull_files(
        self,
        site_url: str,
        api_key: str,
        project_id: str,
        sandbox_mgr: Optional[Any] = None,
    ) -> Dict[str, Any]:
        """Pull sites/default/files from remote Drupal into sandbox."""
        url = f"{self._base_url(site_url)}/api/files/export"
        try:
            async with httpx.AsyncClient(timeout=self._transfer_timeout, verify=self._verify_ssl) as client:
                resp = await client.get(url, headers=self._headers(api_key))
                resp.raise_for_status()
                archive_data = resp.content

            if sandbox_mgr and hasattr(sandbox_mgr, "import_files"):
                await sandbox_mgr.import_files(project_id, archive_data)

            return {
                "success": True,
                "message": f"Files pulled successfully ({len(archive_data)} bytes)",
            }
        except Exception as e:
            logger.warning("File pull failed from %s: %s", site_url, e)
            return {"success": False, "message": f"File pull failed: {str(e)}"}

    async def push_config(
        self,
        site_url: str,
        api_key: str,
        project_id: str,
        sandbox_mgr: Optional[Any] = None,
    ) -> Dict[str, Any]:
        """Export local config and push to remote Drupal site."""
        url = f"{self._base_url(site_url)}/api/config/import"
        try:
            config_data = b""
            if sandbox_mgr and hasattr(sandbox_mgr, "export_config"):
                config_data = await sandbox_mgr.export_config(project_id)

            if not config_data:
                return {
                    "success": False,
                    "message": "No config data to push (sandbox manager unavailable or returned empty config)",
                }

            async with httpx.AsyncClient(timeout=self._drush_timeout, verify=self._verify_ssl) as client:
                resp = await client.post(
                    url,
                    headers=self._headers(api_key),
                    content=config_data,
                )
                resp.raise_for_status()
                return {"success": True, "message": "Config pushed successfully"}
        except Exception as e:
            logger.warning("Config push failed to %s: %s", site_url, e)
            return {"success": False, "message": f"Config push failed: {str(e)}"}
