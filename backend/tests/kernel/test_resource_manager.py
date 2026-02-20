"""Unit tests for the ResourceManager kernel service and VRAMTracker."""

import asyncio
import json
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.kernel.resource_manager import ResourceManager, VRAMTracker
from tests.kernel.test_helpers import (
    assert_redis_key_exists,
    assert_redis_key_ttl,
    make_resource,
)


# =========================================================================
# VRAMTracker Tests
# =========================================================================

class TestVRAMTracker:
    """Tests for VRAMTracker GPU monitoring."""

    @pytest.mark.unit
    def test_get_total_vram(self):
        """get_total_vram_mb returns mocked total VRAM."""
        with patch("app.kernel.resource_manager.VRAMTracker.__init__", return_value=None):
            tracker = VRAMTracker.__new__(VRAMTracker)
            tracker._initialized = True
            tracker._gpu_count = 1

            mock_mem = MagicMock()
            mock_mem.total = 24 * 1024 * 1024 * 1024  # 24 GB in bytes
            mock_pynvml = MagicMock()
            mock_pynvml.nvmlDeviceGetMemoryInfo.return_value = mock_mem
            tracker._pynvml = mock_pynvml
            tracker._gpu_handles = [MagicMock()]

            assert tracker.get_total_vram_mb() == 24576

    @pytest.mark.unit
    def test_get_used_vram(self):
        """get_used_vram_mb returns mocked used VRAM."""
        with patch("app.kernel.resource_manager.VRAMTracker.__init__", return_value=None):
            tracker = VRAMTracker.__new__(VRAMTracker)
            tracker._initialized = True
            tracker._gpu_count = 1

            mock_mem = MagicMock()
            mock_mem.used = 8 * 1024 * 1024 * 1024  # 8 GB
            mock_pynvml = MagicMock()
            mock_pynvml.nvmlDeviceGetMemoryInfo.return_value = mock_mem
            tracker._pynvml = mock_pynvml
            tracker._gpu_handles = [MagicMock()]

            assert tracker.get_used_vram_mb() == 8192

    @pytest.mark.unit
    def test_get_free_vram(self):
        """get_free_vram_mb returns free = total - used from GPU."""
        with patch("app.kernel.resource_manager.VRAMTracker.__init__", return_value=None):
            tracker = VRAMTracker.__new__(VRAMTracker)
            tracker._initialized = True
            tracker._gpu_count = 1

            mock_mem = MagicMock()
            mock_mem.free = 16 * 1024 * 1024 * 1024  # 16 GB
            mock_pynvml = MagicMock()
            mock_pynvml.nvmlDeviceGetMemoryInfo.return_value = mock_mem
            tracker._pynvml = mock_pynvml
            tracker._gpu_handles = [MagicMock()]

            assert tracker.get_free_vram_mb() == 16384

    @pytest.mark.unit
    def test_get_vram_stats(self):
        """get_vram_stats returns complete stats dictionary."""
        with patch("app.kernel.resource_manager.VRAMTracker.__init__", return_value=None):
            tracker = VRAMTracker.__new__(VRAMTracker)
            tracker._initialized = True
            tracker._gpu_count = 1

            mock_mem = MagicMock()
            mock_mem.total = 24 * 1024 * 1024 * 1024
            mock_mem.used = 8 * 1024 * 1024 * 1024
            mock_mem.free = 16 * 1024 * 1024 * 1024
            mock_pynvml = MagicMock()
            mock_pynvml.nvmlDeviceGetMemoryInfo.return_value = mock_mem
            tracker._pynvml = mock_pynvml
            tracker._gpu_handles = [MagicMock()]

            stats = tracker.get_vram_stats()
            assert stats["total_mb"] == 24576
            assert stats["used_mb"] == 8192
            assert stats["free_mb"] == 16384
            assert stats["gpu_count"] == 1
            assert 0 <= stats["utilization_percent"] <= 100

    @pytest.mark.unit
    def test_cleanup_calls_shutdown(self):
        """cleanup() calls nvmlShutdown."""
        with patch("app.kernel.resource_manager.VRAMTracker.__init__", return_value=None):
            tracker = VRAMTracker.__new__(VRAMTracker)
            tracker._initialized = True
            tracker._gpu_count = 1
            tracker._gpu_handles = [MagicMock()]
            mock_pynvml = MagicMock()
            tracker._pynvml = mock_pynvml

            tracker.cleanup()

            mock_pynvml.nvmlShutdown.assert_called_once()
            assert not tracker._initialized
            assert tracker._gpu_handles == []
            assert tracker._gpu_count == 0

    @pytest.mark.unit
    def test_cleanup_idempotent(self):
        """cleanup() is safe to call when not initialized."""
        with patch("app.kernel.resource_manager.VRAMTracker.__init__", return_value=None):
            tracker = VRAMTracker.__new__(VRAMTracker)
            tracker._initialized = False
            tracker._gpu_count = 0
            tracker._gpu_handles = []

            tracker.cleanup()  # should not raise

    @pytest.mark.unit
    def test_pynvml_unavailable(self):
        """VRAMTracker raises RuntimeError when pynvml is not available."""
        with patch.dict("sys.modules", {"pynvml": None}):
            with pytest.raises(RuntimeError, match="NVIDIA drivers not available"):
                VRAMTracker()

    @pytest.mark.unit
    def test_not_initialized_returns_zero(self):
        """VRAM methods return 0 when tracker is not initialized."""
        with patch("app.kernel.resource_manager.VRAMTracker.__init__", return_value=None):
            tracker = VRAMTracker.__new__(VRAMTracker)
            tracker._initialized = False
            tracker._gpu_count = 0
            tracker._gpu_handles = []

            assert tracker.get_total_vram_mb() == 0
            assert tracker.get_used_vram_mb() == 0
            assert tracker.get_free_vram_mb() == 0


# =========================================================================
# ResourceManager Lifecycle Tests
# =========================================================================

