"""
Redis-backed rate limiting middleware and decorators.

Uses a sliding window algorithm with Redis sorted sets to track
request counts per identifier (IP or user ID) per endpoint.
Falls back to in-memory sliding window when Redis is unavailable.
"""

import functools
import logging
import os
import time
import threading
from collections import defaultdict
from typing import Callable, Optional

import redis.asyncio as aioredis
from fastapi import HTTPException, Request, status
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response

logger = logging.getLogger("workstation.rate_limit")


class _InMemoryRateLimiter:
    """Thread-safe in-memory sliding window rate limiter (fallback when Redis is down)."""

    def __init__(self) -> None:
        self._windows: dict[str, list[float]] = defaultdict(list)
        self._lock = threading.Lock()

    def check(self, key: str, max_requests: int, window_seconds: int) -> tuple[bool, int, int]:
        now = time.time()
        cutoff = now - window_seconds
        with self._lock:
            timestamps = self._windows[key]
            # Prune expired entries
            self._windows[key] = timestamps = [t for t in timestamps if t > cutoff]
            if len(timestamps) >= max_requests:
                retry_after = int(window_seconds - (now - timestamps[0])) + 1
                return False, 0, max(retry_after, 1)
            timestamps.append(now)
            return True, max_requests - len(timestamps), 0

    def cleanup(self) -> None:
        """Remove all empty buckets to prevent memory growth."""
        now = time.time()
        with self._lock:
            empty_keys = [k for k, v in self._windows.items() if not v or v[-1] < now - 3600]
            for k in empty_keys:
                del self._windows[k]


class _RateLimitState:
    """Encapsulates rate limiter state (Redis client, script SHA, flags)."""

    def __init__(self) -> None:
        self.redis_client: Optional[aioredis.Redis] = None
        self.script_sha: Optional[str] = None
        self.use_evalsha: bool = True
        self.memory_limiter = _InMemoryRateLimiter()

    async def get_redis(self) -> Optional[aioredis.Redis]:
        if self.redis_client is None:
            redis_url = os.getenv("REDIS_URL", "redis://localhost:6379/0")
            try:
                self.redis_client = aioredis.from_url(
                    redis_url,
                    decode_responses=True,
                    socket_connect_timeout=5.0,
                    socket_timeout=5.0,
                )
                await self.redis_client.ping()
                logger.info("Rate limiter connected to Redis")
            except Exception as e:
                logger.warning("Rate limiter Redis connection failed: %s", e)
                self.redis_client = None
        return self.redis_client

    async def get_script_sha(self, redis_client: aioredis.Redis) -> str:
        if self.script_sha is None:
            self.script_sha = await redis_client.script_load(_RATE_LIMIT_LUA)
        return self.script_sha

    async def reload_script(self, redis_client: aioredis.Redis) -> None:
        self.script_sha = await redis_client.script_load(_RATE_LIMIT_LUA)


_state = _RateLimitState()


async def get_rate_limit_redis() -> Optional[aioredis.Redis]:
    """Get or create the Redis client for rate limiting."""
    return await _state.get_redis()


# Trusted proxy IPs that are allowed to set X-Forwarded-For
TRUSTED_PROXIES = set(
    p
    for p in (
        value.strip()
        for value in os.getenv(
            "TRUSTED_PROXIES", "127.0.0.1,172.16.0.0/12,10.0.0.0/8"
        ).split(",")
    )
    if p
)


def _is_trusted_proxy(ip: str) -> bool:
    """Check if an IP is a trusted proxy (exact match or CIDR prefix match)."""
    import ipaddress
    try:
        addr = ipaddress.ip_address(ip)
        for trusted in TRUSTED_PROXIES:
            trusted = trusted.strip()
            if "/" in trusted:
                if addr in ipaddress.ip_network(trusted, strict=False):
                    return True
            elif ip == trusted:
                return True
    except ValueError:
        pass
    return False


def get_client_ip(request: Request) -> str:
    """Extract client IP, respecting X-Forwarded-For only from trusted proxies.

    Parses the X-Forwarded-For header right-to-left, skipping trusted proxy
    entries, and returns the first (rightmost) untrusted IP.  This prevents
    spoofing via a forged leftmost entry.
    """
    if not request.client:
        return "unknown"
    client_ip = request.client.host
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded and _is_trusted_proxy(client_ip):
        candidates = [ip.strip() for ip in forwarded.split(",") if ip.strip()]
        # Walk from the right, skip trusted proxies
        for ip in reversed(candidates):
            if not _is_trusted_proxy(ip):
                return ip
        # All entries are trusted proxies — fall back to the leftmost
        return candidates[0] if candidates else client_ip
    return client_ip


