"""Tests for BrevoClient email/SMS service."""

import base64
import json
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

from app.services.brevo_client import BrevoClient, _extract_api_key_from_mcp_token


# ---------------------------------------------------------------------------
# Helper: _extract_api_key_from_mcp_token
# ---------------------------------------------------------------------------

class TestExtractApiKeyFromMcpToken:
    def test_extracts_valid_key(self):
        token = base64.b64encode(json.dumps({"api_key": "xkeysib-abc123"}).encode()).decode()
        assert _extract_api_key_from_mcp_token(token) == "xkeysib-abc123"

    def test_raises_on_invalid_base64(self):
        with pytest.raises(Exception):
            _extract_api_key_from_mcp_token("not-base64!!!")

    def test_raises_on_missing_api_key_field(self):
        token = base64.b64encode(json.dumps({"other": "data"}).encode()).decode()
        with pytest.raises(KeyError):
            _extract_api_key_from_mcp_token(token)

    def test_raises_on_invalid_json(self):
        token = base64.b64encode(b"not json").decode()
        with pytest.raises(json.JSONDecodeError):
            _extract_api_key_from_mcp_token(token)


# ---------------------------------------------------------------------------
# BrevoClient init / properties
# ---------------------------------------------------------------------------

class TestBrevoClientInit:
    @patch.dict("os.environ", {"BREVO_API_KEY": "test-key-123"}, clear=False)
    def test_uses_api_key_env_var(self):
        client = BrevoClient()
        assert client._api_key == "test-key-123"
        assert client.is_configured is True

    @patch.dict("os.environ", {"BREVO_API_KEY": "", "BREVO_MCP_TOKEN": ""}, clear=False)
    def test_no_key_means_not_configured(self):
        client = BrevoClient()
        assert client._api_key == ""
        assert client.is_configured is False

    @patch.dict("os.environ", {
        "BREVO_API_KEY": "",
        "BREVO_MCP_TOKEN": base64.b64encode(json.dumps({"api_key": "from-mcp"}).encode()).decode(),
    }, clear=False)
    def test_falls_back_to_mcp_token(self):
        client = BrevoClient()
        assert client._api_key == "from-mcp"

    @patch.dict("os.environ", {
        "BREVO_API_KEY": "",
        "BREVO_MCP_TOKEN": "invalid-base64",
    }, clear=False)
    def test_handles_invalid_mcp_token_gracefully(self):
        client = BrevoClient()
        assert client._api_key == ""

    def test_name_property(self):
        client = BrevoClient()
        assert client.name == "brevo_client"

    def test_not_running_initially(self):
        client = BrevoClient()
        assert client.is_running is False


# ---------------------------------------------------------------------------
# Lifecycle
# ---------------------------------------------------------------------------

class TestBrevoClientLifecycle:
    @patch.dict("os.environ", {"BREVO_API_KEY": "test-key"}, clear=False)
    @pytest.mark.asyncio
    async def test_startup_creates_client(self):
        bc = BrevoClient()
        await bc.startup()
        assert bc.is_running is True
        assert bc._client is not None
        await bc.shutdown()

    @patch.dict("os.environ", {"BREVO_API_KEY": "test-key"}, clear=False)
    @pytest.mark.asyncio
    async def test_startup_is_idempotent(self):
        bc = BrevoClient()
        await bc.startup()
        first_client = bc._client
        await bc.startup()
        assert bc._client is first_client
        await bc.shutdown()

    @patch.dict("os.environ", {"BREVO_API_KEY": ""}, clear=False)
    @pytest.mark.asyncio
    async def test_startup_without_key_skips(self):
        bc = BrevoClient()
        bc._api_key = ""
        await bc.startup()
        assert bc.is_running is False
        assert bc._client is None

    @patch.dict("os.environ", {"BREVO_API_KEY": "test-key"}, clear=False)
    @pytest.mark.asyncio
    async def test_shutdown_cleans_up(self):
        bc = BrevoClient()
        await bc.startup()
        await bc.shutdown()
        assert bc.is_running is False
        assert bc._client is None

    @pytest.mark.asyncio
    async def test_shutdown_when_not_started(self):
        bc = BrevoClient()
        await bc.shutdown()  # Should not raise
        assert bc.is_running is False


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------

class TestBrevoClientHealthCheck:
    @pytest.mark.asyncio
    async def test_health_check_not_running(self):
        bc = BrevoClient()
        healthy, msg = await bc.health_check()
        assert healthy is False
        assert "not running" in msg

    @patch.dict("os.environ", {"BREVO_API_KEY": "test-key"}, clear=False)
    @pytest.mark.asyncio
    async def test_health_check_success(self):
        bc = BrevoClient()
        await bc.startup()
        bc._client = AsyncMock()
        bc._client.get = AsyncMock(return_value=MagicMock(status_code=200))
        healthy, msg = await bc.health_check()
        assert healthy is True
        assert msg == "ok"
        await bc.shutdown()

    @patch.dict("os.environ", {"BREVO_API_KEY": "test-key"}, clear=False)
    @pytest.mark.asyncio
    async def test_health_check_api_error(self):
        bc = BrevoClient()
        await bc.startup()
        bc._client = AsyncMock()
        bc._client.get = AsyncMock(return_value=MagicMock(status_code=500))
        healthy, msg = await bc.health_check()
        assert healthy is False
        assert "500" in msg
        await bc.shutdown()

    @patch.dict("os.environ", {"BREVO_API_KEY": "test-key"}, clear=False)
    @pytest.mark.asyncio
    async def test_health_check_exception(self):
        bc = BrevoClient()
        await bc.startup()
        bc._client = AsyncMock()
        bc._client.get = AsyncMock(side_effect=httpx.ConnectError("timeout"))
        healthy, msg = await bc.health_check()
        assert healthy is False
        assert "failed" in msg
        await bc.shutdown()