class TestResourceManagerLifecycle:
    """Tests for ResourceManager startup/shutdown/health."""

    @pytest.mark.unit
    async def test_startup_initializes(self, mock_session_factory, mock_redis):
        """startup() initializes the service and sets running=True."""
        rm = ResourceManager(
            session_factory=mock_session_factory,
            redis_client=mock_redis,
        )
        with patch.object(ResourceManager, '_vram_monitor_loop', new_callable=AsyncMock):
            with patch("app.kernel.resource_manager.VRAMTracker", side_effect=RuntimeError("no GPU")):
                await rm.startup()

        assert rm.is_running
        assert rm.name == "resource_manager"
        await rm.shutdown()

    @pytest.mark.unit
    async def test_startup_idempotent(self, mock_session_factory, mock_redis):
        """Calling startup() twice does not error."""
        rm = ResourceManager(
            session_factory=mock_session_factory,
            redis_client=mock_redis,
        )
        with patch.object(ResourceManager, '_vram_monitor_loop', new_callable=AsyncMock):
            with patch("app.kernel.resource_manager.VRAMTracker", side_effect=RuntimeError("no GPU")):
                await rm.startup()
                await rm.startup()  # second call

        assert rm.is_running
        await rm.shutdown()

    @pytest.mark.unit
    async def test_shutdown_cancels_monitor(self, mock_session_factory, mock_redis):
        """shutdown() cancels monitor task and closes Redis."""
        rm = ResourceManager(
            session_factory=mock_session_factory,
            redis_client=mock_redis,
        )
        with patch.object(ResourceManager, '_vram_monitor_loop', new_callable=AsyncMock):
            with patch("app.kernel.resource_manager.VRAMTracker", side_effect=RuntimeError("no GPU")):
                await rm.startup()

        await rm.shutdown()

        assert not rm.is_running
        assert rm._monitor_task is None
        assert rm._vram_tracker is None

    @pytest.mark.unit
    async def test_shutdown_handles_partial_init(self, mock_session_factory, mock_redis):
        """shutdown() handles partial initialization gracefully."""
        rm = ResourceManager(
            session_factory=mock_session_factory,
            redis_client=mock_redis,
        )
        # Don't call startup — shutdown should still be safe
        await rm.shutdown()
        assert not rm.is_running

    @pytest.mark.unit
    async def test_health_check_running(self, mock_session_factory, mock_redis, mock_vram_tracker):
        """health_check returns (True, 'ok') when running with VRAM tracker."""
        rm = ResourceManager(
            session_factory=mock_session_factory,
            redis_client=mock_redis,
        )
        rm._running = True
        rm._vram_tracker = mock_vram_tracker

        healthy, message = await rm.health_check()
        assert healthy is True
        assert message == "ok"

    @pytest.mark.unit
    async def test_health_check_not_running(self, mock_session_factory, mock_redis):
        """health_check returns (False, 'not running') when stopped."""
        rm = ResourceManager(
            session_factory=mock_session_factory,
            redis_client=mock_redis,
        )

        healthy, message = await rm.health_check()
        assert healthy is False
        assert "not running" in message

    @pytest.mark.unit
    async def test_health_check_no_vram_tracker(self, mock_session_factory, mock_redis):
        """health_check returns degraded when VRAM tracker is None."""
        rm = ResourceManager(
            session_factory=mock_session_factory,
            redis_client=mock_redis,
        )
        rm._running = True
        rm._vram_tracker = None

        healthy, message = await rm.health_check()
        assert healthy is False
        assert "degraded" in message


# =========================================================================
# Priority Scoring Tests
# =========================================================================

class TestPriorityScoring:
    """Tests for ResourceManager.calculate_priority_score()."""

    @pytest.fixture
    def rm(self, mock_session_factory, mock_redis):
        return ResourceManager(
            session_factory=mock_session_factory,
            redis_client=mock_redis,
        )

    @pytest.mark.unit
    def test_base_priority_only(self, rm):
        """Score equals base_priority when no other factors apply."""
        resource = make_resource(base_priority=10, user_locked=False, vram_mb=None, last_used_at=None)
        score = rm.calculate_priority_score(resource)
        assert score == 10.0

    @pytest.mark.unit
    def test_user_lock_boost(self, rm):
        """User lock adds +1000 to priority."""
        resource = make_resource(base_priority=0, user_locked=True, vram_mb=None, last_used_at=None)
        score = rm.calculate_priority_score(resource)
        assert score == 1000.0

    @pytest.mark.unit
    def test_recency_bonus(self, rm):
        """Recent access gives higher bonus (168 - hours_since_use)."""
        now = datetime.now(timezone.utc)
        resource = make_resource(
            base_priority=0, user_locked=False, vram_mb=None,
            last_used_at=now - timedelta(hours=1)
        )
        score = rm.calculate_priority_score(resource)
        # Recency bonus ≈ 168 - 1 = 167
        assert 166.0 <= score <= 168.0

    @pytest.mark.unit
    def test_vram_penalty(self, rm):
        """Larger models get penalized by vram_mb/1000."""
        resource = make_resource(
            base_priority=0, user_locked=False, vram_mb=8000, last_used_at=None
        )
        score = rm.calculate_priority_score(resource)
        assert score == -8.0  # -8000/1000

    @pytest.mark.unit
    def test_combined_scoring(self, rm):
        """Combined scoring with all factors."""
        now = datetime.now(timezone.utc)
        resource = make_resource(
            base_priority=50,
            user_locked=True,
            vram_mb=4000,
            last_used_at=now - timedelta(hours=2),
        )
        score = rm.calculate_priority_score(resource)
        # 50 + 1000 + ~166 - 4 = ~1212
        assert score > 1200
        assert score < 1220

    @pytest.mark.unit
    def test_recency_capped_at_one_week(self, rm):
        """Recency bonus is capped at 168 hours (1 week)."""
        old_time = datetime.now(timezone.utc) - timedelta(days=30)
        resource = make_resource(
            base_priority=0, user_locked=False, vram_mb=None, last_used_at=old_time
        )
        score = rm.calculate_priority_score(resource)
        # hours_since_use capped to 168, so bonus = 168 - 168 = 0
        assert score == 0.0


# =========================================================================
# Model Loading Queue Tests
# =========================================================================

