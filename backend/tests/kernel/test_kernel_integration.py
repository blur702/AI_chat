"""Integration tests for WorkstationKernel orchestration."""

import asyncio
import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.kernel import WorkstationKernel
from app.kernel.base import BaseKernelService


# =========================================================================
# Mock Service for Testing
# =========================================================================

class MockService(BaseKernelService):
    """Configurable mock kernel service for integration testing."""

    def __init__(
        self,
        service_name: str = "mock_service",
        startup_error: Exception | None = None,
        shutdown_error: Exception | None = None,
        health_result: tuple[bool, str] = (True, "ok"),
    ):
        self._name = service_name
        self._running = False
        self._startup_error = startup_error
        self._shutdown_error = shutdown_error
        self._health_result = health_result
        self.startup_called = False
        self.shutdown_called = False
        self.startup_order: list[str] | None = None
        self.shutdown_order: list[str] | None = None

    @property
    def name(self) -> str:
        return self._name

    @property
    def is_running(self) -> bool:
        return self._running

    async def startup(self) -> None:
        if self._startup_error:
            raise self._startup_error
        self._running = True
        self.startup_called = True
        if self.startup_order is not None:
            self.startup_order.append(self._name)

    async def shutdown(self) -> None:
        if self._shutdown_error:
            raise self._shutdown_error
        self._running = False
        self.shutdown_called = True
        if self.shutdown_order is not None:
            self.shutdown_order.append(self._name)

    async def health_check(self):
        return self._health_result


# =========================================================================
# Service Registration Tests
# =========================================================================

class TestServiceRegistration:
    """Tests for kernel service registration."""

    @pytest.mark.integration
    def test_register_service(self, kernel_instance):
        """register_service adds service to kernel."""
        svc = MockService("test_svc")
        kernel_instance.register_service(svc)
        assert kernel_instance.get_service("test_svc") is svc

    @pytest.mark.integration
    def test_duplicate_service_raises(self, kernel_instance):
        """Duplicate service name raises ValueError."""
        kernel_instance.register_service(MockService("dupe"))
        with pytest.raises(ValueError, match="already registered"):
            kernel_instance.register_service(MockService("dupe"))

    @pytest.mark.integration
    def test_non_base_service_raises(self, kernel_instance):
        """Non-BaseKernelService raises TypeError."""
        with pytest.raises(TypeError, match="must implement BaseKernelService"):
            kernel_instance.register_service("not a service")

    @pytest.mark.integration
    def test_get_service_returns_none(self, kernel_instance):
        """get_service returns None for unregistered service."""
        assert kernel_instance.get_service("nonexistent") is None

    @pytest.mark.integration
    def test_registered_services_order(self, kernel_instance):
        """registered_services returns names in registration order."""
        kernel_instance.register_service(MockService("alpha"))
        kernel_instance.register_service(MockService("beta"))
        kernel_instance.register_service(MockService("gamma"))

        assert kernel_instance.registered_services == ["alpha", "beta", "gamma"]


# =========================================================================
# Lifecycle Coordination Tests
# =========================================================================

class TestLifecycleCoordination:
    """Tests for startup/shutdown orchestration."""

    @pytest.mark.integration
    async def test_startup_calls_services_in_order(self, kernel_instance):
        """startup() calls services in registration order."""
        order = []
        svc_a = MockService("svc_a")
        svc_a.startup_order = order
        svc_b = MockService("svc_b")
        svc_b.startup_order = order
        svc_c = MockService("svc_c")
        svc_c.startup_order = order

        kernel_instance.register_service(svc_a)
        kernel_instance.register_service(svc_b)
        kernel_instance.register_service(svc_c)

        await kernel_instance.startup()

        assert order == ["svc_a", "svc_b", "svc_c"]
        assert kernel_instance.is_initialized
        await kernel_instance.shutdown()

    @pytest.mark.integration
    async def test_shutdown_calls_services_in_reverse(self, kernel_instance):
        """shutdown() calls services in reverse order (LIFO)."""
        order = []
        svc_a = MockService("svc_a")
        svc_a.shutdown_order = order
        svc_b = MockService("svc_b")
        svc_b.shutdown_order = order
        svc_c = MockService("svc_c")
        svc_c.shutdown_order = order

        kernel_instance.register_service(svc_a)
        kernel_instance.register_service(svc_b)
        kernel_instance.register_service(svc_c)

        await kernel_instance.startup()
        await kernel_instance.shutdown()

        assert order == ["svc_c", "svc_b", "svc_a"]
        assert not kernel_instance.is_initialized

    @pytest.mark.integration
    async def test_startup_failure_triggers_cleanup(self, kernel_instance):
        """Startup failure shuts down already-started services."""
        order = []
        svc_a = MockService("svc_a")
        svc_a.shutdown_order = order
        svc_b = MockService("svc_b", startup_error=RuntimeError("fail"))
        svc_b.shutdown_order = order

        kernel_instance.register_service(svc_a)
        kernel_instance.register_service(svc_b)

        with pytest.raises(RuntimeError, match="fail"):
            await kernel_instance.startup()

        # svc_a was started and should be shut down
        assert "svc_a" in order
        # svc_b was not started so should not be in shutdown order
        assert "svc_b" not in order
        assert not kernel_instance.is_initialized

    @pytest.mark.integration
    async def test_started_at_timestamp(self, kernel_instance):
        """started_at is set on successful startup."""
        kernel_instance.register_service(MockService("svc"))
        assert kernel_instance.started_at is None

        await kernel_instance.startup()
        assert kernel_instance.started_at is not None
        assert isinstance(kernel_instance.started_at, datetime)
        await kernel_instance.shutdown()

    @pytest.mark.integration
    async def test_shutdown_not_initialized(self, kernel_instance):
        """shutdown() returns immediately when not initialized."""
        await kernel_instance.shutdown()  # should not raise

    @pytest.mark.integration
    async def test_startup_already_initialized(self, kernel_instance):
        """startup() returns immediately if already initialized."""
        kernel_instance.register_service(MockService("svc"))
        await kernel_instance.startup()

        # Second startup should be a no-op
        kernel_instance.register_service(MockService("svc2"))
        await kernel_instance.startup()

        # svc2 should NOT have been started (already initialized)
        svc2 = kernel_instance.get_service("svc2")
        assert not svc2.startup_called

        await kernel_instance.shutdown()


