"""Unit tests for SandboxManager service."""

import asyncio
import time
from unittest.mock import AsyncMock, MagicMock, patch, PropertyMock
from uuid import uuid4

import pytest

from app.services.sandbox_manager import (
    CREATION_FAILURE_COOLDOWN,
    SANDBOX_IMAGE,
    SANDBOX_NETWORK,
    SandboxManager,
)


pytestmark = pytest.mark.unit


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_mock_container(container_id="abc123def456", status="running", labels=None):
    """Create a mock Docker container object."""
    c = MagicMock()
    c.id = container_id
    c.short_id = container_id[:12]
    c.status = status
    c.labels = labels or {}
    c.start = MagicMock()
    c.stop = MagicMock()
    c.remove = MagicMock()
    c.attrs = {"Config": {}, "Created": "2024-01-01T00:00:00Z"}
    return c


def _make_initialized_manager(mock_client=None):
    """Create a SandboxManager with helpers initialized (bypassing Docker startup)."""
    mgr = SandboxManager()
    if mock_client is None:
        mock_client = MagicMock()
    mgr._client = mock_client
    mgr._running = True

    # Initialize helpers the same way startup() does
    from app.services.sandbox.exec_runner import ExecRunner
    from app.services.sandbox.file_ops import FileOps
    from app.services.sandbox.tech_merger import TechMerger
    from app.services.sandbox.template_applier import TemplateApplier
    from app.services.sandbox.container_lifecycle import ContainerLifecycle
    from app.services.sandbox.portability import Portability

    mgr._run = ExecRunner(mock_client, mgr._last_activity)
    mgr._file_ops = FileOps(mgr._run, mock_client, mgr._last_activity)
    mgr._tech_merger = TechMerger(mgr._template_registry)
    mgr._template_applier = TemplateApplier(
        mgr._run, mgr._file_ops, mock_client,
        mgr._template_registry, mgr._sidecars,
    )
    mgr._lifecycle = ContainerLifecycle(
        mock_client, mgr._containers, mgr._last_activity,
        mgr._creation_locks, mgr._applied_templates,
        mgr._creation_failures, mgr._sidecars,
        mgr._template_registry, mgr._tech_merger, mgr._template_applier,
    )
    mgr._portability = Portability(
        mock_client, mgr._containers, mgr._template_registry,
        mgr._exported_images,
        mgr.get_or_create_container, mgr.stop_container,
    )
    return mgr


# ---------------------------------------------------------------------------
# Initialization
# ---------------------------------------------------------------------------


class TestSandboxManagerInit:
    """Tests for SandboxManager construction."""

    def test_default_state(self):
        mgr = SandboxManager()
        assert mgr.name == "sandbox_manager"
        assert mgr.is_running is False
        assert mgr._client is None
        assert mgr._containers == {}
        assert mgr._last_activity == {}
        assert mgr._sidecars == {}
        assert mgr._creation_locks == {}
        assert mgr._applied_templates == {}
        assert mgr._creation_failures == {}


# ---------------------------------------------------------------------------
# Lifecycle
# ---------------------------------------------------------------------------


class TestSandboxManagerLifecycle:
    """Tests for startup / shutdown."""

    @pytest.mark.asyncio
    async def test_startup_initializes_docker_client(self):
        mgr = SandboxManager()
        mock_client = MagicMock()
        mock_client.containers.list.return_value = []

        with patch("app.services.sandbox_manager.docker.from_env", return_value=mock_client):
            await mgr.startup()

        assert mgr.is_running is True
        assert mgr._client is mock_client
        # Cleanup
        mgr._cleanup_task.cancel()
        try:
            await mgr._cleanup_task
        except asyncio.CancelledError:
            pass

    @pytest.mark.asyncio
    async def test_startup_is_idempotent(self):
        mgr = SandboxManager()
        mock_client = MagicMock()
        mock_client.containers.list.return_value = []

        with patch("app.services.sandbox_manager.docker.from_env", return_value=mock_client):
            await mgr.startup()
            first_client = mgr._client
            await mgr.startup()
            assert mgr._client is first_client

        mgr._cleanup_task.cancel()
        try:
            await mgr._cleanup_task
        except asyncio.CancelledError:
            pass

    @pytest.mark.asyncio
    async def test_shutdown_clears_state(self):
        mgr = SandboxManager()
        mock_client = MagicMock()
        mock_client.containers.list.return_value = []
        mock_client.close = MagicMock()

        with patch("app.services.sandbox_manager.docker.from_env", return_value=mock_client):
            await mgr.startup()

        await mgr.shutdown()
        assert mgr.is_running is False
        assert mgr._client is None
        assert mgr._containers == {}

    @pytest.mark.asyncio
    async def test_shutdown_without_startup(self):
        mgr = SandboxManager()
        await mgr.shutdown()
        assert mgr.is_running is False


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------


class TestSandboxHealthCheck:
    """Tests for the health_check method."""

    @pytest.mark.asyncio
    async def test_health_check_not_running(self):
        mgr = SandboxManager()
        healthy, msg = await mgr.health_check()
        assert healthy is False
        assert "not running" in msg

    @pytest.mark.asyncio
    async def test_health_check_ok(self):
        mgr = SandboxManager()
        mgr._running = True
        mgr._client = MagicMock()
        mgr._client.ping.return_value = True
        mgr._containers = {"proj1": "c1"}

        healthy, msg = await mgr.health_check()
        assert healthy is True
        assert "1 active" in msg

    @pytest.mark.asyncio
    async def test_health_check_docker_error(self):
        from docker.errors import DockerException

        mgr = SandboxManager()
        mgr._running = True
        mgr._client = MagicMock()
        mgr._client.ping.side_effect = DockerException("Connection refused")

        healthy, msg = await mgr.health_check()
        assert healthy is False
        assert "docker error" in msg


