"""
Database models package for AI Workstation.

This package contains all SQLAlchemy ORM models for the application.
All models are imported here to ensure Alembic autogenerate detects them.
"""

from app.database import Base
from app.models.archive import Archive
from app.models.audit_log import AuditLog
from app.models.automation_action import AutomationAction
from app.models.base import TimestampMixin, UUIDMixin
from app.models.chat import Chat
from app.models.context_snippet import ContextSnippet
from app.models.drupal_site import DrupalSite
from app.models.event import Event
from app.models.help_topic import HelpTopic
from app.models.image_generation import ImageGeneration
from app.models.context_compaction import ContextCompaction
from app.models.kb_chunk import KBChunk
from app.models.kb_source import KBSource
from app.models.message import Message
from app.models.project import Project
from app.models.project_import import ProjectImport
from app.models.resource import Resource
from app.models.system_prompt import SystemPrompt
from app.models.user import User
from app.models.user_preference import UserPreference
from app.models.utils import hash_password, verify_password
from app.models.yolo_edit import YoloEdit

__all__ = [
    "Archive",
    "AuditLog",
    "AutomationAction",
    "Base",
    "Chat",
    "ContextCompaction",
    "ContextSnippet",
    "DrupalSite",
    "Event",
    "HelpTopic",
    "ImageGeneration",
    "KBChunk",
    "KBSource",
    "Message",
    "Project",
    "ProjectImport",
    "Resource",
    "SystemPrompt",
    "TimestampMixin",
    "UUIDMixin",
    "User",
    "UserPreference",
    "YoloEdit",
    "hash_password",
    "verify_password",
]