# ---------------------------------------------------------------------------
# _ensure_client
# ---------------------------------------------------------------------------

class TestEnsureClient:
    def test_raises_when_no_client(self):
        bc = BrevoClient()
        with pytest.raises(RuntimeError, match="not configured"):
            bc._ensure_client()

    @patch.dict("os.environ", {"BREVO_API_KEY": "test-key"}, clear=False)
    @pytest.mark.asyncio
    async def test_returns_client_when_started(self):
        bc = BrevoClient()
        await bc.startup()
        client = bc._ensure_client()
        assert client is not None
        await bc.shutdown()


# ---------------------------------------------------------------------------
# API methods
# ---------------------------------------------------------------------------

class TestBrevoClientAPIMethods:
    @pytest.fixture
    def mock_brevo(self):
        bc = BrevoClient()
        bc._running = True
        bc._client = AsyncMock()
        return bc

    @pytest.mark.asyncio
    async def test_get_account(self, mock_brevo):
        mock_brevo._client.get = AsyncMock(
            return_value=MagicMock(status_code=200, json=lambda: {"email": "test@example.com"})
        )
        mock_brevo._client.get.return_value.raise_for_status = MagicMock()
        result = await mock_brevo.get_account()
        assert result["email"] == "test@example.com"

    @pytest.mark.asyncio
    async def test_list_contacts(self, mock_brevo):
        mock_brevo._client.get = AsyncMock(
            return_value=MagicMock(
                status_code=200,
                json=lambda: {"contacts": [], "count": 0},
            )
        )
        mock_brevo._client.get.return_value.raise_for_status = MagicMock()
        result = await mock_brevo.list_contacts(limit=10, offset=0)
        assert "contacts" in result

    @pytest.mark.asyncio
    async def test_create_contact(self, mock_brevo):
        mock_brevo._client.post = AsyncMock(
            return_value=MagicMock(status_code=201, json=lambda: {"id": 123})
        )
        mock_brevo._client.post.return_value.raise_for_status = MagicMock()
        result = await mock_brevo.create_contact(
            email="test@example.com",
            attributes={"FIRSTNAME": "Test"},
            list_ids=[1, 2],
        )
        assert result["id"] == 123

    @pytest.mark.asyncio
    async def test_send_sms_uses_default_recipient(self, mock_brevo):
        mock_brevo._sms_default_recipient = "+1234567890"
        mock_brevo._client.post = AsyncMock(
            return_value=MagicMock(status_code=201, json=lambda: {"messageId": "abc"})
        )
        mock_brevo._client.post.return_value.raise_for_status = MagicMock()
        result = await mock_brevo.send_sms("Hello!")
        assert result["messageId"] == "abc"

    @pytest.mark.asyncio
    async def test_send_sms_no_recipient_raises(self, mock_brevo):
        mock_brevo._sms_default_recipient = ""
        with pytest.raises(ValueError, match="No SMS recipient"):
            await mock_brevo.send_sms("Hello!")

    @pytest.mark.asyncio
    async def test_send_sms_explicit_recipient(self, mock_brevo):
        mock_brevo._client.post = AsyncMock(
            return_value=MagicMock(status_code=201, json=lambda: {"messageId": "xyz"})
        )
        mock_brevo._client.post.return_value.raise_for_status = MagicMock()
        result = await mock_brevo.send_sms("Hello!", recipient="+9876543210")
        assert result["messageId"] == "xyz"

    @pytest.mark.asyncio
    async def test_list_campaigns(self, mock_brevo):
        mock_brevo._client.get = AsyncMock(
            return_value=MagicMock(status_code=200, json=lambda: {"campaigns": []})
        )
        mock_brevo._client.get.return_value.raise_for_status = MagicMock()
        result = await mock_brevo.list_campaigns(campaign_type="email", status="sent")
        assert "campaigns" in result

    @pytest.mark.asyncio
    async def test_send_email_with_template(self, mock_brevo):
        mock_brevo._client.post = AsyncMock(
            return_value=MagicMock(status_code=201, json=lambda: {"messageId": "email-123"})
        )
        mock_brevo._client.post.return_value.raise_for_status = MagicMock()
        result = await mock_brevo.send_transactional_email(
            to=[{"email": "user@example.com"}],
            subject="Test",
            template_id=5,
            params={"name": "User"},
            sender={"email": "from@example.com", "name": "Sender"},
        )
        assert result["messageId"] == "email-123"

    @pytest.mark.asyncio
    async def test_send_email_no_sender_uses_account(self, mock_brevo):
        """When no sender is given, it fetches from account."""
        # Mock get_account first call (for sender resolution)
        mock_brevo._client.get = AsyncMock(
            return_value=MagicMock(
                status_code=200,
                json=lambda: {"email": "account@example.com", "companyName": "TestCo"},
            )
        )
        mock_brevo._client.get.return_value.raise_for_status = MagicMock()
        mock_brevo._client.post = AsyncMock(
            return_value=MagicMock(status_code=201, json=lambda: {"messageId": "auto"})
        )
        mock_brevo._client.post.return_value.raise_for_status = MagicMock()
        result = await mock_brevo.send_transactional_email(
            to=[{"email": "user@example.com"}],
            subject="Test",
            html_content="<p>Hello</p>",
        )
        assert result["messageId"] == "auto"
