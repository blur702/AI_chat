"""SandboxManager - Docker container management for project sandboxes.

Thin facade that delegates to focused helper modules in app.services.sandbox/.
"""

import asyncio
import logging
from typing import Dict, List, Optional, Tuple
from uuid import UUID

import docker
from docker.errors import DockerException

from app.kernel.base import BaseKernelService
from app.services.sandbox.constants import (
    COMMAND_TIMEOUT,
    CREATION_FAILURE_COOLDOWN,
    EXPORTED_IMAGE_TRACKING_MAX,
    SANDBOX_CPU_QUOTA,
    SANDBOX_IDLE_TIMEOUT,
    SANDBOX_IMAGE,
    SANDBOX_MEMORY_LIMIT,
    SANDBOX_NETWORK,
)
from app.services.sandbox.container_lifecycle import ContainerLifecycle
from app.services.sandbox.exec_runner import ExecRunner
from app.services.sandbox.file_ops import FileOps
from app.services.sandbox.portability import Portability
from app.services.sandbox.tech_merger import TechMerger
from app.services.sandbox.template_applier import TemplateApplier
from app.services.templates import TemplateRegistry

# Re-export constants for backward compatibility
__all__ = [
    "SandboxManager",
    "COMMAND_TIMEOUT",
    "CREATION_FAILURE_COOLDOWN",
    "SANDBOX_IMAGE",
    "SANDBOX_NETWORK",
]

logger = logging.getLogger("workstation.sandbox")