def get_user_identifier(request: Request) -> str:
    """Extract user ID from Authorization header or fall back to IP."""
    from app.auth import verify_token

    auth_header = request.headers.get("authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header[7:]
        payload = verify_token(token)
        if payload and payload.get("user_id"):
            return f"user:{payload['user_id']}"
    return f"ip:{get_client_ip(request)}"


_RATE_LIMIT_LUA = """
local key = KEYS[1]
local now = tonumber(ARGV[1])
local window_start = tonumber(ARGV[2])
local max_requests = tonumber(ARGV[3])
local window_seconds = tonumber(ARGV[4])

redis.call('ZREMRANGEBYSCORE', key, 0, window_start)
local count = redis.call('ZCARD', key)

if count >= max_requests then
    local earliest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
    local retry_after = window_seconds
    if #earliest >= 2 then
        retry_after = math.ceil(window_seconds - (now - tonumber(earliest[2]))) + 1
    end
    redis.call('EXPIRE', key, window_seconds)
    return {0, 0, retry_after}
end

redis.call('ZADD', key, now, tostring(now))
redis.call('EXPIRE', key, window_seconds)
return {1, max_requests - count - 1, 0}
"""


async def _check_rate_limit(
    redis_client: aioredis.Redis,
    key: str,
    max_requests: int,
    window_seconds: int,
) -> tuple[bool, int, int]:
    """
    Check and update rate limit using an atomic Lua script (sliding window).

    Uses Redis EVAL to execute the check-and-increment atomically,
    preventing race conditions under concurrent requests.

    Returns:
        (allowed, remaining, retry_after_seconds)
    """
    now = time.time()
    window_start = now - window_seconds

    script_args = [1, key, str(now), str(window_start), str(max_requests), str(window_seconds)]
    result = await _run_lua_script(redis_client, script_args)

    allowed = bool(result[0])
    remaining = int(result[1])
    retry_after = int(result[2])
    return allowed, remaining, retry_after


async def _run_lua_script(
    redis_client: aioredis.Redis, args: list
) -> list:
    """Execute the rate-limit Lua script, preferring EVALSHA with fallback.

    Note: redis_client.eval() here is Redis's EVAL command for Lua scripts,
    not Python's eval(). It is safe and atomic.
    """
    if _state.use_evalsha:
        try:
            sha = await _state.get_script_sha(redis_client)
            return await redis_client.evalsha(sha, *args)
        except aioredis.ResponseError as e:
            if "NOSCRIPT" in str(e):
                try:
                    await _state.reload_script(redis_client)
                    sha = await _state.get_script_sha(redis_client)
                    return await redis_client.evalsha(sha, *args)
                except Exception:
                    _state.use_evalsha = False
            elif "not supported" in str(e).lower():
                _state.use_evalsha = False
            else:
                raise
        except Exception:
            _state.use_evalsha = False

    # Fallback: send full Lua script text every call (still atomic on Redis server)
    redis_eval = getattr(redis_client, "eval")
    return await redis_eval(_RATE_LIMIT_LUA, *args)  # type: ignore[return-value]


def rate_limit(
    max_requests: int,
    window_seconds: int,
    key_func: Callable[[Request], str] = get_client_ip,
):
    """
    Rate limiting decorator for FastAPI endpoint functions.

    Args:
        max_requests: Maximum number of requests allowed in the window.
        window_seconds: Time window in seconds.
        key_func: Function to extract the rate limit identifier from the request.
    """
    def decorator(func):
        @functools.wraps(func)
        async def wrapper(*args, **kwargs):
            request: Optional[Request] = kwargs.get("request")
            if request is None:
                # Try to find Request in positional args
                for arg in args:
                    if isinstance(arg, Request):
                        request = arg
                        break

            if request is None:
                return await func(*args, **kwargs)

            identifier = key_func(request)
            endpoint = request.url.path
            key = f"rate_limit:{identifier}:{endpoint}"

            redis_client = await get_rate_limit_redis()
            if redis_client is None:
                logger.warning("Rate limiter Redis unavailable, using in-memory fallback")
                allowed, remaining, retry_after = _state.memory_limiter.check(
                    key, max_requests, window_seconds,
                )
            else:
                try:
                    allowed, remaining, retry_after = await _check_rate_limit(
                        redis_client, key, max_requests, window_seconds,
                    )
                except Exception as e:
                    logger.warning("Rate limit check failed, using in-memory fallback: %s", e)
                    allowed, remaining, retry_after = _state.memory_limiter.check(
                        key, max_requests, window_seconds,
                    )

            if not allowed:
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail="Too many requests. Please try again later.",
                    headers={"Retry-After": str(retry_after)},
                )

            return await func(*args, **kwargs)

        return wrapper
    return decorator


