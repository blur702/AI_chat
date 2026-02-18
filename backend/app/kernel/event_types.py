"""
Event type and severity constants for the EventBus.

Defines standard event types and severity levels used throughout the application
for consistent event categorization and handling.
"""

# Event Types
MODEL_LOADED = "model_loaded"
MODEL_UNLOADED = "model_unloaded"
TOOL_EXECUTED = "tool_executed"
RESOURCE_UPDATED = "resource_updated"
RESOURCE_CREATED = "resource_created"
RESOURCE_DELETED = "resource_deleted"
ERROR = "error"
SYSTEM = "system"
USER_ACTION = "user_action"
CHAT_MESSAGE = "chat_message"
KERNEL_STARTUP = "kernel_startup"
KERNEL_SHUTDOWN = "kernel_shutdown"
SERVICE_HEALTH_CHANGED = "service_health_changed"
MODEL_LOADING = "model_loading"
MODEL_PULLING = "model_pulling"
COMPACTION_STARTED = "compaction_started"
COMPACTION_COMPLETED = "compaction_completed"
COMPACTION_FAILED = "compaction_failed"
PLAN_PHASE_STARTED = "plan_phase_started"
PLAN_PHASE_COMPLETED = "plan_phase_completed"
PLAN_TASK_EXECUTED = "plan_task_executed"
PLAN_VERIFICATION_COMPLETED = "plan_verification_completed"
IMAGE_GENERATION_STARTED = "image_generation_started"
IMAGE_GENERATION_PROGRESS = "image_generation_progress"
IMAGE_GENERATION_COMPLETED = "image_generation_completed"
IMAGE_GENERATION_FAILED = "image_generation_failed"
VIDEO_EXPORT_STARTED = "video_export_started"
VIDEO_EXPORT_PROGRESS = "video_export_progress"
VIDEO_EXPORT_COMPLETED = "video_export_completed"
VIDEO_EXPORT_FAILED = "video_export_failed"

# Severity Levels
INFO = "info"
WARNING = "warning"
ERROR_SEVERITY = "error"
CRITICAL = "critical"

# All event types for validation
ALL_EVENT_TYPES = [
    MODEL_LOADED,
    MODEL_UNLOADED,
    TOOL_EXECUTED,
    RESOURCE_UPDATED,
    RESOURCE_CREATED,
    RESOURCE_DELETED,
    ERROR,
    SYSTEM,
    USER_ACTION,
    CHAT_MESSAGE,
    KERNEL_STARTUP,
    KERNEL_SHUTDOWN,
    SERVICE_HEALTH_CHANGED,
    MODEL_LOADING,
    MODEL_PULLING,
    COMPACTION_STARTED,
    COMPACTION_COMPLETED,
    COMPACTION_FAILED,
    PLAN_PHASE_STARTED,
    PLAN_PHASE_COMPLETED,
    PLAN_TASK_EXECUTED,
    PLAN_VERIFICATION_COMPLETED,
    IMAGE_GENERATION_STARTED,
    IMAGE_GENERATION_PROGRESS,
    IMAGE_GENERATION_COMPLETED,
    IMAGE_GENERATION_FAILED,
    VIDEO_EXPORT_STARTED,
    VIDEO_EXPORT_PROGRESS,
    VIDEO_EXPORT_COMPLETED,
    VIDEO_EXPORT_FAILED,
]

# All severity levels for validation
ALL_SEVERITIES = [
    INFO,
    WARNING,
    ERROR_SEVERITY,
    CRITICAL,
]

__all__ = [
    # Event types
    "MODEL_LOADED",
    "MODEL_UNLOADED",
    "TOOL_EXECUTED",
    "RESOURCE_UPDATED",
    "RESOURCE_CREATED",
    "RESOURCE_DELETED",
    "ERROR",
    "SYSTEM",
    "USER_ACTION",
    "CHAT_MESSAGE",
    "KERNEL_STARTUP",
    "KERNEL_SHUTDOWN",
    "SERVICE_HEALTH_CHANGED",
    "MODEL_LOADING",
    "MODEL_PULLING",
    "COMPACTION_STARTED",
    "COMPACTION_COMPLETED",
    "COMPACTION_FAILED",
    "PLAN_PHASE_STARTED",
    "PLAN_PHASE_COMPLETED",
    "PLAN_TASK_EXECUTED",
    "PLAN_VERIFICATION_COMPLETED",
    "IMAGE_GENERATION_STARTED",
    "IMAGE_GENERATION_PROGRESS",
    "IMAGE_GENERATION_COMPLETED",
    "IMAGE_GENERATION_FAILED",
    "VIDEO_EXPORT_STARTED",
    "VIDEO_EXPORT_PROGRESS",
    "VIDEO_EXPORT_COMPLETED",
    "VIDEO_EXPORT_FAILED",
    # Severity levels
    "INFO",
    "WARNING",
    "ERROR_SEVERITY",
    "CRITICAL",
    # Collections
    "ALL_EVENT_TYPES",
    "ALL_SEVERITIES",
]
