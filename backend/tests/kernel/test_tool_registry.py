"""Unit tests for the ToolRegistry kernel service."""

import asyncio
import json
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.kernel.tool_registry import ToolRegistry
from tests.kernel.test_helpers import (
    FailingTool,
    MockTool,
    assert_redis_key_exists,
)


# =========================================================================
# Tool Registration Tests
# =========================================================================

class TestToolRegistration:
    """Tests for tool registration and retrieval."""

    @pytest.fixture
    def registry(self, mock_redis):
        return ToolRegistry(redis_client=mock_redis)

    @pytest.mark.unit
    def test_register_tool(self, registry):
        """register_tool adds tool to registry."""
        tool = MockTool(tool_name="echo")
        registry.register_tool(tool)
        assert registry.get_tool("echo") is tool

    @pytest.mark.unit
    def test_duplicate_registration_raises(self, registry):
        """Duplicate registration raises ValueError."""
        tool = MockTool(tool_name="echo")
        registry.register_tool(tool)
        with pytest.raises(ValueError, match="already registered"):
            registry.register_tool(MockTool(tool_name="echo"))

    @pytest.mark.unit
    def test_register_non_basetool_raises(self, registry):
        """Registering non-BaseTool raises TypeError."""
        with pytest.raises(TypeError, match="must implement BaseTool"):
            registry.register_tool("not a tool")

    @pytest.mark.unit
    def test_get_tool_returns_none(self, registry):
        """get_tool returns None for unregistered tools."""
        assert registry.get_tool("nonexistent") is None

    @pytest.mark.unit
    def test_list_tools(self, registry):
        """list_tools returns metadata for all registered tools."""
        registry.register_tool(MockTool(tool_name="tool_a"))
        registry.register_tool(MockTool(tool_name="tool_b"))

        tools = registry.list_tools()
        assert len(tools) == 2
        names = {t["name"] for t in tools}
        assert names == {"tool_a", "tool_b"}
        # Check metadata fields
        for t in tools:
            assert "description" in t
            assert "parameters_schema" in t
            assert "required_permissions" in t


# =========================================================================
# Parameter Validation Tests
# =========================================================================

class TestParameterValidation:
    """Tests for JSON Schema parameter validation."""

    @pytest.fixture
    def registry(self, mock_redis):
        reg = ToolRegistry(redis_client=mock_redis)
        reg._running = True
        reg.register_tool(MockTool(tool_name="validated"))
        return reg

    @pytest.mark.unit
    async def test_valid_parameters(self, registry):
        """Valid parameters pass validation."""
        result = await registry.execute_tool(
            "validated",
            {"input": "hello"},
            caller_permissions={"tools.execute"},
            use_cache=False,
        )
        assert result["success"] is True

    @pytest.mark.unit
    async def test_invalid_parameters(self, registry):
        """Invalid parameters raise ValueError."""
        with pytest.raises(ValueError, match="Parameter validation failed"):
            await registry.execute_tool(
                "validated",
                {"input": 12345},  # should be string
                caller_permissions={"tools.execute"},
                use_cache=False,
            )

    @pytest.mark.unit
    async def test_missing_required_parameters(self, registry):
        """Missing required parameters raise ValueError."""
        with pytest.raises(ValueError, match="Parameter validation failed"):
            await registry.execute_tool(
                "validated",
                {},  # missing required 'input'
                caller_permissions={"tools.execute"},
                use_cache=False,
            )


# =========================================================================
# Permission Checking Tests
# =========================================================================

