"""Shared test fixtures for the kernel test suite."""

import asyncio
import os
from contextlib import asynccontextmanager
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import pytest_asyncio
import fakeredis.aioredis

# Set SECRET_KEY before any app imports that use it
os.environ.setdefault("SECRET_KEY", "test-secret-key-at-least-32-characters-long-for-tests")

from app.auth import get_jwt_secret_key
from app.kernel import WorkstationKernel

# Clear lru_cache in case it was populated before env var was set
get_jwt_secret_key.cache_clear()


# ---------------------------------------------------------------------------
# Event loop
# ---------------------------------------------------------------------------

@pytest_asyncio.fixture(loop_scope="session")
async def event_loop():
    """Create a session-scoped event loop for pytest-asyncio."""
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


# ---------------------------------------------------------------------------
# Redis mock
# ---------------------------------------------------------------------------

@pytest.fixture
async def mock_redis():
    """Provide a fresh fakeredis async client with decode_responses=True.

    Wraps pubsub instances so that subscribe/psubscribe drain the
    subscription confirmation message, matching real Redis behaviour
    (where execute_command consumes the server response inline).
    """
    server = fakeredis.aioredis.FakeServer()
    client = fakeredis.aioredis.FakeRedis(server=server, decode_responses=True)

    _original_pubsub = client.pubsub

    def _patched_pubsub(*args, **kwargs):
        ps = _original_pubsub(*args, **kwargs)
        _orig_subscribe = ps.subscribe
        _orig_psubscribe = ps.psubscribe

        async def _subscribe_and_drain(*a, **kw):
            ret = await _orig_subscribe(*a, **kw)
            # Drain confirmation(s) so they don't pollute get_message
            for _ in range(len(a) + len(kw)):
                await ps.get_message(timeout=0)
            return ret

        async def _psubscribe_and_drain(*a, **kw):
            ret = await _orig_psubscribe(*a, **kw)
            for _ in range(len(a) + len(kw)):
                await ps.get_message(timeout=0)
            return ret

        ps.subscribe = _subscribe_and_drain
        ps.psubscribe = _psubscribe_and_drain
        return ps

    client.pubsub = _patched_pubsub

    yield client
    await client.aclose()


# ---------------------------------------------------------------------------
# Database session mock
# ---------------------------------------------------------------------------

@pytest.fixture
def mock_db_session():
    """Return an AsyncMock that mimics an async SQLAlchemy session."""
    session = AsyncMock()
    session.execute = AsyncMock()
    session.commit = AsyncMock()
    session.refresh = AsyncMock()
    session.add = MagicMock()
    session.close = AsyncMock()
    return session


@pytest.fixture
def mock_session_factory(mock_db_session):
    """Return a callable that yields the mock session as an async context manager."""

    @asynccontextmanager
    async def _factory():
        yield mock_db_session

    return _factory


# ---------------------------------------------------------------------------
# VRAM tracker mock
# ---------------------------------------------------------------------------

@pytest.fixture
def mock_vram_tracker():
    """Return a MagicMock that mimics VRAMTracker with realistic GPU stats."""
    tracker = MagicMock()
    tracker._initialized = True
    tracker._gpu_count = 1
    tracker.get_total_vram_mb.return_value = 24576  # 24 GB
    tracker.get_used_vram_mb.return_value = 8192  # 8 GB
    tracker.get_free_vram_mb.return_value = 16384  # 16 GB
    tracker.get_vram_stats.return_value = {
        "total_mb": 24576,
        "used_mb": 8192,
        "free_mb": 16384,
        "utilization_percent": 33.33,
        "gpu_count": 1,
    }
    tracker.cleanup = MagicMock()
    return tracker


# ---------------------------------------------------------------------------
# Kernel singleton cleanup
# ---------------------------------------------------------------------------

@pytest.fixture(autouse=True)
def cleanup_kernel():
    """Reset the kernel singleton before and after each test."""
    WorkstationKernel._reset()
    yield
    WorkstationKernel._reset()


@pytest.fixture
def kernel_instance():
    """Provide a fresh WorkstationKernel instance."""
    return WorkstationKernel()