class TestModelLoadingQueue:
    """Tests for the priority loading queue."""

    @pytest.fixture
    def rm(self, mock_session_factory, mock_redis):
        return ResourceManager(
            session_factory=mock_session_factory,
            redis_client=mock_redis,
        )

    @pytest.mark.unit
    async def test_enqueue_model_load(self, rm, mock_db_session):
        """enqueue_model_load adds to the priority queue."""
        resource = make_resource(resource_id="model-1", base_priority=10)
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = resource
        mock_db_session.execute.return_value = mock_result

        user_id = uuid.uuid4()
        await rm.enqueue_model_load("model-1", user_id)

        assert rm.get_queue_size() == 1

    @pytest.mark.unit
    async def test_get_next_model_returns_highest_priority(self, rm):
        """get_next_model_to_load returns the highest-priority model."""
        now = datetime.now(timezone.utc).timestamp()
        # Higher score = lower negative value = higher priority
        await rm._load_queue.put((-100, now, "model-low", str(uuid.uuid4())))
        await rm._load_queue.put((-500, now + 1, "model-high", str(uuid.uuid4())))

        result = await rm.get_next_model_to_load()
        assert result is not None
        assert result[0] == "model-high"

    @pytest.mark.unit
    async def test_get_next_model_empty_queue(self, rm):
        """get_next_model_to_load returns None when queue is empty."""
        result = await rm.get_next_model_to_load()
        assert result is None

    @pytest.mark.unit
    def test_get_queue_size(self, rm):
        """get_queue_size returns correct count."""
        assert rm.get_queue_size() == 0


# =========================================================================
# Preemption Algorithm Tests
# =========================================================================

class TestPreemption:
    """Tests for the LRU-based preemption algorithm."""

    @pytest.mark.unit
    async def test_find_preemptable_excludes_locked(self, mock_session_factory, mock_redis):
        """find_preemptable_resources excludes user-locked resources."""
        locked = make_resource(resource_id="locked", user_locked=True, vram_mb=4000)
        unlocked = make_resource(resource_id="unlocked", user_locked=False, vram_mb=4000)

        rm = ResourceManager(session_factory=mock_session_factory, redis_client=mock_redis)
        with patch.object(rm, 'get_loaded_resources', new_callable=AsyncMock) as mock_loaded:
            mock_loaded.return_value = [locked, unlocked]
            result = await rm.find_preemptable_resources(required_vram_mb=4000)

        assert "unlocked" in result
        assert "locked" not in result

    @pytest.mark.unit
    async def test_find_preemptable_lru_order(self, mock_session_factory, mock_redis):
        """Preemption selects resources in LRU order."""
        now = datetime.now(timezone.utc)
        old = make_resource(
            resource_id="old", user_locked=False, vram_mb=2000,
            last_used_at=now - timedelta(hours=10)
        )
        recent = make_resource(
            resource_id="recent", user_locked=False, vram_mb=2000,
            last_used_at=now - timedelta(hours=1)
        )

        rm = ResourceManager(session_factory=mock_session_factory, redis_client=mock_redis)
        with patch.object(rm, 'get_loaded_resources', new_callable=AsyncMock) as mock_loaded:
            # Simulate LRU ordering (old first)
            mock_loaded.return_value = [old, recent]
            result = await rm.find_preemptable_resources(required_vram_mb=2000)

        assert result == ["old"]

    @pytest.mark.unit
    async def test_preempt_resource_updates_status(self, mock_session_factory, mock_redis, mock_db_session):
        """preempt_resource updates status to 'unloading'."""
        resource = make_resource(resource_id="target", user_locked=False, vram_mb=4000)
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = resource
        mock_db_session.execute.return_value = mock_result

        rm = ResourceManager(session_factory=mock_session_factory, redis_client=mock_redis)
        success = await rm.preempt_resource("target")

        assert success is True
        assert resource.status == "unloading"
        mock_db_session.commit.assert_awaited_once()

    @pytest.mark.unit
    async def test_preempt_locked_resource_fails(self, mock_session_factory, mock_redis, mock_db_session):
        """preempt_resource returns False for user-locked resources."""
        resource = make_resource(resource_id="locked", user_locked=True)
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = resource
        mock_db_session.execute.return_value = mock_result

        rm = ResourceManager(session_factory=mock_session_factory, redis_client=mock_redis)
        success = await rm.preempt_resource("locked")

        assert success is False

    @pytest.mark.unit
    async def test_preempt_nonexistent_resource(self, mock_session_factory, mock_redis, mock_db_session):
        """preempt_resource returns False for missing resources."""
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_db_session.execute.return_value = mock_result

        rm = ResourceManager(session_factory=mock_session_factory, redis_client=mock_redis)
        success = await rm.preempt_resource("nonexistent")

        assert success is False

    @pytest.mark.unit
    async def test_find_preemptable_no_candidates(self, mock_session_factory, mock_redis):
        """find_preemptable_resources returns empty when all locked."""
        locked = make_resource(resource_id="locked1", user_locked=True, vram_mb=8000)

        rm = ResourceManager(session_factory=mock_session_factory, redis_client=mock_redis)
        with patch.object(rm, 'get_loaded_resources', new_callable=AsyncMock) as mock_loaded:
            mock_loaded.return_value = [locked]
            result = await rm.find_preemptable_resources(required_vram_mb=4000)

        assert result == []


# =========================================================================
# CPU Offloading Tests
# =========================================================================

class TestCPUOffloading:
    """Tests for CPU offloading operations."""

    @pytest.mark.unit
    async def test_offload_to_cpu(self, mock_session_factory, mock_redis, mock_db_session):
        """offload_to_cpu updates resource status and frees VRAM."""
        resource = make_resource(resource_id="offload-me", vram_mb=4000, status="loaded")
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = resource
        mock_db_session.execute.return_value = mock_result

        rm = ResourceManager(session_factory=mock_session_factory, redis_client=mock_redis)
        rm._running = True

        success = await rm.offload_to_cpu("offload-me", uuid.uuid4())

        assert success is True
        assert resource.status == "cpu_offloaded"
        assert resource.vram_mb == 0

    @pytest.mark.unit
    async def test_offload_nonexistent_resource(self, mock_session_factory, mock_redis, mock_db_session):
        """offload_to_cpu returns False for missing resources."""
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_db_session.execute.return_value = mock_result

        rm = ResourceManager(session_factory=mock_session_factory, redis_client=mock_redis)
        success = await rm.offload_to_cpu("missing", uuid.uuid4())
        assert success is False

    @pytest.mark.unit
    async def test_reload_from_cpu_checks_vram(self, mock_session_factory, mock_redis, mock_db_session):
        """reload_from_cpu checks VRAM availability."""
        resource = make_resource(resource_id="reload-me", status="cpu_offloaded")
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = resource
        mock_db_session.execute.return_value = mock_result

        rm = ResourceManager(session_factory=mock_session_factory, redis_client=mock_redis)
        rm._running = True

        # Mock VRAM as available
        with patch.object(rm, 'check_vram_availability', new_callable=AsyncMock) as mock_check:
            mock_check.return_value = (True, [])
            with patch.object(rm, 'refresh_vram_cache', new_callable=AsyncMock):
                success, preemptable = await rm.reload_from_cpu("reload-me", 4000)

        assert success is True
        assert preemptable == []