class TestPermissionChecking:
    """Tests for permission enforcement."""

    @pytest.fixture
    def registry(self, mock_redis):
        reg = ToolRegistry(redis_client=mock_redis)
        reg._running = True
        reg.register_tool(MockTool(
            tool_name="perm_tool",
            permissions={"admin.access", "tools.execute"},
        ))
        return reg

    @pytest.mark.unit
    async def test_execution_with_all_permissions(self, registry):
        """Execution succeeds when caller has all required permissions."""
        result = await registry.execute_tool(
            "perm_tool",
            {"input": "test"},
            caller_permissions={"admin.access", "tools.execute", "extra"},
            use_cache=False,
        )
        assert result["success"] is True

    @pytest.mark.unit
    async def test_execution_with_missing_permissions(self, registry):
        """Execution fails with missing permissions."""
        with pytest.raises(ValueError, match="Permission denied"):
            await registry.execute_tool(
                "perm_tool",
                {"input": "test"},
                caller_permissions={"tools.execute"},  # missing admin.access
                use_cache=False,
            )

    @pytest.mark.unit
    async def test_permission_error_lists_missing(self, registry):
        """Error message lists the missing permissions."""
        with pytest.raises(ValueError, match=r"admin\.access"):
            await registry.execute_tool(
                "perm_tool",
                {"input": "test"},
                caller_permissions=set(),
                use_cache=False,
            )

    @pytest.mark.unit
    async def test_empty_required_permissions(self, mock_redis):
        """Tool with no required permissions allows any caller."""
        reg = ToolRegistry(redis_client=mock_redis)
        reg._running = True
        reg.register_tool(MockTool(tool_name="open_tool", permissions=set()))

        result = await reg.execute_tool(
            "open_tool",
            {"input": "test"},
            caller_permissions=set(),
            use_cache=False,
        )
        assert result["success"] is True


# =========================================================================
# Result Caching Tests
# =========================================================================

class TestResultCaching:
    """Tests for Redis result caching."""

    @pytest.fixture
    def registry(self, mock_redis):
        reg = ToolRegistry(redis_client=mock_redis)
        reg._running = True
        reg.register_tool(MockTool(tool_name="cached_tool"))
        return reg

    @pytest.mark.unit
    async def test_cache_miss_executes_tool(self, registry):
        """Cache miss executes tool and caches result."""
        result = await registry.execute_tool(
            "cached_tool",
            {"input": "test"},
            caller_permissions={"tools.execute"},
            use_cache=True,
        )
        assert result["success"] is True
        assert result["cached"] is False

    @pytest.mark.unit
    async def test_cache_hit_returns_cached(self, registry):
        """Cache hit returns cached result without execution."""
        tool = registry.get_tool("cached_tool")

        # First call — cache miss
        await registry.execute_tool(
            "cached_tool",
            {"input": "test"},
            caller_permissions={"tools.execute"},
            use_cache=True,
        )
        first_call_count = len(tool.execute_calls)

        # Second call — cache hit
        result = await registry.execute_tool(
            "cached_tool",
            {"input": "test"},
            caller_permissions={"tools.execute"},
            use_cache=True,
        )
        assert result["cached"] is True
        assert result["duration_ms"] == 0
        # Tool should not have been called again
        assert len(tool.execute_calls) == first_call_count

    @pytest.mark.unit
    async def test_cache_key_generation(self, registry):
        """Different parameters produce different cache keys."""
        key_a = registry._build_cache_key("tool", {"a": 1})
        key_b = registry._build_cache_key("tool", {"b": 2})
        assert key_a != key_b

    @pytest.mark.unit
    async def test_clear_tool_cache_specific(self, registry):
        """clear_tool_cache with tool_name clears only that tool's cache."""
        # Populate cache
        await registry.execute_tool(
            "cached_tool",
            {"input": "test"},
            caller_permissions={"tools.execute"},
            use_cache=True,
        )
        deleted = await registry.clear_tool_cache("cached_tool")
        assert deleted >= 1

    @pytest.mark.unit
    async def test_clear_tool_cache_all(self, registry):
        """clear_tool_cache without tool_name clears all tool caches."""
        await registry.execute_tool(
            "cached_tool",
            {"input": "test"},
            caller_permissions={"tools.execute"},
            use_cache=True,
        )
        deleted = await registry.clear_tool_cache()
        assert deleted >= 1


# =========================================================================
# Conversation Context Tests
# =========================================================================

