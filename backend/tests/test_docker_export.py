"""Unit tests for Docker image export and compose file generation."""

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch, PropertyMock
from uuid import uuid4

import pytest


# ---------------------------------------------------------------------------
# Compose file generation
# ---------------------------------------------------------------------------


class TestComposeFileGeneration:
    """Test the _generate_compose_file helper in SandboxManager."""

    def _make_sandbox_manager(self, container_attrs=None):
        """Create a SandboxManager with mocked Docker client."""
        from app.services.sandbox_manager import SandboxManager

        sm = SandboxManager.__new__(SandboxManager)
        sm._containers = {}
        sm._creation_locks = {}
        sm._creation_failures = {}

        mock_client = MagicMock()
        mock_container = MagicMock()
        mock_container.attrs = container_attrs or {}
        mock_client.containers.get.return_value = mock_container
        sm._client = mock_client

        return sm

    @pytest.mark.unit
    def test_basic_compose_generation(self):
        """Generate a compose file for a simple container."""
        sm = self._make_sandbox_manager({
            "Config": {
                "Image": "python:3.12-slim",
                "Env": ["PATH=/usr/local/bin:/usr/bin", "HOME=/root"],
                "ExposedPorts": {"8000/tcp": {}},
                "WorkingDir": "/workspace",
            },
        })

        compose = sm._generate_compose_file(
            project_id="proj-123",
            image_name="my-app",
            tag="latest",
            container_id="ctr-abc",
            template_id=None,
        )

        assert "my-app:latest" in compose
        assert "8000" in compose
        assert "services:" in compose

    @pytest.mark.unit
    def test_compose_with_env_vars(self):
        """Environment variables are included in compose output (PATH is filtered)."""
        sm = self._make_sandbox_manager({
            "Config": {
                "Image": "node:20-slim",
                "Env": [
                    "NODE_ENV=production",
                    "PORT=3000",
                    "PATH=/usr/local/bin:/usr/bin",
                ],
                "ExposedPorts": {"3000/tcp": {}},
                "WorkingDir": "/app",
            },
        })

        compose = sm._generate_compose_file(
            project_id="proj-456",
            image_name="my-node-app",
            tag="latest",
            container_id="ctr-def",
            template_id=None,
        )

        assert "NODE_ENV=production" in compose
        assert "PORT=3000" in compose
        # PATH should be filtered out
        assert "PATH=" not in compose

    @pytest.mark.unit
    def test_compose_no_exposed_ports_defaults_3000(self):
        """When there are no exposed ports, defaults to 3000."""
        sm = self._make_sandbox_manager({
            "Config": {
                "Image": "alpine:latest",
                "Env": [],
                "ExposedPorts": {},
                "WorkingDir": "/",
            },
        })

        compose = sm._generate_compose_file(
            project_id="proj-789",
            image_name="worker-app",
            tag="latest",
            container_id="ctr-ghi",
            template_id=None,
        )

        assert "worker-app:latest" in compose
        assert "3000:3000" in compose  # default port

    @pytest.mark.unit
    def test_compose_handles_docker_error(self):
        """Compose generation handles container inspect failures gracefully."""
        from app.services.sandbox_manager import SandboxManager

        sm = SandboxManager.__new__(SandboxManager)
        sm._containers = {}
        sm._creation_locks = {}
        sm._creation_failures = {}

        mock_client = MagicMock()
        mock_client.containers.get.side_effect = Exception("container not found")
        sm._client = mock_client

        compose = sm._generate_compose_file(
            project_id="proj-err",
            image_name="err-app",
            tag="v1",
            container_id="bad-ctr",
            template_id=None,
        )

        # Should still produce valid compose even with empty config
        assert "err-app:v1" in compose
        assert "services:" in compose


# ---------------------------------------------------------------------------
# Docker Export Request / Response schemas
# ---------------------------------------------------------------------------


