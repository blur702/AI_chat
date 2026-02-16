"""
User model for authentication and authorization.
"""

from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import Boolean, DateTime, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import TimestampMixin, UUIDMixin

if TYPE_CHECKING:
    from app.models.audit_log import AuditLog
    from app.models.context_snippet import ContextSnippet
    from app.models.event import Event
    from app.models.image_generation import ImageGeneration
    from app.models.project import Project
    from app.models.system_prompt import SystemPrompt
    from app.models.user_preference import UserPreference


# Usernames that are protected from modification by other users.
# These accounts cannot be deactivated, deleted, role-changed, or
# have their password reset by anyone other than themselves.
# Configured via MASTER_USERNAMES env var (comma-separated).
MASTER_USERNAMES: frozenset[str] = frozenset(
    name.strip()
    for name in os.getenv("MASTER_USERNAMES", "").split(",")
    if name.strip()
)


def is_master_user(username: str) -> bool:
    """Return True if *username* belongs to a protected master account."""
    return username in MASTER_USERNAMES


class User(UUIDMixin, TimestampMixin, Base):
    """
    User account model.

    Stores authentication credentials and basic user information.
    Related preferences are stored in a separate UserPreference record.
    """

    __tablename__ = "users"

    username: Mapped[str] = mapped_column(
        String(255),
        unique=True,
        nullable=False,
    )

    email: Mapped[Optional[str]] = mapped_column(
        String(255),
        unique=True,
        nullable=True,
    )

    hashed_password: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )

    role: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        default="user",
    )

    is_active: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        nullable=False,
    )

    first_name: Mapped[Optional[str]] = mapped_column(
        String(255),
        nullable=True,
    )

    last_name: Mapped[Optional[str]] = mapped_column(
        String(255),
        nullable=True,
    )

    screen_name: Mapped[Optional[str]] = mapped_column(
        String(255),
        nullable=True,
    )

    # Security fields
    email_verified: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
    )

    email_verification_token: Mapped[Optional[str]] = mapped_column(
        String(255),
        nullable=True,
    )

    password_reset_token: Mapped[Optional[str]] = mapped_column(
        String(255),
        nullable=True,
    )

    password_reset_expires: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    failed_login_attempts: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False,
    )

    locked_until: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    last_login_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    last_password_change: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    # Relationships
    preference: Mapped[Optional["UserPreference"]] = relationship(
        "UserPreference",
        back_populates="user",
        uselist=False,
        cascade="all, delete-orphan",
    )

    projects: Mapped[List["Project"]] = relationship(
        "Project",
        back_populates="user",
        cascade="all, delete-orphan",
    )

    events: Mapped[List["Event"]] = relationship(
        "Event",
        back_populates="user",
        cascade="all, delete-orphan",
    )

    audit_logs: Mapped[List["AuditLog"]] = relationship(
        "AuditLog",
        back_populates="user",
        cascade="save-update, merge",
        passive_deletes=True,
    )

    image_generations: Mapped[List["ImageGeneration"]] = relationship(
        "ImageGeneration",
        back_populates="user",
        cascade="all, delete-orphan",
    )

    system_prompts: Mapped[List["SystemPrompt"]] = relationship(
        "SystemPrompt",
        back_populates="user",
        cascade="all, delete-orphan",
    )

    context_snippets: Mapped[List["ContextSnippet"]] = relationship(
        "ContextSnippet",
        back_populates="user",
        cascade="all, delete-orphan",
    )

    # Indexes
    __table_args__ = (
        Index("idx_users_username", "username"),
        Index("idx_users_email", "email"),
        Index("idx_users_email_verified", "email_verified"),
        Index("idx_users_locked_until", "locked_until"),
    )

    def is_locked(self) -> bool:
        """Check if the account is currently locked."""
        if self.locked_until is None:
            return False
        return self.locked_until > datetime.now(tz=timezone.utc)

    def increment_failed_login(
        self, lockout_threshold: int, lockout_duration_minutes: int
    ) -> bool:
        """Increment failed login attempts; lock account if threshold is reached.

        Returns True if the account was locked by this call.
        """
        self.failed_login_attempts += 1
        if self.failed_login_attempts >= lockout_threshold:
            self.locked_until = datetime.now(tz=timezone.utc) + timedelta(
                minutes=lockout_duration_minutes
            )
            return True
        return False

    def reset_failed_login(self) -> None:
        """Clear failed login counter and unlock the account."""
        self.failed_login_attempts = 0
        self.locked_until = None

    def lock_account(self, duration_minutes: int) -> None:
        """Lock the account for the given number of minutes."""
        self.locked_until = datetime.now(tz=timezone.utc) + timedelta(
            minutes=duration_minutes
        )

    def __repr__(self) -> str:
        return f"<User(id={self.id}, username={self.username}, role={self.role})>"