class TestConversationContext:
    """Tests for conversation-scoped context management."""

    @pytest.fixture
    def registry(self, mock_redis):
        reg = ToolRegistry(redis_client=mock_redis)
        reg._running = True
        return reg

    @pytest.mark.unit
    async def test_set_and_get_context(self, registry):
        """set_conversation_context persists and get retrieves."""
        chat_id = uuid.uuid4()
        await registry.set_conversation_context(chat_id, {"key": "value"})
        ctx = await registry.get_conversation_context(chat_id)
        assert ctx["key"] == "value"

    @pytest.mark.unit
    async def test_get_context_cache_miss_loads_redis(self, registry):
        """get_conversation_context falls back to Redis on cache miss."""
        chat_id = uuid.uuid4()
        # Store directly in Redis
        redis_key = f"{registry.CONTEXT_KEY_PREFIX}{chat_id}"
        await registry._redis.setex(redis_key, 3600, json.dumps({"from": "redis"}))

        ctx = await registry.get_conversation_context(chat_id)
        assert ctx["from"] == "redis"

    @pytest.mark.unit
    async def test_update_context_merges(self, registry):
        """update_conversation_context merges updates into existing context."""
        chat_id = uuid.uuid4()
        await registry.set_conversation_context(chat_id, {"a": 1, "b": 2})
        await registry.update_conversation_context(chat_id, {"b": 3, "c": 4})

        ctx = await registry.get_conversation_context(chat_id)
        assert ctx == {"a": 1, "b": 3, "c": 4}

    @pytest.mark.unit
    async def test_clear_context(self, registry):
        """clear_conversation_context removes from memory and Redis."""
        chat_id = uuid.uuid4()
        await registry.set_conversation_context(chat_id, {"key": "value"})
        await registry.clear_conversation_context(chat_id)

        ctx = await registry.get_conversation_context(chat_id)
        assert ctx == {}

    @pytest.mark.unit
    async def test_context_isolation(self, registry):
        """Different chat_ids have isolated contexts."""
        chat_a = uuid.uuid4()
        chat_b = uuid.uuid4()
        await registry.set_conversation_context(chat_a, {"chat": "a"})
        await registry.set_conversation_context(chat_b, {"chat": "b"})

        assert (await registry.get_conversation_context(chat_a))["chat"] == "a"
        assert (await registry.get_conversation_context(chat_b))["chat"] == "b"


# =========================================================================
# Sequential Execution Queue Tests
# =========================================================================

class TestExecutionQueue:
    """Tests for per-chat sequential execution queues."""

    @pytest.fixture
    def registry(self, mock_redis):
        reg = ToolRegistry(redis_client=mock_redis)
        reg._running = True
        reg.register_tool(MockTool(tool_name="queued_tool", delay=0.01))
        return reg

    @pytest.mark.unit
    async def test_queue_created_on_first_execution(self, registry):
        """Queue processor starts on first chat-scoped execution."""
        chat_id = uuid.uuid4()
        result = await registry.execute_tool(
            "queued_tool",
            {"input": "test"},
            caller_permissions={"tools.execute"},
            use_cache=False,
            chat_id=chat_id,
        )
        assert result["success"] is True
        # Queue processor was created
        assert chat_id in registry._queue_processors

    @pytest.mark.unit
    async def test_sequential_execution(self, registry):
        """Tasks for same chat execute sequentially."""
        chat_id = uuid.uuid4()
        execution_order = []

        tool_a = MockTool(tool_name="tool_a", delay=0.05)
        tool_b = MockTool(tool_name="tool_b", delay=0.01)
        registry.register_tool(tool_a)
        registry.register_tool(tool_b)

        # Replace execute to track order
        original_a = tool_a.execute
        original_b = tool_b.execute

        async def tracked_a(params, context=None):
            execution_order.append("a_start")
            result = await original_a(params, context)
            execution_order.append("a_end")
            return result

        async def tracked_b(params, context=None):
            execution_order.append("b_start")
            result = await original_b(params, context)
            execution_order.append("b_end")
            return result

        tool_a.execute = tracked_a
        tool_b.execute = tracked_b

        # Launch both concurrently for the same chat
        results = await asyncio.gather(
            registry.execute_tool("tool_a", {"input": "1"}, {"tools.execute"}, False, chat_id),
            registry.execute_tool("tool_b", {"input": "2"}, {"tools.execute"}, False, chat_id),
        )

        assert all(r["success"] for r in results)
        # Verify sequential: a finishes before b starts (or vice versa)
        if execution_order[0] == "a_start":
            assert execution_order.index("a_end") < execution_order.index("b_start")
        else:
            assert execution_order.index("b_end") < execution_order.index("a_start")

    @pytest.mark.unit
    async def test_different_chats_run_parallel(self, registry):
        """Different chats execute in parallel."""
        chat_a = uuid.uuid4()
        chat_b = uuid.uuid4()

        results = await asyncio.gather(
            registry.execute_tool("queued_tool", {"input": "a"}, {"tools.execute"}, False, chat_a),
            registry.execute_tool("queued_tool", {"input": "b"}, {"tools.execute"}, False, chat_b),
        )
        assert all(r["success"] for r in results)

    @pytest.mark.unit
    async def test_cleanup_conversation(self, registry):
        """cleanup_conversation removes queue and context."""
        chat_id = uuid.uuid4()
        await registry.execute_tool(
            "queued_tool", {"input": "test"}, {"tools.execute"}, False, chat_id
        )
        await registry.cleanup_conversation(chat_id)

        assert chat_id not in registry._queue_processors
        assert chat_id not in registry._execution_queues
        assert chat_id not in registry._conversation_contexts
        assert chat_id not in registry._conversation_results

    @pytest.mark.unit
    async def test_direct_execution_without_chat_id(self, registry):
        """Execution without chat_id runs directly (no queue)."""
        result = await registry.execute_tool(
            "queued_tool",
            {"input": "test"},
            caller_permissions={"tools.execute"},
            use_cache=False,
            chat_id=None,
        )
        assert result["success"] is True
        assert "conversation_context" not in result


