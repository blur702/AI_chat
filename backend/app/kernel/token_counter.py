"""Token counting kernel service using tiktoken for accurate context window management."""

import logging
from typing import Dict, List, Tuple

import tiktoken

from app.kernel.base import BaseKernelService

logger = logging.getLogger(__name__)

# Context window sizes for known model families
_MODEL_CONTEXT_WINDOWS: Dict[str, int] = {
    "llama3.2": 131072,
    "llama3.1": 131072,
    "llama3": 8192,
    "llama2": 4096,
    "mistral": 32768,
    "mixtral": 32768,
    "codellama": 16384,
    "deepseek-coder": 16384,
    "deepseek": 16384,
    "phi3": 128000,
    "phi": 2048,
    "gemma2": 8192,
    "gemma": 8192,
    "qwen2": 32768,
    "qwen": 32768,
    "command-r": 128000,
    "yi": 200000,
}

# Tokens added per message for role/framing overhead (role name, delimiters, etc.)
_MESSAGE_OVERHEAD_TOKENS = 4


class TokenCounter(BaseKernelService):
    """Kernel service that counts tokens using tiktoken cl100k_base encoding.

    While tiktoken's cl100k_base is designed for OpenAI models, it provides
    a good approximation for most LLM tokenizers. The actual token count
    may vary slightly for non-OpenAI models, but it's close enough for
    context window management and compaction triggering.

    Can also be used standalone (without kernel registration) — the encoding
    is loaded eagerly in __init__ so all counting methods work immediately.
    """

    def __init__(self, encoding_name: str = "cl100k_base") -> None:
        self._encoding_name = encoding_name
        self._encoding = tiktoken.get_encoding(encoding_name)
        self._running = False

    # -- BaseKernelService interface ----------------------------------------

    @property
    def name(self) -> str:
        return "token_counter"

    @property
    def is_running(self) -> bool:
        return self._running

    async def startup(self) -> None:
        if self._running:
            return
        logger.info("Starting TokenCounter service (encoding=%s)...", self._encoding_name)
        self._running = True
        logger.info("TokenCounter service started successfully")

    async def shutdown(self) -> None:
        logger.info("Shutting down TokenCounter service...")
        self._running = False
        logger.info("TokenCounter service shutdown complete")

    async def health_check(self) -> Tuple[bool, str]:
        if not self._running:
            return False, "not running"
        try:
            # Quick sanity check — encode a trivial string
            self._encoding.encode("ok")
            return True, "ok"
        except Exception as e:
            return False, f"encoding error: {e}"

    # -- Token counting methods ---------------------------------------------

    def count_tokens(self, text: str) -> int:
        """Count tokens in a single string."""
        if not text:
            return 0
        return len(self._encoding.encode(text))

    def count_messages(self, messages: List[Dict[str, str]]) -> int:
        """Count tokens in a list of chat messages including framing overhead.

        Each message adds ~4 tokens for role name, delimiters, and framing.
        """
        total = 0
        for msg in messages:
            total += _MESSAGE_OVERHEAD_TOKENS
            total += self.count_tokens(msg.get("role", ""))
            total += self.count_tokens(msg.get("content", ""))
        # 2 tokens for assistant reply priming
        total += 2
        return total

    def estimate_model_context_window(self, model_name: str) -> int:
        """Return the context window size for a model name.

        Uses a lookup table of known model families. Falls back to a
        conservative 8192 for unknown models.
        """
        if not model_name:
            return 8192

        name = model_name.lower().split(":")[0]

        # Exact match
        if name in _MODEL_CONTEXT_WINDOWS:
            return _MODEL_CONTEXT_WINDOWS[name]

        # Prefix match (e.g. "llama3.2-vision" matches "llama3.2")
        for prefix, window in sorted(
            _MODEL_CONTEXT_WINDOWS.items(), key=lambda x: -len(x[0])
        ):
            if name.startswith(prefix):
                return window

        logger.debug("Unknown model '%s', using default context window 8192", model_name)
        return 8192
