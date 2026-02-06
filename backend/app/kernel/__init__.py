"""
WorkstationKernel - Centralized service lifecycle orchestrator.

The kernel manages the lifecycle of all registered services, ensuring
proper startup order, graceful shutdown, and health monitoring.
"""

import asyncio
import logging
import os
from datetime import datetime, timezone
from typing import Dict, Optional, Any

from .base import BaseKernelService
from .context_manager import ContextManager
from .event_bus import EventBus
from .resource_manager import ResourceManager, VRAMTracker
from .tool_base import BaseTool
from .tool_registry import ToolRegistry

# Configure kernel logger
log_level = os.getenv("LOG_LEVEL", "INFO").upper()
logging.basicConfig(
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    level=getattr(logging, log_level, logging.INFO)
)
logger = logging.getLogger("workstation.kernel")


class WorkstationKernel:
    """
    Singleton orchestrator for managing kernel service lifecycles.

    The WorkstationKernel provides:
    - Service registration with duplicate detection
    - Ordered startup (registration order)
    - Reverse-order shutdown (LIFO)
    - Aggregated health checks
    - Thread-safe initialization via asyncio.Lock

    Usage:
        kernel = WorkstationKernel()
        kernel.register_service(MyService())
        await kernel.startup()
        # ... application runs ...
        await kernel.shutdown()

    Singleton Pattern:
        Multiple calls to WorkstationKernel() return the same instance.
        Use WorkstationKernel._reset() in tests to reset the singleton.
    """

    _instance: Optional["WorkstationKernel"] = None
    _services: Dict[str, BaseKernelService]
    _initialized: bool
    _lock: asyncio.Lock
    _last_health_check: Optional[datetime]
    _started_at: Optional[datetime]

    def __new__(cls) -> "WorkstationKernel":
        """Enforce singleton pattern."""
        if cls._instance is None:
            instance = super().__new__(cls)
            instance._services = {}
            instance._initialized = False
            instance._lock = asyncio.Lock()
            instance._last_health_check = None
            instance._started_at = None
            cls._instance = instance
            logger.debug("Created new WorkstationKernel instance")
        return cls._instance

    @classmethod
    def _reset(cls) -> None:
        """
        Reset the singleton instance (for testing only).

        This clears all registered services and resets initialization state.
        Should only be used in test fixtures.
        """
        cls._instance = None
        logger.debug("Reset WorkstationKernel singleton")

    def register_service(self, service: BaseKernelService) -> None:
        """
        Register a service with the kernel.

        Services are started in registration order and stopped in reverse order.
        Each service must have a unique name.

        Args:
            service: Service instance implementing BaseKernelService

        Raises:
            TypeError: If service doesn't implement BaseKernelService
            ValueError: If a service with the same name is already registered
        """
        if not isinstance(service, BaseKernelService):
            raise TypeError(
                f"Service must implement BaseKernelService, got {type(service).__name__}"
            )

        if service.name in self._services:
            raise ValueError(
                f"Service '{service.name}' is already registered"
            )

        self._services[service.name] = service
        logger.info(f"Registered service: {service.name}")

    async def startup(self) -> None:
        """
        Start all registered services in registration order.

        Acquires lock to prevent concurrent initialization. If any service
        fails to start, shutdown() is called to clean up and the exception
        is re-raised.

        After all services start, triggers operation recovery from Redis
        to restore in-progress operations interrupted by the previous shutdown.

        Raises:
            Exception: If any service fails to start
        """
        async with self._lock:
            if self._initialized:
                logger.debug("Kernel already initialized, skipping startup")
                return

            logger.info(
                "Starting WorkstationKernel with %d service(s): %s",
                len(self._services),
                ", ".join(self._services.keys()),
            )
            started_services: list[str] = []

            try:
                for name, service in self._services.items():
                    logger.info(f"Starting service: {name}")
                    svc_start = datetime.now(timezone.utc)
                    await service.startup()
                    svc_duration_ms = (
                        datetime.now(timezone.utc) - svc_start
                    ).total_seconds() * 1000
                    started_services.append(name)
                    logger.info(
                        f"Service {name} started in {svc_duration_ms:.0f}ms"
                    )

                self._initialized = True
                self._started_at = datetime.now(timezone.utc)
                logger.info(
                    f"WorkstationKernel started successfully with "
                    f"{len(self._services)} service(s)"
                )

                # Trigger operation recovery after all services are started
                await self._recover_operations()

            except Exception as e:
                logger.error(f"Service startup failed: {e}")
                # Shutdown already-started services in reverse order
                for name in reversed(started_services):
                    try:
                        logger.info(f"Shutting down service after failure: {name}")
                        await self._services[name].shutdown()
                    except Exception as shutdown_error:
                        logger.error(
                            f"Error shutting down {name} after startup failure: "
                            f"{shutdown_error}"
                        )
                raise

    async def _recover_operations(self) -> None:
        """
        Recover in-progress operations from Redis after kernel restart.

        Called after all services have started. Retrieves operations that
        were interrupted and attempts to restore them. Publishes recovery
        events via EventBus.
        """
        resource_manager = self.get_service("resource_manager")
        event_bus = self.get_service("event_bus")

        if not resource_manager:
            logger.debug("ResourceManager not available, skipping operation recovery")
            return

        try:
            # Get recoverable operations
            recoverable = await resource_manager.recover_operations()

            if not recoverable:
                logger.info("No operations to recover")
                return

            logger.info(f"Recovering {len(recoverable)} operations...")

            success_count = 0
            failure_count = 0

            for operation_state in recoverable:
                try:
                    if await resource_manager.restore_operation(operation_state):
                        success_count += 1
                    else:
                        failure_count += 1
                except Exception as e:
                    logger.error(f"Error restoring operation: {e}")
                    failure_count += 1

            logger.info(
                f"Operation recovery complete: "
                f"{success_count}/{len(recoverable)} succeeded, "
                f"{failure_count} failed"
            )

            # Publish recovery event via EventBus
            if event_bus:
                await event_bus.publish_event(
                    event_type="operations_recovered",
                    event_data={
                        "total_operations": len(recoverable),
                        "success_count": success_count,
                        "failure_count": failure_count,
                    },
                    severity="info",
                    source="kernel",
                    persist=True,
                )

        except Exception as e:
            logger.error(f"Operation recovery failed: {e}")

    async def shutdown(self) -> None:
        """
        Stop all registered services in reverse registration order (LIFO).

        Acquires lock for thread safety. Continues attempting to shut down
        all services even if some fail, logging errors for each failure.
        """
        async with self._lock:
            if not self._initialized:
                logger.debug("Kernel not initialized, skipping shutdown")
                return

            logger.info("Shutting down WorkstationKernel...")
            errors: list[tuple[str, Exception]] = []

            # Shutdown in reverse registration order
            for name in reversed(list(self._services.keys())):
                service = self._services[name]
                try:
                    logger.info(f"Shutting down service: {name}")
                    await service.shutdown()
                    logger.info(f"Service stopped: {name}")
                except Exception as e:
                    logger.error(f"Error shutting down service {name}: {e}")
                    errors.append((name, e))

            self._initialized = False
            self._last_health_check = None

            # Log shutdown summary
            total = len(self._services)
            failed = len(errors)
            if errors:
                logger.warning(
                    f"Kernel shutdown completed: {total - failed}/{total} "
                    f"services stopped cleanly, {failed} error(s)"
                )
            else:
                logger.info(
                    f"WorkstationKernel shutdown complete: "
                    f"{total} service(s) stopped cleanly"
                )

    async def health_check(self) -> Dict[str, Any]:
        """
        Check health of all registered services.

        Returns:
            Dict containing kernel health status and per-service health:
            {
                "healthy": bool,
                "initialized": bool,
                "timestamp": str (ISO format),
                "services": {
                    "service_name": {
                        "healthy": bool,
                        "message": str,
                        "is_running": bool
                    }
                }
            }
        """
        self._last_health_check = datetime.now(timezone.utc)
        services_health: Dict[str, Dict[str, Any]] = {}
        all_healthy = self._initialized

        for name, service in self._services.items():
            try:
                healthy, message = await service.health_check()
                services_health[name] = {
                    "healthy": healthy,
                    "message": message,
                    "is_running": service.is_running
                }
                if not healthy:
                    all_healthy = False
            except Exception as e:
                logger.error(f"Health check failed for service {name}: {e}")
                services_health[name] = {
                    "healthy": False,
                    "message": f"health check error: {str(e)}",
                    "is_running": service.is_running
                }
                all_healthy = False

        return {
            "healthy": all_healthy,
            "initialized": self._initialized,
            "timestamp": self._last_health_check.isoformat(),
            "services": services_health
        }

    def get_service(self, name: str) -> Optional[BaseKernelService]:
        """
        Retrieve a registered service by name.

        Args:
            name: Service identifier

        Returns:
            The service instance, or None if not registered
        """
        return self._services.get(name)

    @property
    def is_initialized(self) -> bool:
        """Return whether the kernel has been initialized."""
        return self._initialized

    @property
    def registered_services(self) -> list[str]:
        """Return list of registered service names in registration order."""
        return list(self._services.keys())

    @property
    def last_health_check(self) -> Optional[datetime]:
        """Return timestamp of last health check, or None if never checked."""
        return self._last_health_check

    @property
    def started_at(self) -> Optional[datetime]:
        """Return kernel startup timestamp, or None if not yet started."""
        return self._started_at


__all__ = [
    "WorkstationKernel",
    "BaseKernelService",
    "ContextManager",
    "EventBus",
    "ResourceManager",
    "VRAMTracker",
    "BaseTool",
    "ToolRegistry",
]
