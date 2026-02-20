"""Tests for BaseKernelService abstract class."""

from typing import Tuple

import pytest

from app.kernel.base import BaseKernelService


class ConcreteService(BaseKernelService):
    """Minimal concrete implementation for testing."""

    def __init__(self):
        self._running = False
        self._name = "test_service"

    @property
    def name(self) -> str:
        return self._name

    @property
    def is_running(self) -> bool:
        return self._running

    async def startup(self) -> None:
        if self._running:
            return
        self._running = True

    async def shutdown(self) -> None:
        self._running = False

    async def health_check(self) -> Tuple[bool, str]:
        if not self._running:
            return False, "not running"
        return True, "ok"


class FailingService(BaseKernelService):
    """Service that fails on startup."""

    @property
    def name(self) -> str:
        return "failing"

    @property
    def is_running(self) -> bool:
        return False

    async def startup(self) -> None:
        raise RuntimeError("startup failed")

    async def shutdown(self) -> None:
        pass

    async def health_check(self) -> Tuple[bool, str]:
        return False, "never started"


class TestBaseKernelServiceContract:
    def test_cannot_instantiate_abstract_class(self):
        with pytest.raises(TypeError):
            BaseKernelService()

    def test_concrete_service_instantiates(self):
        svc = ConcreteService()
        assert svc.name == "test_service"
        assert svc.is_running is False


class TestConcreteServiceLifecycle:
    @pytest.mark.asyncio
    async def test_startup(self):
        svc = ConcreteService()
        await svc.startup()
        assert svc.is_running is True

    @pytest.mark.asyncio
    async def test_startup_idempotent(self):
        svc = ConcreteService()
        await svc.startup()
        await svc.startup()
        assert svc.is_running is True

    @pytest.mark.asyncio
    async def test_shutdown(self):
        svc = ConcreteService()
        await svc.startup()
        await svc.shutdown()
        assert svc.is_running is False

    @pytest.mark.asyncio
    async def test_shutdown_without_startup(self):
        svc = ConcreteService()
        await svc.shutdown()
        assert svc.is_running is False


class TestConcreteServiceHealthCheck:
    @pytest.mark.asyncio
    async def test_healthy_when_running(self):
        svc = ConcreteService()
        await svc.startup()
        healthy, msg = await svc.health_check()
        assert healthy is True
        assert msg == "ok"

    @pytest.mark.asyncio
    async def test_unhealthy_when_not_running(self):
        svc = ConcreteService()
        healthy, msg = await svc.health_check()
        assert healthy is False
        assert "not running" in msg


class TestFailingService:
    @pytest.mark.asyncio
    async def test_startup_raises(self):
        svc = FailingService()
        with pytest.raises(RuntimeError, match="startup failed"):
            await svc.startup()

    @pytest.mark.asyncio
    async def test_shutdown_after_failed_startup(self):
        svc = FailingService()
        try:
            await svc.startup()
        except RuntimeError:
            pass
        await svc.shutdown()  # Should not raise

    @pytest.mark.asyncio
    async def test_health_check_reflects_failure(self):
        svc = FailingService()
        healthy, msg = await svc.health_check()
        assert healthy is False
