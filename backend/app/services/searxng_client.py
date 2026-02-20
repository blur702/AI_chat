"""SearXNG client for web search capabilities."""

import logging
import os
from typing import Any, Dict, List, Optional

import httpx

logger = logging.getLogger(__name__)


class SearXNGClient:
    """
    Async HTTP client for SearXNG search API.

    SearXNG is a self-hosted meta-search engine that aggregates results
    from multiple search engines without tracking.
    """

    def __init__(self, base_url: Optional[str] = None) -> None:
        self._base_url = (
            base_url or os.environ.get("SEARXNG_BASE_URL", "http://searxng:8080")
        ).rstrip("/")
        self._client: Optional[httpx.AsyncClient] = None

    async def startup(self) -> None:
        """Initialize the HTTP client."""
        self._client = httpx.AsyncClient(
            base_url=self._base_url,
            timeout=httpx.Timeout(15.0, connect=5.0),
        )
        logger.info("SearXNGClient started: %s", self._base_url)

    async def shutdown(self) -> None:
        """Close the HTTP client."""
        if self._client:
            await self._client.aclose()
            self._client = None
        logger.info("SearXNGClient shutdown")

    async def search(
        self,
        query: str,
        categories: Optional[str] = None,
        language: str = "en",
        max_results: int = 10,
    ) -> List[Dict[str, Any]]:
        """
        Perform a web search via SearXNG.

        Args:
            query: Search query string.
            categories: Comma-separated categories (e.g. "general,news").
            language: Language code for results.
            max_results: Maximum number of results to return.

        Returns:
            List of result dicts with keys: title, url, content, engine.
        """
        if self._client is None:
            raise RuntimeError("SearXNGClient not started")

        params: Dict[str, Any] = {
            "q": query,
            "format": "json",
            "language": language,
        }
        if categories:
            params["categories"] = categories

        try:
            resp = await self._client.get("/search", params=params)
            resp.raise_for_status()
            data = resp.json()
        except httpx.ConnectError:
            logger.warning("SearXNG is not reachable at %s", self._base_url)
            return []
        except httpx.HTTPStatusError as e:
            logger.warning("SearXNG returned error: %s", e)
            return []
        except Exception as e:
            logger.exception("SearXNG search failed: %s", e)
            return []

        results = data.get("results", [])[:max_results]

        return [
            {
                "title": r.get("title", ""),
                "url": r.get("url", ""),
                "content": r.get("content", ""),
                "engine": r.get("engine", ""),
            }
            for r in results
        ]

    async def is_available(self) -> bool:
        """Check if SearXNG is reachable."""
        if self._client is None:
            return False
        try:
            resp = await self._client.get("/healthz", timeout=3.0)
            return resp.status_code == 200
        except Exception:
            return False
