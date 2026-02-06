"""Shared test fixtures for the kernel test suite."""

import asyncio
from contextlib import asynccontextmanager
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import pytest_asyncio
import fakeredis.aioredis

from app.kernel import WorkstationKernel


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
    """Provide a fresh fakeredis async client with decode_responses=True."""
    server = fakeredis.aioredis.FakeServer()
    client = fakeredis.aioredis.FakeRedis(server=server, decode_responses=True)
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
