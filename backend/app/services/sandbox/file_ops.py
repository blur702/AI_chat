"""File system operations inside sandbox containers."""

import asyncio
import base64
import io
import logging
import os
import shlex
import tarfile
import time

from app.services.sandbox.exec_runner import ExecRunner

logger = logging.getLogger("workstation.sandbox")


class FileOps:
    """File read/write/list/delete operations inside Docker containers."""

    def __init__(self, exec_runner: ExecRunner, client, last_activity: dict) -> None:
        self._exec = exec_runner
        self._client = client
        self._last_activity = last_activity

    async def list_directory(self, container_id: str, dir_path: str = "/workspace") -> list[dict]:
        """List directory contents with metadata."""
        safe_dir = shlex.quote(dir_path)
        cmd = (
            "find {} -maxdepth 1 -mindepth 1 "
            "-printf '%y\\t%s\\t%T@\\t%P\\n' 2>/dev/null | sort -t'\\t' -k4"
        ).format(safe_dir)
        exec_info = await self._exec.execute_command(container_id, cmd)
        output = ""
        async for stream_type, chunk in self._exec.stream_exec_output(exec_info["exec_id"]):
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
            rel_path = "{}/{}".format(dir_path, name)
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
        """Recursively list all files and directories under dir_path."""
        safe_dir = shlex.quote(dir_path)
        cmd = (
            "find {} -mindepth 1 "
            "-printf '%y\\t%s\\t%T@\\t%p\\n' 2>/dev/null | sort -t'\\t' -k4"
        ).format(safe_dir)
        exec_info = await self._exec.execute_command(container_id, cmd)
        output = ""
        async for stream_type, chunk in self._exec.stream_exec_output(exec_info["exec_id"]):
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
        exec_info = await self._exec.execute_command(
            container_id, "cat {}".format(shlex.quote(file_path))
        )
        output = ""
        stderr = ""
        async for stream_type, chunk in self._exec.stream_exec_output(exec_info["exec_id"]):
            if stream_type == "stdout":
                output += chunk
            else:
                stderr += chunk

        exit_code = await self._exec.get_exec_exit_code(exec_info["exec_id"])
        if exit_code != 0:
            raise FileNotFoundError(
                stderr.strip() or "Failed to read {}".format(file_path)
            )
        return output

    async def write_file(self, container_id: str, file_path: str, content: str) -> None:
        """Write content to a file in the container. Creates parent dirs as needed."""
        dir_path = file_path.rsplit("/", 1)[0] if "/" in file_path else "/workspace"
        await self._exec.exec_simple(
            container_id, "mkdir -p {}".format(shlex.quote(dir_path))
        )

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
                    raise IOError("Failed to write {}".format(file_path))
                self._last_activity[container_id] = time.time()
                return
            except Exception as exc:
                if len(content_bytes) > 4096:
                    raise IOError(
                        "Failed to write {}".format(file_path)
                    ) from exc

        # Fallback path for small writes
        encoded = base64.b64encode(content_bytes).decode("ascii")
        cmd = "echo {} | base64 -d > {}".format(
            shlex.quote(encoded), shlex.quote(file_path)
        )
        exec_info = await self._exec.execute_command(container_id, cmd)
        stderr = ""
        async for stream_type, chunk in self._exec.stream_exec_output(exec_info["exec_id"]):
            if stream_type == "stderr":
                stderr += chunk
        exit_code = await self._exec.get_exec_exit_code(exec_info["exec_id"])
        if exit_code != 0:
            raise IOError(
                stderr.strip() or "Failed to write {}".format(file_path)
            )

    async def create_directory(self, container_id: str, dir_path: str) -> None:
        """Create a directory (and parents) in the container."""
        await self._exec.exec_simple(
            container_id, "mkdir -p {}".format(shlex.quote(dir_path))
        )

    async def delete_path(self, container_id: str, path: str, recursive: bool = False) -> None:
        """Delete a file or directory in the container."""
        safe_path = shlex.quote(path)
        cmd = "rm -rf {}".format(safe_path) if recursive else "rm -f {}".format(safe_path)
        type_check = await self._exec.exec_simple(
            container_id,
            "test -d {} && echo dir || echo file".format(safe_path),
        )
        if type_check.strip() == "dir":
            cmd = "rm -rf {}".format(safe_path)
        await self._exec.exec_simple(container_id, cmd)

    async def rename_path(self, container_id: str, old_path: str, new_path: str) -> None:
        """Rename/move a file or directory in the container."""
        new_dir = new_path.rsplit("/", 1)[0] if "/" in new_path else "/workspace"
        await self._exec.exec_simple(
            container_id, "mkdir -p {}".format(shlex.quote(new_dir))
        )
        exec_info = await self._exec.execute_command(
            container_id,
            "mv {} {}".format(shlex.quote(old_path), shlex.quote(new_path)),
        )
        stderr = ""
        async for stream_type, chunk in self._exec.stream_exec_output(exec_info["exec_id"]):
            if stream_type == "stderr":
                stderr += chunk
        exit_code = await self._exec.get_exec_exit_code(exec_info["exec_id"])
        if exit_code != 0:
            raise FileNotFoundError(
                stderr.strip() or "Failed to rename {}".format(old_path)
            )

    async def file_exists(self, container_id: str, path: str) -> bool:
        """Check if a file or directory exists."""
        result = await self._exec.exec_simple(
            container_id,
            "test -e {} && echo yes || echo no".format(shlex.quote(path)),
        )
        return result.strip() == "yes"

    async def is_directory(self, container_id: str, path: str) -> bool:
        """Check if a path is a directory."""
        result = await self._exec.exec_simple(
            container_id,
            "test -d {} && echo yes || echo no".format(shlex.quote(path)),
        )
        return result.strip() == "yes"
