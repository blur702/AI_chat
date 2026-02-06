"""
Common mixins and utilities for database models.

Provides reusable components for timestamp tracking and UUID primary keys.
"""

from datetime import datetime
from uuid import UUID

from sqlalchemy import DateTime, text
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func


class UUIDMixin:
    """
    Mixin that provides a UUID primary key column.

    Uses PostgreSQL's uuid_generate_v4() function from the uuid-ossp extension
    for server-side UUID generation. Requires the uuid-ossp extension to be
    enabled (see migrations for extension creation).
    """

    id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        primary_key=True,
        server_default=text("uuid_generate_v4()"),
    )


class TimestampMixin:
    """
    Mixin that provides automatic timestamp tracking.

    Adds created_at and updated_at columns with automatic defaults
    and update behavior.
    """

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
