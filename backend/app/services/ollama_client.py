"""OllamaClient - Async HTTP client for Ollama LLM API."""

import json
import logging
from typing import Any, AsyncGenerator, Dict, List, Optional, Tuple

import httpx

from app.kernel.base import BaseKernelService

logger = logging.getLogger(__name__)


class OllamaClient(BaseKernelService):
    """
    Kernel service wrapping the Ollama HTTP API.

    Provides async methods for chat completion and model listing,
    with connection pooling and configurable timeouts.
    """

    def __init__(self, base_url: str = "http://host.docker.internal:11434") -> None:
        self._base_url = base_url.rstrip("/")
        self._running = False
        self._client: Optional[httpx.AsyncClient] = None

    # -- BaseKernelService lifecycle -----------------------------------------

    @property
    def name(self) -> str:
        return "ollama_client"

    @property
    def is_running(self) -> bool:
        return self._running

    async def startup(self) -> None:
        if self._running:
            return
        self._client = httpx.AsyncClient(
            base_url=self._base_url,
            timeout=httpx.Timeout(connect=5.0, read=120.0, write=5.0, pool=5.0),
        )
        self._running = True
        logger.info("OllamaClient started (base_url=%s)", self._base_url)

    async def shutdown(self) -> None:
        if self._client:
            await self._client.aclose()
            self._client = None
        self._running = False
        logger.info("OllamaClient stopped")

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

    async def list_models(self) -> List[Dict[str, Any]]:
        """Return the list of locally available Ollama models."""
        if self._client is None:
            raise RuntimeError("OllamaClient not started")
        resp = await self._client.get("/api/tags", timeout=10.0)
        resp.raise_for_status()
        data = resp.json()
        return data.get("models", [])

    async def get_default_model(self) -> str:
        """Return the first available model name, or a sensible fallback."""
        try:
            models = await self.list_models()
            if models:
                return models[0].get("name", "llama3.2")
        except Exception:
            logger.warning("Failed to list Ollama models, using fallback")
        return "llama3.2"

    async def chat_completion(
        self,
        messages: List[Dict[str, str]],
        model: str = "llama3.2",
        temperature: float = 0.7,
        max_tokens: Optional[int] = None,
    ) -> Dict[str, Any]:
        """
        Send a chat completion request to Ollama (non-streaming).

        Args:
            messages: List of {"role": ..., "content": ...} dicts.
            model: Ollama model name.
            temperature: Sampling temperature.
            max_tokens: Optional max token limit for the response.

        Returns:
            Dict with at least ``message`` (the assistant reply) and
            ``model`` keys from the Ollama response.

        Raises:
            httpx.TimeoutException: On request timeout.
            httpx.HTTPStatusError: On non-2xx response from Ollama.
        """
        if self._client is None:
            raise RuntimeError("OllamaClient not started")

        payload: Dict[str, Any] = {
            "model": model,
            "messages": messages,
            "stream": False,
            "options": {
                "temperature": temperature,
            },
        }
        if max_tokens is not None:
            payload["options"]["num_predict"] = max_tokens

        resp = await self._client.post("/api/chat", json=payload)
        resp.raise_for_status()
        return resp.json()

    async def chat_completion_stream(
        self,
        messages: List[Dict[str, str]],
        model: str = "llama3.2",
        temperature: float = 0.7,
        max_tokens: Optional[int] = None,
    ) -> AsyncGenerator[str, None]:
        """
        Send a streaming chat completion request to Ollama.

        Yields token strings as they arrive from the Ollama streaming API.

        Args:
            messages: List of {"role": ..., "content": ...} dicts.
            model: Ollama model name.
            temperature: Sampling temperature.
            max_tokens: Optional max token limit for the response.

        Yields:
            Individual token strings from the assistant response.

        Raises:
            httpx.TimeoutException: On request timeout.
            httpx.HTTPStatusError: On non-2xx response from Ollama.
            httpx.ConnectError: When Ollama is unreachable.
        """
        if self._client is None:
            raise RuntimeError("OllamaClient not started")

        payload: Dict[str, Any] = {
            "model": model,
            "messages": messages,
            "stream": True,
            "options": {
                "temperature": temperature,
            },
        }
        if max_tokens is not None:
            payload["options"]["num_predict"] = max_tokens

        async with self._client.stream("POST", "/api/chat", json=payload) as resp:
            resp.raise_for_status()
            async for line in resp.aiter_lines():
                if not line:
                    continue
                try:
                    chunk = json.loads(line)
                except json.JSONDecodeError:
                    logger.warning("Malformed JSON chunk from Ollama: %s", line[:100])
                    continue
                token = chunk.get("message", {}).get("content", "")
                if token:
                    yield token
                if chunk.get("done", False):
                    break