# =========================================================================
# Session Preference Tests
# =========================================================================

class TestSessionPreferences:
    """Tests for user offload preference storage."""

    @pytest.fixture
    def rm(self, mock_session_factory, mock_redis):
        rm = ResourceManager(session_factory=mock_session_factory, redis_client=mock_redis)
        rm._redis = mock_redis
        return rm

    @pytest.mark.unit
    async def test_get_preference_default(self, rm):
        """Default preference is ask_each_time."""
        user_id = uuid.uuid4()
        pref = await rm.get_offload_preference(user_id)
        assert pref == "ask_each_time"

    @pytest.mark.unit
    async def test_set_and_get_preference(self, rm):
        """Set and retrieve a preference."""
        user_id = uuid.uuid4()
        await rm.set_offload_preference(user_id, "always_offload", remember=False)
        pref = await rm.get_offload_preference(user_id)
        assert pref == "always_offload"

    @pytest.mark.unit
    async def test_set_invalid_preference(self, rm):
        """Invalid preference is rejected."""
        user_id = uuid.uuid4()
        result = await rm.set_offload_preference(user_id, "invalid", remember=False)
        assert result is False

    @pytest.mark.unit
    async def test_should_prompt_user_true(self, rm):
        """should_prompt_user returns True for ask_each_time."""
        user_id = uuid.uuid4()
        assert await rm.should_prompt_user(user_id) is True

    @pytest.mark.unit
    async def test_should_prompt_user_false(self, rm):
        """should_prompt_user returns False for always_offload."""
        user_id = uuid.uuid4()
        await rm.set_offload_preference(user_id, "always_offload", remember=True)
        assert await rm.should_prompt_user(user_id) is False

    @pytest.mark.unit
    async def test_session_preference_with_ttl(self, rm):
        """Session-scoped preference uses TTL."""
        user_id = uuid.uuid4()
        await rm.set_offload_preference(user_id, "always_cancel", remember=False)
        key = f"user:{user_id}:offload_preference"
        ttl = await rm._redis.ttl(key)
        assert ttl > 0
        assert ttl <= rm.SESSION_PREFERENCE_TTL

    @pytest.mark.unit
    async def test_persistent_preference_no_ttl(self, rm):
        """Persistent preference has no TTL (returns -1)."""
        user_id = uuid.uuid4()
        await rm.set_offload_preference(user_id, "always_offload", remember=True)
        key = f"user:{user_id}:offload_preference"
        ttl = await rm._redis.ttl(key)
        assert ttl == -1  # No expiration


# =========================================================================
# Operation Recovery Tests
# =========================================================================

class TestOperationRecovery:
    """Tests for operation state persistence and recovery."""

    @pytest.fixture
    def rm(self, mock_session_factory, mock_redis):
        rm = ResourceManager(session_factory=mock_session_factory, redis_client=mock_redis)
        rm._redis = mock_redis
        return rm

    @pytest.mark.unit
    async def test_save_operation_state(self, rm):
        """save_operation_state persists to Redis with TTL."""
        state = {
            "operation_type": "load",
            "resource_id": "model-1",
            "user_id": str(uuid.uuid4()),
            "status": "in_progress",
        }
        result = await rm.save_operation_state("op-1", state)
        assert result is True
        await assert_redis_key_exists(rm._redis, "operation:op-1:state")

    @pytest.mark.unit
    async def test_save_operation_state_ttl(self, rm):
        """Operation state has 24h TTL."""
        state = {"status": "in_progress"}
        await rm.save_operation_state("op-ttl", state)
        await assert_redis_key_ttl(rm._redis, "operation:op-ttl:state", rm.OPERATION_STATE_TTL)

    @pytest.mark.unit
    async def test_get_operation_state(self, rm):
        """get_operation_state retrieves saved state."""
        state = {"operation_type": "load", "status": "in_progress"}
        await rm.save_operation_state("op-get", state)

        retrieved = await rm.get_operation_state("op-get")
        assert retrieved is not None
        assert retrieved["operation_type"] == "load"
        assert retrieved["status"] == "in_progress"

    @pytest.mark.unit
    async def test_get_operation_state_missing(self, rm):
        """get_operation_state returns None for missing operations."""
        result = await rm.get_operation_state("nonexistent")
        assert result is None

    @pytest.mark.unit
    async def test_clear_operation_state(self, rm):
        """clear_operation_state deletes the key."""
        await rm.save_operation_state("op-clear", {"status": "done"})
        result = await rm.clear_operation_state("op-clear")
        assert result is True

        retrieved = await rm.get_operation_state("op-clear")
        assert retrieved is None

    @pytest.mark.unit
    async def test_recover_operations(self, rm):
        """recover_operations finds in_progress and pending operations."""
        await rm.save_operation_state("op-1", {"status": "in_progress", "operation_type": "load"})
        await rm.save_operation_state("op-2", {"status": "pending", "operation_type": "reload"})
        await rm.save_operation_state("op-3", {"status": "completed", "operation_type": "offload"})

        recoverable = await rm.recover_operations()
        assert len(recoverable) == 2
        op_ids = {op["operation_id"] for op in recoverable}
        assert "op-1" in op_ids
        assert "op-2" in op_ids

    @pytest.mark.unit
    async def test_restore_load_operation(self, rm, mock_db_session):
        """restore_operation re-enqueues load operations."""
        resource = make_resource(resource_id="model-1")
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = resource
        mock_db_session.execute.return_value = mock_result

        user_id = uuid.uuid4()
        state = {
            "operation_id": "op-load",
            "operation_type": "load",
            "resource_id": "model-1",
            "user_id": str(user_id),
            "status": "in_progress",
        }
        result = await rm.restore_operation(state)
        assert result is True
        assert rm.get_queue_size() == 1

    @pytest.mark.unit
    async def test_restore_offload_operation_fails(self, rm):
        """Offload operations cannot be resumed."""
        state = {
            "operation_id": "op-offload",
            "operation_type": "offload",
            "resource_id": "model-1",
            "user_id": str(uuid.uuid4()),
            "status": "in_progress",
        }
        result = await rm.restore_operation(state)
        assert result is True  # marked as failed, not an error

        saved = await rm.get_operation_state("op-offload")
        assert saved["status"] == "failed"
        assert "cannot-resume-offload" in saved["recovery_action"]

    @pytest.mark.unit
    async def test_restore_invalid_state(self, rm):
        """restore_operation returns False for missing required fields."""
        state = {"operation_id": "op-bad"}  # missing operation_type and resource_id
        result = await rm.restore_operation(state)
        assert result is False


