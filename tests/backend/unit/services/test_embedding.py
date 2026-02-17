"""Unit tests for EmbeddingService."""

import pytest
from unittest.mock import AsyncMock, MagicMock

import httpx

from app.services.embedding_service import (
    DEFAULT_EMBEDDING_MODEL,
    EMBEDDING_DIMENSION,
    MAX_EMBED_CHARS,
    EmbeddingService,
)


pytestmark = pytest.mark.unit


# ---------------------------------------------------------------------------
# Initialization
# ---------------------------------------------------------------------------


class TestEmbeddingServiceInit:
    """Tests for EmbeddingService construction."""

    def test_default_state(self):
        svc = EmbeddingService()
        assert svc._base_url == "http://ollama:11434"
        assert svc.name == "embedding_service"
        assert svc.is_running is False
        assert svc._client is None

    def test_custom_base_url(self):
        svc = EmbeddingService(base_url="http://localhost:11434/")
        assert svc._base_url == "http://localhost:11434"


# ---------------------------------------------------------------------------
# Lifecycle
# ---------------------------------------------------------------------------


class TestEmbeddingServiceLifecycle:

    @pytest.mark.asyncio
    async def test_startup_creates_client(self):
        svc = EmbeddingService()
        await svc.startup()
        try:
            assert svc.is_running is True
            assert isinstance(svc._client, httpx.AsyncClient)
        finally:
            await svc.shutdown()

    @pytest.mark.asyncio
    async def test_startup_idempotent(self):
        svc = EmbeddingService()
        await svc.startup()
        first = svc._client
        await svc.startup()
        assert svc._client is first
        await svc.shutdown()

    @pytest.mark.asyncio
    async def test_shutdown_clears_state(self):
        svc = EmbeddingService()
        await svc.startup()
        await svc.shutdown()
        assert svc.is_running is False
        assert svc._client is None


# ---------------------------------------------------------------------------
# generate_embedding
# ---------------------------------------------------------------------------


class TestGenerateEmbedding:

    @pytest.mark.asyncio
    async def test_returns_vector(self):
        svc = EmbeddingService()
        await svc.startup()
        try:
            fake_vector = [0.1] * EMBEDDING_DIMENSION
            mock_resp = MagicMock()
            mock_resp.json.return_value = {"embedding": fake_vector}
            mock_resp.raise_for_status = MagicMock()
            svc._client.post = AsyncMock(return_value=mock_resp)

            result = await svc.generate_embedding("hello world")
            assert result == fake_vector
            assert len(result) == EMBEDDING_DIMENSION

            call_kwargs = svc._client.post.call_args
            assert call_kwargs[0][0] == "/api/embeddings"
            payload = call_kwargs[1]["json"]
            assert payload["prompt"] == "hello world"
            assert payload["model"] == DEFAULT_EMBEDDING_MODEL
        finally:
            await svc.shutdown()

    @pytest.mark.asyncio
    async def test_truncates_long_text(self):
        svc = EmbeddingService()
        await svc.startup()
        try:
            fake_vector = [0.5] * EMBEDDING_DIMENSION
            mock_resp = MagicMock()
            mock_resp.json.return_value = {"embedding": fake_vector}
            mock_resp.raise_for_status = MagicMock()
            svc._client.post = AsyncMock(return_value=mock_resp)

            long_text = "x" * (MAX_EMBED_CHARS + 500)
            await svc.generate_embedding(long_text)

            payload = svc._client.post.call_args[1]["json"]
            assert len(payload["prompt"]) == MAX_EMBED_CHARS
        finally:
            await svc.shutdown()

    @pytest.mark.asyncio
    async def test_raises_on_dimension_mismatch(self):
        svc = EmbeddingService()
        await svc.startup()
        try:
            wrong_vector = [0.1] * 512  # wrong dimension
            mock_resp = MagicMock()
            mock_resp.json.return_value = {"embedding": wrong_vector}
            mock_resp.raise_for_status = MagicMock()
            svc._client.post = AsyncMock(return_value=mock_resp)

            with pytest.raises(ValueError, match="dimension mismatch"):
                await svc.generate_embedding("test")
        finally:
            await svc.shutdown()

    @pytest.mark.asyncio
    async def test_raises_if_not_started(self):
        svc = EmbeddingService()
        with pytest.raises(RuntimeError, match="EmbeddingService not started"):
            await svc.generate_embedding("test")

    @pytest.mark.asyncio
    async def test_propagates_http_error(self):
        svc = EmbeddingService()
        await svc.startup()
        try:
            mock_resp = MagicMock()
            mock_resp.raise_for_status.side_effect = httpx.HTTPStatusError(
                "Internal Server Error",
                request=MagicMock(),
                response=MagicMock(status_code=500),
            )
            svc._client.post = AsyncMock(return_value=mock_resp)

            with pytest.raises(httpx.HTTPStatusError):
                await svc.generate_embedding("test")
        finally:
            await svc.shutdown()

    @pytest.mark.asyncio
    async def test_custom_model(self):
        svc = EmbeddingService()
        await svc.startup()
        try:
            fake_vector = [0.2] * EMBEDDING_DIMENSION
            mock_resp = MagicMock()
            mock_resp.json.return_value = {"embedding": fake_vector}
            mock_resp.raise_for_status = MagicMock()
            svc._client.post = AsyncMock(return_value=mock_resp)

            await svc.generate_embedding("test", model="nomic-embed-text")
            payload = svc._client.post.call_args[1]["json"]
            assert payload["model"] == "nomic-embed-text"
        finally:
            await svc.shutdown()


