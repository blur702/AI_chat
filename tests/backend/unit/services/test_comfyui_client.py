"""Unit tests for ComfyUIClient service."""

import pytest
from unittest.mock import AsyncMock, MagicMock

import httpx

from app.services.comfyui_client import ComfyUIClient


pytestmark = pytest.mark.unit


# ---------------------------------------------------------------------------
# Initialization
# ---------------------------------------------------------------------------


class TestComfyUIClientInit:
    """Tests for ComfyUIClient construction and properties."""

    def test_default_base_url(self):
        client = ComfyUIClient()
        assert client._base_url == "http://comfyui:8188"
        assert client.name == "comfyui_client"
        assert client.is_running is False
        assert client._client is None

    def test_custom_base_url(self):
        client = ComfyUIClient(base_url="http://localhost:8188/")
        assert client._base_url == "http://localhost:8188"

    def test_trailing_slash_stripped(self):
        client = ComfyUIClient(base_url="http://host:9999///")
        assert client._base_url == "http://host:9999"


# ---------------------------------------------------------------------------
# Lifecycle
# ---------------------------------------------------------------------------


class TestComfyUIClientLifecycle:
    """Tests for startup / shutdown lifecycle."""

    @pytest.mark.asyncio
    async def test_startup_creates_client(self):
        client = ComfyUIClient()
        await client.startup()
        try:
            assert client.is_running is True
            assert client._client is not None
            assert isinstance(client._client, httpx.AsyncClient)
        finally:
            await client.shutdown()

    @pytest.mark.asyncio
    async def test_startup_is_idempotent(self):
        client = ComfyUIClient()
        await client.startup()
        first_http = client._client
        await client.startup()
        assert client._client is first_http
        await client.shutdown()

    @pytest.mark.asyncio
    async def test_shutdown_clears_state(self):
        client = ComfyUIClient()
        await client.startup()
        await client.shutdown()
        assert client.is_running is False
        assert client._client is None

    @pytest.mark.asyncio
    async def test_shutdown_without_startup(self):
        client = ComfyUIClient()
        await client.shutdown()
        assert client.is_running is False


# ---------------------------------------------------------------------------
# submit_workflow (queue_prompt)
# ---------------------------------------------------------------------------


class TestSubmitWorkflow:
    """Tests for the submit_workflow method."""

    @pytest.mark.asyncio
    async def test_submit_workflow_returns_prompt_id(self):
        client = ComfyUIClient()
        await client.startup()
        try:
            mock_response = MagicMock()
            mock_response.json.return_value = {"prompt_id": "abc-123"}
            mock_response.raise_for_status = MagicMock()
            client._client.post = AsyncMock(return_value=mock_response)

            workflow = {"1": {"class_type": "KSampler", "inputs": {}}}
            prompt_id = await client.submit_workflow(workflow)

            assert prompt_id == "abc-123"
            call_kwargs = client._client.post.call_args
            assert call_kwargs[0][0] == "/prompt"
            assert call_kwargs[1]["json"] == {"prompt": workflow}
        finally:
            await client.shutdown()

    @pytest.mark.asyncio
    async def test_submit_workflow_raises_on_missing_prompt_id(self):
        client = ComfyUIClient()
        await client.startup()
        try:
            mock_response = MagicMock()
            mock_response.json.return_value = {}
            mock_response.raise_for_status = MagicMock()
            client._client.post = AsyncMock(return_value=mock_response)

            with pytest.raises(ValueError, match="did not return a prompt_id"):
                await client.submit_workflow({})
        finally:
            await client.shutdown()

    @pytest.mark.asyncio
    async def test_submit_workflow_raises_if_not_started(self):
        client = ComfyUIClient()
        with pytest.raises(RuntimeError, match="ComfyUIClient not started"):
            await client.submit_workflow({})


# ---------------------------------------------------------------------------
# get_job_status (get_history)
# ---------------------------------------------------------------------------


class TestGetJobStatus:
    """Tests for the get_job_status method."""

    @pytest.mark.asyncio
    async def test_get_job_status_returns_history(self):
        client = ComfyUIClient()
        await client.startup()
        try:
            expected = {
                "abc-123": {
                    "outputs": {"9": {"images": [{"filename": "out.png"}]}}
                }
            }
            mock_response = MagicMock()
            mock_response.json.return_value = expected
            mock_response.raise_for_status = MagicMock()
            client._client.get = AsyncMock(return_value=mock_response)

            result = await client.get_job_status("abc-123")
            assert result == expected
            client._client.get.assert_awaited_once_with(
                "/history/abc-123", timeout=10.0
            )
        finally:
            await client.shutdown()

    @pytest.mark.asyncio
    async def test_get_job_status_raises_if_not_started(self):
        client = ComfyUIClient()
        with pytest.raises(RuntimeError, match="ComfyUIClient not started"):
            await client.get_job_status("some-id")


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------


class TestComfyUIHealthCheck:
    """Tests for the health_check method."""

    @pytest.mark.asyncio
    async def test_health_check_not_running(self):
        client = ComfyUIClient()
        healthy, msg = await client.health_check()
        assert healthy is False
        assert "not running" in msg

    @pytest.mark.asyncio
    async def test_health_check_ok(self):
        client = ComfyUIClient()
        await client.startup()
        try:
            mock_response = MagicMock()
            mock_response.raise_for_status = MagicMock()
            client._client.get = AsyncMock(return_value=mock_response)

            healthy, msg = await client.health_check()
            assert healthy is True
            assert msg == "ok"
        finally:
            await client.shutdown()

    @pytest.mark.asyncio
    async def test_health_check_unreachable(self):
        client = ComfyUIClient()
        await client.startup()
        try:
            client._client.get = AsyncMock(
                side_effect=httpx.ConnectError("Connection refused")
            )
            healthy, msg = await client.health_check()
            assert healthy is False
            assert "unreachable" in msg
        finally:
            await client.shutdown()


