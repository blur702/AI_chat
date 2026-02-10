"""
Alembic migration environment configuration for async SQLAlchemy.

This module configures Alembic to work with async SQLAlchemy engines
and reads the database URL from environment variables.
"""

import asyncio
import os
from logging.config import fileConfig

from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config, create_async_engine

from alembic import context

# Import Base from our database module for autogenerate support
from app.database import Base

# Import all models here for autogenerate to detect them
from app.models.user import User
from app.models.user_preference import UserPreference
from app.models.project import Project
from app.models.chat import Chat
from app.models.message import Message
from app.models.resource import Resource
from app.models.context_compaction import ContextCompaction
from app.models.kb_source import KBSource
from app.models.kb_chunk import KBChunk
from app.models.automation_action import AutomationAction
from app.models.yolo_edit import YoloEdit
from app.models.archive import Archive
from app.models.audit_log import AuditLog

# this is the Alembic Config object, which provides
# access to the values within the .ini file in use.
config = context.config

# Interpret the config file for Python logging.
# This line sets up loggers basically.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Set target_metadata for autogenerate support
target_metadata = Base.metadata


def get_database_url() -> str:
    """
    Get database URL from environment variables.

    Converts postgresql:// to postgresql+asyncpg:// for async driver support.
    """
    url = os.getenv(
        "DATABASE_URL",
        "postgresql://workstation_user:change_me_in_production@postgres:5432/workstation"
    )
    # Convert to async driver URL if needed
    if url.startswith("postgresql://"):
        url = url.replace("postgresql://", "postgresql+asyncpg://", 1)
    return url


def run_migrations_offline() -> None:
    """
    Run migrations in 'offline' mode.

    This configures the context with just a URL and not an Engine,
    though an Engine is acceptable here as well. By skipping the Engine
    creation we don't even need a DBAPI to be available.

    Calls to context.execute() here emit the given string to the
    script output.
    """
    url = get_database_url()
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    """
    Run migrations with a given connection.

    This is called within the async context to actually execute migrations.
    """
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
    )

    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    """
    Run migrations in 'online' mode using async engine.

    In this scenario we need to create an async Engine
    and associate a connection with the context.
    """
    connectable = create_async_engine(
        get_database_url(),
        poolclass=pool.NullPool,
    )

    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)

    await connectable.dispose()


def run_migrations_online() -> None:
    """
    Entry point for online migrations.

    Wraps the async migration runner in asyncio.run().
    """
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