# =========================================================================
# VRAM Caching Tests
# =========================================================================

class TestVRAMCaching:
    """Tests for VRAM stats Redis caching."""

    @pytest.mark.unit
    async def test_cached_vram_stats_hit(self, mock_session_factory, mock_redis):
        """get_cached_vram_stats returns cached stats within TTL."""
        stats = {"total_mb": 24576, "used_mb": 8192, "free_mb": 16384}
        await mock_redis.setex("vram:stats", 1, json.dumps(stats))

        rm = ResourceManager(session_factory=mock_session_factory, redis_client=mock_redis)
        result = await rm.get_cached_vram_stats()
        assert result["total_mb"] == 24576

    @pytest.mark.unit
    async def test_cached_vram_stats_miss(self, mock_session_factory, mock_redis, mock_vram_tracker):
        """Cache miss triggers refresh from VRAMTracker."""
        rm = ResourceManager(session_factory=mock_session_factory, redis_client=mock_redis)
        rm._vram_tracker = mock_vram_tracker

        result = await rm.get_cached_vram_stats()
        assert result["total_mb"] == 24576
        # Verify cache was populated
        await assert_redis_key_exists(mock_redis, "vram:stats")

    @pytest.mark.unit
    async def test_refresh_vram_cache(self, mock_session_factory, mock_redis, mock_vram_tracker):
        """refresh_vram_cache updates Redis with fresh stats."""
        rm = ResourceManager(session_factory=mock_session_factory, redis_client=mock_redis)
        rm._vram_tracker = mock_vram_tracker

        await rm.refresh_vram_cache()

        cached = await mock_redis.get("vram:stats")
        assert cached is not None
        data = json.loads(cached)
        assert data["total_mb"] == 24576

    @pytest.mark.unit
    async def test_empty_stats_without_gpu(self, mock_session_factory, mock_redis):
        """Returns empty stats when no GPU available."""
        rm = ResourceManager(session_factory=mock_session_factory, redis_client=mock_redis)
        rm._vram_tracker = None

        result = await rm.get_cached_vram_stats()
        assert result["total_mb"] == 0
        assert result["gpu_count"] == 0


# =========================================================================
# Per-GPU Stats - VRAMTracker Tests
# =========================================================================

class TestPerGpuStatsTracker:
    """Tests for VRAMTracker.get_per_gpu_stats()."""

    @pytest.mark.unit
    def test_get_per_gpu_stats_not_initialized(self):
        """Returns empty list when tracker is not initialized."""
        with patch("app.kernel.resource_manager.VRAMTracker.__init__", return_value=None):
            tracker = VRAMTracker.__new__(VRAMTracker)
            tracker._initialized = False
            tracker._gpu_handles = []

            assert tracker.get_per_gpu_stats() == []

    @pytest.mark.unit
    def test_get_per_gpu_stats_single_gpu(self):
        """Returns correct stats for a single GPU."""
        with patch("app.kernel.resource_manager.VRAMTracker.__init__", return_value=None):
            tracker = VRAMTracker.__new__(VRAMTracker)
            tracker._initialized = True
            tracker._gpu_count = 1

            mock_mem = MagicMock()
            mock_mem.total = 24 * 1024 * 1024 * 1024
            mock_mem.used = 8 * 1024 * 1024 * 1024
            mock_mem.free = 16 * 1024 * 1024 * 1024

            mock_pynvml = MagicMock()
            mock_pynvml.nvmlDeviceGetMemoryInfo.return_value = mock_mem
            mock_pynvml.nvmlDeviceGetName.return_value = "NVIDIA GeForce RTX 4090"
            tracker._pynvml = mock_pynvml
            tracker._gpu_handles = [MagicMock()]

            result = tracker.get_per_gpu_stats()
            assert len(result) == 1
            gpu = result[0]
            assert gpu["gpu_index"] == 0
            assert gpu["name"] == "NVIDIA GeForce RTX 4090"
            assert gpu["total_mb"] == 24576
            assert gpu["used_mb"] == 8192
            assert gpu["free_mb"] == 16384
            assert gpu["utilization_percent"] == 33.33

    @pytest.mark.unit
    def test_get_per_gpu_stats_multi_gpu(self):
        """Returns independent stats for multiple GPUs."""
        with patch("app.kernel.resource_manager.VRAMTracker.__init__", return_value=None):
            tracker = VRAMTracker.__new__(VRAMTracker)
            tracker._initialized = True
            tracker._gpu_count = 2

            mem0 = MagicMock(total=24 * 1024**3, used=8 * 1024**3, free=16 * 1024**3)
            mem1 = MagicMock(total=16 * 1024**3, used=4 * 1024**3, free=12 * 1024**3)

            mock_pynvml = MagicMock()
            handle0, handle1 = MagicMock(), MagicMock()
            mock_pynvml.nvmlDeviceGetMemoryInfo.side_effect = lambda h: mem0 if h is handle0 else mem1
            mock_pynvml.nvmlDeviceGetName.side_effect = lambda h: "RTX 4090" if h is handle0 else "RTX 3080"
            tracker._pynvml = mock_pynvml
            tracker._gpu_handles = [handle0, handle1]

            result = tracker.get_per_gpu_stats()
            assert len(result) == 2
            assert result[0]["gpu_index"] == 0
            assert result[0]["total_mb"] == 24576
            assert result[1]["gpu_index"] == 1
            assert result[1]["total_mb"] == 16384

    @pytest.mark.unit
    def test_get_per_gpu_stats_name_bytes(self):
        """Handles GPU name returned as bytes."""
        with patch("app.kernel.resource_manager.VRAMTracker.__init__", return_value=None):
            tracker = VRAMTracker.__new__(VRAMTracker)
            tracker._initialized = True
            tracker._gpu_count = 1

            mock_mem = MagicMock(total=16 * 1024**3, used=2 * 1024**3, free=14 * 1024**3)
            mock_pynvml = MagicMock()
            mock_pynvml.nvmlDeviceGetMemoryInfo.return_value = mock_mem
            mock_pynvml.nvmlDeviceGetName.return_value = b"Tesla T4"
            tracker._pynvml = mock_pynvml
            tracker._gpu_handles = [MagicMock()]

            result = tracker.get_per_gpu_stats()
            assert result[0]["name"] == "Tesla T4"

    @pytest.mark.unit
    def test_get_per_gpu_stats_zero_total(self):
        """Returns 0% utilization when total VRAM is zero."""
        with patch("app.kernel.resource_manager.VRAMTracker.__init__", return_value=None):
            tracker = VRAMTracker.__new__(VRAMTracker)
            tracker._initialized = True
            tracker._gpu_count = 1

            mock_mem = MagicMock(total=0, used=0, free=0)
            mock_pynvml = MagicMock()
            mock_pynvml.nvmlDeviceGetMemoryInfo.return_value = mock_mem
            mock_pynvml.nvmlDeviceGetName.return_value = "Unknown GPU"
            tracker._pynvml = mock_pynvml
            tracker._gpu_handles = [MagicMock()]

            result = tracker.get_per_gpu_stats()
            assert result[0]["utilization_percent"] == 0.0