# =========================================================================
# Health Check Aggregation Tests
# =========================================================================

class TestHealthCheckAggregation:
    """Tests for aggregated health checks."""

    @pytest.mark.integration
    async def test_all_healthy(self, kernel_instance):
        """Returns healthy=True when all services healthy."""
        kernel_instance.register_service(MockService("a", health_result=(True, "ok")))
        kernel_instance.register_service(MockService("b", health_result=(True, "ok")))

        await kernel_instance.startup()
        health = await kernel_instance.health_check()

        assert health["healthy"] is True
        assert health["initialized"] is True
        assert "a" in health["services"]
        assert "b" in health["services"]
        assert health["services"]["a"]["healthy"] is True
        await kernel_instance.shutdown()

    @pytest.mark.integration
    async def test_one_unhealthy(self, kernel_instance):
        """Returns healthy=False when any service unhealthy."""
        kernel_instance.register_service(MockService("healthy_svc", health_result=(True, "ok")))
        kernel_instance.register_service(MockService("sick_svc", health_result=(False, "degraded")))

        await kernel_instance.startup()
        health = await kernel_instance.health_check()

        assert health["healthy"] is False
        assert health["services"]["sick_svc"]["healthy"] is False
        assert health["services"]["sick_svc"]["message"] == "degraded"
        await kernel_instance.shutdown()

    @pytest.mark.integration
    async def test_health_check_exception(self, kernel_instance):
        """Handles service health_check() exceptions."""

        class ExplodingService(MockService):
            async def health_check(self):
                raise RuntimeError("health check boom")

        kernel_instance.register_service(ExplodingService("boom"))
        await kernel_instance.startup()
        health = await kernel_instance.health_check()

        assert health["healthy"] is False
        assert "health check error" in health["services"]["boom"]["message"]
        await kernel_instance.shutdown()

    @pytest.mark.integration
    async def test_last_health_check_updated(self, kernel_instance):
        """last_health_check timestamp updated after health check."""
        kernel_instance.register_service(MockService("svc"))
        await kernel_instance.startup()

        assert kernel_instance.last_health_check is None
        await kernel_instance.health_check()
        assert kernel_instance.last_health_check is not None

        await kernel_instance.shutdown()

    @pytest.mark.integration
    async def test_health_includes_timestamp(self, kernel_instance):
        """Health check response includes ISO timestamp."""
        kernel_instance.register_service(MockService("svc"))
        await kernel_instance.startup()
        health = await kernel_instance.health_check()

        assert "timestamp" in health
        # Should be parseable ISO format
        datetime.fromisoformat(health["timestamp"])
        await kernel_instance.shutdown()


# =========================================================================
# Operation Recovery Tests
# =========================================================================

