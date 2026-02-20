"""OllamaClient - Async HTTP client for Ollama LLM API."""

import json
import logging
from typing import Any, AsyncGenerator, Dict, List, Optional, Union

import httpx

from app.kernel.http_service import HttpKernelService

logger = logging.getLogger(__name__)


class OllamaClient(HttpKernelService):
    """
    Kernel service wrapping the Ollama HTTP API.

    Provides async methods for chat completion and model listing,
    with connection pooling and configurable timeouts.
    """

    def __init__(self, base_url: str = "http://ollama:11434") -> None:
        super().__init__(base_url)

    @property
    def name(self) -> str:
        return "ollama_client"

    @property
    def _health_endpoint(self) -> str:
        return "/api/tags"

    @property
    def _default_timeout(self) -> httpx.Timeout:
        return httpx.Timeout(connect=5.0, read=120.0, write=5.0, pool=5.0)

    # -- Public API ----------------------------------------------------------

    async def list_models(self) -> List[Dict[str, Any]]:
        """Return the list of locally available Ollama models."""
        self._require_client()
        resp = await self._client.get("/api/tags", timeout=10.0)
        resp.raise_for_status()
        data = resp.json()
        return data.get("models", [])

    async def get_default_model(self) -> str:
        """Return the best available chat model, preferring uncensored coding models.

        Priority: abliterated/uncensored coding models > other coding models > any chat model.
        Skips embedding-only models (e.g. nomic-embed-text, snowflake-arctic-embed).
        """
        try:
            models = await self.list_models()
            # Filter out embedding models
            chat_models = [
                m for m in models
                if "embed" not in m.get("name", "").lower()
            ]
            if not chat_models:
                return "llama3.2"

            # Prefer uncensored/abliterated coding models
            def _score(m: dict) -> int:
                name = m.get("name", "").lower()
                s = 0
                if "abliterat" in name or "uncensor" in name or "dolphin" in name:
                    s += 20
                if "code" in name or "coder" in name or "roocode" in name or "deepcoder" in name:
                    s += 10
                # Prefer larger models (rough heuristic from size)
                size = m.get("size", 0)
                if size > 8_000_000_000:
                    s += 5
                elif size > 4_000_000_000:
                    s += 2
                return s

            chat_models.sort(key=_score, reverse=True)
            chosen = chat_models[0].get("name", "llama3.2")
            logger.info("Default model selected: %s", chosen)
            return chosen
        except Exception:
            logger.warning("Failed to list Ollama models, using fallback")
        return "llama3.2"

    async def chat_completion(
        self,
        messages: List[Dict[str, Any]],
        model: str = "llama3.2",
        temperature: float = 0.7,
        max_tokens: Optional[int] = None,
        num_ctx: Optional[int] = None,
        tools: Optional[List[Dict[str, Any]]] = None,
    ) -> Dict[str, Any]:
        """
        Send a chat completion request to Ollama (non-streaming).

        Args:
            messages: List of {"role": ..., "content": ...} dicts.
            model: Ollama model name.
            temperature: Sampling temperature.
            max_tokens: Optional max token limit for the response.
            tools: Optional list of tool definitions in OpenAI format.

        Returns:
            Dict with at least ``message`` (the assistant reply) and
            ``model`` keys from the Ollama response. If tools were
            provided and the model invoked them, ``message.tool_calls``
            will be present.

        Raises:
            httpx.TimeoutException: On request timeout.
            httpx.HTTPStatusError: On non-2xx response from Ollama.
        """
        self._require_client()

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
        if num_ctx is not None:
            payload["options"]["num_ctx"] = num_ctx
        if tools:
            payload["tools"] = tools

        resp = await self._client.post("/api/chat", json=payload)
        resp.raise_for_status()
        return resp.json()

    async def chat_completion_stream(
        self,
        messages: List[Dict[str, Any]],
        model: str = "llama3.2",
        temperature: float = 0.7,
        max_tokens: Optional[int] = None,
        num_ctx: Optional[int] = None,
        tools: Optional[List[Dict[str, Any]]] = None,
    ) -> AsyncGenerator[Union[str, Dict[str, Any]], None]:
        """
        Send a streaming chat completion request to Ollama.

        Yields token strings as they arrive. When the model invokes tools,
        the final yield is a dict ``{"tool_calls": [...]}`` instead of a
        string token.

        Args:
            messages: List of message dicts (role, content, tool_calls, etc.).
            model: Ollama model name.
            temperature: Sampling temperature.
            max_tokens: Optional max token limit for the response.
            tools: Optional list of tool definitions in OpenAI format.

        Yields:
            ``str`` token text, or a ``dict`` with ``tool_calls`` key on
            the final chunk when the model invokes tools.

        Raises:
            httpx.TimeoutException: On request timeout.
            httpx.HTTPStatusError: On non-2xx response from Ollama.
            httpx.ConnectError: When Ollama is unreachable.
        """
        self._require_client()

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
        if num_ctx is not None:
            payload["options"]["num_ctx"] = num_ctx
        if tools:
            payload["tools"] = tools

        logger.info("Ollama chat request: model=%s messages=%d", payload["model"], len(messages))
        async with self._client.stream("POST", "/api/chat", json=payload) as resp:
            if resp.status_code != 200:
                body = await resp.aread()
                logger.error("Ollama chat error %d: %s", resp.status_code, body[:500])
            resp.raise_for_status()
            async for line in resp.aiter_lines():
                if not line:
                    continue
                try:
                    chunk = json.loads(line)
                except json.JSONDecodeError:
                    logger.warning("Malformed JSON chunk from Ollama: %s", line[:100])
                    continue

                msg = chunk.get("message", {})
                token = msg.get("content", "")
                if token:
                    yield token

                # On the final chunk, check for tool calls
                if chunk.get("done", False):
                    tool_calls = msg.get("tool_calls")
                    if tool_calls:
                        yield {"tool_calls": tool_calls}
                    break

    async def list_running_models(self) -> List[Dict[str, Any]]:
        """Return models currently loaded in VRAM via Ollama's /api/ps."""
        self._require_client()
        resp = await self._client.get("/api/ps", timeout=10.0)
        resp.raise_for_status()
        data = resp.json()
        return data.get("models", [])

    async def load_model(self, name: str, keep_alive: str = "5m") -> Dict[str, Any]:
        """Load a model into VRAM by sending a blank generate request with keep_alive."""
        self._require_client()
        resp = await self._client.post(
            "/api/generate",
            json={"model": name, "keep_alive": keep_alive},
            timeout=httpx.Timeout(connect=5.0, read=300.0, write=5.0, pool=5.0),
        )
        resp.raise_for_status()
        return resp.json()

    async def unload_model(self, name: str) -> Dict[str, Any]:
        """Unload a model from VRAM by setting keep_alive to 0."""
        self._require_client()
        resp = await self._client.post(
            "/api/generate",
            json={"model": name, "keep_alive": 0},
            timeout=30.0,
        )
        resp.raise_for_status()
        return resp.json()

    async def pull_model(self, name: str) -> AsyncGenerator[Dict[str, Any], None]:
        """Pull/download a model from Ollama registry, streaming progress."""
        self._require_client()
        async with self._client.stream(
            "POST",
            "/api/pull",
            json={"model": name, "stream": True},
            timeout=httpx.Timeout(connect=10.0, read=600.0, write=5.0, pool=5.0),
        ) as resp:
            resp.raise_for_status()
            async for line in resp.aiter_lines():
                if not line:
                    continue
                try:
                    chunk = json.loads(line)
                except json.JSONDecodeError:
                    logger.warning("Malformed JSON chunk from Ollama pull: %s", line[:100])
                    continue
                yield chunk

    async def delete_model(self, name: str) -> None:
        """Delete a local model."""
        self._require_client()
        resp = await self._client.request(
            "DELETE",
            "/api/delete",
            json={"model": name},
            timeout=30.0,
        )
        resp.raise_for_status()
