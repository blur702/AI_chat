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
    # Severity levels
    "INFO",
    "WARNING",
    "ERROR_SEVERITY",
    "CRITICAL",
    # Collections
    "ALL_EVENT_TYPES",
    "ALL_SEVERITIES",
]