# =========================================================================
# LRU Eviction Tests
# =========================================================================

class TestLRUEviction:
    """Tests for tool result LRU eviction."""

    @pytest.fixture
    def registry(self, mock_redis):
        reg = ToolRegistry(redis_client=mock_redis)
        reg._running = True
        return reg

    @pytest.mark.unit
    async def test_add_result(self, registry):
        """_add_tool_result stores results."""
        chat_id = uuid.uuid4()
        await registry._add_tool_result(chat_id, {
            "tool": "test", "success": True, "result": {"data": 1}
        })
        results = await registry.get_conversation_results(chat_id)
        assert len(results) == 1

    @pytest.mark.unit
    async def test_eviction_at_max(self, registry):
        """Oldest results evicted when MAX_RESULTS_PER_CHAT exceeded."""
        chat_id = uuid.uuid4()
        for i in range(registry.MAX_RESULTS_PER_CHAT + 10):
            await registry._add_tool_result(chat_id, {
                "tool": "test", "success": True, "result": {"index": i}
            })

        results = await registry.get_conversation_results(chat_id)
        assert len(results) == registry.MAX_RESULTS_PER_CHAT
        # First result should be index 10 (0-9 evicted)
        assert results[0]["result"]["index"] == 10

    @pytest.mark.unit
    async def test_get_results_with_limit(self, registry):
        """get_conversation_results respects limit parameter."""
        chat_id = uuid.uuid4()
        for i in range(10):
            await registry._add_tool_result(chat_id, {
                "tool": "test", "success": True, "result": {"index": i}
            })

        results = await registry.get_conversation_results(chat_id, limit=3)
        assert len(results) == 3
        # Returns most recent
        assert results[-1]["result"]["index"] == 9

    @pytest.mark.unit
    async def test_clear_results(self, registry):
        """clear_conversation_results removes all results."""
        chat_id = uuid.uuid4()
        await registry._add_tool_result(chat_id, {"tool": "test", "success": True})
        await registry.clear_conversation_results(chat_id)
        results = await registry.get_conversation_results(chat_id)
        assert len(results) == 0


# =========================================================================
# Tool Execution Tests
# =========================================================================

