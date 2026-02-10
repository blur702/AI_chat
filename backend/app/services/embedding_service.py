"""EmbeddingService - Async embedding generation via Ollama API."""

import logging
from typing import Any, Dict, List, Optional, Tuple

import httpx

from app.kernel.base import BaseKernelService

logger = logging.getLogger(__name__)

DEFAULT_EMBEDDING_MODEL = "nomic-embed-text"
EMBEDDING_DIMENSION = 1024


class EmbeddingService(BaseKernelService):
    """
    Kernel service for generating vector embeddings via the Ollama API.

    Uses the /api/embeddings endpoint to produce 1024-dimensional vectors
    compatible with the pgvector IVFFlat index on KBChunk.embedding.
    """

    def __init__(self, base_url: str = "http://host.docker.internal:11434") -> None:
        self._base_url = base_url.rstrip("/")
        self._running = False
        self._client: Optional[httpx.AsyncClient] = None

    # -- BaseKernelService lifecycle -----------------------------------------

    @property
    def name(self) -> str:
        return "embedding_service"

    @property
    def is_running(self) -> bool:
        return self._running

    async def startup(self) -> None:
        if self._running:
            return
        self._client = httpx.AsyncClient(
            base_url=self._base_url,
            timeout=httpx.Timeout(connect=5.0, read=60.0, write=5.0, pool=5.0),
        )
        self._running = True
        logger.info("EmbeddingService started (base_url=%s)", self._base_url)

    async def shutdown(self) -> None:
        if self._client:
            await self._client.aclose()
            self._client = None
        self._running = False
        logger.info("EmbeddingService stopped")

    async def health_check(self) -> Tuple[bool, str]:
        if not self._running or not self._client:
            return False, "service not running"
        try:
            resp = await self._client.get("/api/tags", timeout=5.0)
            resp.raise_for_status()
            return True, "ok"
        except Exception as exc:
            return False, f"ollama unreachable: {exc}"

    # -- Public API ----------------------------------------------------------

    async def generate_embedding(
        self,
        text: str,
        model: str = DEFAULT_EMBEDDING_MODEL,
    ) -> List[float]:
        """Generate a single embedding vector for the given text.

        Args:
            text: Input text to embed.
            model: Ollama embedding model name.

        Returns:
            List of floats representing the embedding vector.

        Raises:
            httpx.TimeoutException: On request timeout.
            httpx.HTTPStatusError: On non-2xx response from Ollama.
            ValueError: If the returned embedding has unexpected dimensions.
        """
        if self._client is None:
            raise RuntimeError("EmbeddingService not started")

        resp = await self._client.post(
            "/api/embeddings",
            json={"model": model, "prompt": text},
        )
        resp.raise_for_status()
        data = resp.json()

        embedding = data.get("embedding", [])
        self._validate_embedding_dimension(embedding)
        return embedding

    async def generate_embeddings_batch(
        self,
        texts: List[str],
        model: str = DEFAULT_EMBEDDING_MODEL,
    ) -> List[List[float]]:
        """Generate embeddings for multiple texts.

        Processes each text individually through the Ollama API since the
        /api/embeddings endpoint handles one prompt at a time.

        Args:
            texts: List of input texts to embed.
            model: Ollama embedding model name.

        Returns:
            List of embedding vectors matching the input order.
        """
        results: List[List[float]] = []
        for text in texts:
            embedding = await self.generate_embedding(text, model=model)
            results.append(embedding)
        return results

    # -- Helpers -------------------------------------------------------------

    @staticmethod
    def _validate_embedding_dimension(embedding: List[float]) -> None:
        """Raise ValueError if the embedding dimension is unexpected."""
        if len(embedding) != EMBEDDING_DIMENSION:
            logger.warning(
                "Unexpected embedding dimension: got %d, expected %d",
                len(embedding),
                EMBEDDING_DIMENSION,
            )
            raise ValueError(
                f"Embedding dimension mismatch: got {len(embedding)}, "
                f"expected {EMBEDDING_DIMENSION}"
            )
