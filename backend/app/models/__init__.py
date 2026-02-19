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
from app.models.color_palette import ColorPalette
from app.models.plan_phase import PlanPhase
from app.models.plan_task import PlanTask
from app.models.planning_session import PlanningSession
from app.models.context_snippet import ContextSnippet
from app.models.drupal_site import DrupalSite
from app.models.event import Event
from app.models.help_topic import HelpTopic
from app.models.help_topic_feedback import HelpTopicFeedback
from app.models.image_generation import ImageGeneration
from app.models.issue import Issue
from app.models.context_compaction import ContextCompaction
from app.models.kb_chunk import KBChunk
from app.models.kb_source import KBSource
from app.models.message import Message
from app.models.note import Note
from app.models.note_category import NoteCategory
from app.models.project import Project
from app.models.prompt_preset import PromptPreset
from app.models.project_import import ProjectImport
from app.models.resource import Resource
from app.models.system_prompt import SystemPrompt
from app.models.user import User
from app.models.user_preference import UserPreference
from app.models.video_project import MediaAsset, VideoExport, VideoProject
from app.models.utils import hash_password, verify_password
from app.models.ui_component import UIComponent
from app.models.yolo_edit import YoloEdit

__all__ = [
    "Archive",
    "AuditLog",
    "AutomationAction",
    "Base",
    "Chat",
    "ColorPalette",
    "ContextCompaction",
    "ContextSnippet",
    "DrupalSite",
    "Event",
    "HelpTopic",
    "HelpTopicFeedback",
    "ImageGeneration",
    "Issue",
    "KBChunk",
    "KBSource",
    "Message",
    "Note",
    "NoteCategory",
    "PlanPhase",
    "PlanTask",
    "PlanningSession",
    "Project",
    "ProjectImport",
    "PromptPreset",
    "Resource",
    "SystemPrompt",
    "TimestampMixin",
    "UUIDMixin",
    "UIComponent",
    "User",
    "UserPreference",
    "MediaAsset",
    "VideoExport",
    "VideoProject",
    "YoloEdit",
    "hash_password",
    "verify_password",
]
