"""
Resource Manager kernel service for GPU VRAM tracking and model loading prioritization.

This module provides:
- VRAMTracker: Low-level GPU VRAM monitoring using pynvml
- ResourceManager: Kernel service for managing resource loading with priority queuing

The ResourceManager integrates with the kernel lifecycle and provides:
- Real-time VRAM statistics with Redis caching
- Priority-based model loading queue
- User resource locking to prevent preemption
- Background VRAM monitoring with 1-second refresh
"""

import asyncio
import json
import logging
import os
from datetime import datetime, timezone
from typing import Callable, List, Optional, Tuple
from uuid import UUID

import redis.asyncio as redis
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.kernel.base import BaseKernelService
from app.models.resource import Resource

logger = logging.getLogger(__name__)


class VRAMTracker:
    """
    Low-level GPU VRAM monitoring using NVIDIA Management Library (pynvml).

    Supports multi-GPU environments and provides comprehensive VRAM statistics.
    Gracefully handles environments without NVIDIA GPUs or drivers.

    Testing Notes:
    - Mock pynvml for testing in non-GPU environments
    - Use dependency injection to provide mock tracker instances
    """

    def __init__(self) -> None:
        """
        Initialize pynvml and discover available GPUs.

        Raises:
            RuntimeError: If NVIDIA drivers are not available.
        """
        self._initialized = False
        self._gpu_handles: list = []
        self._gpu_count = 0

        try:
            import pynvml
            self._pynvml = pynvml
            pynvml.nvmlInit()
            self._initialized = True
            self._gpu_count = pynvml.nvmlDeviceGetCount()

            for i in range(self._gpu_count):
                handle = pynvml.nvmlDeviceGetHandleByIndex(i)
                self._gpu_handles.append(handle)

            logger.info(f"VRAMTracker initialized with {self._gpu_count} GPU(s)")

        except ImportError:
            logger.warning("pynvml not available - GPU monitoring disabled")
            raise RuntimeError("NVIDIA drivers not available: pynvml import failed")
        except Exception as e:
            logger.warning(f"Failed to initialize pynvml: {e}")
            raise RuntimeError(f"NVIDIA drivers not available: {e}")

    def get_total_vram_mb(self) -> int:
        """
        Get total VRAM across all GPUs in megabytes.

        Returns:
            Total VRAM in MB.
        """
        if not self._initialized:
            return 0

        total_bytes = 0
        for handle in self._gpu_handles:
            mem_info = self._pynvml.nvmlDeviceGetMemoryInfo(handle)
            total_bytes += mem_info.total

        return total_bytes // (1024 * 1024)

    def get_used_vram_mb(self) -> int:
        """
        Get currently used VRAM across all GPUs in megabytes.

        Returns:
            Used VRAM in MB.
        """
        if not self._initialized:
            return 0

        used_bytes = 0
        for handle in self._gpu_handles:
            mem_info = self._pynvml.nvmlDeviceGetMemoryInfo(handle)
            used_bytes += mem_info.used

        return used_bytes // (1024 * 1024)

    def get_free_vram_mb(self) -> int:
        """
        Get available VRAM across all GPUs in megabytes.

        Returns:
            Free VRAM in MB (total - used).
        """
        if not self._initialized:
            return 0

        free_bytes = 0
        for handle in self._gpu_handles:
            mem_info = self._pynvml.nvmlDeviceGetMemoryInfo(handle)
            free_bytes += mem_info.free

        return free_bytes // (1024 * 1024)

    def get_vram_stats(self) -> dict:
        """
        Get comprehensive VRAM statistics.

        Returns:
            Dictionary with keys:
            - total_mb: Total VRAM in megabytes
            - used_mb: Used VRAM in megabytes
            - free_mb: Free VRAM in megabytes
            - utilization_percent: VRAM utilization as percentage (0-100)
            - gpu_count: Number of GPUs detected
        """
        total = self.get_total_vram_mb()
        used = self.get_used_vram_mb()
        free = self.get_free_vram_mb()

        utilization = (used / total * 100) if total > 0 else 0.0

        return {
            "total_mb": total,
            "used_mb": used,
            "free_mb": free,
            "utilization_percent": round(utilization, 2),
            "gpu_count": self._gpu_count,
        }

    def cleanup(self) -> None:
        """
        Shutdown pynvml and release GPU handles.

        Safe to call multiple times.
        """
        if self._initialized:
            try:
                self._pynvml.nvmlShutdown()
                logger.info("VRAMTracker shutdown complete")
            except Exception as e:
                logger.warning(f"Error during pynvml shutdown: {e}")
            finally:
                self._initialized = False
                self._gpu_handles = []
                self._gpu_count = 0


