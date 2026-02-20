"""Web search tool using SearXNG."""

import logging
from typing import Any, Dict, Optional, Set

from app.kernel.tool_base import BaseTool
from app.services.searxng_client import SearXNGClient

logger = logging.getLogger(__name__)


class WebSearchTool(BaseTool):
    """
    Search the web using SearXNG meta-search engine.

    Returns a list of search results with titles, URLs, and snippets.
    """

    def __init__(self, searxng_client: SearXNGClient) -> None:
        self._client = searxng_client

    @property
    def name(self) -> str:
        return "web_search"

    @property
    def description(self) -> str:
        return (
            "Search the web for current information, documentation, news, "
            "or any topic. Returns a list of results with titles, URLs, "
            "and content snippets."
        )

    @property
    def parameters_schema(self) -> Dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "The search query string.",
                },
                "categories": {
                    "type": "string",
                    "description": (
                        "Comma-separated search categories. "
                        "Options: general, news, images, videos, science, it, files. "
                        "Default: general."
                    ),
                },
                "max_results": {
                    "type": "integer",
                    "description": "Maximum number of results to return (1-20). Default: 8.",
                    "minimum": 1,
                    "maximum": 20,
                },
            },
            "required": ["query"],
        }

    @property
    def required_permissions(self) -> Set[str]:
        return {"tools.execute"}

    async def execute(
        self,
        parameters: Dict[str, Any],
        context: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        query = parameters["query"]
        categories = parameters.get("categories")
        max_results = parameters.get("max_results", 8)

        results = await self._client.search(
            query=query,
            categories=categories,
            max_results=max_results,
        )

        if not results:
            return {
                "results": [],
                "query": query,
                "message": "No results found. Try rephrasing the query.",
            }

        return {
            "results": results,
            "query": query,
            "result_count": len(results),
        }
