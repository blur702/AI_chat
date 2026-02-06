"""Reusable test utilities, mock tools, model factories, and assertion helpers."""

import asyncio
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, Optional, Set
from unittest.mock import MagicMock

from app.kernel.tool_base import BaseTool


# ---------------------------------------------------------------------------
# Mock tool implementation
# ---------------------------------------------------------------------------

class MockTool(BaseTool):
    """Configurable mock tool for testing the ToolRegistry."""

    def __init__(
        self,
        tool_name: str = "mock_tool",
        tool_description: str = "A mock tool for testing",
        schema: Optional[Dict[str, Any]] = None,
        permissions: Optional[Set[str]] = None,
        result: Optional[Dict[str, Any]] = None,
        error: Optional[Exception] = None,
        delay: float = 0.0,
    ):
        self._name = tool_name
        self._description = tool_description
        self._schema = schema or {
            "type": "object",
            "properties": {
                "input": {"type": "string", "description": "Test input"},
            },
            "required": ["input"],
        }
        self._permissions = permissions if permissions is not None else {"tools.execute"}
        self._result = result or {"output": "mock result"}
        self._error = error
        self._delay = delay
        self.execute_calls: list[tuple[Dict, Optional[Dict]]] = []

    @property
    def name(self) -> str:
        return self._name

    @property
    def description(self) -> str:
        return self._description

    @property
    def parameters_schema(self) -> Dict[str, Any]:
        return self._schema

    @property
    def required_permissions(self) -> Set[str]:
        return self._permissions

    async def execute(
        self,
        parameters: Dict[str, Any],
        context: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        self.execute_calls.append((parameters, context))
        if self._delay > 0:
            await asyncio.sleep(self._delay)
        if self._error:
            raise self._error
        return dict(self._result)


class FailingTool(MockTool):
    """Mock tool that always raises on execute."""

    def __init__(self, tool_name: str = "failing_tool", error_message: str = "tool error"):
        super().__init__(
            tool_name=tool_name,
            error=RuntimeError(error_message),
        )


# ---------------------------------------------------------------------------
# Model factories
# ---------------------------------------------------------------------------

def make_resource(
    resource_id: str = "test-model-1",
    status: str = "loaded",
    base_priority: int = 0,
    user_locked: bool = False,
    vram_mb: Optional[int] = None,
    last_used_at: Optional[datetime] = None,
    user_id: Optional[uuid.UUID] = None,
) -> MagicMock:
    """Create a mock Resource model with realistic defaults."""
    resource = MagicMock()
    resource.id = uuid.uuid4()
    resource.resource_id = resource_id
    resource.resource_type = "model"
    resource.status = status
    resource.base_priority = base_priority
    resource.priority = base_priority
    resource.user_locked = user_locked
    resource.vram_mb = vram_mb
    resource.last_used_at = last_used_at
    resource.user_id = user_id
    resource.auto_unload = True
    resource.created_at = datetime.now(timezone.utc)
    resource.updated_at = datetime.now(timezone.utc)
    return resource


def make_chat(
    chat_id: Optional[uuid.UUID] = None,
    project_id: Optional[uuid.UUID] = None,
    title: str = "Test Chat",
    is_deleted: bool = False,
    messages: Optional[list] = None,
    context_compactions: Optional[list] = None,
) -> MagicMock:
    """Create a mock Chat model."""
    chat = MagicMock()
    chat.id = chat_id or uuid.uuid4()
    chat.project_id = project_id or uuid.uuid4()
    chat.title = title
    chat.is_deleted = is_deleted
    chat.messages = messages or []
    chat.context_compactions = context_compactions or []
    chat.created_at = datetime.now(timezone.utc)
    chat.updated_at = datetime.now(timezone.utc)
    return chat


def make_message(
    role: str = "user",
    content: str = "Hello",
    is_pinned: bool = False,
    is_excluded: bool = False,
) -> MagicMock:
    """Create a mock Message model."""
    msg = MagicMock()
    msg.id = uuid.uuid4()
    msg.role = role
    msg.content = content
    msg.message_metadata = {}
    msg.is_pinned = is_pinned
    msg.is_excluded = is_excluded
    msg.created_at = datetime.now(timezone.utc)
    return msg


def make_event(
    event_type: str = "test_event",
    event_data: Optional[dict] = None,
    severity: str = "info",
    source: str = "test",
) -> MagicMock:
    """Create a mock Event model."""
    event = MagicMock()
    event.id = uuid.uuid4()
    event.event_type = event_type
    event.event_data = event_data or {}
    event.severity = severity
    event.source = source
    event.user_id = None
    event.chat_id = None
    event.resource_id = None
    event.created_at = datetime.now(timezone.utc)
    return event


def make_project(
    project_id: Optional[uuid.UUID] = None,
    user_id: Optional[uuid.UUID] = None,
    name: str = "Test Project",
    chats: Optional[list] = None,
) -> MagicMock:
    """Create a mock Project model."""
    project = MagicMock()
    project.id = project_id or uuid.uuid4()
    project.user_id = user_id or uuid.uuid4()
    project.name = name
    project.path = "/test/project"
    project.type = "general"
    project.settings = {}
    project.custom_context = None
    project.important_files = []
    project.is_deleted = False
    project.chats = chats or []
    project.created_at = datetime.now(timezone.utc)
    return project


def make_user_preference(
    user_id: Optional[uuid.UUID] = None,
    custom_system_prompt: str = "Be helpful",
    coding_principles: str = "Clean code",
    response_style: str = "concise",
) -> MagicMock:
    """Create a mock UserPreference model."""
    pref = MagicMock()
    pref.id = uuid.uuid4()
    pref.user_id = user_id or uuid.uuid4()
    pref.custom_system_prompt = custom_system_prompt
    pref.coding_principles = coding_principles
    pref.response_style = response_style
    return pref


def make_compaction(
    chat_id: Optional[uuid.UUID] = None,
    original_message_count: int = 50,
    compacted_message_count: int = 0,
    summary: str = "[Pending compaction]",
) -> MagicMock:
    """Create a mock ContextCompaction model."""
    compaction = MagicMock()
    compaction.id = uuid.uuid4()
    compaction.chat_id = chat_id or uuid.uuid4()
    compaction.original_message_count = original_message_count
    compaction.compacted_message_count = compacted_message_count
    compaction.summary = summary
    compaction.created_at = datetime.now(timezone.utc)
    return compaction


# ---------------------------------------------------------------------------
# Assertion helpers
# ---------------------------------------------------------------------------

async def assert_redis_key_exists(redis_client, key: str) -> None:
    """Assert that a Redis key exists."""
    exists = await redis_client.exists(key)
    assert exists, f"Expected Redis key '{key}' to exist"


async def assert_redis_key_absent(redis_client, key: str) -> None:
    """Assert that a Redis key does not exist."""
    exists = await redis_client.exists(key)
    assert not exists, f"Expected Redis key '{key}' to not exist"


async def assert_redis_key_ttl(redis_client, key: str, expected_ttl: int, tolerance: int = 2) -> None:
    """Assert that a Redis key has expected TTL within tolerance."""
    ttl = await redis_client.ttl(key)
    assert abs(ttl - expected_ttl) <= tolerance, (
        f"Expected TTL ~{expected_ttl} for key '{key}', got {ttl}"
    )


# ---------------------------------------------------------------------------
# Async test utilities
# ---------------------------------------------------------------------------

async def wait_for_condition(condition, timeout: float = 5.0, interval: float = 0.05) -> bool:
    """Poll until condition() returns True or timeout expires."""
    import time
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if condition():
            return True
        await asyncio.sleep(interval)
    return False


async def assert_eventually(assertion, timeout: float = 5.0, interval: float = 0.05) -> None:
    """Retry an assertion function until it passes or timeout expires."""
    import time
    deadline = time.monotonic() + timeout
    last_error = None
    while time.monotonic() < deadline:
        try:
            result = assertion()
            if asyncio.iscoroutine(result):
                await result
        except AssertionError as e:
            last_error = e
            await asyncio.sleep(interval)
        else:
            return
    if last_error is None:
        raise AssertionError("assertion did not run before timeout")
    raise last_error