# =========================================================================
# Per-GPU Stats - ResourceManager Delegate Tests
# =========================================================================

class TestPerGpuStatsDelegate:
    """Tests for ResourceManager.get_per_gpu_stats() delegation."""

    @pytest.mark.unit
    def test_get_per_gpu_stats_no_tracker(self, mock_session_factory, mock_redis):
        """Returns empty list when no VRAM tracker is available."""
        rm = ResourceManager(session_factory=mock_session_factory, redis_client=mock_redis)
        rm._vram_tracker = None
        assert rm.get_per_gpu_stats() == []

    @pytest.mark.unit
    def test_get_per_gpu_stats_delegates(self, mock_session_factory, mock_redis, mock_vram_tracker):
        """Delegates to VRAMTracker and returns its result."""
        rm = ResourceManager(session_factory=mock_session_factory, redis_client=mock_redis)
        rm._vram_tracker = mock_vram_tracker
        result = rm.get_per_gpu_stats()
        assert len(result) == 1
        assert result[0]["name"] == "NVIDIA GeForce RTX 4090"
        mock_vram_tracker.get_per_gpu_stats.assert_called_once()


# =========================================================================
# Per-GPU Stats - API Endpoint Tests
# =========================================================================

class TestPerGpuStatsEndpoints:
    """Tests for the per-GPU VRAM API endpoints."""

    @pytest.fixture
    def mock_rm(self, mock_vram_tracker):
        """Create a mock ResourceManager with per-GPU stats."""
        rm = MagicMock(spec=ResourceManager)
        rm.get_cached_vram_stats = AsyncMock(return_value={
            "total_mb": 24576, "used_mb": 8192, "free_mb": 16384,
            "utilization_percent": 33.33, "gpu_count": 1,
        })
        rm.get_per_gpu_stats = MagicMock(return_value=[
            {"gpu_index": 0, "name": "NVIDIA GeForce RTX 4090",
             "total_mb": 24576, "used_mb": 8192, "free_mb": 16384,
             "utilization_percent": 33.33}
        ])
        return rm

    @pytest.fixture
    def test_app(self, mock_rm):
        """Create a FastAPI test app with dependency overrides."""
        from fastapi import FastAPI
        from app.api.resources import router, get_resource_manager

        app = FastAPI()
        app.include_router(router, prefix="/api")
        app.dependency_overrides[get_resource_manager] = lambda: mock_rm
        return app

    @pytest.mark.unit
    async def test_get_per_gpu_vram_stats(self, test_app, mock_rm):
        """GET /api/resources/vram/gpus returns 200 with GPU list."""
        from httpx import ASGITransport, AsyncClient

        async with AsyncClient(transport=ASGITransport(app=test_app), base_url="http://test") as ac:
            resp = await ac.get("/api/resources/vram/gpus")

        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["name"] == "NVIDIA GeForce RTX 4090"
        assert data[0]["gpu_index"] == 0

    @pytest.mark.unit
    async def test_get_vram_includes_per_gpu(self, test_app, mock_rm):
        """GET /api/resources/vram includes per_gpu field."""
        from httpx import ASGITransport, AsyncClient

        async with AsyncClient(transport=ASGITransport(app=test_app), base_url="http://test") as ac:
            resp = await ac.get("/api/resources/vram")

        assert resp.status_code == 200
        data = resp.json()
        assert "per_gpu" in data
        assert len(data["per_gpu"]) == 1
        assert data["per_gpu"][0]["name"] == "NVIDIA GeForce RTX 4090"

    @pytest.mark.unit
    async def test_get_per_gpu_vram_stats_empty(self, test_app, mock_rm):
        """GET /api/resources/vram/gpus with no GPUs returns empty list."""
        mock_rm.get_per_gpu_stats.return_value = []
        from httpx import ASGITransport, AsyncClient

        async with AsyncClient(transport=ASGITransport(app=test_app), base_url="http://test") as ac:
            resp = await ac.get("/api/resources/vram/gpus")

        assert resp.status_code == 200
        assert resp.json() == []


# =========================================================================
# Offload & Reload Endpoint Tests
# =========================================================================