class SandboxManager(BaseKernelService):
    """Manages Docker containers for project sandboxes.

    Each project gets an isolated container with persistent storage.
    Containers are created on demand and cleaned up after idle timeout.
    """

    def __init__(self) -> None:
        self._running = False
        self._client: Optional[docker.DockerClient] = None
        # Shared state dicts — passed by reference to helper classes
        self._containers: Dict[str, str] = {}
        self._last_activity: Dict[str, float] = {}
        self._cleanup_task: Optional[asyncio.Task] = None
        self._sidecars: Dict[str, List[str]] = {}
        self._template_registry = TemplateRegistry()
        self._creation_locks: Dict[str, asyncio.Lock] = {}
        self._applied_templates: Dict[str, str] = {}
        self._exported_images: Dict[str, str] = {}
        self._creation_failures: Dict[str, Tuple[float, str]] = {}
        # Helpers are instantiated in startup() once Docker client is available
        self._run: Optional[ExecRunner] = None
        self._file_ops: Optional[FileOps] = None
        self._tech_merger: Optional[TechMerger] = None
        self._template_applier: Optional[TemplateApplier] = None
        self._lifecycle: Optional[ContainerLifecycle] = None
        self._portability: Optional[Portability] = None

    @property
    def name(self) -> str:
        return "sandbox_manager"

    @property
    def is_running(self) -> bool:
        return self._running

    async def startup(self) -> None:
        if self._running:
            return
        self._client = await asyncio.to_thread(docker.from_env)

        # Instantiate helpers with shared state
        self._run = ExecRunner(self._client, self._last_activity)
        self._file_ops = FileOps(self._run, self._client, self._last_activity)
        self._tech_merger = TechMerger(self._template_registry)
        self._template_applier = TemplateApplier(
            self._run, self._file_ops, self._client,
            self._template_registry, self._sidecars,
        )
        self._lifecycle = ContainerLifecycle(
            self._client, self._containers, self._last_activity,
            self._creation_locks, self._applied_templates,
            self._creation_failures, self._sidecars,
            self._template_registry, self._tech_merger, self._template_applier,
        )
        self._portability = Portability(
            self._client, self._containers, self._template_registry,
            self._exported_images,
            self.get_or_create_container, self.stop_container,
        )

        await self._lifecycle.recover_containers()
        self._cleanup_task = asyncio.create_task(self._cleanup_loop())
        self._running = True
        logger.info("SandboxManager started")

    async def shutdown(self) -> None:
        if self._cleanup_task:
            self._cleanup_task.cancel()
            try:
                await self._cleanup_task
            except asyncio.CancelledError:
                pass
            self._cleanup_task = None
        if self._client:
            await asyncio.to_thread(self._client.close)
            self._client = None
        self._containers.clear()
        self._last_activity.clear()
        self._sidecars.clear()
        self._creation_locks.clear()
        self._applied_templates.clear()
        self._exported_images.clear()
        self._creation_failures.clear()
        self._running = False
        logger.info("SandboxManager stopped")

    async def health_check(self) -> Tuple[bool, str]:
        if not self._running or not self._client:
            return False, "service not running"
        try:
            await asyncio.to_thread(self._client.ping)
            return True, "ok ({} active containers)".format(len(self._containers))
        except DockerException as e:
            return False, "docker error: {}".format(e)

    @property
    def template_registry(self) -> TemplateRegistry:
        return self._template_registry

    # -- Container lifecycle (delegates to ContainerLifecycle) -----------------

    async def get_or_create_container(
        self,
        project_id: UUID,
        template_id: Optional[str] = None,
        custom_image: Optional[str] = None,
        selected_technologies: Optional[List[str]] = None,
    ) -> str:
        return await self._lifecycle.get_or_create_container(
            project_id, template_id, custom_image, selected_technologies,
        )

    async def stop_container(self, project_id: UUID) -> bool:
        return await self._lifecycle.stop_container(project_id)

    # -- Command running (delegates to ExecRunner) ----------------------------

    async def execute_command(self, container_id: str, command: str) -> dict:
        return await self._run.execute_command(container_id, command)

    async def stream_exec_output(self, exec_id: str):
        async for item in self._run.stream_exec_output(exec_id):
            yield item

    async def get_exec_exit_code(self, exec_id: str) -> int:
        return await self._run.get_exec_exit_code(exec_id)

    async def terminate_exec(self, container_id: str, exec_id: str) -> bool:
        return await self._run.terminate_exec(container_id, exec_id)

    async def kill_exec(self, exec_id: str) -> None:
        try:
            exec_inspect = await asyncio.to_thread(self._client.api.exec_inspect, exec_id)
            pid = exec_inspect.get("Pid", 0)
            if pid:
                container_id = exec_inspect.get("ContainerID")
                if container_id:
                    container = await asyncio.to_thread(
                        self._client.containers.get, container_id,
                    )
                    await asyncio.to_thread(
                        container.exec_run, ["kill", "-9", str(pid)],
                    )
        except Exception as e:
            logger.debug("Failed to kill exec process %s: %s", exec_id, e)

    async def exec_simple(self, container_id: str, command: str) -> str:
        return await self._run.exec_simple(container_id, command)

    async def _exec_simple(self, container_id: str, command: str) -> str:
        return await self._run.exec_simple(container_id, command)

    # -- File operations (delegates to FileOps) -------------------------------

    async def list_directory(self, container_id: str, dir_path: str = "/workspace") -> list[dict]:
        return await self._file_ops.list_directory(container_id, dir_path)

    async def list_directory_recursive(self, container_id: str, dir_path: str = "/workspace") -> list[dict]:
        return await self._file_ops.list_directory_recursive(container_id, dir_path)

    async def read_file(self, container_id: str, file_path: str) -> str:
        return await self._file_ops.read_file(container_id, file_path)

    async def write_file(self, container_id: str, file_path: str, content: str) -> None:
        return await self._file_ops.write_file(container_id, file_path, content)

    async def create_directory(self, container_id: str, dir_path: str) -> None:
        return await self._file_ops.create_directory(container_id, dir_path)

    async def delete_path(self, container_id: str, path: str, recursive: bool = False) -> None:
        return await self._file_ops.delete_path(container_id, path, recursive)

    async def rename_path(self, container_id: str, old_path: str, new_path: str) -> None:
        return await self._file_ops.rename_path(container_id, old_path, new_path)

    async def file_exists(self, container_id: str, path: str) -> bool:
        return await self._file_ops.file_exists(container_id, path)

    async def is_directory(self, container_id: str, path: str) -> bool:
        return await self._file_ops.is_directory(container_id, path)

    # -- Portability (delegates to Portability) -------------------------------

    async def export_workspace_streaming(self, project_id: UUID):
        async for chunk in self._portability.export_workspace_streaming(project_id):
            yield chunk

    CLONE_MAX_SIZE = Portability.CLONE_MAX_SIZE

    async def clone_volume(self, source_project_id: UUID, dest_project_id: UUID) -> None:
        return await self._portability.clone_volume(source_project_id, dest_project_id)

    async def create_snapshot(self, project_id: UUID, snapshot_name: str) -> str:
        return await self._portability.create_snapshot(project_id, snapshot_name)

    async def list_snapshots(self, project_id: UUID) -> list[dict]:
        return await self._portability.list_snapshots(project_id)

    async def restore_snapshot(self, project_id: UUID, snapshot_name: str) -> str:
        return await self._portability.restore_snapshot(project_id, snapshot_name)

    async def delete_snapshot(self, project_id: UUID, snapshot_name: str) -> None:
        return await self._portability.delete_snapshot(project_id, snapshot_name)

    async def export_as_docker_image(
        self,
        project_id: UUID,
        image_name: str | None = None,
        include_compose: bool = True,
        include_tar: bool = False,
        template_id: str | None = None,
    ) -> dict:
        return await self._portability.export_as_docker_image(
            project_id, image_name, include_compose, include_tar, template_id,
        )

    async def export_docker_tar_streaming(self, image_id: str):
        async for chunk in self._portability.export_docker_tar_streaming(image_id):
            yield chunk

    async def is_exported_image_owned_by_project(self, project_id: UUID, image_id: str) -> bool:
        return await self._portability.is_exported_image_owned_by_project(project_id, image_id)

    # -- Internal helpers -----------------------------------------------------

    async def _cleanup_loop(self) -> None:
        while True:
            await asyncio.sleep(300)
            await self._lifecycle.cleanup_idle_containers()
