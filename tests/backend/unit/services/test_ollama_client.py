"""Unit tests for OllamaClient service."""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

import httpx

from app.services.ollama_client import OllamaClient


pytestmark = pytest.mark.unit


# ---------------------------------------------------------------------------
# Initialization
# ---------------------------------------------------------------------------


class TestOllamaClientInit:
    """Tests for OllamaClient construction and properties."""

    def test_default_base_url(self):
        client = OllamaClient()
        assert client._base_url == "http://ollama:11434"
        assert client.name == "ollama_client"
        assert client.is_running is False
        assert client._client is None

    def test_custom_base_url(self):
        client = OllamaClient(base_url="http://localhost:11434/")
        assert client._base_url == "http://localhost:11434"

    def test_trailing_slash_stripped(self):
        client = OllamaClient(base_url="http://host:1234///")
        assert client._base_url == "http://host:1234"


# ---------------------------------------------------------------------------
# Lifecycle
# ---------------------------------------------------------------------------


class TestOllamaClientLifecycle:
    """Tests for startup / shutdown lifecycle."""

    @pytest.mark.asyncio
    async def test_startup_creates_client(self):
        client = OllamaClient()
        await client.startup()
        try:
            assert client.is_running is True
            assert client._client is not None
            assert isinstance(client._client, httpx.AsyncClient)
        finally:
            await client.shutdown()

    @pytest.mark.asyncio
    async def test_startup_is_idempotent(self):
        client = OllamaClient()
        await client.startup()
        first_http = client._client
        await client.startup()  # second call should be a no-op
        assert client._client is first_http
        await client.shutdown()

    @pytest.mark.asyncio
    async def test_shutdown_clears_state(self):
        client = OllamaClient()
        await client.startup()
        await client.shutdown()
        assert client.is_running is False
        assert client._client is None

    @pytest.mark.asyncio
    async def test_shutdown_without_startup(self):
        """Shutdown on a never-started client should not raise."""
        client = OllamaClient()
        await client.shutdown()
        assert client.is_running is False


# ---------------------------------------------------------------------------
# list_models
# ---------------------------------------------------------------------------


class TestListModels:
    """Tests for the list_models method."""

    @pytest.mark.asyncio
    async def test_list_models_returns_model_list(self):
        client = OllamaClient()
        await client.startup()
        try:
            mock_response = MagicMock()
            mock_response.json.return_value = {
                "models": [
                    {"name": "llama3.2", "size": 1000000},
                    {"name": "mistral", "size": 2000000},
                ]
            }
            mock_response.raise_for_status = MagicMock()
            client._client.get = AsyncMock(return_value=mock_response)

            models = await client.list_models()
            assert len(models) == 2
            assert models[0]["name"] == "llama3.2"
            assert models[1]["name"] == "mistral"
            client._client.get.assert_awaited_once_with("/api/tags", timeout=10.0)
        finally:
            await client.shutdown()

    @pytest.mark.asyncio
    async def test_list_models_empty(self):
        client = OllamaClient()
        await client.startup()
        try:
            mock_response = MagicMock()
            mock_response.json.return_value = {"models": []}
            mock_response.raise_for_status = MagicMock()
            client._client.get = AsyncMock(return_value=mock_response)

            models = await client.list_models()
            assert models == []
        finally:
            await client.shutdown()

    @pytest.mark.asyncio
    async def test_list_models_raises_if_not_started(self):
        client = OllamaClient()
        with pytest.raises(RuntimeError, match="OllamaClient not started"):
            await client.list_models()

    @pytest.mark.asyncio
    async def test_list_models_propagates_http_error(self):
        client = OllamaClient()
        await client.startup()
        try:
            mock_response = MagicMock()
            mock_response.raise_for_status.side_effect = httpx.HTTPStatusError(
                "Server Error",
                request=MagicMock(),
                response=MagicMock(status_code=500),
            )
            client._client.get = AsyncMock(return_value=mock_response)

            with pytest.raises(httpx.HTTPStatusError):
                await client.list_models()
        finally:
            await client.shutdown()


# ---------------------------------------------------------------------------
# chat_completion (generate)
# ---------------------------------------------------------------------------


