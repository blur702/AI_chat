"""
AuditLog model for security event tracking.

Stores security-related events such as login attempts, password changes,
and other auditable actions for compliance and security monitoring.
"""

from uuid import UUID

from sqlalchemy import String, Index, ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID as PGUUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import UUIDMixin, TimestampMixin


class AuditLog(Base, UUIDMixin, TimestampMixin):
    """
    Security audit log record.

    Tracks security-relevant actions like authentication events,
    password changes, and authorization decisions.

    Attributes:
        user_id: User who performed the action (nullable for anonymous events)
        action: Type of action (e.g., 'login', 'password_change', 'logout')
        resource: Resource affected by the action
        ip_address: Client IP address (supports IPv4 and IPv6)
        user_agent: Client user agent string
        status: Result of the action (success, failure, error)
        details: Additional context as JSON
    """

    __tablename__ = "audit_logs"

    user_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    action: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
    )

    resource: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
    )

    ip_address: Mapped[str | None] = mapped_column(
        String(45),
        nullable=True,
    )

    user_agent: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    status: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
    )

    details: Mapped[dict] = mapped_column(
        JSONB,
        nullable=False,
        default=dict,
    )

    # Relationships
    user = relationship("User", back_populates="audit_logs", lazy="selectin")

    __table_args__ = (
        Index("idx_audit_logs_user_id", "user_id"),
        Index("idx_audit_logs_action", "action"),
        Index("idx_audit_logs_created_at", "created_at"),
        Index("idx_audit_logs_user_action", "user_id", "action"),
        Index("idx_audit_logs_action_created", "action", "created_at"),
    )

    def __repr__(self) -> str:
        return f"<AuditLog(id={self.id}, action={self.action}, user_id={self.user_id})>"
