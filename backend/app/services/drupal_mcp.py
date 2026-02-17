"""Drupal MCP service — JSON:API with Basic Auth."""

import base64
import json
import logging
import os
from typing import Any, Dict, List, Optional, Tuple

import httpx
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives.hashes import SHA256
from cryptography.hazmat.primitives.kdf.hkdf import HKDF

from app.kernel.base import BaseKernelService

logger = logging.getLogger(__name__)

JSONAPI_CONTENT_TYPE = "application/vnd.api+json"


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
    """Manages connections to remote Drupal sites via JSON:API + Basic Auth."""

    def __init__(self, verify_ssl: bool = True) -> None:
        self._running = False
        secret = os.getenv("SECRET_KEY")
        if not secret:
            raise RuntimeError(
                "SECRET_KEY environment variable is required for DrupalMCPService "
                "credential encryption but is not set"
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

    # --- Credential encryption helpers ---

    def encrypt_credentials(self, username: str, password: str) -> str:
        """Encrypt username+password as JSON blob."""
        payload = json.dumps({"username": username, "password": password})
        return self._fernet.encrypt(payload.encode("utf-8")).decode("utf-8")

    def decrypt_credentials(self, encrypted: str) -> Tuple[str, str]:
        """Decrypt stored credentials, returning (username, password)."""
        payload = self._fernet.decrypt(encrypted.encode("utf-8")).decode("utf-8")
        data = json.loads(payload)
        return data["username"], data["password"]

    # Backwards-compat shims for old column data (plain API key strings)
    def encrypt_api_key(self, key: str) -> str:
        return self.encrypt_credentials(key, "")

    def decrypt_api_key(self, encrypted: str) -> str:
        try:
            u, p = self.decrypt_credentials(encrypted)
            return u
        except (json.JSONDecodeError, KeyError):
            # Old format: plain encrypted string
            return self._fernet.decrypt(encrypted.encode("utf-8")).decode("utf-8")

    # --- HTTP helpers ---

    @staticmethod
    def _base_url(site_url: str) -> str:
        return site_url.rstrip("/")

    @staticmethod
    def _basic_auth_header(username: str, password: str) -> str:
        token = base64.b64encode(f"{username}:{password}".encode("utf-8")).decode("ascii")
        return f"Basic {token}"

    def _headers(self, username: str, password: str) -> Dict[str, str]:
        return {
            "Authorization": self._basic_auth_header(username, password),
            "Accept": JSONAPI_CONTENT_TYPE,
        }

    def _write_headers(self, username: str, password: str) -> Dict[str, str]:
        h = self._headers(username, password)
        h["Content-Type"] = JSONAPI_CONTENT_TYPE
        return h

    # --- Connection test ---

    async def test_connection(
        self, site_url: str, username: str, password: str
    ) -> Tuple[bool, str]:
        """Validate credentials by hitting the JSON:API root."""
        url = f"{self._base_url(site_url)}/jsonapi"
        try:
            async with httpx.AsyncClient(
                timeout=self._http_timeout, verify=self._verify_ssl
            ) as client:
                resp = await client.get(url, headers=self._headers(username, password))
                if resp.status_code == 200:
                    return True, "Connection successful"
                if resp.status_code in (401, 403):
                    return False, "Authentication failed — check username and password"
                return False, f"Site returned HTTP {resp.status_code}"
        except httpx.ConnectError:
            return False, "Could not connect to the remote site"
        except httpx.TimeoutException:
            return False, "Connection timed out"
        except Exception as e:
            return False, f"Connection error: {str(e)}"

    # --- Site config (content types from JSON:API) ---

    async def get_site_config(
        self, site_url: str, username: str, password: str
    ) -> Dict[str, Any]:
        """Read content types from the Drupal JSON:API."""
        base = self._base_url(site_url)
        headers = self._headers(username, password)
        content_types: List[str] = []

        try:
            async with httpx.AsyncClient(
                timeout=self._http_timeout, verify=self._verify_ssl
            ) as client:
                resp = await client.get(
                    f"{base}/jsonapi/node_type/node_type", headers=headers
                )
                resp.raise_for_status()
                data = resp.json()
                for item in data.get("data", []):
                    attrs = item.get("attributes", {})
                    ct_id = attrs.get("drupal_internal__type") or item.get("id", "")
                    if ct_id:
                        content_types.append(ct_id)
        except Exception as e:
            logger.warning("Failed to fetch content types from %s: %s", site_url, e)
            return {
                "error": str(e),
                "drupal_version": None,
                "content_types": [],
                "modules": [],
                "themes": [],
            }

        return {
            "drupal_version": None,
            "content_types": content_types,
            "modules": [],
            "themes": [],
        }

    # --- Content CRUD ---

    async def list_content_types(
        self, site_url: str, username: str, password: str
    ) -> List[Dict[str, Any]]:
        """Return list of {id, label, description} for each node type."""
        base = self._base_url(site_url)
        headers = self._headers(username, password)
        result: List[Dict[str, Any]] = []

        try:
            async with httpx.AsyncClient(
                timeout=self._http_timeout, verify=self._verify_ssl
            ) as client:
                resp = await client.get(
                    f"{base}/jsonapi/node_type/node_type", headers=headers
                )
                resp.raise_for_status()
                data = resp.json()
                for item in data.get("data", []):
                    attrs = item.get("attributes", {})
                    result.append({
                        "id": attrs.get("drupal_internal__type", ""),
                        "label": attrs.get("name", ""),
                        "description": attrs.get("description", ""),
                    })
        except Exception as e:
            logger.warning("Failed to list content types from %s: %s", site_url, e)

        return result

    @staticmethod
    def _validate_bundle(bundle: str) -> None:
        """Validate bundle identifier to prevent URL injection."""
        import re
        if not re.match(r"^[a-z][a-z0-9_]*$", bundle):
            raise ValueError(f"Invalid bundle identifier: {bundle}")

    async def list_nodes(
        self,
        site_url: str,
        username: str,
        password: str,
        bundle: str,
    ) -> List[Dict[str, Any]]:
        """List nodes for a given bundle via JSON:API."""
        self._validate_bundle(bundle)
        base = self._base_url(site_url)
        headers = self._headers(username, password)
        url = (
            f"{base}/jsonapi/node/{bundle}"
            f"?fields[node--{bundle}]=title,status,created,changed,body"
            f"&sort=-changed"
            f"&page[limit]=50"
        )

        try:
            async with httpx.AsyncClient(
                timeout=self._http_timeout, verify=self._verify_ssl
            ) as client:
                resp = await client.get(url, headers=headers)
                resp.raise_for_status()
                data = resp.json()
                nodes = []
                for item in data.get("data", []):
                    attrs = item.get("attributes", {})
                    body_field = attrs.get("body") or {}
                    nodes.append({
                        "uuid": item.get("id", ""),
                        "title": attrs.get("title", ""),
                        "bundle": bundle,
                        "status": attrs.get("status", True),
                        "created": attrs.get("created"),
                        "changed": attrs.get("changed"),
                        "body": body_field.get("value") if isinstance(body_field, dict) else None,
                        "body_format": body_field.get("format") if isinstance(body_field, dict) else None,
                    })
                return nodes
        except Exception as e:
            logger.warning("Failed to list nodes (%s) from %s: %s", bundle, site_url, e)
            return []

    async def get_node(
        self,
        site_url: str,
        username: str,
        password: str,
        bundle: str,
        uuid: str,
    ) -> Optional[Dict[str, Any]]:
        """Fetch a single node by UUID."""
        base = self._base_url(site_url)
        headers = self._headers(username, password)
        url = f"{base}/jsonapi/node/{bundle}/{uuid}"

        try:
            async with httpx.AsyncClient(
                timeout=self._http_timeout, verify=self._verify_ssl
            ) as client:
                resp = await client.get(url, headers=headers)
                resp.raise_for_status()
                data = resp.json()
                item = data.get("data", {})
                attrs = item.get("attributes", {})
                body_field = attrs.get("body") or {}
                return {
                    "uuid": item.get("id", ""),
                    "title": attrs.get("title", ""),
                    "bundle": bundle,
                    "status": attrs.get("status", True),
                    "created": attrs.get("created"),
                    "changed": attrs.get("changed"),
                    "body": body_field.get("value") if isinstance(body_field, dict) else None,
                    "body_format": body_field.get("format") if isinstance(body_field, dict) else None,
                }
        except Exception as e:
            logger.warning("Failed to get node %s from %s: %s", uuid, site_url, e)
            return None

    async def create_node(
        self,
        site_url: str,
        username: str,
        password: str,
        bundle: str,
        title: str,
        body: Optional[str] = None,
        body_format: str = "basic_html",
        node_status: bool = True,
    ) -> Dict[str, Any]:
        """Create a new node via JSON:API."""
        base = self._base_url(site_url)
        headers = self._write_headers(username, password)
        url = f"{base}/jsonapi/node/{bundle}"

        attributes: Dict[str, Any] = {
            "title": title,
            "status": node_status,
        }
        if body is not None:
            attributes["body"] = {"value": body, "format": body_format}

        payload = {
            "data": {
                "type": f"node--{bundle}",
                "attributes": attributes,
            }
        }

        try:
            async with httpx.AsyncClient(
                timeout=self._http_timeout, verify=self._verify_ssl
            ) as client:
                resp = await client.post(url, headers=headers, json=payload)
                resp.raise_for_status()
                data = resp.json()
                item = data.get("data", {})
                attrs = item.get("attributes", {})
                body_field = attrs.get("body") or {}
                return {
                    "uuid": item.get("id", ""),
                    "title": attrs.get("title", ""),
                    "bundle": bundle,
                    "status": attrs.get("status", True),
                    "created": attrs.get("created"),
                    "changed": attrs.get("changed"),
                    "body": body_field.get("value") if isinstance(body_field, dict) else None,
                    "body_format": body_field.get("format") if isinstance(body_field, dict) else None,
                }
        except httpx.HTTPStatusError as e:
            detail = ""
            try:
                detail = e.response.text
            except Exception:
                pass
            logger.warning("Failed to create node on %s: %s %s", site_url, e, detail)
            raise
        except Exception as e:
            logger.warning("Failed to create node on %s: %s", site_url, e)
            raise

    async def update_node(
        self,
        site_url: str,
        username: str,
        password: str,
        bundle: str,
        uuid: str,
        title: Optional[str] = None,
        body: Optional[str] = None,
        body_format: Optional[str] = None,
        node_status: Optional[bool] = None,
    ) -> Dict[str, Any]:
        """Update an existing node via JSON:API PATCH."""
        base = self._base_url(site_url)
        headers = self._write_headers(username, password)
        url = f"{base}/jsonapi/node/{bundle}/{uuid}"

        attributes: Dict[str, Any] = {}
        if title is not None:
            attributes["title"] = title
        if body is not None:
            body_obj: Dict[str, Any] = {"value": body}
            if body_format is not None:
                body_obj["format"] = body_format
            attributes["body"] = body_obj
        if node_status is not None:
            attributes["status"] = node_status

        payload = {
            "data": {
                "type": f"node--{bundle}",
                "id": uuid,
                "attributes": attributes,
            }
        }

        try:
            async with httpx.AsyncClient(
                timeout=self._http_timeout, verify=self._verify_ssl
            ) as client:
                resp = await client.patch(url, headers=headers, json=payload)
                resp.raise_for_status()
                data = resp.json()
                item = data.get("data", {})
                attrs = item.get("attributes", {})
                body_field = attrs.get("body") or {}
                return {
                    "uuid": item.get("id", ""),
                    "title": attrs.get("title", ""),
                    "bundle": bundle,
                    "status": attrs.get("status", True),
                    "created": attrs.get("created"),
                    "changed": attrs.get("changed"),
                    "body": body_field.get("value") if isinstance(body_field, dict) else None,
                    "body_format": body_field.get("format") if isinstance(body_field, dict) else None,
                }
        except httpx.HTTPStatusError as e:
            detail = ""
            try:
                detail = e.response.text
            except Exception:
                pass
            logger.warning("Failed to update node %s on %s: %s %s", uuid, site_url, e, detail)
            raise
        except Exception as e:
            logger.warning("Failed to update node %s on %s: %s", uuid, site_url, e)
            raise

    # --- Legacy endpoints (kept for drush/pull/push — will 404 gracefully) ---

    async def run_drush(
        self, site_url: str, username: str, password: str, command: str
    ) -> Dict[str, Any]:
        """Execute a Drush command on the remote Drupal site."""
        url = f"{self._base_url(site_url)}/api/drush"
        try:
            async with httpx.AsyncClient(
                timeout=self._drush_timeout, verify=self._verify_ssl
            ) as client:
                resp = await client.post(
                    url,
                    headers=self._headers(username, password),
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
        username: str,
        password: str,
        project_id: str,
        sandbox_mgr: Optional[Any] = None,
    ) -> Dict[str, Any]:
        """Pull database from remote Drupal and import into sandbox."""
        url = f"{self._base_url(site_url)}/api/db/export"
        try:
            async with httpx.AsyncClient(
                timeout=self._transfer_timeout, verify=self._verify_ssl
            ) as client:
                resp = await client.get(url, headers=self._headers(username, password))
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
        username: str,
        password: str,
        project_id: str,
        sandbox_mgr: Optional[Any] = None,
    ) -> Dict[str, Any]:
        """Pull sites/default/files from remote Drupal into sandbox."""
        url = f"{self._base_url(site_url)}/api/files/export"
        try:
            async with httpx.AsyncClient(
                timeout=self._transfer_timeout, verify=self._verify_ssl
            ) as client:
                resp = await client.get(url, headers=self._headers(username, password))
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
        username: str,
        password: str,
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
            async with httpx.AsyncClient(
                timeout=self._drush_timeout, verify=self._verify_ssl
            ) as client:
                resp = await client.post(
                    url,
                    headers=self._headers(username, password),
                    content=config_data,
                )
                resp.raise_for_status()
                return {"success": True, "message": "Config pushed successfully"}
        except Exception as e:
            logger.warning("Config push failed to %s: %s", site_url, e)
            return {"success": False, "message": f"Config push failed: {str(e)}"}
