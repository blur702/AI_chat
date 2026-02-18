"""Security headers middleware.

Adds standard security headers to all HTTP responses to mitigate
common web vulnerabilities (clickjacking, MIME sniffing, etc.).

Uses pure ASGI middleware (not BaseHTTPMiddleware) for compatibility
with Starlette >=0.50 exception handling.
"""

import os
import secrets

from starlette.types import ASGIApp, Receive, Scope, Send


# Pre-compute static header values at import time
_ENVIRONMENT = os.getenv("ENVIRONMENT", "development").lower()
_IS_PRODUCTION = _ENVIRONMENT == "production"

_CSP_WS_ORIGINS = os.getenv("CSP_WS_ORIGINS", "ws://localhost wss://localhost")

_CSP_TEMPLATE_DEV = (
    "default-src 'self'; "
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'; "
    "style-src 'self' 'unsafe-inline'; "
    "img-src 'self' data: blob:; "
    f"connect-src 'self' {_CSP_WS_ORIGINS}; "
    "font-src 'self' data:; "
    "frame-src 'self'"
)

_CSP_TEMPLATE_PROD = (
    "default-src 'self'; "
    "script-src 'self' 'nonce-{{nonce}}'; "
    "style-src 'self' 'unsafe-inline'; "
    "img-src 'self' data: blob:; "
    f"connect-src 'self' {_CSP_WS_ORIGINS}; "
    "font-src 'self' data:; "
    "frame-src 'self'"
)

_BASE_HEADERS: list[tuple[bytes, bytes]] = [
    (b"x-frame-options", b"DENY"),
    (b"x-content-type-options", b"nosniff"),
    (b"x-xss-protection", b"1; mode=block"),
    (b"referrer-policy", b"strict-origin-when-cross-origin"),
    (b"permissions-policy", b"camera=(), microphone=(), geolocation=()"),
    (b"cross-origin-opener-policy", b"same-origin"),
    (b"cross-origin-resource-policy", b"same-origin"),
]

if _IS_PRODUCTION:
    _BASE_HEADERS.append(
        (b"strict-transport-security", b"max-age=31536000; includeSubDomains")
    )

if not _IS_PRODUCTION:
    _STATIC_HEADERS = list(_BASE_HEADERS) + [
        (b"content-security-policy", _CSP_TEMPLATE_DEV.encode()),
    ]

_STRIP_HEADERS = {b"server", b"x-powered-by"}


class SecurityHeadersMiddleware:
    """Pure ASGI middleware that adds security headers to every response."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        if _IS_PRODUCTION:
            nonce = secrets.token_urlsafe(16)
            scope.setdefault("state", {})["csp_nonce"] = nonce
            csp_value = _CSP_TEMPLATE_PROD.replace("{{nonce}}", nonce).encode()
            request_headers = list(_BASE_HEADERS) + [
                (b"content-security-policy", csp_value),
            ]
        else:
            request_headers = _STATIC_HEADERS

        async def send_with_headers(message: dict) -> None:
            if message["type"] == "http.response.start":
                headers = [
                    (k, v) for k, v in message.get("headers", [])
                    if k.lower() not in _STRIP_HEADERS
                ]
                existing_keys = {k.lower() for k, _ in headers}
                for key, value in request_headers:
                    if key not in existing_keys:
                        headers.append((key, value))
                message = {**message, "headers": headers}
            await send(message)

        await self.app(scope, receive, send_with_headers)