# Predefined rate limit decorators for sensitive endpoints
rate_limit_login = rate_limit(
    max_requests=5,
    window_seconds=60,
    key_func=get_client_ip,
)

rate_limit_password_change = rate_limit(
    max_requests=5,
    window_seconds=3600,
    key_func=get_user_identifier,
)

rate_limit_user_creation = rate_limit(
    max_requests=10,
    window_seconds=3600,
    key_func=get_user_identifier,
)


def rate_limit_by_body_field(
    max_requests: int,
    window_seconds: int,
    body_field: str,
):
    """
    Rate limiting decorator that keys on a field from the parsed request body.

    Falls back to client IP if the body field is not available.
    """
    def decorator(func):
        @functools.wraps(func)
        async def wrapper(*args, **kwargs):
            request: Optional[Request] = kwargs.get("request")
            if request is None:
                for arg in args:
                    if isinstance(arg, Request):
                        request = arg
                        break

            if request is None:
                return await func(*args, **kwargs)

            # Extract identifier from parsed body kwarg
            body = kwargs.get("body")
            identifier = getattr(body, body_field, None) if body else None
            if not identifier:
                identifier = get_client_ip(request)

            endpoint = request.url.path
            key = f"rate_limit:{identifier}:{endpoint}"

            redis_client = await get_rate_limit_redis()
            if redis_client is None:
                logger.warning("Rate limiter Redis unavailable, using in-memory fallback")
                allowed, remaining, retry_after = _state.memory_limiter.check(
                    key, max_requests, window_seconds,
                )
            else:
                try:
                    allowed, remaining, retry_after = await _check_rate_limit(
                        redis_client, key, max_requests, window_seconds,
                    )
                except Exception as e:
                    logger.warning("Rate limit check failed, using in-memory fallback: %s", e)
                    allowed, remaining, retry_after = _state.memory_limiter.check(
                        key, max_requests, window_seconds,
                    )

            if not allowed:
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail="Too many requests. Please try again later.",
                    headers={"Retry-After": str(retry_after)},
                )

            return await func(*args, **kwargs)

        return wrapper
    return decorator


rate_limit_password_reset = rate_limit_by_body_field(
    max_requests=3,
    window_seconds=3600,
    body_field="email",
)


class RateLimitMiddleware(BaseHTTPMiddleware):
    """
    Global rate limiting middleware.

    Applies a default rate limit to all requests as a safety net.
    Auth-related endpoints get stricter limits automatically.
    Endpoint-specific rate limits are also applied via decorators.
    """

    GLOBAL_MAX_REQUESTS = int(os.getenv("GLOBAL_MAX_REQUESTS", "100"))
    GLOBAL_WINDOW_SECONDS = int(os.getenv("GLOBAL_WINDOW_SECONDS", "900"))

    # Stricter limits for authentication-related endpoints
    AUTH_ENDPOINT_LIMITS: dict[str, tuple[int, int]] = {
        "/api/auth/login": (5, 900),           # 5 per 15 min
        "/api/auth/password-reset": (3, 900),   # 3 per 15 min
        "/api/auth/otp": (5, 900),              # 5 per 15 min
        "/api/auth/register": (5, 900),         # 5 per 15 min
        "/api/auth/users": (10, 600),           # 10 per 10 min
    }

    def _get_limits(self, path: str) -> tuple[int, int]:
        """Return (max_requests, window_seconds) for the given path."""
        for prefix, limits in self.AUTH_ENDPOINT_LIMITS.items():
            if path.rstrip("/") == prefix or path.startswith(prefix + "/"):
                return limits
        return self.GLOBAL_MAX_REQUESTS, self.GLOBAL_WINDOW_SECONDS

    async def dispatch(self, request: Request, call_next) -> Response:
        identifier = get_client_ip(request)
        path = request.url.path
        max_requests, window_seconds = self._get_limits(path)
        key = f"rate_limit:global:{identifier}:{path}"

        redis_client = await get_rate_limit_redis()
        if redis_client is None:
            allowed, remaining, retry_after = _state.memory_limiter.check(
                key, max_requests, window_seconds,
            )
        else:
            try:
                allowed, remaining, retry_after = await _check_rate_limit(
                    redis_client,
                    key,
                    max_requests,
                    window_seconds,
                )
            except Exception as e:
                logger.warning("Global rate limit check failed, using in-memory fallback: %s", e)
                allowed, remaining, retry_after = _state.memory_limiter.check(
                    key, max_requests, window_seconds,
                )

        if not allowed:
            return Response(
                content='{"detail":"Too many requests. Please try again later."}',
                status_code=429,
                media_type="application/json",
                headers={"Retry-After": str(retry_after)},
            )

        response = await call_next(request)
        response.headers["X-RateLimit-Remaining"] = str(remaining)
        return response