class TestOffloadReloadEndpoints:
    """Tests for the CPU offload/reload API endpoints."""

    USER_ID = "550e8400-e29b-41d4-a716-446655440000"

    @pytest.fixture
    def mock_rm(self, mock_vram_tracker):
        """Create a mock ResourceManager with offload/reload stubs."""
        rm = MagicMock(spec=ResourceManager)
        rm.get_cached_vram_stats = AsyncMock(return_value={
            "total_mb": 24576, "used_mb": 8192, "free_mb": 16384,
            "utilization_percent": 33.33, "gpu_count": 1,
        })
        rm.get_per_gpu_stats = MagicMock(return_value=[
            {"gpu_index": 0, "name": "NVIDIA GeForce RTX 4090",
             "total_mb": 24576, "used_mb": 8192, "free_mb": 16384,
             "utilization_percent": 33.33}
        ])
        rm.get_offload_preference = AsyncMock(return_value="ask_each_time")
        rm.offload_to_cpu = AsyncMock(return_value=True)
        rm.set_offload_preference = AsyncMock(return_value=True)
        rm.reload_from_cpu = AsyncMock(return_value=(True, []))
        rm.preempt_resource = AsyncMock(return_value=True)
        # Expose preference constants
        rm.PREFERENCE_ALWAYS_OFFLOAD = ResourceManager.PREFERENCE_ALWAYS_OFFLOAD
        rm.PREFERENCE_ALWAYS_CANCEL = ResourceManager.PREFERENCE_ALWAYS_CANCEL
        return rm

    @pytest.fixture
    def test_app(self, mock_rm):
        """Create a FastAPI test app with dependency overrides."""
        from fastapi import FastAPI
        from app.api.resources import router, get_resource_manager

        app = FastAPI()
        app.include_router(router, prefix="/api")
        app.dependency_overrides[get_resource_manager] = lambda: mock_rm
        return app

    # ----- Offload endpoint -----

    @pytest.mark.unit
    async def test_offload_decision_offload(self, test_app, mock_rm):
        """POST /offload with decision=offload succeeds and saves preference."""
        from httpx import ASGITransport, AsyncClient

        async with AsyncClient(transport=ASGITransport(app=test_app), base_url="http://test") as ac:
            resp = await ac.post("/api/resources/offload", json={
                "resource_id": "model-a",
                "user_id": self.USER_ID,
                "decision": "offload",
                "remember": False,
            })

        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        mock_rm.offload_to_cpu.assert_awaited_once_with("model-a", uuid.UUID(self.USER_ID))
        mock_rm.set_offload_preference.assert_awaited_once()

    @pytest.mark.unit
    async def test_offload_decision_cancel(self, test_app, mock_rm):
        """POST /offload with decision=cancel does not call offload_to_cpu."""
        from httpx import ASGITransport, AsyncClient

        async with AsyncClient(transport=ASGITransport(app=test_app), base_url="http://test") as ac:
            resp = await ac.post("/api/resources/offload", json={
                "resource_id": "model-a",
                "user_id": self.USER_ID,
                "decision": "cancel",
                "remember": False,
            })

        assert resp.status_code == 200
        assert resp.json()["success"] is True
        mock_rm.offload_to_cpu.assert_not_awaited()
        mock_rm.set_offload_preference.assert_awaited_once()

    @pytest.mark.unit
    async def test_offload_auto_offload_preference(self, test_app, mock_rm):
        """POST /offload auto-offloads when stored preference is always_offload."""
        mock_rm.get_offload_preference.return_value = ResourceManager.PREFERENCE_ALWAYS_OFFLOAD
        from httpx import ASGITransport, AsyncClient

        async with AsyncClient(transport=ASGITransport(app=test_app), base_url="http://test") as ac:
            resp = await ac.post("/api/resources/offload", json={
                "resource_id": "model-a",
                "user_id": self.USER_ID,
                "decision": "cancel",  # ignored due to stored preference
                "remember": False,
            })

        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert "always_offload" in data["message"]
        mock_rm.offload_to_cpu.assert_awaited_once()

    @pytest.mark.unit
    async def test_offload_auto_cancel_preference(self, test_app, mock_rm):
        """POST /offload auto-cancels when stored preference is always_cancel."""
        mock_rm.get_offload_preference.return_value = ResourceManager.PREFERENCE_ALWAYS_CANCEL
        from httpx import ASGITransport, AsyncClient

        async with AsyncClient(transport=ASGITransport(app=test_app), base_url="http://test") as ac:
            resp = await ac.post("/api/resources/offload", json={
                "resource_id": "model-a",
                "user_id": self.USER_ID,
                "decision": "offload",
                "remember": False,
            })

        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert "always_cancel" in data["message"]
        mock_rm.offload_to_cpu.assert_not_awaited()

    @pytest.mark.unit
    async def test_offload_failure(self, test_app, mock_rm):
        """POST /offload returns 500 when offload_to_cpu fails."""
        mock_rm.offload_to_cpu.return_value = False
        from httpx import ASGITransport, AsyncClient

        async with AsyncClient(transport=ASGITransport(app=test_app), base_url="http://test") as ac:
            resp = await ac.post("/api/resources/offload", json={
                "resource_id": "model-a",
                "user_id": self.USER_ID,
                "decision": "offload",
                "remember": False,
            })

        assert resp.status_code == 500

    # ----- Reload endpoint -----

    @pytest.mark.unit
    async def test_reload_success(self, test_app, mock_rm):
        """POST /reload succeeds when VRAM is available."""
        from httpx import ASGITransport, AsyncClient

        async with AsyncClient(transport=ASGITransport(app=test_app), base_url="http://test") as ac:
            resp = await ac.post("/api/resources/reload", json={
                "resource_id": "model-a",
                "estimated_vram_mb": 8192,
            })

        assert resp.status_code == 200
        assert resp.json()["success"] is True

    @pytest.mark.unit
    async def test_reload_insufficient_vram_no_user(self, test_app, mock_rm):
        """POST /reload with insufficient VRAM and no user_id returns suggestions."""
        mock_rm.reload_from_cpu.return_value = (False, ["model-b"])
        from httpx import ASGITransport, AsyncClient

        async with AsyncClient(transport=ASGITransport(app=test_app), base_url="http://test") as ac:
            resp = await ac.post("/api/resources/reload", json={
                "resource_id": "model-a",
                "estimated_vram_mb": 8192,
            })

        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is False
        assert data["preempted_resources"] == ["model-b"]

    @pytest.mark.unit
    async def test_reload_auto_preempt_preference(self, test_app, mock_rm):
        """POST /reload auto-preempts when user preference is always_offload."""
        mock_rm.reload_from_cpu.side_effect = [
            (False, ["model-b"]),  # first call: insufficient VRAM
            (True, []),            # second call after preemption: success
        ]
        mock_rm.get_offload_preference.return_value = ResourceManager.PREFERENCE_ALWAYS_OFFLOAD
        from httpx import ASGITransport, AsyncClient

        async with AsyncClient(transport=ASGITransport(app=test_app), base_url="http://test") as ac:
            resp = await ac.post("/api/resources/reload", json={
                "resource_id": "model-a",
                "estimated_vram_mb": 8192,
                "user_id": self.USER_ID,
            })

        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        mock_rm.preempt_resource.assert_awaited_once_with("model-b")

    @pytest.mark.unit
    async def test_reload_auto_cancel_preference(self, test_app, mock_rm):
        """POST /reload auto-cancels when user preference is always_cancel."""
        mock_rm.reload_from_cpu.return_value = (False, ["model-b"])
        mock_rm.get_offload_preference.return_value = ResourceManager.PREFERENCE_ALWAYS_CANCEL
        from httpx import ASGITransport, AsyncClient

        async with AsyncClient(transport=ASGITransport(app=test_app), base_url="http://test") as ac:
            resp = await ac.post("/api/resources/reload", json={
                "resource_id": "model-a",
                "estimated_vram_mb": 8192,
                "user_id": self.USER_ID,
            })

        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is False
        assert "always_cancel" in data["message"]

    @pytest.mark.unit
    async def test_reload_failure_no_suggestions(self, test_app, mock_rm):
        """POST /reload returns 500 when reload fails with no suggestions."""
        mock_rm.reload_from_cpu.return_value = (False, [])
        from httpx import ASGITransport, AsyncClient

        async with AsyncClient(transport=ASGITransport(app=test_app), base_url="http://test") as ac:
            resp = await ac.post("/api/resources/reload", json={
                "resource_id": "model-a",
                "estimated_vram_mb": 8192,
            })

        assert resp.status_code == 500