class ResourceManager(BaseKernelService):
    """
    Kernel service for managing resource loading with priority-based queuing.

    Features:
    - VRAM statistics tracking with Redis caching (1s TTL)
    - Priority queue for model loading requests
    - User resource locking to prevent preemption
    - Background VRAM monitoring loop

    Priority Scoring Formula:
        score = base_priority + user_lock_boost + recency_bonus + vram_penalty

        - base_priority: Resource's base priority value (default 0)
        - user_lock_boost: +1000 if resource is user-locked
        - recency_bonus: Inverse of hours since last use (more recent = higher)
        - vram_penalty: -vram_mb/1000 (larger models penalized)

    Testing Notes:
    - Test priority queue ordering with various resource configurations
    - Test Redis cache TTL behavior
    - Test database transaction rollback on errors
    - Test concurrent queue operations
    - Test VRAM tracker cleanup on service shutdown
    """

    # Redis cache key for VRAM statistics
    VRAM_STATS_KEY = "vram:stats"
    VRAM_CACHE_TTL_SECONDS = 1

    def __init__(
        self,
        session_factory: Callable[[], AsyncSession],
        redis_client: Optional[redis.Redis] = None,
    ) -> None:
        """
        Initialize the ResourceManager.

        Args:
            session_factory: Callable that returns an async database session.
            redis_client: Optional Redis client. If not provided, will be created
                from REDIS_URL environment variable.
        """
        self._session_factory = session_factory
        self._redis: Optional[redis.Redis] = redis_client
        self._vram_tracker: Optional[VRAMTracker] = None
        self._running = False
        self._monitor_task: Optional[asyncio.Task] = None
        self._kernel = None
        self._last_broadcast_utilization: Optional[float] = None

        # Priority queue stores tuples: (negative_score, timestamp, resource_id, user_id)
        # Using negative score for max-heap behavior with asyncio.PriorityQueue
        self._load_queue: asyncio.PriorityQueue = asyncio.PriorityQueue()

    @property
    def name(self) -> str:
        """Return unique service identifier."""
        return "resource_manager"

    @property
    def is_running(self) -> bool:
        """Return whether the service is currently running."""
        return self._running

    async def startup(self) -> None:
        """
        Initialize the service.

        - Initializes VRAM tracker
        - Creates Redis connection if not provided
        - Performs initial VRAM cache population
        - Starts background monitoring loop
        """
        if self._running:
            return  # Idempotent

        logger.info("Starting ResourceManager service...")

        # Initialize Redis connection if not provided
        if self._redis is None:
            redis_url = os.environ.get("REDIS_URL", "redis://localhost:6379/0")
            self._redis = redis.from_url(redis_url, decode_responses=True)

        # Initialize VRAM tracker
        try:
            self._vram_tracker = VRAMTracker()
        except RuntimeError as e:
            logger.warning(f"VRAM tracking unavailable: {e}")
            # Continue without VRAM tracking - service can still manage priorities
            self._vram_tracker = None

        # Perform initial VRAM cache population if tracker is available
        if self._vram_tracker:
            await self.refresh_vram_cache()
            stats = self._vram_tracker.get_vram_stats()
            logger.info(
                f"ResourceManager started with {stats['gpu_count']} GPU(s), "
                f"{stats['total_mb']}MB total VRAM"
            )

        # Start background monitoring loop
        self._running = True
        self._monitor_task = asyncio.create_task(self._vram_monitor_loop())

        logger.info("ResourceManager service started successfully")

    async def shutdown(self) -> None:
        """
        Clean up the service.

        - Stops background monitoring loop
        - Cleans up VRAM tracker
        - Closes Redis connection
        - Clears priority queue
        """
        logger.info("Shutting down ResourceManager service...")

        self._running = False

        # Cancel monitor task
        if self._monitor_task:
            self._monitor_task.cancel()
            try:
                await asyncio.wait_for(self._monitor_task, timeout=5.0)
            except (asyncio.CancelledError, asyncio.TimeoutError):
                pass
            self._monitor_task = None

        # Cleanup VRAM tracker
        if self._vram_tracker:
            self._vram_tracker.cleanup()
            self._vram_tracker = None

        # Close Redis connection
        if self._redis:
            await self._redis.close()
            self._redis = None

        # Clear priority queue
        while not self._load_queue.empty():
            try:
                self._load_queue.get_nowait()
            except asyncio.QueueEmpty:
                break

        logger.info("ResourceManager service shutdown complete")

    async def health_check(self) -> Tuple[bool, str]:
        """
        Check service health.

        Returns:
            Tuple of (healthy, message). Returns degraded status when VRAM
            tracking is unavailable.
        """
        if not self._running:
            return False, "not running"

        # Check if VRAM tracking is unavailable (degraded state)
        if self._vram_tracker is None:
            return False, "degraded: vram tracking unavailable"

        try:
            self._vram_tracker.get_vram_stats()
            return True, "ok"
        except Exception as e:
            return False, f"vram tracking failed: {e}"

    # -------------------------------------------------------------------------
    # VRAM Stats Caching
    # -------------------------------------------------------------------------

    async def get_cached_vram_stats(self) -> dict:
        """
        Get VRAM statistics, using Redis cache when available.

        Returns:
            Dictionary with VRAM statistics (see VRAMTracker.get_vram_stats).
        """
        if not self._redis:
            if self._vram_tracker:
                return self._vram_tracker.get_vram_stats()
            return self._empty_vram_stats()

        # Try cache first
        cached = await self._redis.get(self.VRAM_STATS_KEY)
        if cached:
            return json.loads(cached)

        # Cache miss - fetch fresh stats
        if self._vram_tracker:
            stats = self._vram_tracker.get_vram_stats()
        else:
            stats = self._empty_vram_stats()

        # Store in cache
        await self._redis.setex(
            self.VRAM_STATS_KEY,
            self.VRAM_CACHE_TTL_SECONDS,
            json.dumps(stats)
        )

        return stats

    async def refresh_vram_cache(self) -> None:
        """
        Force refresh VRAM cache with fresh statistics.
        """
        if not self._vram_tracker or not self._redis:
            return

        stats = self._vram_tracker.get_vram_stats()
        await self._redis.setex(
            self.VRAM_STATS_KEY,
            self.VRAM_CACHE_TTL_SECONDS,
            json.dumps(stats)
        )
        logger.debug("VRAM cache refreshed")

    def _empty_vram_stats(self) -> dict:
        """Return empty VRAM stats for non-GPU environments."""
        return {
            "total_mb": 0,
            "used_mb": 0,
            "free_mb": 0,
            "utilization_percent": 0.0,
            "gpu_count": 0,
        }

    # -------------------------------------------------------------------------
    # Priority Scoring
    # -------------------------------------------------------------------------

    def calculate_priority_score(self, resource: Resource) -> float:
        """
        Calculate priority score for a resource.

        Formula:
            score = base_priority + user_lock_boost + recency_bonus + vram_penalty

        Components:
        - base_priority: Resource's base priority value (default 0)
        - user_lock_boost: +1000 if user_locked is True
        - recency_bonus: Inverse of hours since last use (capped at 168 hours / 1 week)
        - vram_penalty: -vram_mb/1000 (larger models get lower priority)

        Examples:
        - New resource (just used, no VRAM, not locked): ~0 + 168 - 0 = ~168
        - Locked resource with 8GB VRAM: 1000 + recency - 8 = ~992+
        - Old resource (1 week since use): base + 0 + vram_penalty

        Args:
            resource: The Resource model instance.

        Returns:
            Computed priority score as float.
        """
        score = float(resource.base_priority)

        # User lock boost
        if resource.user_locked:
            score += 1000.0

        # Recency bonus (inverse hours since last use)
        if resource.last_used_at:
            now = datetime.now(timezone.utc)
            hours_since_use = (now - resource.last_used_at).total_seconds() / 3600
            # Cap at 168 hours (1 week) to prevent extreme values
            hours_since_use = min(hours_since_use, 168.0)
            # More recent = higher bonus (168 - hours gives higher values for recent)
            recency_bonus = 168.0 - hours_since_use
            score += recency_bonus

        # VRAM efficiency penalty (larger models penalized)
        if resource.vram_mb:
            score -= resource.vram_mb / 1000.0

        return score

    # -------------------------------------------------------------------------
    # Model Loading Queue
    # -------------------------------------------------------------------------

    async def enqueue_model_load(
        self,
        resource_id: str,
        user_id: UUID,
        priority_boost: int = 0
    ) -> None:
        """
        Add a resource to the loading queue with priority.

        Args:
            resource_id: The resource's external identifier.
            user_id: UUID of the requesting user.
            priority_boost: Optional additional priority boost.
        """
        async with self._session_factory() as session:
            result = await session.execute(
                select(Resource).where(Resource.resource_id == resource_id)
            )
            resource = result.scalar_one_or_none()

            if not resource:
                logger.warning(f"Resource not found: {resource_id}")
                return

            # Calculate priority score
            score = self.calculate_priority_score(resource) + priority_boost

            # Create queue item (negative score for max-heap behavior)
            timestamp = datetime.now(timezone.utc).timestamp()
            queue_item = (-score, timestamp, resource_id, str(user_id))

            await self._load_queue.put(queue_item)
            logger.info(
                f"Enqueued model load: resource_id={resource_id}, "
                f"priority={score:.2f}, queue_size={self._load_queue.qsize()}"
            )

    async def get_next_model_to_load(self) -> Optional[Tuple[str, UUID]]:
        """
        Get the highest priority resource from the loading queue.

        Returns:
            Tuple of (resource_id, user_id) or None if queue is empty.
        """
        if self._load_queue.empty():
            return None

        try:
            item = self._load_queue.get_nowait()
            _, _, resource_id, user_id_str = item
            logger.info(f"Dequeued model load: {resource_id}")
            return resource_id, UUID(user_id_str)
        except asyncio.QueueEmpty:
            return None

    def get_queue_size(self) -> int:
        """
        Get the current size of the loading queue.

        Returns:
            Number of items in the queue.
        """
        return self._load_queue.qsize()

    # -------------------------------------------------------------------------
    # Resource Database Operations
    # -------------------------------------------------------------------------

    async def update_resource_vram(self, resource_id: str, vram_mb: int) -> None:
        """
        Update VRAM usage for a resource.

        Args:
            resource_id: The resource's external identifier.
            vram_mb: VRAM usage in megabytes.
        """
        async with self._session_factory() as session:
            result = await session.execute(
                select(Resource).where(Resource.resource_id == resource_id)
            )
            resource = result.scalar_one_or_none()

            if not resource:
                logger.warning(f"Resource not found: {resource_id}")
                return

            resource.vram_mb = vram_mb
            resource.last_used_at = datetime.now(timezone.utc)
            await session.commit()

            logger.info(f"Updated resource {resource_id} VRAM to {vram_mb}MB")

        # Refresh VRAM cache after update
        await self.refresh_vram_cache()

    async def lock_resource(self, resource_id: str, user_id: UUID) -> None:
        """
        Lock a resource for a user, preventing preemption.

        Args:
            resource_id: The resource's external identifier.
            user_id: UUID of the user locking the resource.
        """
        async with self._session_factory() as session:
            result = await session.execute(
                select(Resource).where(Resource.resource_id == resource_id)
            )
            resource = result.scalar_one_or_none()

            if not resource:
                logger.warning(f"Resource not found: {resource_id}")
                return

            resource.user_locked = True
            resource.user_id = user_id
            resource.priority = resource.base_priority + 1000
            await session.commit()

            logger.info(f"Locked resource {resource_id} for user {user_id}")

    async def unlock_resource(self, resource_id: str) -> None:
        """
        Unlock a resource, allowing preemption.

        Args:
            resource_id: The resource's external identifier.
        """
        async with self._session_factory() as session:
            result = await session.execute(
                select(Resource).where(Resource.resource_id == resource_id)
            )
            resource = result.scalar_one_or_none()

            if not resource:
                logger.warning(f"Resource not found: {resource_id}")
                return

            resource.user_locked = False
            resource.user_id = None
            resource.priority = resource.base_priority
            await session.commit()

            logger.info(f"Unlocked resource {resource_id}")

    # -------------------------------------------------------------------------
    # Background Monitoring
    # -------------------------------------------------------------------------

    async def _vram_monitor_loop(self) -> None:
        """
        Background loop that refreshes VRAM cache every second.

        Broadcasts resource_updated events via EventBus when VRAM utilization
        changes by more than 5% or on the first iteration.
        """
        logger.info("VRAM monitor loop started")

        while self._running:
            try:
                await self.refresh_vram_cache()
                await self._maybe_broadcast_vram_update()
            except Exception as e:
                logger.error(f"Error in VRAM monitor loop: {e}")

            await asyncio.sleep(1.0)

        logger.info("VRAM monitor loop stopped")

    async def _maybe_broadcast_vram_update(self) -> None:
        """Broadcast resource_updated event if VRAM changed significantly (>5%)."""
        if not self._kernel:
            return

        stats = await self.get_cached_vram_stats()
        current_util = stats.get("utilization_percent", 0.0)
        prev_util = self._last_broadcast_utilization

        # Broadcast on first iteration or when utilization changes by >5%
        should_broadcast = (
            prev_util is None
            or abs(current_util - prev_util) > 5.0
        )

        if not should_broadcast:
            return

        event_bus = self._kernel.get_service("event_bus")
        if not event_bus:
            return

        loaded_count = 0
        try:
            loaded = await self.get_loaded_resources()
            loaded_count = len(loaded)
        except Exception as e:
            logger.debug("Failed to get loaded resources for broadcast: %s", e)

        await event_bus.publish_event(
            event_type="resource_updated",
            event_data={
                "vram_stats": stats,
                "loaded_resources_count": loaded_count,
                "queue_size": self._load_queue.qsize(),
            },
            severity="info",
            source="resource_manager",
            persist=False,
        )

        # Update state only after successful broadcast so failures trigger retry
        self._last_broadcast_utilization = current_util

    # -------------------------------------------------------------------------
    # Preemption Algorithm (LRU-based)
    # -------------------------------------------------------------------------

    async def get_loaded_resources(self) -> List[Resource]:
        """
        Query database for resources with status="loaded", ordered by last_used_at (LRU order).

        Returns:
            List of Resource objects ordered by least recently used first.
        """
        try:
            async with self._session_factory() as session:
                result = await session.execute(
                    select(Resource)
                    .where(Resource.status == "loaded")
                    .order_by(Resource.last_used_at.asc().nullsfirst())
                )
                resources = list(result.scalars().all())
                logger.debug(f"Found {len(resources)} loaded resources")
                return resources
        except Exception as e:
            logger.error(f"Failed to get loaded resources: {e}")
            return []

    async def find_preemptable_resources(self, required_vram_mb: int) -> List[str]:
        """
        Find resources that can be preempted to free required VRAM.

        Resources are selected in LRU order, excluding user-locked resources.
        Accumulates VRAM until the required amount is met.

        Args:
            required_vram_mb: Amount of VRAM needed in megabytes.

        Returns:
            List of resource IDs that can be preempted.
        """
        loaded_resources = await self.get_loaded_resources()

        # Filter out user-locked resources (protected from preemption)
        preemptable = [r for r in loaded_resources if not r.user_locked]

        accumulated_vram = 0
        resources_to_preempt: List[str] = []

        for resource in preemptable:
            if accumulated_vram >= required_vram_mb:
                break

            vram = resource.vram_mb or 0
            resources_to_preempt.append(resource.resource_id)
            accumulated_vram += vram

        logger.info(
            f"Found {len(resources_to_preempt)} preemptable resources "
            f"with {accumulated_vram}MB VRAM (required: {required_vram_mb}MB)"
        )
        return resources_to_preempt

    async def preempt_resource(self, resource_id: str) -> bool:
        """
        Mark a resource for preemption by updating its status to "unloading".

        Args:
            resource_id: The resource's external identifier.

        Returns:
            True if preemption was successful, False otherwise.
        """
        try:
            async with self._session_factory() as session:
                result = await session.execute(
                    select(Resource).where(Resource.resource_id == resource_id)
                )
                resource = result.scalar_one_or_none()

                if not resource:
                    logger.warning(f"Resource not found for preemption: {resource_id}")
                    return False

                if resource.user_locked:
                    logger.warning(f"Cannot preempt user-locked resource: {resource_id}")
                    return False

                resource.status = "unloading"
                await session.commit()

                freed_vram = resource.vram_mb or 0
                logger.info(
                    f"Preempting resource {resource_id}: "
                    f"reason=VRAM_needed, freed_mb={freed_vram}"
                )
                return True

        except Exception as e:
            logger.error(f"Failed to preempt resource {resource_id}: {e}")
            return False

    async def check_vram_availability(
        self, required_vram_mb: int
    ) -> Tuple[bool, List[str]]:
        """
        Check if required VRAM is available, suggesting preemptable resources if not.

        Args:
            required_vram_mb: Amount of VRAM needed in megabytes.

        Returns:
            Tuple of (available, preemptable_resource_ids):
            - available: True if sufficient VRAM is free
            - preemptable_resource_ids: List of resources that could be preempted
        """
        stats = await self.get_cached_vram_stats()
        free_mb = stats.get("free_mb", 0)

        if free_mb >= required_vram_mb:
            logger.debug(f"VRAM available: {free_mb}MB free >= {required_vram_mb}MB required")
            return True, []

        # Need to find resources to preempt
        needed_mb = required_vram_mb - free_mb
        preemptable = await self.find_preemptable_resources(needed_mb)

        logger.info(
            f"VRAM insufficient: {free_mb}MB free < {required_vram_mb}MB required. "
            f"Found {len(preemptable)} preemptable resources"
        )
        return False, preemptable

    # -------------------------------------------------------------------------
    # CPU Offloading
    # -------------------------------------------------------------------------

    async def offload_to_cpu(self, resource_id: str, user_id: UUID) -> bool:
        """
        Offload a resource from GPU to CPU memory.

        Updates resource status to "cpu_offloaded" and frees VRAM allocation.

        Args:
            resource_id: The resource's external identifier.
            user_id: UUID of the user requesting the offload.

        Returns:
            True if offloading was successful, False otherwise.
        """
        try:
            async with self._session_factory() as session:
                result = await session.execute(
                    select(Resource).where(Resource.resource_id == resource_id)
                )
                resource = result.scalar_one_or_none()

                if not resource:
                    logger.warning(f"Resource not found for CPU offload: {resource_id}")
                    return False

                resource.status = "cpu_offloaded"
                resource.vram_mb = 0
                resource.last_used_at = datetime.now(timezone.utc)
                await session.commit()

                logger.info(
                    f"CPU offload: resource_id={resource_id}, user_id={user_id}"
                )

            # Refresh VRAM cache to reflect freed memory
            await self.refresh_vram_cache()
            return True

        except Exception as e:
            logger.error(f"Failed to offload resource {resource_id} to CPU: {e}")
            return False

    async def reload_from_cpu(
        self, resource_id: str, estimated_vram_mb: int
    ) -> Tuple[bool, List[str]]:
        """
        Reload a resource from CPU back to GPU memory.

        Checks VRAM availability and suggests preemption if needed.

        Args:
            resource_id: The resource's external identifier.
            estimated_vram_mb: Expected VRAM usage after reload.

        Returns:
            Tuple of (success, preemption_suggestions):
            - success: True if reload was initiated
            - preemption_suggestions: List of resource IDs to preempt if VRAM insufficient
        """
        # Check VRAM availability
        available, preemptable = await self.check_vram_availability(estimated_vram_mb)

        if not available and not preemptable:
            logger.warning(
                f"Cannot reload {resource_id}: insufficient VRAM and no preemptable resources"
            )
            return False, []

        if not available:
            logger.info(
                f"Reload of {resource_id} requires preemption of {len(preemptable)} resources"
            )
            return False, preemptable

        try:
            async with self._session_factory() as session:
                result = await session.execute(
                    select(Resource).where(Resource.resource_id == resource_id)
                )
                resource = result.scalar_one_or_none()

                if not resource:
                    logger.warning(f"Resource not found for CPU reload: {resource_id}")
                    return False, []

                resource.status = "loading"
                resource.vram_mb = estimated_vram_mb
                resource.last_used_at = datetime.now(timezone.utc)
                await session.commit()

                logger.info(
                    f"Initiated reload of resource {resource_id} from CPU "
                    f"(estimated VRAM: {estimated_vram_mb}MB)"
                )

            await self.refresh_vram_cache()
            return True, []

        except Exception as e:
            logger.error(f"Failed to reload resource {resource_id} from CPU: {e}")
            return False, []

    # -------------------------------------------------------------------------
    # Session Preference Storage (Redis)
    # -------------------------------------------------------------------------

    # Preference values
    PREFERENCE_ALWAYS_OFFLOAD = "always_offload"
    PREFERENCE_ALWAYS_CANCEL = "always_cancel"
    PREFERENCE_ASK_EACH_TIME = "ask_each_time"
    VALID_PREFERENCES = {PREFERENCE_ALWAYS_OFFLOAD, PREFERENCE_ALWAYS_CANCEL, PREFERENCE_ASK_EACH_TIME}

    # Redis key patterns
    OFFLOAD_PREFERENCE_KEY_PREFIX = "user:{user_id}:offload_preference"
    PREFERENCE_CACHE_TTL = 300  # 5 minutes
    SESSION_PREFERENCE_TTL = 3600  # 1 hour for session-scoped preferences

    async def get_offload_preference(self, user_id: UUID) -> str:
        """
        Get user's offload preference from Redis.

        Args:
            user_id: UUID of the user.

        Returns:
            Preference string: "always_offload", "always_cancel", or "ask_each_time".
        """
        if not self._redis:
            return self.PREFERENCE_ASK_EACH_TIME

        try:
            key = f"user:{user_id}:offload_preference"
            preference = await self._redis.get(key)

            if preference and preference in self.VALID_PREFERENCES:
                return preference

            return self.PREFERENCE_ASK_EACH_TIME

        except Exception as e:
            logger.error(f"Failed to get offload preference for user {user_id}: {e}")
            return self.PREFERENCE_ASK_EACH_TIME

    async def set_offload_preference(
        self, user_id: UUID, preference: str, remember: bool
    ) -> bool:
        """
        Set user's offload preference in Redis.

        Args:
            user_id: UUID of the user.
            preference: One of "always_offload", "always_cancel", "ask_each_time".
            remember: If True, preference persists indefinitely. If False, expires after 1 hour.

        Returns:
            True if preference was set successfully, False otherwise.
        """
        if preference not in self.VALID_PREFERENCES:
            logger.warning(f"Invalid offload preference: {preference}")
            return False

        if not self._redis:
            logger.warning("Redis not available for preference storage")
            return False

        try:
            key = f"user:{user_id}:offload_preference"

            if remember:
                # Persistent preference (no expiration)
                await self._redis.set(key, preference)
            else:
                # Session-scoped preference (1 hour TTL)
                await self._redis.setex(key, self.SESSION_PREFERENCE_TTL, preference)

            logger.info(
                f"Set offload preference for user {user_id}: {preference} "
                f"(persistent: {remember})"
            )
            return True

        except Exception as e:
            logger.error(f"Failed to set offload preference for user {user_id}: {e}")
            return False

    async def should_prompt_user(self, user_id: UUID) -> bool:
        """
        Determine if user should be prompted for offload decision.

        Args:
            user_id: UUID of the user.

        Returns:
            True if preference is "ask_each_time", False otherwise.
        """
        preference = await self.get_offload_preference(user_id)
        return preference == self.PREFERENCE_ASK_EACH_TIME

    # -------------------------------------------------------------------------
    # Operation State Persistence (Redis)
    # -------------------------------------------------------------------------

    OPERATION_STATE_KEY_PREFIX = "operation:{operation_id}:state"
    OPERATION_STATE_TTL = 86400  # 24 hours

    async def save_operation_state(self, operation_id: str, state: dict) -> bool:
        """
        Save operation state to Redis for recovery.

        Args:
            operation_id: Unique identifier for the operation.
            state: Dictionary containing operation state with keys:
                - operation_type: Type of operation (e.g., "load", "offload")
                - resource_id: Resource being operated on
                - user_id: User who initiated the operation
                - status: Current status
                - timestamp: When the operation started
                - metadata: Additional operation-specific data

        Returns:
            True if state was saved successfully, False otherwise.
        """
        if not self._redis:
            logger.warning("Redis not available for operation state storage")
            return False

        try:
            key = f"operation:{operation_id}:state"
            state["timestamp"] = datetime.now(timezone.utc).isoformat()
            await self._redis.setex(key, self.OPERATION_STATE_TTL, json.dumps(state))

            logger.info(f"Saved operation state for {operation_id}: {state.get('status')}")
            return True

        except Exception as e:
            logger.error(f"Failed to save operation state for {operation_id}: {e}")
            return False

    async def get_operation_state(self, operation_id: str) -> Optional[dict]:
        """
        Retrieve operation state from Redis.

        Args:
            operation_id: Unique identifier for the operation.

        Returns:
            Operation state dictionary if found, None otherwise.
        """
        if not self._redis:
            return None

        try:
            key = f"operation:{operation_id}:state"
            state_json = await self._redis.get(key)

            if state_json:
                return json.loads(state_json)

            return None

        except Exception as e:
            logger.error(f"Failed to get operation state for {operation_id}: {e}")
            return None

    async def clear_operation_state(self, operation_id: str) -> bool:
        """
        Delete operation state from Redis.

        Args:
            operation_id: Unique identifier for the operation.

        Returns:
            True if state was deleted successfully, False otherwise.
        """
        if not self._redis:
            return False

        try:
            key = f"operation:{operation_id}:state"
            await self._redis.delete(key)

            logger.info(f"Cleared operation state for {operation_id}")
            return True

        except Exception as e:
            logger.error(f"Failed to clear operation state for {operation_id}: {e}")
            return False

    # -------------------------------------------------------------------------
    # Operation State Recovery
    # -------------------------------------------------------------------------

    async def scan_operation_keys(self) -> List[str]:
        """
        Scan Redis for all operation state keys.

        Returns:
            List of operation IDs extracted from keys.
        """
        if not self._redis:
            return []

        operation_ids: List[str] = []

        try:
            # Use scan_iter to find all operation state keys
            async for key in self._redis.scan_iter(match="operation:*:state"):
                # Extract operation_id from key pattern "operation:{id}:state"
                parts = key.split(":")
                if len(parts) >= 2:
                    operation_ids.append(parts[1])

            logger.debug(f"Found {len(operation_ids)} operation keys in Redis")
            return operation_ids

        except Exception as e:
            logger.error(f"Failed to scan operation keys: {e}")
            return []

    async def recover_operations(self) -> List[dict]:
        """
        Recover in-progress operations from Redis after kernel restart.

        Scans for all operation state keys and returns operations that
        were in 'in_progress' or 'pending' status.

        Returns:
            List of recoverable operation state dictionaries.
        """
        if not self._redis:
            logger.warning("Redis not available for operation recovery")
            return []

        recoverable: List[dict] = []

        try:
            operation_ids = await self.scan_operation_keys()

            for operation_id in operation_ids:
                state = await self.get_operation_state(operation_id)
                if state:
                    status = state.get("status", "")
                    if status in ("in_progress", "pending"):
                        state["operation_id"] = operation_id
                        recoverable.append(state)

            logger.info(f"Found {len(recoverable)} recoverable operations")
            return recoverable

        except Exception as e:
            logger.error(f"Failed to recover operations: {e}")
            return []

    async def restore_operation(self, operation_state: dict) -> bool:
        """
        Attempt to restore a recovered operation.

        Based on operation type, either re-enqueues the operation or marks
        it as failed if it cannot be resumed.

        Args:
            operation_state: Dictionary containing operation details:
                - operation_id: Unique operation identifier
                - operation_type: Type of operation (load, reload, offload)
                - resource_id: Resource being operated on
                - user_id: User who initiated the operation
                - metadata: Additional operation-specific data

        Returns:
            True if operation was restored or marked appropriately, False on error.
        """
        operation_id = operation_state.get("operation_id")
        operation_type = operation_state.get("operation_type")
        resource_id = operation_state.get("resource_id")
        user_id_str = operation_state.get("user_id")

        if not all([operation_id, operation_type, resource_id]):
            logger.warning(f"Invalid operation state for recovery: missing required fields")
            return False

        try:
            user_id = UUID(user_id_str) if user_id_str else None
        except (ValueError, TypeError):
            user_id = None

        try:
            if operation_type == "load":
                # Re-enqueue model load
                if user_id:
                    await self.enqueue_model_load(resource_id, user_id)
                    await self.save_operation_state(operation_id, {
                        **operation_state,
                        "status": "recovered",
                        "recovery_action": "re-enqueued"
                    })
                    logger.info(f"Recovered load operation {operation_id}: re-enqueued")
                    return True
                else:
                    logger.warning(f"Cannot recover load operation {operation_id}: missing user_id")

            elif operation_type == "reload":
                # Attempt to reload from CPU
                estimated_vram = operation_state.get("metadata", {}).get("estimated_vram_mb", 0)
                if estimated_vram > 0:
                    success, preemptable = await self.reload_from_cpu(resource_id, estimated_vram)
                    if success:
                        await self.save_operation_state(operation_id, {
                            **operation_state,
                            "status": "recovered",
                            "recovery_action": "reload-initiated"
                        })
                        logger.info(f"Recovered reload operation {operation_id}")
                        return True
                    elif preemptable:
                        # VRAM insufficient but preemption is possible
                        await self.save_operation_state(operation_id, {
                            **operation_state,
                            "status": "pending_preempt",
                            "recovery_action": "awaiting-preemption",
                            "preemptable_resources": preemptable,
                            "estimated_vram_mb": estimated_vram
                        })
                        logger.info(
                            f"Reload operation {operation_id} pending preemption of "
                            f"{len(preemptable)} resources"
                        )
                        return True

            elif operation_type == "offload":
                # Cannot resume offload operations - mark as failed
                await self.save_operation_state(operation_id, {
                    **operation_state,
                    "status": "failed",
                    "recovery_action": "cannot-resume-offload",
                    "error": "Offload operations cannot be resumed after restart"
                })
                logger.warning(f"Operation {operation_id} (offload) cannot be resumed")
                return True

            # Unknown operation type or recovery failed
            await self.save_operation_state(operation_id, {
                **operation_state,
                "status": "failed",
                "recovery_action": "recovery-failed",
                "error": f"Could not recover operation type: {operation_type}"
            })
            return False

        except Exception as e:
            logger.error(f"Failed to restore operation {operation_id}: {e}")
            try:
                await self.save_operation_state(operation_id, {
                    **operation_state,
                    "status": "failed",
                    "recovery_action": "exception",
                    "error": str(e)
                })
            except Exception:
                pass
            return False
