"""SandboxManager - Docker container management for project sandboxes."""

import asyncio
import base64
import io
import logging
import os
import shlex
import tarfile
import time
from typing import Dict, Optional, Tuple
from uuid import UUID

import docker
from docker.errors import DockerException, NotFound

from app.kernel.base import BaseKernelService

logger = logging.getLogger("workstation.sandbox")

# Container configuration
SANDBOX_IMAGE = os.getenv("SANDBOX_IMAGE", "python:3.12-slim")
SANDBOX_NETWORK = "workstation-preview-network"
SANDBOX_IDLE_TIMEOUT = int(os.getenv("SANDBOX_IDLE_TIMEOUT", "3600"))  # 1 hour
SANDBOX_MEMORY_LIMIT = os.getenv("SANDBOX_MEMORY_LIMIT", "512m")
SANDBOX_CPU_QUOTA = int(os.getenv("SANDBOX_CPU_QUOTA", "50000"))  # 50% of one core
COMMAND_TIMEOUT = int(os.getenv("SANDBOX_COMMAND_TIMEOUT", "300"))  # 5 minutes


class SandboxManager(BaseKernelService):
    """Manages Docker containers for project sandboxes.

    Each project gets an isolated container with persistent storage.
    Containers are created on demand and cleaned up after idle timeout.
    """

    def __init__(self) -> None:
        self._running = False
        self._client: Optional[docker.DockerClient] = None
        # project_id -> container_id mapping
        self._containers: Dict[str, str] = {}
        # container_id -> last_activity timestamp
        self._last_activity: Dict[str, float] = {}
        self._cleanup_task: Optional[asyncio.Task] = None

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
        # Recover existing sandbox containers
        await self._recover_containers()
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
        self._running = False
        logger.info("SandboxManager stopped")

    async def health_check(self) -> Tuple[bool, str]:
        if not self._running or not self._client:
            return False, "service not running"
        try:
            await asyncio.to_thread(self._client.ping)
            return True, f"ok ({len(self._containers)} active containers)"
        except DockerException as e:
            return False, f"docker error: {e}"

    # -- Container lifecycle --------------------------------------------------

    async def get_or_create_container(self, project_id: UUID) -> str:
        """Get existing or create new container for a project.

        Returns the container ID.
        """
        pid = str(project_id)

        # Check if we already track this container and it's still running
        if pid in self._containers:
            container_id = self._containers[pid]
            try:
                container = await asyncio.to_thread(
                    self._client.containers.get, container_id
                )
                if container.status == "running":
                    self._last_activity[container_id] = time.time()
                    return container_id
                # Container exists but not running - start it
                await asyncio.to_thread(container.start)
                self._last_activity[container_id] = time.time()
                return container_id
            except NotFound:
                # Container was removed externally
                del self._containers[pid]
                if container_id in self._last_activity:
                    del self._last_activity[container_id]

        # Create a new container
        container = await asyncio.to_thread(
            self._client.containers.run,
            SANDBOX_IMAGE,
            command="sleep infinity",
            detach=True,
            name=f"sandbox-{pid[:12]}",
            labels={
                "project_id": pid,
                "managed_by": "workstation",
            },
            network=SANDBOX_NETWORK,
            working_dir="/workspace",
            volumes={
                f"sandbox-{pid}": {"bind": "/workspace", "mode": "rw"},
            },
            mem_limit=SANDBOX_MEMORY_LIMIT,
            cpu_quota=SANDBOX_CPU_QUOTA,
            read_only=False,
            security_opt=["no-new-privileges"],
            cap_drop=["ALL"],
            cap_add=["CHOWN", "SETUID", "SETGID", "DAC_OVERRIDE", "FOWNER"],
        )

        container_id = container.id
        self._containers[pid] = container_id
        self._last_activity[container_id] = time.time()
        logger.info("Created sandbox container %s for project %s", container_id[:12], pid[:12])
        return container_id

    async def execute_command(self, container_id: str, command: str) -> dict:
        """Execute a command in a container.

        Returns a dict with exec_id, which can be used for streaming.
        """
        self._last_activity[container_id] = time.time()

        container = await asyncio.to_thread(
            self._client.containers.get, container_id
        )

        # Use the low-level API for exec create + start to get streaming
        exec_instance = await asyncio.to_thread(
            self._client.api.exec_create,
            container.id,
            ["sh", "-c", command],
            stdout=True,
            stderr=True,
            tty=False,
            workdir="/workspace",
        )

        return {"exec_id": exec_instance["Id"], "container_id": container_id}

    async def stream_exec_output(self, exec_id: str):
        """Generator that yields (stream_type, chunk) from an exec instance.

        stream_type is 'stdout' or 'stderr'.
        Blocking Docker socket iteration runs in a background thread and
        pushes decoded chunks into an asyncio.Queue so this async generator
        never blocks the event loop.
        """
        queue: asyncio.Queue = asyncio.Queue()
        _SENTINEL = None
        loop = asyncio.get_running_loop()

        def _reader():
            try:
                output = self._client.api.exec_start(
                    exec_id,
                    stream=True,
                    demux=True,
                )
                for stdout_chunk, stderr_chunk in output:
                    if stdout_chunk:
                        loop.call_soon_threadsafe(queue.put_nowait, ("stdout", stdout_chunk.decode("utf-8", errors="replace")))
                    if stderr_chunk:
                        loop.call_soon_threadsafe(queue.put_nowait, ("stderr", stderr_chunk.decode("utf-8", errors="replace")))
            except Exception:
                logger.exception("stream_exec_output reader error")
            finally:
                loop.call_soon_threadsafe(queue.put_nowait, _SENTINEL)

        loop.run_in_executor(None, _reader)

        while True:
            item = await queue.get()
            if item is _SENTINEL:
                break
            yield item

    async def get_exec_exit_code(self, exec_id: str) -> int:
        """Get the exit code of a completed exec instance."""
        info = await asyncio.to_thread(
            self._client.api.exec_inspect, exec_id
        )
        return info.get("ExitCode", -1)

    async def stop_container(self, project_id: UUID) -> bool:
        """Stop and remove a container for a project."""
        pid = str(project_id)
        container_id = self._containers.pop(pid, None)
        if not container_id:
            return False

        self._last_activity.pop(container_id, None)

        try:
            container = await asyncio.to_thread(
                self._client.containers.get, container_id
            )
            await asyncio.to_thread(container.stop, timeout=10)
            await asyncio.to_thread(container.remove, force=True)
            logger.info("Stopped sandbox container %s for project %s", container_id[:12], pid[:12])
            return True
        except NotFound:
            return True
        except DockerException as e:
            logger.error("Failed to stop container %s: %s", container_id[:12], e)
            return False

    # -- File operation helpers ------------------------------------------------

    async def list_directory(self, container_id: str, dir_path: str = "/workspace") -> list[dict]:
        """List directory contents with metadata.

        Returns a list of dicts with keys: name, type, path, size, modified_at.
        """
        # Use find to list immediate children, stat for metadata
        safe_dir = shlex.quote(dir_path)
        cmd = (
            f"find {safe_dir} -maxdepth 1 -mindepth 1 "
            f"-printf '%y\\t%s\\t%T@\\t%P\\n' 2>/dev/null | sort -t$'\\t' -k4"
        )
        exec_info = await self.execute_command(container_id, cmd)
        output = ""
        async for stream_type, chunk in self.stream_exec_output(exec_info["exec_id"]):
            if stream_type == "stdout":
                output += chunk

        results = []
        for line in output.strip().split("\n"):
            if not line:
                continue
            parts = line.split("\t", 3)
            if len(parts) < 4:
                continue
            file_type_char, size_str, mtime_str, name = parts
            node_type = "directory" if file_type_char == "d" else "file"
            # Build path relative to /workspace
            rel_path = f"{dir_path}/{name}"
            if rel_path.startswith("/workspace/"):
                rel_path = rel_path[len("/workspace/"):]
            elif rel_path == "/workspace":
                rel_path = ""
            results.append({
                "name": name,
                "type": node_type,
                "path": rel_path,
                "size": int(size_str) if node_type == "file" else None,
                "modified_at": mtime_str,
            })
        return results

    async def list_directory_recursive(self, container_id: str, dir_path: str = "/workspace") -> list[dict]:
        """Recursively list all files and directories under dir_path.

        Returns a flat list of dicts with keys: name, type, path, size, modified_at.
        """
        safe_dir = shlex.quote(dir_path)
        cmd = (
            f"find {safe_dir} -mindepth 1 "
            f"-printf '%y\\t%s\\t%T@\\t%p\\n' 2>/dev/null | sort -t$'\\t' -k4"
        )
        exec_info = await self.execute_command(container_id, cmd)
        output = ""
        async for stream_type, chunk in self.stream_exec_output(exec_info["exec_id"]):
            if stream_type == "stdout":
                output += chunk

        results = []
        for line in output.strip().split("\n"):
            if not line:
                continue
            parts = line.split("\t", 3)
            if len(parts) < 4:
                continue
            file_type_char, size_str, mtime_str, full_path = parts
            node_type = "directory" if file_type_char == "d" else "file"
            # Build path relative to /workspace
            rel_path = full_path
            if rel_path.startswith("/workspace/"):
                rel_path = rel_path[len("/workspace/"):]
            name = rel_path.rsplit("/", 1)[-1] if "/" in rel_path else rel_path
            results.append({
                "name": name,
                "type": node_type,
                "path": rel_path,
                "size": int(size_str) if node_type == "file" else None,
                "modified_at": mtime_str,
            })
        return results

    async def read_file(self, container_id: str, file_path: str) -> str:
        """Read file content from container. file_path is absolute."""
        exec_info = await self.execute_command(container_id, f"cat {shlex.quote(file_path)}")
        output = ""
        stderr = ""
        async for stream_type, chunk in self.stream_exec_output(exec_info["exec_id"]):
            if stream_type == "stdout":
                output += chunk
            else:
                stderr += chunk

        exit_code = await self.get_exec_exit_code(exec_info["exec_id"])
        if exit_code != 0:
            raise FileNotFoundError(stderr.strip() or f"Failed to read {file_path}")
        return output

    async def write_file(self, container_id: str, file_path: str, content: str) -> None:
        """Write content to a file in the container. Creates parent dirs as needed."""
        dir_path = file_path.rsplit("/", 1)[0] if "/" in file_path else "/workspace"
        await self._exec_simple(container_id, f"mkdir -p {shlex.quote(dir_path)}")

        content_bytes = content.encode("utf-8")
        if self._client is not None:
            try:
                tar_buffer = io.BytesIO()
                file_name = os.path.basename(file_path) or "file"
                with tarfile.open(fileobj=tar_buffer, mode="w") as tar:
                    tar_info = tarfile.TarInfo(name=file_name)
                    tar_info.size = len(content_bytes)
                    tar_info.mode = 0o644
                    tar.addfile(tar_info, io.BytesIO(content_bytes))
                tar_bytes = tar_buffer.getvalue()
                ok = await asyncio.to_thread(
                    self._client.api.put_archive,
                    container_id,
                    dir_path,
                    tar_bytes,
                )
                if not ok:
                    raise IOError(f"Failed to write {file_path}")
                self._last_activity[container_id] = time.time()
                return
            except Exception as exc:
                # Keep shell fallback only for small payloads to avoid ARG_MAX issues.
                if len(content_bytes) > 4096:
                    raise IOError(f"Failed to write {file_path}") from exc

        # Fallback path for small writes when docker archive upload is unavailable.
        encoded = base64.b64encode(content_bytes).decode("ascii")
        cmd = f"echo {shlex.quote(encoded)} | base64 -d > {shlex.quote(file_path)}"
        exec_info = await self.execute_command(container_id, cmd)
        stderr = ""
        async for stream_type, chunk in self.stream_exec_output(exec_info["exec_id"]):
            if stream_type == "stderr":
                stderr += chunk
        exit_code = await self.get_exec_exit_code(exec_info["exec_id"])
        if exit_code != 0:
            raise IOError(stderr.strip() or f"Failed to write {file_path}")

    async def create_directory(self, container_id: str, dir_path: str) -> None:
        """Create a directory (and parents) in the container."""
        await self._exec_simple(container_id, f"mkdir -p {shlex.quote(dir_path)}")

    async def delete_path(self, container_id: str, path: str, recursive: bool = False) -> None:
        """Delete a file or directory in the container."""
        safe_path = shlex.quote(path)
        cmd = f"rm -rf {safe_path}" if recursive else f"rm -f {safe_path}"
        # Check if it's a directory and use rm -rf regardless
        type_check = await self._exec_simple(container_id, f"test -d {safe_path} && echo dir || echo file")
        if type_check.strip() == "dir":
            cmd = f"rm -rf {safe_path}"
        await self._exec_simple(container_id, cmd)

    async def rename_path(self, container_id: str, old_path: str, new_path: str) -> None:
        """Rename/move a file or directory in the container."""
        # Ensure parent directory of new_path exists
        new_dir = new_path.rsplit("/", 1)[0] if "/" in new_path else "/workspace"
        await self._exec_simple(container_id, f"mkdir -p {shlex.quote(new_dir)}")
        exec_info = await self.execute_command(container_id, f"mv {shlex.quote(old_path)} {shlex.quote(new_path)}")
        stderr = ""
        async for stream_type, chunk in self.stream_exec_output(exec_info["exec_id"]):
            if stream_type == "stderr":
                stderr += chunk
        exit_code = await self.get_exec_exit_code(exec_info["exec_id"])
        if exit_code != 0:
            raise FileNotFoundError(stderr.strip() or f"Failed to rename {old_path}")

    async def file_exists(self, container_id: str, path: str) -> bool:
        """Check if a file or directory exists."""
        result = await self._exec_simple(container_id, f"test -e {shlex.quote(path)} && echo yes || echo no")
        return result.strip() == "yes"

    async def is_directory(self, container_id: str, path: str) -> bool:
        """Check if a path is a directory."""
        result = await self._exec_simple(container_id, f"test -d {shlex.quote(path)} && echo yes || echo no")
        return result.strip() == "yes"

    async def _exec_simple(self, container_id: str, command: str) -> str:
        """Execute a command and return stdout. Raises on non-zero exit."""
        exec_info = await self.execute_command(container_id, command)
        output = ""
        stderr = ""
        async for stream_type, chunk in self.stream_exec_output(exec_info["exec_id"]):
            if stream_type == "stdout":
                output += chunk
            else:
                stderr += chunk
        exit_code = await self.get_exec_exit_code(exec_info["exec_id"])
        if exit_code != 0:
            raise RuntimeError(stderr.strip() or f"Command failed with exit code {exit_code}")
        return output

    # -- Internal helpers -----------------------------------------------------

    async def _recover_containers(self) -> None:
        """Discover existing sandbox containers managed by this service."""
        try:
            containers = await asyncio.to_thread(
                self._client.containers.list,
                filters={"label": "managed_by=workstation"},
                all=True,
            )
            for container in containers:
                pid = container.labels.get("project_id")
                if pid:
                    self._containers[pid] = container.id
                    self._last_activity[container.id] = time.time()
            if self._containers:
                logger.info("Recovered %d sandbox containers", len(self._containers))
        except DockerException as e:
            logger.warning("Failed to recover containers: %s", e)

    async def _cleanup_loop(self) -> None:
        """Periodically remove idle containers."""
        while True:
            await asyncio.sleep(300)  # Check every 5 minutes
            await self._cleanup_idle_containers()

    async def _cleanup_idle_containers(self) -> None:
        """Remove containers that have been idle beyond the timeout."""
        now = time.time()
        to_remove = []

        for pid, container_id in list(self._containers.items()):
            last = self._last_activity.get(container_id, 0)
            if now - last > SANDBOX_IDLE_TIMEOUT:
                to_remove.append(pid)

        for pid in to_remove:
            try:
                await self.stop_container(UUID(pid))
                logger.info("Cleaned up idle sandbox for project %s", pid[:12])
            except Exception as e:
                logger.warning("Failed to clean up sandbox %s: %s", pid[:12], e)
