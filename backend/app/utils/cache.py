"""Redis response caching decorator for FastAPI endpoints."""

import functools
import hashlib
import json
import logging
import os
from typing import Callable, Optional

import redis.asyncio as aioredis

logger = logging.getLogger("workstation.cache")

REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/0")

_redis_client: Optional[aioredis.Redis] = None


async def _get_redis() -> aioredis.Redis:
    global _redis_client
    if _redis_client is None:
        _redis_client = aioredis.from_url(
            REDIS_URL, decode_responses=True, socket_connect_timeout=2.0
        )
    return _redis_client


def cached_response(ttl: int = 60, key_prefix: str = "rc"):
    """Decorator that caches endpoint JSON responses in Redis.

    Args:
        ttl: Cache time-to-live in seconds.
        key_prefix: Prefix for the Redis key.

    The cache key is built from the key_prefix, the function name,
    and a hash of the keyword arguments (excluding db sessions).
    """

    def decorator(func: Callable) -> Callable:
        @functools.wraps(func)
        async def wrapper(*args, **kwargs):
            # Build cache key from non-session kwargs
            key_parts = {
                k: str(v)
                for k, v in kwargs.items()
                if k not in ("db", "request", "event_bus", "payload")
            }
            # Include user_id from payload if present for user-scoped caches
            payload = kwargs.get("payload")
            if payload and isinstance(payload, dict):
                uid = payload.get("user_id", "")
                if uid:
                    key_parts["_uid"] = str(uid)

            raw = json.dumps(key_parts, sort_keys=True)
            h = hashlib.md5(raw.encode()).hexdigest()[:12]
            cache_key = f"{key_prefix}:{func.__name__}:{h}"

            try:
                redis = await _get_redis()
                cached = await redis.get(cache_key)
                if cached is not None:
                    logger.debug("Cache hit: %s", cache_key)
                    return json.loads(cached)
            except Exception:
                logger.debug("Redis unavailable for cache read", exc_info=True)

            result = await func(*args, **kwargs)

            try:
                redis = await _get_redis()
                # Serialize Pydantic models or dicts
                if hasattr(result, "model_dump"):
                    serialized = json.dumps(result.model_dump(mode="json"))
                elif isinstance(result, (dict, list)):
                    serialized = json.dumps(result)
                else:
                    return result  # Can't cache, return as-is
                await redis.set(cache_key, serialized, ex=ttl)
                logger.debug("Cache set: %s (ttl=%ds)", cache_key, ttl)
            except Exception:
                logger.debug("Redis unavailable for cache write", exc_info=True)

            return result

        # Expose cache key invalidation helper
        wrapper.cache_key_prefix = f"{key_prefix}:{func.__name__}"  # type: ignore[attr-defined]
        return wrapper

    return decorator


async def invalidate_cache(pattern: str) -> int:
    """Delete all cache keys matching a pattern.

    Args:
        pattern: Redis key pattern (e.g. "rc:list_system_prompts:*").

    Returns:
        Number of keys deleted.
    """
    try:
        redis = await _get_redis()
        keys = []
        async for key in redis.scan_iter(match=pattern, count=100):
            keys.append(key)
        if keys:
            return await redis.delete(*keys)
    except Exception:
        logger.debug("Redis unavailable for cache invalidation", exc_info=True)
    return 0
