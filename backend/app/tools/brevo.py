"""Brevo email/SMS marketing tools for AI chat agent."""

import logging
from typing import Any, Dict, Optional, Set

from app.kernel.tool_base import BaseTool
from app.services.brevo_client import BrevoClient

logger = logging.getLogger(__name__)


class BrevoSendEmailTool(BaseTool):
    """Send a transactional email via Brevo."""

    def __init__(self, client: BrevoClient) -> None:
        self._client = client

    @property
    def name(self) -> str:
        return "brevo_send_email"

    @property
    def description(self) -> str:
        return (
            "Send a transactional email via Brevo. Provide recipient email, "
            "subject, and HTML or text content. Can optionally use a Brevo "
            "template by ID instead of inline content."
        )

    @property
    def parameters_schema(self) -> Dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "to_email": {
                    "type": "string",
                    "description": "Recipient email address.",
                },
                "to_name": {
                    "type": "string",
                    "description": "Recipient display name (optional).",
                },
                "subject": {
                    "type": "string",
                    "description": "Email subject line.",
                },
                "html_content": {
                    "type": "string",
                    "description": "HTML body of the email.",
                },
                "text_content": {
                    "type": "string",
                    "description": "Plain text body (fallback or alternative to HTML).",
                },
                "template_id": {
                    "type": "integer",
                    "description": "Brevo template ID to use instead of inline content.",
                },
                "params": {
                    "type": "object",
                    "description": "Template parameters (key-value pairs) when using template_id.",
                },
            },
            "required": ["to_email", "subject"],
        }

    @property
    def required_permissions(self) -> Set[str]:
        return {"tools.execute"}

    async def execute(
        self,
        parameters: Dict[str, Any],
        context: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        to = [{"email": parameters["to_email"]}]
        if parameters.get("to_name"):
            to[0]["name"] = parameters["to_name"]

        try:
            result = await self._client.send_transactional_email(
                to=to,
                subject=parameters["subject"],
                html_content=parameters.get("html_content"),
                text_content=parameters.get("text_content"),
                template_id=parameters.get("template_id"),
                params=parameters.get("params"),
            )
        except Exception as exc:
            logger.error("Brevo send_transactional_email failed: %s", exc)
            return {
                "success": False,
                "error": str(exc),
            }
        return {
            "success": True,
            "message_id": result.get("messageId"),
            "recipient": parameters["to_email"],
        }


class BrevoSendSMSTool(BaseTool):
    """Send a transactional SMS via Brevo."""

    def __init__(self, client: BrevoClient) -> None:
        self._client = client

    @property
    def name(self) -> str:
        return "brevo_send_sms"

    @property
    def description(self) -> str:
        return (
            "Send a transactional SMS message via Brevo. If no recipient is "
            "provided, the default recipient from configuration is used."
        )

    @property
    def parameters_schema(self) -> Dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "content": {
                    "type": "string",
                    "description": "SMS message content (max 160 chars).",
                    "maxLength": 160,
                },
                "recipient": {
                    "type": "string",
                    "description": "Phone number in E.164 format (e.g. 14155551234). Optional — uses default if omitted.",
                },
            },
            "required": ["content"],
        }

    @property
    def required_permissions(self) -> Set[str]:
        return {"tools.execute"}

    async def execute(
        self,
        parameters: Dict[str, Any],
        context: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        try:
            result = await self._client.send_sms(
                content=parameters["content"],
                recipient=parameters.get("recipient"),
            )
            return {
                "success": True,
                "message_id": result.get("messageId"),
                "remaining_credits": result.get("remainingCredits"),
            }
        except Exception as exc:
            logger.error("Brevo send_sms failed: %s", exc)
            return {"success": False, "error": str(exc)}


class BrevoListContactsTool(BaseTool):
    """List contacts from the Brevo account."""

    def __init__(self, client: BrevoClient) -> None:
        self._client = client

    @property
    def name(self) -> str:
        return "brevo_list_contacts"

    @property
    def description(self) -> str:
        return "List contacts from the Brevo account with pagination."

    @property
    def parameters_schema(self) -> Dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "limit": {
                    "type": "integer",
                    "description": "Max contacts to return (1-50). Default: 20.",
                    "minimum": 1,
                    "maximum": 50,
                },
                "offset": {
                    "type": "integer",
                    "description": "Pagination offset. Default: 0.",
                    "minimum": 0,
                },
            },
        }

    @property
    def required_permissions(self) -> Set[str]:
        return {"tools.execute"}

    async def execute(
        self,
        parameters: Dict[str, Any],
        context: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        limit = parameters.get("limit", 20)
        offset = parameters.get("offset", 0)
        data = await self._client.list_contacts(limit=limit, offset=offset)
        contacts = [
            {
                "email": c.get("email"),
                "id": c.get("id"),
                "attributes": c.get("attributes"),
            }
            for c in data.get("contacts", [])
        ]
        return {
            "contacts": contacts,
            "count": data.get("count", len(contacts)),
        }


class BrevoCreateContactTool(BaseTool):
    """Create or update a contact in Brevo."""

    def __init__(self, client: BrevoClient) -> None:
        self._client = client

    @property
    def name(self) -> str:
        return "brevo_create_contact"

    @property
    def description(self) -> str:
        return (
            "Create a new contact in Brevo, or update if the email already exists. "
            "Can set attributes like FIRSTNAME, LASTNAME, SMS phone number."
        )

    @property
    def parameters_schema(self) -> Dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "email": {
                    "type": "string",
                    "description": "Contact email address.",
                },
                "first_name": {
                    "type": "string",
                    "description": "Contact first name.",
                },
                "last_name": {
                    "type": "string",
                    "description": "Contact last name.",
                },
                "sms": {
                    "type": "string",
                    "description": "Contact phone number for SMS (E.164 format).",
                },
            },
            "required": ["email"],
        }

    @property
    def required_permissions(self) -> Set[str]:
        return {"tools.execute"}

    async def execute(
        self,
        parameters: Dict[str, Any],
        context: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        attributes: Dict[str, Any] = {}
        if parameters.get("first_name"):
            attributes["FIRSTNAME"] = parameters["first_name"]
        if parameters.get("last_name"):
            attributes["LASTNAME"] = parameters["last_name"]
        if parameters.get("sms"):
            attributes["SMS"] = parameters["sms"]

        await self._client.create_contact(
            email=parameters["email"],
            attributes=attributes or None,
            update_enabled=True,
        )
        return {
            "success": True,
            "email": parameters["email"],
            "message": "Contact created/updated successfully.",
        }


class BrevoListTemplatesTool(BaseTool):
    """List email templates from Brevo."""

    def __init__(self, client: BrevoClient) -> None:
        self._client = client

    @property
    def name(self) -> str:
        return "brevo_list_templates"

    @property
    def description(self) -> str:
        return "List available email templates from the Brevo account."

    @property
    def parameters_schema(self) -> Dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "limit": {
                    "type": "integer",
                    "description": "Max templates to return (1-50). Default: 20.",
                    "minimum": 1,
                    "maximum": 50,
                },
            },
        }

    @property
    def required_permissions(self) -> Set[str]:
        return {"tools.execute"}

    async def execute(
        self,
        parameters: Dict[str, Any],
        context: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        limit = parameters.get("limit", 20)
        data = await self._client.list_templates(limit=limit)
        templates = [
            {
                "id": t.get("id"),
                "name": t.get("name"),
                "subject": t.get("subject"),
                "is_active": t.get("isActive"),
            }
            for t in data.get("templates", [])
        ]
        return {
            "templates": templates,
            "count": data.get("count", len(templates)),
        }


class BrevoListCampaignsTool(BaseTool):
    """List email or SMS campaigns from Brevo."""

    def __init__(self, client: BrevoClient) -> None:
        self._client = client

    @property
    def name(self) -> str:
        return "brevo_list_campaigns"

    @property
    def description(self) -> str:
        return "List email or SMS campaigns from the Brevo account with optional status filter."

    @property
    def parameters_schema(self) -> Dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "type": {
                    "type": "string",
                    "description": "Campaign type: 'email' or 'sms'. Default: 'email'.",
                    "enum": ["email", "sms"],
                },
                "status": {
                    "type": "string",
                    "description": "Filter by status (e.g. 'sent', 'draft', 'queued').",
                },
                "limit": {
                    "type": "integer",
                    "description": "Max campaigns to return (1-50). Default: 20.",
                    "minimum": 1,
                    "maximum": 50,
                },
            },
        }

    @property
    def required_permissions(self) -> Set[str]:
        return {"tools.execute"}

    async def execute(
        self,
        parameters: Dict[str, Any],
        context: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        campaign_type = parameters.get("type", "email")
        status = parameters.get("status")
        limit = parameters.get("limit", 20)
        data = await self._client.list_campaigns(
            campaign_type=campaign_type, status=status, limit=limit
        )
        campaigns = [
            {
                "id": c.get("id"),
                "name": c.get("name"),
                "status": c.get("status"),
                "subject": c.get("subject"),
                "type": c.get("type"),
            }
            for c in data.get("campaigns", [])
        ]
        return {
            "campaigns": campaigns,
            "count": data.get("count", len(campaigns)),
        }


class BrevoGetAccountTool(BaseTool):
    """Get Brevo account information."""

    def __init__(self, client: BrevoClient) -> None:
        self._client = client

    @property
    def name(self) -> str:
        return "brevo_get_account"

    @property
    def description(self) -> str:
        return "Get Brevo account information including email, company name, and plan details."

    @property
    def parameters_schema(self) -> Dict[str, Any]:
        return {"type": "object", "properties": {}}

    @property
    def required_permissions(self) -> Set[str]:
        return {"tools.execute"}

    async def execute(
        self,
        parameters: Dict[str, Any],
        context: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        data = await self._client.get_account()
        return {
            "email": data.get("email"),
            "first_name": data.get("firstName"),
            "last_name": data.get("lastName"),
            "company_name": data.get("companyName"),
        }