# ---------------------------------------------------------------------------
# get_or_create_container
# ---------------------------------------------------------------------------


class TestGetOrCreateContainer:
    """Tests for the get_or_create_container method."""

    @pytest.mark.asyncio
    async def test_returns_existing_running_container(self):
        mock_client = MagicMock()
        mgr = _make_initialized_manager(mock_client)

        project_id = uuid4()
        pid = str(project_id)
        container = _make_mock_container(status="running")
        mgr._containers[pid] = container.id
        mock_client.containers.get.return_value = container

        result = await mgr.get_or_create_container(project_id)
        assert result == container.id
        assert mgr._last_activity[container.id] > 0

    @pytest.mark.asyncio
    async def test_starts_stopped_container(self):
        mock_client = MagicMock()
        mgr = _make_initialized_manager(mock_client)

        project_id = uuid4()
        pid = str(project_id)
        container = _make_mock_container(status="exited")
        mgr._containers[pid] = container.id
        mock_client.containers.get.return_value = container

        result = await mgr.get_or_create_container(project_id)
        assert result == container.id
        container.start.assert_called_once()

    @pytest.mark.asyncio
    async def test_circuit_breaker_rejects_during_cooldown(self):
        mock_client = MagicMock()
        mgr = _make_initialized_manager(mock_client)

        project_id = uuid4()
        pid = str(project_id)
        mgr._creation_failures[pid] = (time.time(), "previous failure")

        with pytest.raises(RuntimeError, match="cooldown"):
            await mgr.get_or_create_container(project_id)

    @pytest.mark.asyncio
    async def test_circuit_breaker_clears_after_cooldown(self):
        mock_client = MagicMock()
        mgr = _make_initialized_manager(mock_client)

        project_id = uuid4()
        pid = str(project_id)
        # Set failure time well in the past
        mgr._creation_failures[pid] = (
            time.time() - CREATION_FAILURE_COOLDOWN - 10,
            "old failure",
        )

        container = _make_mock_container()
        mock_client.containers.run.return_value = container

        result = await mgr.get_or_create_container(project_id)
        assert result == container.id
        assert pid not in mgr._creation_failures


# ---------------------------------------------------------------------------
# stop_container (cleanup)
# ---------------------------------------------------------------------------


class TestStopContainer:
    """Tests for stop_container."""

    @pytest.mark.asyncio
    async def test_stop_and_remove_container(self):
        mock_client = MagicMock()
        mgr = _make_initialized_manager(mock_client)

        project_id = uuid4()
        pid = str(project_id)
        container = _make_mock_container()
        mgr._containers[pid] = container.id
        mgr._last_activity[container.id] = time.time()
        mock_client.containers.get.return_value = container

        result = await mgr.stop_container(project_id)
        assert result is True
        assert pid not in mgr._containers
        assert container.id not in mgr._last_activity
        container.stop.assert_called_once_with(timeout=10)
        container.remove.assert_called_once_with(force=True)

    @pytest.mark.asyncio
    async def test_stop_nonexistent_project(self):
        mock_client = MagicMock()
        mgr = _make_initialized_manager(mock_client)

        result = await mgr.stop_container(uuid4())
        assert result is False

    @pytest.mark.asyncio
    async def test_stop_cleans_up_sidecars(self):
        mock_client = MagicMock()
        mgr = _make_initialized_manager(mock_client)

        project_id = uuid4()
        pid = str(project_id)
        container = _make_mock_container()
        sidecar = _make_mock_container(container_id="sidecar123")
        mgr._containers[pid] = container.id
        mgr._sidecars[pid] = [sidecar.id]

        def get_container(cid):
            if cid == sidecar.id:
                return sidecar
            return container

        mock_client.containers.get.side_effect = get_container

        result = await mgr.stop_container(project_id)
        assert result is True
        sidecar.stop.assert_called_once()
        sidecar.remove.assert_called_once_with(force=True)
        assert pid not in mgr._sidecars

    @pytest.mark.asyncio
    async def test_stop_clears_tracking_dicts(self):
        mock_client = MagicMock()
        mgr = _make_initialized_manager(mock_client)

        project_id = uuid4()
        pid = str(project_id)
        container = _make_mock_container()
        mgr._containers[pid] = container.id
        mgr._creation_locks[pid] = asyncio.Lock()
        mgr._applied_templates[pid] = "template-1"
        mgr._creation_failures[pid] = (time.time(), "err")
        mock_client.containers.get.return_value = container

        await mgr.stop_container(project_id)
        assert pid not in mgr._creation_locks
        assert pid not in mgr._applied_templates
        assert pid not in mgr._creation_failures


# ---------------------------------------------------------------------------
# Template registry exposure
# ---------------------------------------------------------------------------


class TestTemplateRegistry:
    """Tests for template_registry property."""

    def test_template_registry_exposed(self):
        mgr = SandboxManager()
        registry = mgr.template_registry
        assert registry is mgr._template_registry


# ---------------------------------------------------------------------------
# Export image ownership
# ---------------------------------------------------------------------------


class TestExportedImageOwnership:
    """Tests for is_exported_image_owned_by_project."""

    @pytest.mark.asyncio
    async def test_owned_image(self):
        mock_client = MagicMock()
        mgr = _make_initialized_manager(mock_client)
        project_id = uuid4()
        mgr._exported_images["sha256:abc"] = str(project_id)
        assert await mgr.is_exported_image_owned_by_project(project_id, "sha256:abc") is True

    @pytest.mark.asyncio
    async def test_unowned_image(self):
        mock_client = MagicMock()
        mgr = _make_initialized_manager(mock_client)
        assert await mgr.is_exported_image_owned_by_project(uuid4(), "sha256:xyz") is False
