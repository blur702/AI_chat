"""Base class for kernel services that wrap an HTTP API via httpx."""

import logging
from abc import abstractmethod
from typing import Dict, Optional, Tuple

import httpx

from app.kernel.base import BaseKernelService

logger = logging.getLogger(__name__)


class HttpKernelService(BaseKernelService):
    """Abstract base for kernel services backed by a persistent httpx.AsyncClient.

    Subclasses must define :pyattr:`name` and :pyattr:`_health_endpoint`.
    Override :pyattr:`_default_timeout` or :pyattr:`_default_headers` to
    customise the client created in :pymeth:`startup`.
    """

    def __init__(self, base_url: str) -> None:
        self._base_url = base_url.rstrip("/")
        self._running = False
        self._client: Optional[httpx.AsyncClient] = None

    # -- Overridable properties ------------------------------------------------

    @property
    def _default_timeout(self) -> httpx.Timeout:
        return httpx.Timeout(connect=5.0, read=60.0, write=5.0, pool=5.0)

    @property
    def _default_headers(self) -> Dict[str, str]:
        return {}

    @property
    @abstractmethod
    def _health_endpoint(self) -> str:
        """URL path used by :pymeth:`health_check` (e.g. ``/api/tags``)."""

    # -- BaseKernelService lifecycle -------------------------------------------

    @property
    def is_running(self) -> bool:
        return self._running

    async def startup(self) -> None:
        if self._running:
            return
        self._client = httpx.AsyncClient(
            base_url=self._base_url,
            timeout=self._default_timeout,
            headers=self._default_headers or None,
        )
        self._running = True
        logger.info("%s started (base_url=%s)", self.name, self._base_url)

    async def shutdown(self) -> None:
        if self._client:
            await self._client.aclose()
            self._client = None
        self._running = False
        logger.info("%s stopped", self.name)

    async def health_check(self) -> Tuple[bool, str]:
        if not self._running or not self._client:
            return False, "service not running"
        try:
            resp = await self._client.get(self._health_endpoint, timeout=5.0)
            resp.raise_for_status()
            return True, "ok"
        except Exception as exc:
            return False, f"{self.name} unreachable: {exc}"

    # -- Helpers ---------------------------------------------------------------

    def _require_client(self) -> httpx.AsyncClient:
        """Return the active client or raise ``RuntimeError``."""
        if self._client is None:
            raise RuntimeError(f"{self.name} not started")
        return self._client
