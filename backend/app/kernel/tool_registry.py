"""
ToolRegistry - Kernel service for tool lifecycle and execution orchestration.

Manages tool registration, parameter validation, permission checking,
Redis result caching, conversation-scoped context, sequential execution
queues, and execution orchestration.
"""

import asyncio
import hashlib
import json
import logging
import os
import time
from datetime import datetime, timezone
from typing import Any, Callable, Dict, List, Optional, Set, Tuple
from uuid import UUID

import redis.asyncio as redis

from app.kernel.base import BaseKernelService
from app.kernel.tool_base import BaseTool

logger = logging.getLogger(__name__)


class ToolRegistry(BaseKernelService):
    """
    Kernel service for managing tool registration and execution.

    Features:
    - Tool registration with duplicate detection
    - JSON Schema parameter validation via BaseTool
    - Permission checking before execution
    - Redis result caching with 5-minute TTL
    - Conversation-scoped context with Redis persistence
    - Sequential per-chat execution queues
    - LRU eviction for tool results per chat
    - Execution timing and error handling
    """

    CACHE_KEY_PREFIX = "tool_result:"
    CACHE_TTL_SECONDS = 300  # 5 minutes
    CONTEXT_KEY_PREFIX = "tool_context:"
    CONTEXT_TTL_SECONDS = 86400  # 24 hours
    MAX_RESULTS_PER_CHAT = 100
    QUEUE_IDLE_TIMEOUT_SECONDS = 1800  # 30 minutes

    def __init__(
        self,
        redis_client: Optional[redis.Redis] = None,
    ) -> None:
        """
        Initialize the ToolRegistry.

        Args:
            redis_client: Optional Redis client. If not provided, will be
                created from REDIS_URL environment variable during startup.
        """
        self._redis: Optional[redis.Redis] = redis_client
        self._tools: Dict[str, BaseTool] = {}
        self._running = False

        # Conversation context state
        self._conversation_contexts: Dict[UUID, Dict[str, Any]] = {}
        self._conversation_results: Dict[UUID, List[Dict[str, Any]]] = {}
        self._execution_queues: Dict[UUID, asyncio.Queue] = {}
        self._queue_processors: Dict[UUID, asyncio.Task] = {}

    @property
    def name(self) -> str:
        return "tool_registry"

    @property
    def is_running(self) -> bool:
        return self._running

    async def startup(self) -> None:
        if self._running:
            return

        logger.info("Starting ToolRegistry service...")

        if self._redis is None:
            redis_url = os.environ.get("REDIS_URL", "redis://localhost:6379/0")
            self._redis = redis.from_url(redis_url, decode_responses=True)

        # Initialize conversation state containers
        self._conversation_contexts = {}
        self._conversation_results = {}
        self._execution_queues = {}
        self._queue_processors = {}

        self._running = True
        logger.info(
            f"ToolRegistry started with {len(self._tools)} tool(s) registered"
        )

    async def shutdown(self) -> None:
        logger.info("Shutting down ToolRegistry service...")
        self._running = False

        # Cancel all active queue processors
        processor_count = len(self._queue_processors)
        for chat_id, task in list(self._queue_processors.items()):
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
        logger.info(f"Cancelled {processor_count} queue processor(s)")

        # Clear conversation state
        conversation_count = len(self._conversation_contexts)
        self._conversation_contexts.clear()
        self._conversation_results.clear()
        self._execution_queues.clear()
        self._queue_processors.clear()
        logger.info(
            f"Cleaned up {conversation_count} conversation context(s)"
        )

        if self._redis:
            await self._redis.aclose()
            self._redis = None

        logger.info("ToolRegistry service shutdown complete")

    async def health_check(self) -> Tuple[bool, str]:
        if not self._running:
            return False, "service not running"

        if self._redis is None:
            return False, "redis not connected"

        try:
            await self._redis.ping()
        except Exception as e:
            return False, f"redis ping failed: {e}"

        conversations = len(self._conversation_contexts)
        processors = len(self._queue_processors)

        # Check for dead queue processors
        dead_processors = sum(
            1 for t in self._queue_processors.values() if t.done()
        )
        if dead_processors > 0:
            logger.warning(
                f"Dead queue processors detected: {dead_processors} of "
                f"{processors} processor(s) have exited"
            )
            return (
                True,
                f"ok ({len(self._tools)} tools, {conversations} conversations, "
                f"WARNING: {dead_processors} dead queue processor(s))",
            )

        return (
            True,
            f"ok ({len(self._tools)} tools, {conversations} conversations)",
        )

    # ------------------------------------------------------------------
    # Tool Registration
    # ------------------------------------------------------------------

    def register_tool(self, tool: BaseTool) -> None:
        """
        Register a tool with the registry.

        Args:
            tool: Tool instance implementing BaseTool.

        Raises:
            TypeError: If tool doesn't implement BaseTool.
            ValueError: If a tool with the same name is already registered.
        """
        if not isinstance(tool, BaseTool):
            raise TypeError(
                f"Tool must implement BaseTool, got {type(tool).__name__}"
            )

        if tool.name in self._tools:
            raise ValueError(f"Tool '{tool.name}' is already registered")

        self._tools[tool.name] = tool
        logger.info(f"Registered tool: {tool.name}")

    def get_tool(self, name: str) -> Optional[BaseTool]:
        """Return a registered tool by name, or None."""
        return self._tools.get(name)

    def get_redis_client(self) -> Optional[redis.Redis]:
        """Return the Redis client, or None if unavailable."""
        return self._redis

    def list_tools(self) -> list[Dict[str, Any]]:
        """
        Return metadata for all registered tools.

        Returns:
            List of dicts with name, description, parameters_schema,
            and required_permissions for each tool.
        """
        return [
            {
                "name": tool.name,
                "description": tool.description,
                "parameters_schema": tool.parameters_schema,
                "required_permissions": sorted(tool.required_permissions),
            }
            for tool in self._tools.values()
        ]

    def get_tools_openai_format(self) -> List[Dict[str, Any]]:
        """
        Return registered tools as OpenAI-compatible tool definitions.

        This format is accepted by Ollama's ``tools`` parameter.
        """
        return [
            {
                "type": "function",
                "function": {
                    "name": tool.name,
                    "description": tool.description,
                    "parameters": tool.parameters_schema,
                },
            }
            for tool in self._tools.values()
        ]

    # ------------------------------------------------------------------
    # Conversation Context Management
    # ------------------------------------------------------------------

    async def get_conversation_context(
        self, chat_id: UUID
    ) -> Dict[str, Any]:
        """
        Retrieve context for a chat.

        Checks in-memory cache first, falls back to Redis, returns
        empty dict if not found.
        """
        if chat_id in self._conversation_contexts:
            return self._conversation_contexts[chat_id]

        # Try loading from Redis
        loaded = await self._load_context_from_redis(chat_id)
        if loaded is not None:
            self._conversation_contexts[chat_id] = loaded
            logger.debug(f"Loaded context from Redis for chat {chat_id}")
            return loaded

        return {}

    async def set_conversation_context(
        self, chat_id: UUID, context: Dict[str, Any]
    ) -> None:
        """Update context for a chat and persist to Redis."""
        self._conversation_contexts[chat_id] = context
        await self._persist_context_to_redis(chat_id, context)
        logger.debug(f"Set context for chat {chat_id}")

    async def update_conversation_context(
        self, chat_id: UUID, updates: Dict[str, Any]
    ) -> None:
        """Merge updates into existing context for a chat."""
        current = await self.get_conversation_context(chat_id)
        current.update(updates)
        await self.set_conversation_context(chat_id, current)
        logger.debug(
            f"Updated context for chat {chat_id} with {len(updates)} key(s)"
        )

    async def clear_conversation_context(self, chat_id: UUID) -> None:
        """Remove context from memory and Redis."""
        self._conversation_contexts.pop(chat_id, None)
        if self._redis:
            try:
                await self._redis.delete(
                    f"{self.CONTEXT_KEY_PREFIX}{chat_id}"
                )
            except Exception as e:
                logger.warning(
                    f"Failed to delete context from Redis for chat {chat_id}: {e}"
                )
        logger.debug(f"Cleared context for chat {chat_id}")

    async def _persist_context_to_redis(
        self, chat_id: UUID, context: Dict[str, Any]
    ) -> None:
        """Save context to Redis with 24-hour TTL."""
        if self._redis is None:
            return
        try:
            await self._redis.setex(
                f"{self.CONTEXT_KEY_PREFIX}{chat_id}",
                self.CONTEXT_TTL_SECONDS,
                json.dumps(context, default=str),
            )
        except Exception as e:
            logger.warning(
                f"Failed to persist context to Redis for chat {chat_id}: {e}"
            )

    async def _load_context_from_redis(
        self, chat_id: UUID
    ) -> Optional[Dict[str, Any]]:
        """Load context from Redis on first access."""
        if self._redis is None:
            return None
        try:
            raw = await self._redis.get(
                f"{self.CONTEXT_KEY_PREFIX}{chat_id}"
            )
            if raw:
                return json.loads(raw)
        except Exception as e:
            logger.warning(
                f"Failed to load context from Redis for chat {chat_id}: {e}"
            )
        return None

    # ------------------------------------------------------------------
    # Tool Results LRU Cache
    # ------------------------------------------------------------------

    async def _add_tool_result(
        self, chat_id: UUID, result: Dict[str, Any]
    ) -> None:
        """
        Add a result to the conversation results list with LRU eviction.

        Evicts oldest entries when MAX_RESULTS_PER_CHAT is exceeded.
        """
        if chat_id not in self._conversation_results:
            self._conversation_results[chat_id] = []

        entry = {
            "tool": result.get("tool", "unknown"),
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "result": result.get("result"),
            "error": result.get("error"),
            "success": result.get("success", False),
        }
        self._conversation_results[chat_id].append(entry)

        # LRU eviction
        overflow = (
            len(self._conversation_results[chat_id])
            - self.MAX_RESULTS_PER_CHAT
        )
        if overflow > 0:
            self._conversation_results[chat_id] = (
                self._conversation_results[chat_id][overflow:]
            )
            logger.debug(
                f"Evicted {overflow} oldest result(s) for chat {chat_id}"
            )

    async def get_conversation_results(
        self, chat_id: UUID, limit: Optional[int] = None
    ) -> List[Dict[str, Any]]:
        """Retrieve recent results for a chat."""
        results = self._conversation_results.get(chat_id, [])
        if limit is not None and limit > 0:
            return results[-limit:]
        return list(results)

    async def clear_conversation_results(self, chat_id: UUID) -> None:
        """Clear all results for a chat."""
        self._conversation_results.pop(chat_id, None)
        logger.debug(f"Cleared results for chat {chat_id}")

    # ------------------------------------------------------------------
    # Sequential Execution Queue
    # ------------------------------------------------------------------

    async def _get_or_create_queue(self, chat_id: UUID) -> asyncio.Queue:
        """Get existing queue or create new one for a chat."""
        if chat_id not in self._execution_queues:
            self._execution_queues[chat_id] = asyncio.Queue()
            # Start processor for this queue
            task = asyncio.create_task(self._queue_processor(chat_id))
            self._queue_processors[chat_id] = task
            logger.info(f"Created execution queue for chat {chat_id}")
        elif chat_id in self._queue_processors:
            # Restart processor if it died
            task = self._queue_processors[chat_id]
            if task.done():
                logger.warning(
                    f"Queue processor for chat {chat_id} died, restarting"
                )
                new_task = asyncio.create_task(
                    self._queue_processor(chat_id)
                )
                self._queue_processors[chat_id] = new_task
        return self._execution_queues[chat_id]

    async def _queue_processor(self, chat_id: UUID) -> None:
        """Background task that processes execution requests sequentially."""
        logger.info(f"Queue processor started for chat {chat_id}")
        idle_start: Optional[float] = None

        try:
            while True:
                try:
                    # Wait for next task with a timeout for idle cleanup
                    execution_task, future = await asyncio.wait_for(
                        self._execution_queues[chat_id].get(),
                        timeout=self.QUEUE_IDLE_TIMEOUT_SECONDS,
                    )
                    idle_start = None
                except asyncio.TimeoutError:
                    # Queue has been idle too long
                    if idle_start is None:
                        idle_start = time.monotonic()
                    logger.info(
                        f"Queue processor idle timeout for chat {chat_id}, "
                        f"shutting down"
                    )
                    break
                except KeyError:
                    # Queue was removed during cleanup
                    break

                try:
                    result = await execution_task()
                    future.set_result(result)
                except Exception as e:
                    future.set_exception(e)
        except asyncio.CancelledError:
            logger.info(f"Queue processor cancelled for chat {chat_id}")
            raise
        except Exception as e:
            logger.error(
                f"Queue processor error for chat {chat_id}: {e}"
            )
        finally:
            # Clean up queue state on exit
            self._queue_processors.pop(chat_id, None)
            self._execution_queues.pop(chat_id, None)
            logger.info(f"Queue processor stopped for chat {chat_id}")

    async def _enqueue_execution(
        self, chat_id: UUID, execution_task: Callable
    ) -> Any:
        """Add execution task to queue and wait for result."""
        queue = await self._get_or_create_queue(chat_id)
        loop = asyncio.get_running_loop()
        future = loop.create_future()
        await queue.put((execution_task, future))
        return await future

    # ------------------------------------------------------------------
    # Conversation Cleanup
    # ------------------------------------------------------------------

    async def cleanup_conversation(self, chat_id: UUID) -> None:
        """
        Clear context, results, and stop queue processor for a chat.

        Safe to call even if the chat has no active state.
        """
        # Capture counts before cleanup for logging
        result_count = len(self._conversation_results.get(chat_id, []))
        context_keys = len(self._conversation_contexts.get(chat_id, {}))

        # Cancel queue processor
        task = self._queue_processors.pop(chat_id, None)
        if task is not None:
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass

        # Remove queue
        self._execution_queues.pop(chat_id, None)

        # Clear context and results
        self._conversation_contexts.pop(chat_id, None)
        self._conversation_results.pop(chat_id, None)

        # Delete from Redis
        if self._redis:
            try:
                await self._redis.delete(
                    f"{self.CONTEXT_KEY_PREFIX}{chat_id}"
                )
            except Exception as e:
                logger.warning(
                    f"Failed to delete Redis context for chat {chat_id}: {e}"
                )

        logger.info(
            f"Cleaned up conversation {chat_id}: "
            f"results={result_count}, context_keys={context_keys}"
        )

    # ------------------------------------------------------------------
    # Execution
    # ------------------------------------------------------------------

    async def execute_tool(
        self,
        tool_name: str,
        parameters: Dict[str, Any],
        caller_permissions: Set[str],
        use_cache: bool = True,
        chat_id: Optional[UUID] = None,
        context_data: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Validate, permission-check, and execute a tool.

        Workflow:
        1. Look up the tool by name.
        2. Validate parameters against the tool's JSON Schema.
        3. Check that caller_permissions is a superset of required_permissions.
        4. Check Redis cache for a prior result (if use_cache is True).
        5. If chat_id is provided, merge context_data, load conversation
           context, and route through sequential execution queue.
        6. Execute the tool and cache the result.
        7. Store result in conversation results and update context.

        Args:
            tool_name: Registered tool name.
            parameters: Parameter dict for the tool.
            caller_permissions: Permissions held by the caller.
            use_cache: Whether to check/store results in Redis cache.
            chat_id: Optional chat ID for conversation-scoped execution.
            context_data: Optional context data to merge before execution.

        Returns:
            Dict with keys: tool, success, result/error, cached, duration_ms,
            and optionally conversation_context.

        Raises:
            ValueError: If tool not found, validation fails, or permission denied.
        """
        tool = self._tools.get(tool_name)
        if tool is None:
            raise ValueError(f"Tool '{tool_name}' not found")

        # Parameter validation
        validation_errors = tool.validate_parameters(parameters)
        if validation_errors:
            raise ValueError(
                f"Parameter validation failed: {'; '.join(validation_errors)}"
            )

        # Permission check
        missing = tool.required_permissions - caller_permissions
        if missing:
            raise ValueError(
                f"Permission denied. Missing: {', '.join(sorted(missing))}"
            )

        # Cache lookup
        cache_key = self._build_cache_key(tool_name, parameters)
        if use_cache and self._redis:
            cached = await self._get_cached_result(cache_key)
            if cached is not None:
                return {
                    "tool": tool_name,
                    "success": True,
                    "result": cached,
                    "cached": True,
                    "duration_ms": 0,
                }

        # Merge incoming context data if provided
        if chat_id is not None and context_data:
            await self.update_conversation_context(chat_id, context_data)

        # Build the execution callable
        async def _do_execute() -> Dict[str, Any]:
            context = None
            if chat_id is not None:
                context = await self.get_conversation_context(chat_id)

            start = time.monotonic()
            try:
                result = await tool.execute(parameters, context=context)
                duration_ms = round((time.monotonic() - start) * 1000, 2)

                # Cache result
                if use_cache and self._redis:
                    await self._set_cached_result(cache_key, result)

                # Extract context updates from tool result
                if chat_id is not None:
                    context_updates = result.pop("context_updates", None)
                    if context_updates and isinstance(
                        context_updates, dict
                    ):
                        await self.update_conversation_context(
                            chat_id, context_updates
                        )

                logger.info(
                    f"Tool executed: name={tool_name}, "
                    f"duration_ms={duration_ms}, cached=False, success=True"
                )

                exec_result = {
                    "tool": tool_name,
                    "success": True,
                    "result": result,
                    "cached": False,
                    "duration_ms": duration_ms,
                }

                # Store result and attach context
                if chat_id is not None:
                    await self._add_tool_result(chat_id, exec_result)
                    exec_result["conversation_context"] = (
                        await self.get_conversation_context(chat_id)
                    )

                return exec_result

            except Exception as e:
                duration_ms = round((time.monotonic() - start) * 1000, 2)
                logger.error(
                    f"Tool executed: name={tool_name}, "
                    f"duration_ms={duration_ms}, cached=False, success=False, "
                    f"error={e}"
                )
                error_result = {
                    "tool": tool_name,
                    "success": False,
                    "error": str(e),
                    "cached": False,
                    "duration_ms": duration_ms,
                }

                if chat_id is not None:
                    await self._add_tool_result(chat_id, error_result)

                return error_result

        # Route through queue for conversation-scoped execution
        if chat_id is not None:
            return await self._enqueue_execution(chat_id, _do_execute)

        # Direct execution (no chat_id)
        return await _do_execute()

    # ------------------------------------------------------------------
    # Cache Helpers
    # ------------------------------------------------------------------

    def _build_cache_key(self, tool_name: str, parameters: Dict[str, Any]) -> str:
        """Derive a deterministic cache key from tool name + parameters."""
        param_json = json.dumps(parameters, sort_keys=True, default=str)
        digest = hashlib.sha256(param_json.encode()).hexdigest()[:16]
        return f"{self.CACHE_KEY_PREFIX}{tool_name}:{digest}"

    async def _get_cached_result(self, key: str) -> Optional[Dict[str, Any]]:
        try:
            raw = await self._redis.get(key)
            if raw:
                return json.loads(raw)
        except Exception as e:
            logger.warning(f"Cache read error: {e}")
        return None

    async def _set_cached_result(self, key: str, result: Dict[str, Any]) -> None:
        try:
            await self._redis.setex(
                key,
                self.CACHE_TTL_SECONDS,
                json.dumps(result, default=str),
            )
        except Exception as e:
            logger.warning(f"Cache write error: {e}")

    async def clear_tool_cache(self, tool_name: Optional[str] = None) -> int:
        """
        Clear cached results for a specific tool or all tools.

        Args:
            tool_name: If provided, clear only this tool's cache.
                       If None, clear all tool result caches.

        Returns:
            Number of cache keys deleted.
        """
        if self._redis is None:
            return 0

        pattern = f"{self.CACHE_KEY_PREFIX}{tool_name}:*" if tool_name else f"{self.CACHE_KEY_PREFIX}*"
        deleted = 0

        try:
            cursor = None
            while cursor != 0:
                cursor, keys = await self._redis.scan(
                    cursor=cursor or 0, match=pattern, count=100
                )
                if keys:
                    deleted += await self._redis.delete(*keys)
        except Exception as e:
            logger.warning(f"Cache clear error: {e}")

        logger.info(f"Cleared {deleted} cache key(s) (pattern={pattern})")
        return deleted
