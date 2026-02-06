"""
Base service interface for kernel-managed services.

All kernel services must inherit from BaseKernelService and implement
the required lifecycle methods. This ensures consistent behavior across
all services managed by the WorkstationKernel.
"""

from abc import ABC, abstractmethod
from typing import Tuple


class BaseKernelService(ABC):
    """
    Abstract base class for kernel-managed services.

    Lifecycle Contract:
    - startup(): Called during kernel initialization. Must be idempotent -
      calling startup() multiple times should have the same effect as calling
      it once. Should initialize resources, connections, and background tasks.

    - shutdown(): Called during kernel cleanup. Must handle partial
      initialization gracefully - if startup() failed partway through,
      shutdown() should still clean up any resources that were initialized.
      Should release resources, close connections, and stop background tasks.

    - health_check(): Called to verify service health. Should be lightweight
      and fast - avoid expensive operations. Returns a tuple of (healthy, message)
      where healthy is a boolean and message provides status details.

    Properties:
    - name: Unique identifier for the service. Used for logging and registration.
    - is_running: Boolean flag indicating whether the service is currently running.

    Example Implementation:
        class MyService(BaseKernelService):
            def __init__(self):
                self._running = False
                self._connection = None

            @property
            def name(self) -> str:
                return "my_service"

            @property
            def is_running(self) -> bool:
                return self._running

            async def startup(self) -> None:
                if self._running:
                    return  # Idempotent
                self._connection = await create_connection()
                self._running = True

            async def shutdown(self) -> None:
                if self._connection:
                    await self._connection.close()
                self._running = False

            async def health_check(self) -> Tuple[bool, str]:
                if not self._running:
                    return False, "service not running"
                return True, "ok"
    """

    @property
    @abstractmethod
    def name(self) -> str:
        """
        Return unique service identifier.

        This name is used for:
        - Service registration (must be unique per kernel)
        - Logging and debugging
        - Health check reporting
        - Service retrieval via kernel.get_service()
        """
        pass

    @property
    @abstractmethod
    def is_running(self) -> bool:
        """
        Return whether the service is currently running.

        Should return True only after successful startup() completion
        and before shutdown() begins.
        """
        pass

    @abstractmethod
    async def startup(self) -> None:
        """
        Initialize the service.

        Called by the kernel during startup phase. Must be idempotent -
        if called when already running, should return without error.

        Raises:
            Exception: If initialization fails. The kernel will catch this
                and trigger shutdown of all previously started services.
        """
        pass

    @abstractmethod
    async def shutdown(self) -> None:
        """
        Clean up the service.

        Called by the kernel during shutdown phase. Must handle partial
        initialization - should not raise exceptions even if startup()
        was never called or failed partway through.

        This method should:
        - Release all resources (connections, file handles, etc.)
        - Stop all background tasks
        - Reset internal state to allow potential restart
        """
        pass

    @abstractmethod
    async def health_check(self) -> Tuple[bool, str]:
        """
        Check service health.

        Called by the kernel during health checks. Should be lightweight
        and complete quickly (under 1 second ideally).

        Returns:
            Tuple[bool, str]: (healthy, message) where:
                - healthy: True if service is operating normally
                - message: Human-readable status message ("ok", "degraded", etc.)
        """
        pass
