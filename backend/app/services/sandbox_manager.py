"""SandboxManager - Docker container management for project sandboxes."""

import asyncio
import base64
import io
import logging
import os
import shlex
import tarfile
import time
from typing import Dict, List, Optional, Tuple
from uuid import UUID

import docker
from docker.errors import APIError, DockerException, NotFound

from app.kernel.base import BaseKernelService
from app.services.templates import TemplateDefinition, TemplateRegistry

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
        # project_id -> list of sidecar container IDs
        self._sidecars: Dict[str, List[str]] = {}
        self._template_registry = TemplateRegistry()

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
        self._sidecars.clear()
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

    @property
    def template_registry(self) -> TemplateRegistry:
        """Expose the template registry for use by API endpoints."""
        return self._template_registry

    # -- Container lifecycle --------------------------------------------------

    async def get_or_create_container(
        self,
        project_id: UUID,
        template_id: Optional[str] = None,
        custom_image: Optional[str] = None,
    ) -> str:
        """Get existing or create new container for a project.

        Args:
            project_id: The project UUID.
            template_id: Optional template ID to resolve image/config from registry.
            custom_image: Optional Docker image override (takes precedence over template).

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

        # Resolve template configuration
        template: Optional[TemplateDefinition] = None
        if template_id:
            template = self._template_registry.get(template_id)
            if template is None:
                logger.warning("Template '%s' not found, using default image", template_id)

        # Determine image, memory, cpu, environment
        image = custom_image or SANDBOX_IMAGE
        mem_limit = SANDBOX_MEMORY_LIMIT
        cpu_quota = SANDBOX_CPU_QUOTA
        env_vars: Dict[str, str] = {}

        if template:
            if template.dockerfile:
                image = await self._build_template_image(template)
            elif template.docker_image:
                image = template.docker_image
            mem_limit = template.memory_limit
            cpu_quota = template.cpu_quota
            env_vars = dict(template.environment)

        # Create the main container (with conflict recovery)
        container_name = f"sandbox-{pid[:12]}"
        run_kwargs = dict(
            image=image,
            command="sleep infinity",
            detach=True,
            name=container_name,
            labels={
                "project_id": pid,
                "managed_by": "workstation",
            },
            network=SANDBOX_NETWORK,
            working_dir="/workspace",
            volumes={
                f"sandbox-{pid}": {"bind": "/workspace", "mode": "rw"},
            },
            environment=env_vars or None,
            mem_limit=mem_limit,
            cpu_quota=cpu_quota,
            read_only=False,
            security_opt=["no-new-privileges"],
            cap_drop=["ALL"],
            cap_add=["CHOWN", "SETUID", "SETGID", "DAC_OVERRIDE", "FOWNER"],
        )

        try:
            container = await asyncio.to_thread(
                self._client.containers.run, **run_kwargs
            )
        except APIError as exc:
            if exc.status_code == 409:
                # Name conflict — stale container exists; remove it and retry
                logger.warning(
                    "Container name '%s' conflict (409), removing stale container",
                    container_name,
                )
                try:
                    stale = await asyncio.to_thread(
                        self._client.containers.get, container_name
                    )
                    await asyncio.to_thread(stale.remove, force=True)
                except (NotFound, APIError):
                    pass  # Already gone or removal race
                try:
                    container = await asyncio.to_thread(
                        self._client.containers.run, **run_kwargs
                    )
                except APIError as retry_exc:
                    raise RuntimeError(
                        f"Failed to create sandbox container after removing stale "
                        f"'{container_name}': {retry_exc}"
                    ) from retry_exc
            else:
                raise

        container_id = container.id
        self._containers[pid] = container_id
        self._last_activity[container_id] = time.time()
        logger.info("Created sandbox container %s for project %s", container_id[:12], pid[:12])

        # Apply template scaffolding if provided
        if template:
            await self._apply_template(container_id, pid, template)

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
        """Stop and remove a container and its sidecars for a project."""
        pid = str(project_id)
        container_id = self._containers.pop(pid, None)
        if not container_id:
            return False

        self._last_activity.pop(container_id, None)

        # Clean up sidecar containers first
        sidecar_ids = self._sidecars.pop(pid, [])
        for sc_id in sidecar_ids:
            try:
                sc = await asyncio.to_thread(self._client.containers.get, sc_id)
                await asyncio.to_thread(sc.stop, timeout=10)
                await asyncio.to_thread(sc.remove, force=True)
                logger.info("Stopped sidecar container %s for project %s", sc_id[:12], pid[:12])
            except NotFound:
                pass
            except DockerException as e:
                logger.warning("Failed to stop sidecar %s: %s", sc_id[:12], e)

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

    # -- Template helpers -----------------------------------------------------

    async def _build_template_image(self, template: TemplateDefinition) -> str:
        """Build a Docker image from a template's Dockerfile.

        Returns the image tag.
        """
        from pathlib import Path as _Path

        definitions_dir = self._template_registry._definitions_dir
        dockerfile_path = definitions_dir / template.dockerfile
        if not dockerfile_path.exists():
            logger.error("Dockerfile not found for template %s: %s", template.id, dockerfile_path)
            # Fall back to default image
            return template.docker_image or SANDBOX_IMAGE

        tag = f"workstation-template-{template.id}:latest"
        build_context = str(dockerfile_path.parent)

        try:
            _image, _logs = await asyncio.to_thread(
                self._client.images.build,
                path=build_context,
                tag=tag,
                rm=True,
            )
            logger.info("Built template image %s for %s", tag, template.id)
            return tag
        except DockerException as e:
            logger.error("Failed to build image for template %s: %s", template.id, e)
            return template.docker_image or SANDBOX_IMAGE

    async def _apply_template(
        self, container_id: str, project_id: str, template: TemplateDefinition
    ) -> None:
        """Scaffold files, run setup commands, and create sidecars for a template."""
        # Scaffold files into the container
        for file_path, content in template.scaffold_files.items():
            abs_path = f"/workspace/{file_path}"
            try:
                await self.write_file(container_id, abs_path, content)
            except Exception:
                logger.exception("Failed to scaffold %s in container %s", file_path, container_id[:12])

        # Run setup commands
        for cmd in template.setup_commands:
            try:
                exec_info = await self.execute_command(container_id, cmd)
                stderr = ""
                async for stream_type, chunk in self.stream_exec_output(exec_info["exec_id"]):
                    if stream_type == "stderr":
                        stderr += chunk
                exit_code = await self.get_exec_exit_code(exec_info["exec_id"])
                if exit_code != 0:
                    logger.warning(
                        "Setup command failed (exit %d) in %s: %s — %s",
                        exit_code, container_id[:12], cmd, stderr[:200],
                    )
            except Exception:
                logger.exception("Setup command error in %s: %s", container_id[:12], cmd)

        # Create sidecar containers
        if template.sidecar_services:
            await self._create_sidecars(project_id, template)

    async def _create_sidecars(
        self, project_id: str, template: TemplateDefinition
    ) -> None:
        """Create sidecar containers defined in a template."""
        sidecar_ids: List[str] = []
        for sidecar in template.sidecar_services:
            try:
                sc = await asyncio.to_thread(
                    self._client.containers.run,
                    sidecar.image,
                    detach=True,
                    name=f"sandbox-{project_id[:12]}-{sidecar.name}",
                    labels={
                        "project_id": project_id,
                        "managed_by": "workstation",
                        "sidecar_of": project_id,
                    },
                    network=SANDBOX_NETWORK,
                    environment=sidecar.environment or None,
                    command=sidecar.command,
                    mem_limit=sidecar.memory_limit or "512m",
                )
                sidecar_ids.append(sc.id)
                logger.info(
                    "Created sidecar '%s' (%s) for project %s",
                    sidecar.name, sc.id[:12], project_id[:12],
                )
            except DockerException as e:
                logger.error(
                    "Failed to create sidecar '%s' for project %s: %s",
                    sidecar.name, project_id[:12], e,
                )
        if sidecar_ids:
            self._sidecars[project_id] = sidecar_ids

    # -- Portability: export, clone, snapshots --------------------------------

    async def export_workspace_streaming(self, project_id: UUID):
        """Async generator yielding tar chunks of /workspace.

        Returns chunks of bytes for streaming download.
        """
        pid = str(project_id)
        container_id = self._containers.get(pid)
        if not container_id:
            raise RuntimeError(f"No container for project {pid}")

        queue: asyncio.Queue = asyncio.Queue()
        _SENTINEL = None
        loop = asyncio.get_running_loop()

        def _reader():
            try:
                stream, _stat = self._client.api.get_archive(container_id, "/workspace")
                for chunk in stream:
                    loop.call_soon_threadsafe(queue.put_nowait, chunk)
            except Exception:
                logger.exception("export_workspace_streaming reader error")
            finally:
                loop.call_soon_threadsafe(queue.put_nowait, _SENTINEL)

        loop.run_in_executor(None, _reader)

        while True:
            item = await queue.get()
            if item is _SENTINEL:
                break
            yield item

    # Maximum workspace size for clone operations (default 2GB)
    CLONE_MAX_SIZE = int(os.getenv("SANDBOX_CLONE_MAX_SIZE", str(2 * 1024 * 1024 * 1024)))

    async def clone_volume(self, source_project_id: UUID, dest_project_id: UUID) -> None:
        """Copy workspace data from one container to another via get_archive/put_archive.

        Streams the archive through a temporary file to avoid OOM on large workspaces.
        Aborts if the archive exceeds CLONE_MAX_SIZE.
        """
        import tempfile as _tempfile

        src_pid = str(source_project_id)
        src_container_id = self._containers.get(src_pid)
        if not src_container_id:
            raise RuntimeError(f"No container for source project {src_pid}")

        # Ensure destination container exists
        dest_container_id = await self.get_or_create_container(dest_project_id)

        # Stream archive from source into a temporary file
        tmp = _tempfile.NamedTemporaryFile(delete=False, suffix=".tar")
        tmp_path = tmp.name
        max_size = self.CLONE_MAX_SIZE

        def _stream_to_file() -> int:
            """Download Docker archive to temp file (runs in thread)."""
            stream, _stat = self._client.api.get_archive(
                src_container_id, "/workspace"
            )
            written = 0
            for chunk in stream:
                written += len(chunk)
                if written > max_size:
                    tmp.close()
                    raise RuntimeError(
                        f"Workspace archive exceeds size limit "
                        f"({written} > {max_size} bytes)"
                    )
                tmp.write(chunk)
            tmp.close()
            return written

        def _put_from_file() -> None:
            """Upload temp file into destination container (runs in thread)."""
            with open(tmp_path, "rb") as f:
                self._client.api.put_archive(dest_container_id, "/", f)

        try:
            written = await asyncio.to_thread(_stream_to_file)
            await asyncio.to_thread(_put_from_file)
            logger.info(
                "Cloned workspace from %s to %s (%d bytes)",
                src_pid[:12], str(dest_project_id)[:12], written,
            )
        finally:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass

    async def create_snapshot(self, project_id: UUID, snapshot_name: str) -> str:
        """Save a container as a Docker image. Returns the image tag."""
        pid = str(project_id)
        container_id = self._containers.get(pid)
        if not container_id:
            raise RuntimeError(f"No container for project {pid}")

        repo = f"workstation-snapshot-{pid[:12]}/{snapshot_name}"
        tag = "latest"

        result = await asyncio.to_thread(
            self._client.api.commit, container_id, repo, tag
        )
        image_id = result.get("Id", "")
        logger.info("Created snapshot %s:%s for project %s", repo, tag, pid[:12])
        return image_id

    async def list_snapshots(self, project_id: UUID) -> list[dict]:
        """List snapshot images for a project."""
        pid = str(project_id)
        repo_prefix = f"workstation-snapshot-{pid[:12]}"

        images = await asyncio.to_thread(
            self._client.images.list, name=f"{repo_prefix}/*"
        )

        snapshots = []
        for img in images:
            for tag in img.tags:
                # tag format: "workstation-snapshot-xxxx/name:latest"
                parts = tag.split("/", 1)
                if len(parts) == 2:
                    name_tag = parts[1]
                    name = name_tag.rsplit(":", 1)[0] if ":" in name_tag else name_tag
                    created = img.attrs.get("Created", "")
                    size = img.attrs.get("Size", 0)
                    snapshots.append({
                        "name": name,
                        "image_id": img.short_id,
                        "created_at": created,
                        "size": size,
                    })
        return snapshots

    async def restore_snapshot(self, project_id: UUID, snapshot_name: str) -> str:
        """Recreate a container from a snapshot image. Returns new container ID."""
        pid = str(project_id)
        repo = f"workstation-snapshot-{pid[:12]}/{snapshot_name}"
        tag = "latest"
        image_ref = f"{repo}:{tag}"

        # Verify snapshot image exists
        try:
            await asyncio.to_thread(self._client.images.get, image_ref)
        except NotFound:
            raise RuntimeError(f"Snapshot '{snapshot_name}' not found for project {pid[:12]}")

        # Stop current container if running
        await self.stop_container(project_id)

        # Create new container from snapshot image
        container_id = await self.get_or_create_container(
            project_id, custom_image=image_ref
        )
        logger.info("Restored snapshot %s for project %s", snapshot_name, pid[:12])
        return container_id

    async def delete_snapshot(self, project_id: UUID, snapshot_name: str) -> None:
        """Remove a snapshot image."""
        pid = str(project_id)
        repo = f"workstation-snapshot-{pid[:12]}/{snapshot_name}"
        tag = "latest"
        image_ref = f"{repo}:{tag}"

        try:
            await asyncio.to_thread(self._client.images.remove, image_ref)
            logger.info("Deleted snapshot %s for project %s", snapshot_name, pid[:12])
        except NotFound:
            raise RuntimeError(f"Snapshot '{snapshot_name}' not found")

    # -- Internal helpers -----------------------------------------------------

    async def _recover_containers(self) -> None:
        """Discover existing sandbox containers managed by this service."""
        try:
            containers = await asyncio.to_thread(
                self._client.containers.list,
                filters={"label": "managed_by=workstation"},
                all=True,
            )
            removed = 0
            for container in containers:
                pid = container.labels.get("project_id")
                if not pid:
                    continue
                # Remove containers stuck in "created" state — they block
                # new container creation with a 409 name conflict.
                if container.status == "created":
                    try:
                        await asyncio.to_thread(container.remove, force=True)
                        removed += 1
                        logger.info(
                            "Removed stale 'created' container %s for project %s",
                            container.short_id, pid[:12],
                        )
                    except (NotFound, APIError):
                        pass
                    continue
                self._containers[pid] = container.id
                self._last_activity[container.id] = time.time()
            if self._containers:
                logger.info("Recovered %d sandbox containers", len(self._containers))
            if removed:
                logger.info("Cleaned up %d stale containers", removed)
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
