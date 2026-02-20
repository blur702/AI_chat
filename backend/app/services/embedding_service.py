"""EmbeddingService - Async embedding generation via Ollama API."""

import asyncio
import logging
from typing import List

from app.kernel.http_service import HttpKernelService

logger = logging.getLogger(__name__)

DEFAULT_EMBEDDING_MODEL = "snowflake-arctic-embed:l"
EMBEDDING_DIMENSION = 1024
# snowflake-arctic-embed:l (Ollama tag for snowflake-arctic-embed-l-v2.0)
# has a 512-token context window (num_ctx=512 by default).
# Code/template text tokenizes ~1 char/token, prose ~4 chars/token.
# Use conservative limit to handle worst-case tokenization.
MAX_EMBED_CHARS = 1000


class EmbeddingService(HttpKernelService):
    """
    Kernel service for generating vector embeddings via the Ollama API.

    Uses the /api/embeddings endpoint to produce 1024-dimensional vectors
    compatible with the pgvector IVFFlat index on KBChunk.embedding.
    """

    def __init__(self, base_url: str = "http://ollama:11434") -> None:
        super().__init__(base_url)

    @property
    def name(self) -> str:
        return "embedding_service"

    @property
    def _health_endpoint(self) -> str:
        return "/api/tags"

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
        self._require_client()

        # Truncate to avoid exceeding model context window
        truncated = text[:MAX_EMBED_CHARS] if len(text) > MAX_EMBED_CHARS else text
        resp = await self._client.post(
            "/api/embeddings",
            json={"model": model, "prompt": truncated},
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
        batch_size: int = 10,
    ) -> List[List[float]]:
        """Generate embeddings for multiple texts with parallel processing.

        Uses asyncio.gather with a semaphore to process up to `batch_size`
        embeddings concurrently through the Ollama API.

        Args:
            texts: List of input texts to embed.
            model: Ollama embedding model name.
            batch_size: Maximum concurrent embedding requests.

        Returns:
            List of embedding vectors matching the input order.
        """
        semaphore = asyncio.Semaphore(batch_size)

        async def _embed(text: str) -> List[float]:
            async with semaphore:
                return await self.generate_embedding(text, model=model)

        return list(await asyncio.gather(*[_embed(t) for t in texts]))

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