# ---------------------------------------------------------------------------
# Other API methods
# ---------------------------------------------------------------------------


class TestComfyUIOtherMethods:
    """Tests for get_queue_status, download_image, upload_image."""

    @pytest.mark.asyncio
    async def test_get_queue_status(self):
        client = ComfyUIClient()
        await client.startup()
        try:
            expected = {"queue_running": [], "queue_pending": []}
            mock_response = MagicMock()
            mock_response.json.return_value = expected
            mock_response.raise_for_status = MagicMock()
            client._client.get = AsyncMock(return_value=mock_response)

            result = await client.get_queue_status()
            assert result == expected
        finally:
            await client.shutdown()

    @pytest.mark.asyncio
    async def test_download_image(self):
        client = ComfyUIClient()
        await client.startup()
        try:
            mock_response = MagicMock()
            mock_response.content = b"\x89PNG\r\n\x1a\nfakedata"
            mock_response.raise_for_status = MagicMock()
            client._client.get = AsyncMock(return_value=mock_response)

            data = await client.download_image("out.png", subfolder="", folder_type="output")
            assert data == b"\x89PNG\r\n\x1a\nfakedata"
            call_kwargs = client._client.get.call_args
            assert call_kwargs[1]["params"]["filename"] == "out.png"
        finally:
            await client.shutdown()

    @pytest.mark.asyncio
    async def test_upload_image(self):
        client = ComfyUIClient()
        await client.startup()
        try:
            mock_response = MagicMock()
            mock_response.json.return_value = {"name": "uploaded.png"}
            mock_response.raise_for_status = MagicMock()
            client._client.post = AsyncMock(return_value=mock_response)

            name = await client.upload_image(b"image_bytes", "test.png")
            assert name == "uploaded.png"
        finally:
            await client.shutdown()

    @pytest.mark.asyncio
    async def test_upload_image_raises_on_missing_name(self):
        client = ComfyUIClient()
        await client.startup()
        try:
            mock_response = MagicMock()
            mock_response.json.return_value = {}
            mock_response.raise_for_status = MagicMock()
            client._client.post = AsyncMock(return_value=mock_response)

            with pytest.raises(ValueError, match="did not return filename"):
                await client.upload_image(b"data", "test.png")
        finally:
            await client.shutdown()


# ---------------------------------------------------------------------------
# Static helper methods
# ---------------------------------------------------------------------------


class TestComfyUIStaticHelpers:
    """Tests for static utility methods."""

    def test_coerce_seed_none_generates_random(self):
        seed = ComfyUIClient._coerce_seed(None)
        assert isinstance(seed, int)
        assert 0 <= seed < 2**63

    def test_coerce_seed_with_value(self):
        assert ComfyUIClient._coerce_seed(42) == 42

    def test_normalize_loras_empty(self):
        assert ComfyUIClient._normalize_loras(None) == []
        assert ComfyUIClient._normalize_loras([]) == []

    def test_normalize_loras_valid(self):
        loras = [
            {"name": "my_lora", "strength_model": 0.8, "strength_clip": 0.5},
            {"name": "other"},
        ]
        result = ComfyUIClient._normalize_loras(loras)
        assert len(result) == 2
        assert result[0]["name"] == "my_lora"
        assert result[0]["strength_model"] == 0.8
        assert result[1]["strength_model"] == 1.0  # default
        assert result[1]["strength_clip"] == 1.0  # default

    def test_normalize_loras_skips_empty_name(self):
        loras = [{"name": ""}, {"name": "  "}, {"notname": "val"}]
        result = ComfyUIClient._normalize_loras(loras)
        assert len(result) == 0

    def test_infer_checkpoint_type_sdxl(self):
        assert ComfyUIClient._infer_checkpoint_type("sdxl_turbo.safetensors") == "sdxl"
        assert ComfyUIClient._infer_checkpoint_type("model_XL_v2.safetensors") == "sdxl"

    def test_infer_checkpoint_type_sd15(self):
        assert ComfyUIClient._infer_checkpoint_type("v1-5-pruned.safetensors") == "sd15"
        assert ComfyUIClient._infer_checkpoint_type(None) == "sd15"

    def test_extract_enum_choices(self):
        node_info = {
            "input": {
                "required": {
                    "ckpt_name": [["model_a.safetensors", "model_b.safetensors"]],
                }
            }
        }
        result = ComfyUIClient._extract_enum_choices(node_info, "ckpt_name")
        assert result == ["model_a.safetensors", "model_b.safetensors"]

    def test_extract_enum_choices_missing_field(self):
        result = ComfyUIClient._extract_enum_choices({}, "ckpt_name")
        assert result == []

    def test_get_text_to_image_workflow_structure(self):
        workflow = ComfyUIClient.get_text_to_image_workflow(
            prompt="a cat",
            negative_prompt="bad",
            width=512,
            height=512,
            seed=42,
        )
        # Should have at minimum a CheckpointLoaderSimple, CLIPTextEncode (x2),
        # EmptyLatentImage, KSampler, VAEDecode, SaveImage
        class_types = [v["class_type"] for v in workflow.values()]
        assert "CheckpointLoaderSimple" in class_types
        assert "KSampler" in class_types
        assert "SaveImage" in class_types
        assert "VAEDecode" in class_types
        assert class_types.count("CLIPTextEncode") == 2
