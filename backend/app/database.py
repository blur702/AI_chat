"""
SQLAlchemy async database configuration for AI Workstation.

This module provides the async engine, session factory, and base class
for all database models.
"""

import os
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import declarative_base

# Database URL from environment with fallback for local development
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+asyncpg://workstation_user:change_me_in_production@postgres:5432/workstation"
)

# Convert postgresql:// to postgresql+asyncpg:// if needed for async driver
if DATABASE_URL.startswith("postgresql://"):
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://", 1)

# Create async engine
engine = create_async_engine(
    DATABASE_URL,
    echo=os.getenv("DEBUG", "false").lower() == "true",  # Log SQL in debug mode
    future=True,  # SQLAlchemy 2.0 style
    pool_pre_ping=True,  # Verify connections before use
)

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