class TestChatCompletion:
    """Tests for the chat_completion method."""

    @pytest.mark.asyncio
    async def test_chat_completion_basic(self):
        client = OllamaClient()
        await client.startup()
        try:
            expected_response = {
                "model": "llama3.2",
                "message": {"role": "assistant", "content": "Hello!"},
            }
            mock_response = MagicMock()
            mock_response.json.return_value = expected_response
            mock_response.raise_for_status = MagicMock()
            client._client.post = AsyncMock(return_value=mock_response)

            messages = [{"role": "user", "content": "Hi"}]
            result = await client.chat_completion(messages=messages)

            assert result["message"]["content"] == "Hello!"
            call_kwargs = client._client.post.call_args
            assert call_kwargs[0][0] == "/api/chat"
            payload = call_kwargs[1]["json"]
            assert payload["model"] == "llama3.2"
            assert payload["stream"] is False
            assert payload["messages"] == messages
        finally:
            await client.shutdown()

    @pytest.mark.asyncio
    async def test_chat_completion_with_options(self):
        client = OllamaClient()
        await client.startup()
        try:
            mock_response = MagicMock()
            mock_response.json.return_value = {"message": {"content": "ok"}}
            mock_response.raise_for_status = MagicMock()
            client._client.post = AsyncMock(return_value=mock_response)

            await client.chat_completion(
                messages=[{"role": "user", "content": "test"}],
                model="mistral",
                temperature=0.5,
                max_tokens=100,
                num_ctx=4096,
            )

            payload = client._client.post.call_args[1]["json"]
            assert payload["model"] == "mistral"
            assert payload["options"]["temperature"] == 0.5
            assert payload["options"]["num_predict"] == 100
            assert payload["options"]["num_ctx"] == 4096
        finally:
            await client.shutdown()

    @pytest.mark.asyncio
    async def test_chat_completion_with_tools(self):
        client = OllamaClient()
        await client.startup()
        try:
            mock_response = MagicMock()
            mock_response.json.return_value = {"message": {"content": ""}}
            mock_response.raise_for_status = MagicMock()
            client._client.post = AsyncMock(return_value=mock_response)

            tools = [{"type": "function", "function": {"name": "test_tool"}}]
            await client.chat_completion(
                messages=[{"role": "user", "content": "use tool"}],
                tools=tools,
            )

            payload = client._client.post.call_args[1]["json"]
            assert payload["tools"] == tools
        finally:
            await client.shutdown()

    @pytest.mark.asyncio
    async def test_chat_completion_raises_if_not_started(self):
        client = OllamaClient()
        with pytest.raises(RuntimeError, match="OllamaClient not started"):
            await client.chat_completion(messages=[])


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------


class TestOllamaHealthCheck:
    """Tests for the health_check method."""

    @pytest.mark.asyncio
    async def test_health_check_not_running(self):
        client = OllamaClient()
        healthy, msg = await client.health_check()
        assert healthy is False
        assert "not running" in msg

    @pytest.mark.asyncio
    async def test_health_check_ok(self):
        client = OllamaClient()
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
        client = OllamaClient()
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


class TestOllamaOtherMethods:
    """Tests for list_running_models, load_model, unload_model, delete_model."""

    @pytest.mark.asyncio
    async def test_list_running_models(self):
        client = OllamaClient()
        await client.startup()
        try:
            mock_response = MagicMock()
            mock_response.json.return_value = {
                "models": [{"name": "llama3.2", "size_vram": 500000}]
            }
            mock_response.raise_for_status = MagicMock()
            client._client.get = AsyncMock(return_value=mock_response)

            models = await client.list_running_models()
            assert len(models) == 1
            assert models[0]["name"] == "llama3.2"
            client._client.get.assert_awaited_once_with("/api/ps", timeout=10.0)
        finally:
            await client.shutdown()

    @pytest.mark.asyncio
    async def test_load_model(self):
        client = OllamaClient()
        await client.startup()
        try:
            mock_response = MagicMock()
            mock_response.json.return_value = {"status": "success"}
            mock_response.raise_for_status = MagicMock()
            client._client.post = AsyncMock(return_value=mock_response)

            result = await client.load_model("llama3.2", keep_alive="10m")
            assert result["status"] == "success"
            call_kwargs = client._client.post.call_args[1]
            assert call_kwargs["json"]["model"] == "llama3.2"
            assert call_kwargs["json"]["keep_alive"] == "10m"
        finally:
            await client.shutdown()

    @pytest.mark.asyncio
    async def test_unload_model(self):
        client = OllamaClient()
        await client.startup()
        try:
            mock_response = MagicMock()
            mock_response.json.return_value = {"status": "success"}
            mock_response.raise_for_status = MagicMock()
            client._client.post = AsyncMock(return_value=mock_response)

            result = await client.unload_model("llama3.2")
            assert result["status"] == "success"
            call_kwargs = client._client.post.call_args[1]
            assert call_kwargs["json"]["keep_alive"] == 0
        finally:
            await client.shutdown()

    @pytest.mark.asyncio
    async def test_delete_model(self):
        client = OllamaClient()
        await client.startup()
        try:
            mock_response = MagicMock()
            mock_response.raise_for_status = MagicMock()
            client._client.request = AsyncMock(return_value=mock_response)

            await client.delete_model("llama3.2")
            client._client.request.assert_awaited_once()
            args = client._client.request.call_args
            assert args[0][0] == "DELETE"
            assert args[0][1] == "/api/delete"
            assert args[1]["json"]["model"] == "llama3.2"
        finally:
            await client.shutdown()

    @pytest.mark.asyncio
    async def test_get_default_model_returns_first(self):
        client = OllamaClient()
        await client.startup()
        try:
            mock_response = MagicMock()
            mock_response.json.return_value = {
                "models": [{"name": "mistral"}, {"name": "llama3.2"}]
            }
            mock_response.raise_for_status = MagicMock()
            client._client.get = AsyncMock(return_value=mock_response)

            default = await client.get_default_model()
            assert default == "mistral"
        finally:
            await client.shutdown()

    @pytest.mark.asyncio
    async def test_get_default_model_fallback(self):
        client = OllamaClient()
        await client.startup()
        try:
            client._client.get = AsyncMock(
                side_effect=httpx.ConnectError("Connection refused")
            )
            default = await client.get_default_model()
            assert default == "llama3.2"
        finally:
            await client.shutdown()
