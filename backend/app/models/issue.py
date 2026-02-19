"""Issue model for project issue tracking linked to notes."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, String, Text, text
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import TimestampMixin, UUIDMixin

if TYPE_CHECKING:
    from app.models.note import Note
    from app.models.project import Project
    from app.models.user import User


class Issue(UUIDMixin, TimestampMixin, Base):
    """Project issue with severity, status, and optional link to a note."""

    __tablename__ = "issues"

    user_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    project_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=True,
    )
    is_app_issue: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    note_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("notes.id", ondelete="SET NULL"),
        nullable=True,
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    severity: Mapped[str] = mapped_column(String(20), nullable=False, default="medium")
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="open")
    reproduction_steps: Mapped[str | None] = mapped_column(Text, nullable=True)
    fix_branch: Mapped[str | None] = mapped_column(String(255), nullable=True)
    fix_pr_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    coderabbit_review_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    is_deleted: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    user: Mapped[User] = relationship("User", back_populates="issues")
    project: Mapped[Project | None] = relationship("Project", lazy="selectin")
    note: Mapped[Note | None] = relationship(
        "Note",
        foreign_keys=[note_id],
        lazy="selectin",
    )

    __table_args__ = (
        Index(
            "idx_issues_user_project_status",
            "user_id",
            "project_id",
            "status",
            "is_deleted",
        ),
        Index("idx_issues_project_open", "project_id", "is_deleted"),
        Index(
            "idx_issues_app_issues",
            "user_id",
            "is_deleted",
            postgresql_where=text("is_app_issue = true"),
        ),
    )

    def soft_delete(self) -> None:
        self.is_deleted = True
        self.deleted_at = datetime.now(UTC)
