"""Tests for SearXNG web search client."""

from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

from app.services.searxng_client import SearXNGClient


class TestSearXNGClientInit:
    def test_default_base_url(self):
        client = SearXNGClient()
        assert client._base_url == "http://searxng:8080"

    def test_custom_base_url(self):
        client = SearXNGClient(base_url="http://custom:9090/")
        assert client._base_url == "http://custom:9090"  # trailing slash stripped

    @patch.dict("os.environ", {"SEARXNG_BASE_URL": "http://env-searx:8888"})
    def test_env_var_base_url(self):
        client = SearXNGClient()
        assert client._base_url == "http://env-searx:8888"


class TestSearXNGClientLifecycle:
    @pytest.mark.asyncio
    async def test_startup_creates_client(self):
        client = SearXNGClient("http://localhost:8080")
        await client.startup()
        assert client._client is not None
        await client.shutdown()

    @pytest.mark.asyncio
    async def test_shutdown_closes_client(self):
        client = SearXNGClient("http://localhost:8080")
        await client.startup()
        await client.shutdown()
        assert client._client is None

    @pytest.mark.asyncio
    async def test_shutdown_when_not_started(self):
        client = SearXNGClient()
        await client.shutdown()  # Should not raise


class TestSearXNGSearch:
    @pytest.fixture
    def mock_client(self):
        client = SearXNGClient("http://localhost:8080")
        client._client = AsyncMock()
        return client

    @pytest.mark.asyncio
    async def test_search_returns_results(self, mock_client):
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "results": [
                {"title": "Result 1", "url": "https://example.com/1", "content": "Content 1", "engine": "google"},
                {"title": "Result 2", "url": "https://example.com/2", "content": "Content 2", "engine": "bing"},
            ]
        }
        mock_resp.raise_for_status = MagicMock()
        mock_client._client.get = AsyncMock(return_value=mock_resp)

        results = await mock_client.search("test query")
        assert len(results) == 2
        assert results[0]["title"] == "Result 1"
        assert results[1]["engine"] == "bing"

    @pytest.mark.asyncio
    async def test_search_respects_max_results(self, mock_client):
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "results": [{"title": f"R{i}", "url": f"u{i}", "content": "", "engine": "g"} for i in range(20)]
        }
        mock_resp.raise_for_status = MagicMock()
        mock_client._client.get = AsyncMock(return_value=mock_resp)

        results = await mock_client.search("test", max_results=5)
        assert len(results) == 5

    @pytest.mark.asyncio
    async def test_search_with_categories(self, mock_client):
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {"results": []}
        mock_resp.raise_for_status = MagicMock()
        mock_client._client.get = AsyncMock(return_value=mock_resp)

        await mock_client.search("test", categories="general,news")
        call_kwargs = mock_client._client.get.call_args
        assert call_kwargs[1]["params"]["categories"] == "general,news"

    @pytest.mark.asyncio
    async def test_search_not_started_raises(self):
        client = SearXNGClient()
        with pytest.raises(RuntimeError, match="not started"):
            await client.search("test")

    @pytest.mark.asyncio
    async def test_search_connect_error_returns_empty(self, mock_client):
        mock_client._client.get = AsyncMock(side_effect=httpx.ConnectError("unreachable"))
        results = await mock_client.search("test")
        assert results == []

    @pytest.mark.asyncio
    async def test_search_http_error_returns_empty(self, mock_client):
        mock_resp = MagicMock()
        mock_resp.status_code = 500
        mock_resp.raise_for_status = MagicMock(
            side_effect=httpx.HTTPStatusError("500", request=MagicMock(), response=mock_resp)
        )
        mock_client._client.get = AsyncMock(return_value=mock_resp)
        results = await mock_client.search("test")
        assert results == []

    @pytest.mark.asyncio
    async def test_search_unexpected_error_returns_empty(self, mock_client):
        mock_client._client.get = AsyncMock(side_effect=Exception("unexpected"))
        results = await mock_client.search("test")
        assert results == []

    @pytest.mark.asyncio
    async def test_search_handles_missing_fields(self, mock_client):
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {"results": [{}]}
        mock_resp.raise_for_status = MagicMock()
        mock_client._client.get = AsyncMock(return_value=mock_resp)

        results = await mock_client.search("test")
        assert len(results) == 1
        assert results[0]["title"] == ""
        assert results[0]["url"] == ""


class TestSearXNGIsAvailable:
    @pytest.mark.asyncio
    async def test_available_when_healthy(self):
        client = SearXNGClient()
        client._client = AsyncMock()
        client._client.get = AsyncMock(return_value=MagicMock(status_code=200))
        assert await client.is_available() is True

    @pytest.mark.asyncio
    async def test_not_available_when_not_started(self):
        client = SearXNGClient()
        assert await client.is_available() is False

    @pytest.mark.asyncio
    async def test_not_available_on_error(self):
        client = SearXNGClient()
        client._client = AsyncMock()
        client._client.get = AsyncMock(side_effect=Exception("fail"))
        assert await client.is_available() is False

    @pytest.mark.asyncio
    async def test_not_available_on_non_200(self):
        client = SearXNGClient()
        client._client = AsyncMock()
        client._client.get = AsyncMock(return_value=MagicMock(status_code=503))
        assert await client.is_available() is False
