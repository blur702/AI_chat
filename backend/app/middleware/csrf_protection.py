"""CSRF protection middleware for cookie-based authentication.

Validates Origin/Referer headers on state-changing requests (POST, PUT, PATCH, DELETE)
when authentication is provided via cookie rather than Bearer token. Requests
authenticated with a Bearer header are not vulnerable to CSRF and are allowed through.
"""

import logging
import os
from urllib.parse import urlparse

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

logger = logging.getLogger("workstation.csrf")

TOKEN_COOKIE_NAME = "workstation_token"

_STATE_CHANGING_METHODS = {"POST", "PUT", "PATCH", "DELETE"}


class CSRFProtectionMiddleware(BaseHTTPMiddleware):
    """Reject cross-origin state-changing requests authenticated via cookie."""

    def __init__(self, app, allowed_origins: list[str] | None = None) -> None:
        super().__init__(app)
        raw = allowed_origins or os.getenv(
            "CORS_ORIGINS", "http://localhost:3001,http://localhost:9080"
        ).split(",")
        # Normalise full URLs to origin strings (scheme + host + port only, no path)
        # so "/api/auth/login" passed in CORS_ORIGINS still compares correctly to "Origin: http://host"
        self._allowed_origins: set[str] = set()
        for origin in raw:
            origin = origin.strip()
            if origin:
                parsed = urlparse(origin)
                normalised = f"{parsed.scheme}://{parsed.netloc}" if parsed.scheme else origin
                self._allowed_origins.add(normalised.rstrip("/"))

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        if request.method not in _STATE_CHANGING_METHODS:
            return await call_next(request)

        # Bearer-token auth is not CSRF-vulnerable — skip check
        # (CSRF requires the browser to auto-attach credentials; JS-controlled headers aren't auto-sent)
        auth_header = request.headers.get("authorization", "")
        if auth_header.startswith("Bearer "):
            return await call_next(request)

        # Only enforce when a cookie is present — non-browser clients without cookies are safe
        if TOKEN_COOKIE_NAME not in request.cookies:
            return await call_next(request)

        # Validate Origin (preferred) or Referer header
        request_origin = self._extract_origin(request)
        if request_origin is None:
            logger.warning(
                "CSRF: missing Origin/Referer on cookie-auth %s %s",
                request.method, request.url.path,
            )
            return JSONResponse(
                status_code=403,
                content={"detail": "CSRF validation failed: missing Origin header"},
            )

        if request_origin not in self._allowed_origins:
            logger.warning(
                "CSRF: origin mismatch %s not in %s for %s %s",
                request_origin, self._allowed_origins, request.method, request.url.path,
            )
            return JSONResponse(
                status_code=403,
                content={"detail": "CSRF validation failed: origin not allowed"},
            )

        return await call_next(request)

    @staticmethod
    def _extract_origin(request: Request) -> str | None:
        """Return the request origin from Origin or Referer header."""
        origin = request.headers.get("origin")
        # "null" origin is sent by sandboxed iframes and local file:// pages — treat as missing
        if origin and origin != "null":
            return origin.rstrip("/")

        # Referer fallback: extract just the origin portion (strip path and query)
        referer = request.headers.get("referer")
        if referer:
            parsed = urlparse(referer)
            return f"{parsed.scheme}://{parsed.netloc}".rstrip("/")

        return None
