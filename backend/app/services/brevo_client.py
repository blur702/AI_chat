"""Brevo email/SMS marketing service — REST API client."""

import base64
import json
import logging
import os
import re
from typing import Any, Dict, List, Optional, Tuple

import httpx

from app.kernel.http_service import HttpKernelService

logger = logging.getLogger(__name__)

BASE_URL = "https://api.brevo.com/v3"
_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _extract_api_key_from_mcp_token(token: str) -> str:
    """Decode a Brevo MCP token (base64 JSON) to extract the raw API key."""
    decoded = base64.b64decode(token).decode("utf-8")
    data = json.loads(decoded)
    return data["api_key"]


class BrevoClient(HttpKernelService):
    """Kernel service for Brevo email/SMS marketing via REST API."""

    def __init__(self) -> None:
        super().__init__(BASE_URL)

        # Try BREVO_API_KEY first, then decode from BREVO_MCP_TOKEN
        self._api_key = os.getenv("BREVO_API_KEY", "")
        if not self._api_key:
            mcp_token = os.getenv("BREVO_MCP_TOKEN", "")
            if mcp_token:
                try:
                    self._api_key = _extract_api_key_from_mcp_token(mcp_token)
                except Exception as e:
                    logger.warning("Failed to decode BREVO_MCP_TOKEN: %s", e)

        self._sms_sender = os.getenv("SMS_SENDER", "Workstation")
        self._sms_default_recipient = os.getenv("SMS_DEFAULT_RECIPIENT", "")

    @property
    def name(self) -> str:
        return "brevo_client"

    @property
    def _health_endpoint(self) -> str:
        return "/account"

    @property
    def _default_headers(self) -> Dict[str, str]:
        return {"api-key": self._api_key, "Accept": "application/json"}

    @property
    def _default_timeout(self) -> httpx.Timeout:
        return httpx.Timeout(connect=5.0, read=30.0, write=5.0, pool=5.0)

    @property
    def is_configured(self) -> bool:
        return bool(self._api_key)

    async def startup(self) -> None:
        if self._running:
            return
        if not self._api_key:
            logger.warning("BrevoClient: no API key configured, service will be inactive")
            return
        await super().startup()

    async def health_check(self) -> Tuple[bool, str]:
        if not self._running:
            return False, "service not running"
        if not self._client:
            return True, "no API key configured"
        try:
            resp = await self._client.get(self._health_endpoint)
            if resp.status_code == 200:
                return True, "ok"
            return False, f"Brevo API returned {resp.status_code}"
        except Exception as e:
            return False, f"health check failed: {e}"

    def _ensure_client(self) -> httpx.AsyncClient:
        if not self._client:
            raise RuntimeError("BrevoClient is not configured (no API key)")
        return self._client

    # --- Account ---

    async def get_account(self) -> Dict[str, Any]:
        client = self._ensure_client()
        resp = await client.get("/account")
        resp.raise_for_status()
        return resp.json()

    # --- Contacts ---

    async def list_contacts(
        self, limit: int = 50, offset: int = 0
    ) -> Dict[str, Any]:
        client = self._ensure_client()
        resp = await client.get(
            "/contacts", params={"limit": limit, "offset": offset}
        )
        resp.raise_for_status()
        return resp.json()

    async def get_contact(self, identifier: str) -> Dict[str, Any]:
        client = self._ensure_client()
        resp = await client.get(f"/contacts/{identifier}")
        resp.raise_for_status()
        return resp.json()

    async def create_contact(
        self,
        email: str,
        attributes: Optional[Dict[str, Any]] = None,
        list_ids: Optional[List[int]] = None,
        update_enabled: bool = True,
    ) -> Dict[str, Any]:
        client = self._ensure_client()
        payload: Dict[str, Any] = {"email": email, "updateEnabled": update_enabled}
        if attributes:
            payload["attributes"] = attributes
        if list_ids:
            payload["listIds"] = list_ids
        resp = await client.post("/contacts", json=payload)
        resp.raise_for_status()
        return resp.json()

    async def update_contact(
        self,
        identifier: str,
        attributes: Optional[Dict[str, Any]] = None,
        list_ids: Optional[List[int]] = None,
    ) -> None:
        client = self._ensure_client()
        payload: Dict[str, Any] = {}
        if attributes:
            payload["attributes"] = attributes
        if list_ids:
            payload["listIds"] = list_ids
        resp = await client.put(f"/contacts/{identifier}", json=payload)
        resp.raise_for_status()

    # --- Transactional Email ---

    async def send_transactional_email(
        self,
        to: List[Dict[str, str]],
        subject: str,
        html_content: Optional[str] = None,
        text_content: Optional[str] = None,
        sender: Optional[Dict[str, str]] = None,
        template_id: Optional[int] = None,
        params: Optional[Dict[str, Any]] = None,
        tags: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        client = self._ensure_client()
        payload: Dict[str, Any] = {"to": to}

        if template_id is not None:
            payload["templateId"] = template_id
            if params:
                payload["params"] = params
        else:
            payload["subject"] = subject
            if html_content:
                payload["htmlContent"] = html_content
            if text_content:
                payload["textContent"] = text_content

        if sender:
            payload["sender"] = sender
        else:
            # Use default sender from account
            account = await self.get_account()
            email = str(account.get("email", "")).strip()
            fallback = os.getenv("MAIL_FROM", "").strip()
            if not _EMAIL_RE.fullmatch(email):
                if _EMAIL_RE.fullmatch(fallback):
                    email = fallback
                else:
                    raise ValueError("No valid sender email found (account email and MAIL_FROM are invalid)")
            company = account.get("companyName", "AI Workstation")
            payload["sender"] = {"email": email, "name": company}

        if tags:
            payload["tags"] = tags

        resp = await client.post("/smtp/email", json=payload)
        resp.raise_for_status()
        return resp.json()

    async def list_templates(
        self, limit: int = 50, offset: int = 0
    ) -> Dict[str, Any]:
        client = self._ensure_client()
        resp = await client.get(
            "/smtp/templates",
            params={"limit": limit, "offset": offset, "templateStatus": True},
        )
        resp.raise_for_status()
        return resp.json()

    # --- SMS ---

    async def send_sms(
        self,
        content: str,
        recipient: Optional[str] = None,
        sender: Optional[str] = None,
    ) -> Dict[str, Any]:
        client = self._ensure_client()
        actual_recipient = recipient or self._sms_default_recipient
        if not actual_recipient:
            raise ValueError("No SMS recipient specified and SMS_DEFAULT_RECIPIENT not set")

        actual_sender = sender or self._sms_sender
        payload = {
            "type": "transactional",
            "unicodeEnabled": True,
            "sender": actual_sender,
            "recipient": actual_recipient,
            "content": content,
        }
        resp = await client.post("/transactionalSMS/sms", json=payload)
        resp.raise_for_status()
        return resp.json()

    # --- Campaigns ---

    async def list_campaigns(
        self,
        campaign_type: str = "email",
        status: Optional[str] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> Dict[str, Any]:
        client = self._ensure_client()
        params: Dict[str, Any] = {
            "type": campaign_type,
            "limit": limit,
            "offset": offset,
        }
        if status:
            params["status"] = status
        resp = await client.get(f"/{campaign_type}Campaigns", params=params)
        resp.raise_for_status()
        return resp.json()

    async def get_campaign(self, campaign_id: int, campaign_type: str = "email") -> Dict[str, Any]:
        client = self._ensure_client()
        resp = await client.get(f"/{campaign_type}Campaigns/{campaign_id}")
        resp.raise_for_status()
        return resp.json()
