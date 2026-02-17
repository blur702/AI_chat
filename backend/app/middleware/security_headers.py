"""Security headers middleware.

Adds standard security headers to all HTTP responses to mitigate
common web vulnerabilities (clickjacking, MIME sniffing, etc.).

Uses pure ASGI middleware (not BaseHTTPMiddleware) for compatibility
with Starlette >=0.50 exception handling.
"""

import os
from typing import Callable

from starlette.types import ASGIApp, Receive, Scope, Send


# Pre-compute static header values at import time
_ENVIRONMENT = os.getenv("ENVIRONMENT", "development").lower()

if _ENVIRONMENT == "development":
    _SCRIPT_SRC = "script-src 'self' 'unsafe-inline' 'unsafe-eval'; "
else:
    _SCRIPT_SRC = "script-src 'self' 'unsafe-inline'; "

_CSP = (
    "default-src 'self'; "
    + _SCRIPT_SRC
    + "style-src 'self' 'unsafe-inline'; "
    "img-src 'self' data: blob:; "
    f"connect-src 'self' {os.getenv('CSP_WS_ORIGINS', 'ws://localhost wss://localhost')}; "
    "font-src 'self' data:; "
    "frame-src 'self'"
)

_STATIC_HEADERS: list[tuple[bytes, bytes]] = [
    (b"x-frame-options", b"DENY"),
    (b"x-content-type-options", b"nosniff"),
    (b"x-xss-protection", b"1; mode=block"),
    (b"referrer-policy", b"strict-origin-when-cross-origin"),
    (b"permissions-policy", b"camera=(), microphone=(), geolocation=()"),
    (b"content-security-policy", _CSP.encode()),
    (b"cross-origin-opener-policy", b"same-origin"),
    (b"cross-origin-resource-policy", b"same-origin"),
]

if _ENVIRONMENT == "production":
    _STATIC_HEADERS.append(
        (b"strict-transport-security", b"max-age=31536000; includeSubDomains")
    )

_STRIP_HEADERS = {b"server", b"x-powered-by"}


class SecurityHeadersMiddleware:
    """Pure ASGI middleware that adds security headers to every response."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        async def send_with_headers(message: dict) -> None:
            if message["type"] == "http.response.start":
                headers = [
                    (k, v) for k, v in message.get("headers", [])
                    if k.lower() not in _STRIP_HEADERS
                ]
                existing_keys = {k.lower() for k, _ in headers}
                for key, value in _STATIC_HEADERS:
                    if key not in existing_keys:
                        headers.append((key, value))
                message = {**message, "headers": headers}
            await send(message)

        await self.app(scope, receive, send_with_headers)