class TestToolExecution:
    """Tests for the full execute_tool workflow."""

    @pytest.fixture
    def registry(self, mock_redis):
        reg = ToolRegistry(redis_client=mock_redis)
        reg._running = True
        reg.register_tool(MockTool(tool_name="exec_tool"))
        reg.register_tool(FailingTool(tool_name="fail_tool"))
        return reg

    @pytest.mark.unit
    async def test_successful_execution(self, registry):
        """Successful execution returns result with success=True."""
        result = await registry.execute_tool(
            "exec_tool",
            {"input": "hello"},
            caller_permissions={"tools.execute"},
            use_cache=False,
        )
        assert result["success"] is True
        assert result["tool"] == "exec_tool"
        assert result["cached"] is False
        assert result["duration_ms"] >= 0

    @pytest.mark.unit
    async def test_failed_execution(self, registry):
        """Failed execution returns error with success=False."""
        result = await registry.execute_tool(
            "fail_tool",
            {"input": "hello"},
            caller_permissions={"tools.execute"},
            use_cache=False,
        )
        assert result["success"] is False
        assert "tool error" in result["error"]
        assert result["duration_ms"] >= 0

    @pytest.mark.unit
    async def test_tool_not_found(self, registry):
        """Executing nonexistent tool raises ValueError."""
        with pytest.raises(ValueError, match="not found"):
            await registry.execute_tool(
                "nonexistent",
                {"input": "test"},
                caller_permissions={"tools.execute"},
            )

    @pytest.mark.unit
    async def test_context_updates_from_tool(self, registry):
        """Context updates from tool result are merged into conversation context."""
        tool = MockTool(
            tool_name="ctx_tool",
            result={"output": "ok", "context_updates": {"updated_key": "new_value"}},
        )
        registry.register_tool(tool)

        chat_id = uuid.uuid4()
        result = await registry.execute_tool(
            "ctx_tool",
            {"input": "test"},
            caller_permissions={"tools.execute"},
            use_cache=False,
            chat_id=chat_id,
        )
        assert result["success"] is True
        ctx = await registry.get_conversation_context(chat_id)
        assert ctx["updated_key"] == "new_value"

    @pytest.mark.unit
    async def test_result_stored_in_conversation(self, registry):
        """Execution result is stored in conversation results."""
        chat_id = uuid.uuid4()
        await registry.execute_tool(
            "exec_tool",
            {"input": "test"},
            caller_permissions={"tools.execute"},
            use_cache=False,
            chat_id=chat_id,
        )

        results = await registry.get_conversation_results(chat_id)
        assert len(results) == 1
        assert results[0]["tool"] == "exec_tool"


# =========================================================================
# Lifecycle Tests
# =========================================================================

class TestToolRegistryLifecycle:
    """Tests for ToolRegistry startup/shutdown/health."""

    @pytest.mark.unit
    async def test_startup_initializes_redis(self, mock_redis):
        """startup() sets running and initializes containers."""
        reg = ToolRegistry(redis_client=mock_redis)
        await reg.startup()
        assert reg.is_running
        assert reg.name == "tool_registry"
        await reg.shutdown()

    @pytest.mark.unit
    async def test_startup_idempotent(self, mock_redis):
        """Calling startup() twice is safe."""
        reg = ToolRegistry(redis_client=mock_redis)
        await reg.startup()
        await reg.startup()
        assert reg.is_running
        await reg.shutdown()

    @pytest.mark.unit
    async def test_shutdown_cancels_processors(self, mock_redis):
        """shutdown() cancels all queue processors."""
        reg = ToolRegistry(redis_client=mock_redis)
        reg._running = True
        reg.register_tool(MockTool(tool_name="tool"))

        chat_id = uuid.uuid4()
        await reg.execute_tool(
            "tool", {"input": "test"}, {"tools.execute"}, False, chat_id
        )
        assert chat_id in reg._queue_processors

        await reg.shutdown()
        assert not reg.is_running
        assert len(reg._queue_processors) == 0
        assert len(reg._conversation_contexts) == 0

    @pytest.mark.unit
    async def test_health_check_healthy(self, mock_redis):
        """health_check returns healthy when running."""
        reg = ToolRegistry(redis_client=mock_redis)
        await reg.startup()

        healthy, msg = await reg.health_check()
        assert healthy is True
        assert "ok" in msg
        await reg.shutdown()

    @pytest.mark.unit
    async def test_health_check_not_running(self, mock_redis):
        """health_check returns not running when stopped."""
        reg = ToolRegistry(redis_client=mock_redis)
        healthy, msg = await reg.health_check()
        assert healthy is False
        assert "not running" in msg
