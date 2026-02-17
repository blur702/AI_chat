"""Tests for SSHClient service.

SSHClient inherits BaseKernelService but is missing the `name` and `is_running`
abstract property implementations (uses `service_name` class attr instead).
We subclass to add the missing properties for testing.
"""

from typing import Tuple
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.ssh_client import SSHClient


class TestableSSHClient(SSHClient):
    """Add missing abstract property implementations for testing."""

    @property
    def name(self) -> str:
        return self.service_name

    @property
    def is_running(self) -> bool:
        return self._conn is not None


class TestSSHClientInit:
    @patch.dict("os.environ", {
        "DRUPAL_VPS_HOST": "example.com",
        "DRUPAL_VPS_USER": "testuser",
        "DRUPAL_VPS_PASSWORD": "testpass",
        "DRUPAL_VPS_PORT": "2222",
    }, clear=False)
    def test_reads_env_vars(self):
        client = TestableSSHClient()
        assert client._host == "example.com"
        assert client._user == "testuser"
        assert client._password == "testpass"
        assert client._port == 2222

    def test_not_configured_without_host(self):
        client = TestableSSHClient()
        client._host = ""
        client._password = ""
        client._key_path = ""
        assert client.is_configured is False

    @patch.dict("os.environ", {
        "DRUPAL_VPS_HOST": "host",
        "DRUPAL_VPS_PASSWORD": "pass",
    }, clear=False)
    def test_configured_with_password(self):
        client = TestableSSHClient()
        assert client.is_configured is True

    @patch.dict("os.environ", {
        "DRUPAL_VPS_HOST": "host",
        "DRUPAL_VPS_KEY_PATH": "/path/to/key",
        "DRUPAL_VPS_PASSWORD": "",
    }, clear=False)
    def test_configured_with_key_path(self):
        client = TestableSSHClient()
        assert client.is_configured is True

    def test_service_name(self):
        client = TestableSSHClient()
        assert client.name == "ssh_client"


class TestSSHClientLifecycle:
    @pytest.mark.asyncio
    async def test_startup_logs_when_configured(self):
        client = TestableSSHClient()
        client._host = "example.com"
        client._password = "pass"
        await client.startup()

    @pytest.mark.asyncio
    async def test_startup_when_not_configured(self):
        client = TestableSSHClient()
        client._host = ""
        client._password = ""
        client._key_path = ""
        await client.startup()

    @pytest.mark.asyncio
    async def test_shutdown_closes_connection(self):
        client = TestableSSHClient()
        mock_conn = MagicMock()
        client._conn = mock_conn
        await client.shutdown()
        mock_conn.close.assert_called_once()
        assert client._conn is None

    @pytest.mark.asyncio
    async def test_shutdown_when_no_connection(self):
        client = TestableSSHClient()
        client._conn = None
        await client.shutdown()


class TestSSHClientHealthCheck:
    @pytest.mark.asyncio
    async def test_health_check_not_configured(self):
        client = TestableSSHClient()
        client._host = ""
        client._password = ""
        client._key_path = ""
        healthy, msg = await client.health_check()
        assert healthy is False
        assert "not configured" in msg


class TestSSHClientExecute:
    @pytest.mark.asyncio
    async def test_execute_returns_result(self):
        client = TestableSSHClient()
        mock_conn = AsyncMock()
        mock_result = MagicMock()
        mock_result.stdout = "hello\n"
        mock_result.stderr = ""
        mock_result.exit_status = 0
        mock_conn.run = AsyncMock(return_value=mock_result)
        client._get_connection = AsyncMock(return_value=mock_conn)

        result = await client.execute("echo hello")
        assert result["stdout"] == "hello\n"
        assert result["exit_code"] == 0