# ---------------------------------------------------------------------------
# generate_embeddings_batch
# ---------------------------------------------------------------------------


class TestGenerateEmbeddingsBatch:

    @pytest.mark.asyncio
    async def test_batch_returns_multiple_vectors(self):
        svc = EmbeddingService()
        await svc.startup()
        try:
            call_count = 0

            async def mock_post(url, **kwargs):
                nonlocal call_count
                call_count += 1
                resp = MagicMock()
                resp.json.return_value = {
                    "embedding": [float(call_count)] * EMBEDDING_DIMENSION
                }
                resp.raise_for_status = MagicMock()
                return resp

            svc._client.post = mock_post

            texts = ["text1", "text2", "text3"]
            results = await svc.generate_embeddings_batch(texts)

            assert len(results) == 3
            # Each vector should have different values based on call order
            assert results[0][0] == 1.0
            assert results[1][0] == 2.0
            assert results[2][0] == 3.0
        finally:
            await svc.shutdown()

    @pytest.mark.asyncio
    async def test_batch_empty_list(self):
        svc = EmbeddingService()
        await svc.startup()
        try:
            results = await svc.generate_embeddings_batch([])
            assert results == []
        finally:
            await svc.shutdown()


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------


class TestEmbeddingHealthCheck:

    @pytest.mark.asyncio
    async def test_health_check_not_running(self):
        svc = EmbeddingService()
        healthy, msg = await svc.health_check()
        assert healthy is False
        assert "not running" in msg

    @pytest.mark.asyncio
    async def test_health_check_ok(self):
        svc = EmbeddingService()
        await svc.startup()
        try:
            mock_resp = MagicMock()
            mock_resp.raise_for_status = MagicMock()
            svc._client.get = AsyncMock(return_value=mock_resp)

            healthy, msg = await svc.health_check()
            assert healthy is True
            assert msg == "ok"
        finally:
            await svc.shutdown()

    @pytest.mark.asyncio
    async def test_health_check_unreachable(self):
        svc = EmbeddingService()
        await svc.startup()
        try:
            svc._client.get = AsyncMock(
                side_effect=httpx.ConnectError("Connection refused")
            )
            healthy, msg = await svc.health_check()
            assert healthy is False
            assert "unreachable" in msg
        finally:
            await svc.shutdown()


# ---------------------------------------------------------------------------
# Validate embedding dimension
# ---------------------------------------------------------------------------


class TestValidateEmbeddingDimension:

    def test_valid_dimension(self):
        # Should not raise
        EmbeddingService._validate_embedding_dimension([0.0] * EMBEDDING_DIMENSION)

    def test_wrong_dimension(self):
        with pytest.raises(ValueError, match="dimension mismatch"):
            EmbeddingService._validate_embedding_dimension([0.0] * 256)

    def test_empty_embedding(self):
        with pytest.raises(ValueError, match="dimension mismatch"):
            EmbeddingService._validate_embedding_dimension([])