# =========================================================================
# Auth Guard Verification — resource endpoints are intentionally
# unauthenticated (see note in app/api/resources.py).  These tests
# confirm that unauthenticated callers receive 200 (not 401/403),
# documenting the current design contract.
# =========================================================================

class TestResourceEndpointsUnauthenticated:
    """Verify resource endpoints are accessible without authentication."""

    @pytest.fixture
    def mock_rm(self, mock_vram_tracker):
        rm = MagicMock(spec=ResourceManager)
        rm.get_cached_vram_stats = AsyncMock(return_value={
            "total_mb": 24576, "used_mb": 8192, "free_mb": 16384,
            "utilization_percent": 33.33, "gpu_count": 1,
        })
        rm.get_per_gpu_stats = MagicMock(return_value=[
            {"gpu_index": 0, "name": "NVIDIA GeForce RTX 4090",
             "total_mb": 24576, "used_mb": 8192, "free_mb": 16384,
             "utilization_percent": 33.33}
        ])
        rm.get_loaded_resources = AsyncMock(return_value=[])
        rm.get_offloaded_resources = AsyncMock(return_value=[])
        rm.get_queue_size = MagicMock(return_value=0)
        rm.scan_operation_keys = AsyncMock(return_value=[])
        rm.get_offload_preference = AsyncMock(return_value="ask_each_time")
        rm.offload_to_cpu = AsyncMock(return_value=True)
        rm.set_offload_preference = AsyncMock(return_value=True)
        rm.reload_from_cpu = AsyncMock(return_value=(True, []))
        rm.PREFERENCE_ALWAYS_OFFLOAD = ResourceManager.PREFERENCE_ALWAYS_OFFLOAD
        rm.PREFERENCE_ALWAYS_CANCEL = ResourceManager.PREFERENCE_ALWAYS_CANCEL
        return rm

    @pytest.fixture
    def test_app(self, mock_rm):
        from fastapi import FastAPI
        from app.api.resources import router, get_resource_manager

        app = FastAPI()
        app.include_router(router, prefix="/api")
        app.dependency_overrides[get_resource_manager] = lambda: mock_rm
        return app

    @pytest.mark.unit
    async def test_vram_no_auth_returns_200(self, test_app):
        """GET /api/resources/vram is accessible without authentication."""
        from httpx import ASGITransport, AsyncClient

        async with AsyncClient(transport=ASGITransport(app=test_app), base_url="http://test") as ac:
            resp = await ac.get("/api/resources/vram")

        assert resp.status_code == 200

    @pytest.mark.unit
    async def test_vram_gpus_no_auth_returns_200(self, test_app):
        """GET /api/resources/vram/gpus is accessible without authentication."""
        from httpx import ASGITransport, AsyncClient

        async with AsyncClient(transport=ASGITransport(app=test_app), base_url="http://test") as ac:
            resp = await ac.get("/api/resources/vram/gpus")

        assert resp.status_code == 200

    @pytest.mark.unit
    async def test_status_no_auth_returns_200(self, test_app):
        """GET /api/resources/status is accessible without authentication."""
        from httpx import ASGITransport, AsyncClient

        async with AsyncClient(transport=ASGITransport(app=test_app), base_url="http://test") as ac:
            resp = await ac.get("/api/resources/status")

        assert resp.status_code == 200

    @pytest.mark.unit
    async def test_offload_no_auth_returns_200(self, test_app):
        """POST /api/resources/offload is accessible without authentication."""
        from httpx import ASGITransport, AsyncClient

        async with AsyncClient(transport=ASGITransport(app=test_app), base_url="http://test") as ac:
            resp = await ac.post("/api/resources/offload", json={
                "resource_id": "model-a",
                "user_id": "550e8400-e29b-41d4-a716-446655440000",
                "decision": "offload",
                "remember": False,
            })

        assert resp.status_code == 200

    @pytest.mark.unit
    async def test_reload_no_auth_returns_200(self, test_app):
        """POST /api/resources/reload is accessible without authentication."""
        from httpx import ASGITransport, AsyncClient

        async with AsyncClient(transport=ASGITransport(app=test_app), base_url="http://test") as ac:
            resp = await ac.post("/api/resources/reload", json={
                "resource_id": "model-a",
                "estimated_vram_mb": 8192,
            })

        assert resp.status_code == 200