class TestDockerExportSchemas:
    """Test the Pydantic schemas for Docker export."""

    @pytest.mark.unit
    def test_export_request_defaults(self):
        from app.api.project_import import DockerExportRequest

        req = DockerExportRequest()
        assert req.image_name is None
        assert req.include_compose is True
        assert req.include_tar is False

    @pytest.mark.unit
    def test_export_request_custom(self):
        from app.api.project_import import DockerExportRequest

        req = DockerExportRequest(
            image_name="my-custom-app:v2",
            include_compose=False,
            include_tar=True,
        )
        assert req.image_name == "my-custom-app:v2"
        assert req.include_compose is False
        assert req.include_tar is True

    @pytest.mark.unit
    def test_export_response(self):
        from app.api.project_import import DockerExportResponse

        resp = DockerExportResponse(
            image_id="sha256:abc123",
            image_name="my-app:latest",
            compose_file="version: '3.8'\nservices:\n  app:\n    image: my-app:latest",
            tar_download_url="/api/projects/123/export-docker/sha256:abc123/download",
        )
        assert resp.image_id == "sha256:abc123"
        assert resp.compose_file is not None
        assert "my-app:latest" in resp.compose_file

    @pytest.mark.unit
    def test_export_response_minimal(self):
        from app.api.project_import import DockerExportResponse

        resp = DockerExportResponse(
            image_id="sha256:def456",
            image_name="app:v1",
        )
        assert resp.compose_file is None
        assert resp.tar_download_url is None


# ---------------------------------------------------------------------------
# Export method behavior (mocked Docker)
# ---------------------------------------------------------------------------


class TestExportAsDockerImage:
    """Test the export_as_docker_image method with mocked Docker client."""

    @pytest.mark.unit
    async def test_export_creates_image(self):
        """export_as_docker_image commits container and returns metadata."""
        from app.services.sandbox_manager import SandboxManager

        sm = SandboxManager.__new__(SandboxManager)
        sm._containers = {}
        sm._creation_locks = {}
        sm._creation_failures = {}

        project_id = uuid4()
        container_id = "container-abc123"
        sm._containers[str(project_id)] = container_id

        # Mock sync Docker client
        mock_client = MagicMock()
        mock_client.api.commit.return_value = {"Id": "sha256:newimage123"}
        mock_container = MagicMock()
        mock_container.attrs = {
            "Config": {
                "Image": "python:3.12-slim",
                "Env": ["PATH=/usr/local/bin"],
                "ExposedPorts": {"8000/tcp": {}},
                "WorkingDir": "/workspace",
            },
        }
        mock_client.containers.get.return_value = mock_container
        sm._client = mock_client

        result = await sm.export_as_docker_image(
            project_id,
            image_name="test-export",
            include_compose=True,
            include_tar=False,
        )

        assert result["image_id"] == "sha256:newimage123"
        assert result["image_name"] == "test-export:latest"
        assert "compose_file" in result
        assert result.get("tar_download_url") is None
        mock_client.api.commit.assert_called_once()

    @pytest.mark.unit
    async def test_export_no_container_raises(self):
        """export_as_docker_image raises when no container exists."""
        from app.services.sandbox_manager import SandboxManager

        sm = SandboxManager.__new__(SandboxManager)
        sm._containers = {}

        project_id = uuid4()

        with pytest.raises(RuntimeError, match="No container"):
            await sm.export_as_docker_image(project_id)

    @pytest.mark.unit
    async def test_export_default_image_name(self):
        """When no image_name is provided, generates one from project_id."""
        from app.services.sandbox_manager import SandboxManager

        sm = SandboxManager.__new__(SandboxManager)
        sm._containers = {}

        project_id = uuid4()
        container_id = "container-xyz"
        sm._containers[str(project_id)] = container_id

        mock_client = MagicMock()
        mock_client.api.commit.return_value = {"Id": "sha256:img456"}
        mock_container = MagicMock()
        mock_container.attrs = {"Config": {"Image": "node:20-slim"}}
        mock_client.containers.get.return_value = mock_container
        sm._client = mock_client

        result = await sm.export_as_docker_image(project_id)

        assert "workstation-export-" in result["image_name"]

    @pytest.mark.unit
    async def test_export_with_tar_includes_download_url(self):
        """When include_tar=True, response includes tar_download_url."""
        from app.services.sandbox_manager import SandboxManager

        sm = SandboxManager.__new__(SandboxManager)
        sm._containers = {}

        project_id = uuid4()
        sm._containers[str(project_id)] = "ctr-tar-test"

        mock_client = MagicMock()
        mock_client.api.commit.return_value = {"Id": "sha256:tarimg"}
        mock_container = MagicMock()
        mock_container.attrs = {"Config": {}}
        mock_client.containers.get.return_value = mock_container
        sm._client = mock_client

        result = await sm.export_as_docker_image(
            project_id,
            include_tar=True,
            include_compose=False,
        )

        assert result["tar_download_url"] is not None
        assert "export-docker" in result["tar_download_url"]
        assert "compose_file" not in result