class TestOperationRecovery:
    """Tests for _recover_operations after startup."""

    @pytest.mark.integration
    async def test_recovery_skipped_without_resource_manager(self, kernel_instance):
        """Recovery is skipped when ResourceManager not registered."""
        kernel_instance.register_service(MockService("other_svc"))
        await kernel_instance.startup()  # should not raise
        await kernel_instance.shutdown()

    @pytest.mark.integration
    async def test_recovery_with_no_operations(self, kernel_instance):
        """Recovery completes with no operations to recover."""
        mock_rm = MockService("resource_manager")
        mock_rm.recover_operations = AsyncMock(return_value=[])
        kernel_instance.register_service(mock_rm)

        mock_eb = MockService("event_bus")
        mock_eb.publish_event = AsyncMock()
        kernel_instance.register_service(mock_eb)

        await kernel_instance.startup()

        mock_rm.recover_operations.assert_awaited_once()
        # No event published when no operations recovered
        mock_eb.publish_event.assert_not_awaited()

        await kernel_instance.shutdown()

    @pytest.mark.integration
    async def test_recovery_success_publishes_event(self, kernel_instance):
        """Successful recovery publishes operations_recovered event."""
        mock_rm = MockService("resource_manager")
        ops = [
            {"operation_id": "op-1", "operation_type": "load", "status": "in_progress"}
        ]
        mock_rm.recover_operations = AsyncMock(return_value=ops)
        mock_rm.restore_operation = AsyncMock(return_value=True)
        kernel_instance.register_service(mock_rm)

        mock_eb = MockService("event_bus")
        mock_eb.publish_event = AsyncMock()
        kernel_instance.register_service(mock_eb)

        await kernel_instance.startup()

        mock_rm.restore_operation.assert_awaited_once()
        mock_eb.publish_event.assert_awaited_once()

        call_kwargs = mock_eb.publish_event.call_args[1]
        assert call_kwargs["event_type"] == "operations_recovered"
        assert call_kwargs["event_data"]["success_count"] == 1

        await kernel_instance.shutdown()

    @pytest.mark.integration
    async def test_recovery_failure_logged(self, kernel_instance):
        """Recovery failure is logged but doesn't stop startup."""
        mock_rm = MockService("resource_manager")
        mock_rm.recover_operations = AsyncMock(side_effect=RuntimeError("recovery failed"))
        kernel_instance.register_service(mock_rm)

        # Should not raise
        await kernel_instance.startup()
        assert kernel_instance.is_initialized
        await kernel_instance.shutdown()


# =========================================================================
# Singleton Pattern Tests
# =========================================================================

class TestSingleton:
    """Tests for the WorkstationKernel singleton pattern."""

    @pytest.mark.integration
    def test_singleton_returns_same_instance(self):
        """Multiple calls return same instance."""
        a = WorkstationKernel()
        b = WorkstationKernel()
        assert a is b

    @pytest.mark.integration
    def test_reset_clears_singleton(self):
        """_reset() allows creating a new instance."""
        a = WorkstationKernel()
        WorkstationKernel._reset()
        b = WorkstationKernel()
        assert a is not b

    @pytest.mark.integration
    def test_service_registration_persists(self):
        """Services persist across multiple singleton accesses."""
        kernel = WorkstationKernel()
        kernel.register_service(MockService("persisted"))

        kernel2 = WorkstationKernel()
        assert kernel2.get_service("persisted") is not None


# =========================================================================
# Concurrent Startup/Shutdown Tests
# =========================================================================

class TestConcurrency:
    """Tests for concurrent kernel operations."""

    @pytest.mark.integration
    async def test_concurrent_startup(self, kernel_instance):
        """Concurrent startup() calls are handled by lock."""
        svc = MockService("concurrent_svc")
        kernel_instance.register_service(svc)

        # Run startup concurrently
        results = await asyncio.gather(
            kernel_instance.startup(),
            kernel_instance.startup(),
            return_exceptions=True,
        )

        # Both should succeed (second is idempotent)
        assert all(r is None for r in results)
        assert kernel_instance.is_initialized
        await kernel_instance.shutdown()

    @pytest.mark.integration
    async def test_concurrent_shutdown(self, kernel_instance):
        """Concurrent shutdown() calls are handled by lock."""
        kernel_instance.register_service(MockService("svc"))
        await kernel_instance.startup()

        results = await asyncio.gather(
            kernel_instance.shutdown(),
            kernel_instance.shutdown(),
            return_exceptions=True,
        )

        assert all(r is None for r in results)
        assert not kernel_instance.is_initialized


# =========================================================================
# Service Interaction Tests
# =========================================================================

class TestServiceInteraction:
    """Tests for cross-service communication."""

    @pytest.mark.integration
    async def test_event_bus_subscriber_receives_events(self, kernel_instance, mock_redis):
        """EventBus subscribers receive published events."""
        from app.kernel.event_bus import EventBus

        bus = EventBus(session_factory=None, redis_client=mock_redis)
        kernel_instance.register_service(bus)
        await kernel_instance.startup()

        received = []

        async def handler(event_type, event_data, _metadata):
            received.append((event_type, event_data))

        await bus.subscribe("test_event", handler)

        await bus.publish_event(
            event_type="test_event",
            event_data={"msg": "hello"},
        )

        # Allow async processing
        await asyncio.sleep(0.1)

        assert len(received) == 1, f"Expected 1 event, got {len(received)}"
        assert received[0] == ("test_event", {"msg": "hello"})

        await kernel_instance.shutdown()

    @pytest.mark.integration
    async def test_shutdown_error_continues(self, kernel_instance):
        """Shutdown continues even if a service fails."""
        order = []
        svc_a = MockService("svc_a", shutdown_error=RuntimeError("shutdown fail"))
        svc_a.shutdown_order = order
        svc_b = MockService("svc_b")
        svc_b.shutdown_order = order

        kernel_instance.register_service(svc_a)
        kernel_instance.register_service(svc_b)

        await kernel_instance.startup()
        await kernel_instance.shutdown()  # should not raise

        # svc_b should still have been shut down (reverse order)
        assert "svc_b" in order
        assert not kernel_instance.is_initialized
