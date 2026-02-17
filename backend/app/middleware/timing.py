"""Request timing middleware.

Adds X-Process-Time header to every response and logs slow requests (>1s).
"""

import logging
import time

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response

logger = logging.getLogger("workstation.timing")

SLOW_REQUEST_THRESHOLD = 1.0  # seconds


class TimingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        start = time.monotonic()
        response = await call_next(request)
        elapsed = time.monotonic() - start

        response.headers["X-Process-Time"] = f"{elapsed:.4f}"

        if elapsed >= SLOW_REQUEST_THRESHOLD:
            logger.warning(
                "Slow request (%.1fms): %s %s",
                elapsed * 1000,
                request.method,
                request.url.path,
            )

        return response
