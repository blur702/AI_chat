"""
SQLAlchemy async database configuration for AI Workstation.

This module provides the async engine, session factory, and base class
for all database models.
"""

import logging
import os
import time
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from sqlalchemy import event
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import declarative_base

logger = logging.getLogger("workstation.db")

# Database URL from environment with fallback for local development
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+asyncpg://workstation_user:change_me_in_production@postgres:5432/workstation"
)

# Convert postgresql:// to postgresql+asyncpg:// if needed for async driver
if DATABASE_URL.startswith("postgresql://"):
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://", 1)

# Connection pool configuration
POOL_SIZE = int(os.getenv("DB_POOL_SIZE", "10"))
MAX_OVERFLOW = int(os.getenv("DB_MAX_OVERFLOW", "20"))
POOL_RECYCLE = int(os.getenv("DB_POOL_RECYCLE", "1800"))  # 30 minutes
POOL_TIMEOUT = int(os.getenv("DB_POOL_TIMEOUT", "30"))

# Create async engine
engine = create_async_engine(
    DATABASE_URL,
    echo=os.getenv("DEBUG", "false").lower() == "true",  # Log SQL in debug mode
    future=True,  # SQLAlchemy 2.0 style
    pool_pre_ping=True,  # Verify connections before use
    pool_size=POOL_SIZE,
    max_overflow=MAX_OVERFLOW,
    pool_recycle=POOL_RECYCLE,
    pool_timeout=POOL_TIMEOUT,
    pool_reset_on_return="rollback",  # Ensure clean connection state on return
    connect_args={
        "statement_cache_size": 0,  # Avoid prepared statement conflicts with pgbouncer
    },
)

# Database connection and session management for backend app
# Create async session factory
AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,  # Prevent lazy loading issues after commit
    autocommit=False,
    autoflush=False,
)

# Declarative base for all models
Base = declarative_base()


@asynccontextmanager
async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """
    Async context manager for database sessions.

    Usage:
        async with get_db() as db:
            result = await db.execute(query)
    """
    session = AsyncSessionLocal()
    try:
        yield session
    except Exception:
        await session.rollback()
        raise
    finally:
        await session.close()


async def get_db_session() -> AsyncGenerator[AsyncSession, None]:
    """
    Dependency for FastAPI route injection.

    Usage:
        @app.get("/items")
        async def get_items(db: AsyncSession = Depends(get_db_session)):
            ...
    """
    async with AsyncSessionLocal() as session:
        yield session


async def init_db() -> None:
    """
    Initialize database tables.

    Note: In production, use Alembic migrations instead of create_all().
    This function is primarily for testing or initial development.
    """
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def close_db() -> None:
    """
    Close database connections.

    Call this during application shutdown.
    """
    await engine.dispose()


# Slow query logging
SLOW_QUERY_THRESHOLD = float(os.getenv("SLOW_QUERY_THRESHOLD_MS", "500")) / 1000


@event.listens_for(engine.sync_engine, "before_cursor_execute")
def _before_cursor_execute(conn, cursor, statement, parameters, context, executemany):
    conn.info.setdefault("query_start_time", []).append(time.monotonic())


@event.listens_for(engine.sync_engine, "after_cursor_execute")
def _after_cursor_execute(conn, cursor, statement, parameters, context, executemany):
    total = time.monotonic() - conn.info["query_start_time"].pop(-1)
    if total >= SLOW_QUERY_THRESHOLD:
        logger.warning(
            "Slow query (%.1fms): %s",
            total * 1000,
            statement[:200],
        )


@event.listens_for(engine.sync_engine, "handle_error")
def _handle_error(exception_context):
    conn = exception_context.connection
    if conn is not None:
        timing_stack = conn.info.get("query_start_time")
        if timing_stack:
            timing_stack.pop(-1)
