"""Command execution and streaming for sandbox containers."""

import asyncio
import logging
import time

import docker

logger = logging.getLogger("workstation.sandbox")


class ExecRunner:
    """Executes commands inside Docker containers and streams output."""

    def __init__(self, client: docker.DockerClient, last_activity: dict) -> None:
        self._client = client
        self._last_activity = last_activity

    async def execute_command(self, container_id: str, command: str) -> dict:
        """Execute a command in a container. Returns dict with exec_id."""
        self._last_activity[container_id] = time.time()

        container = await asyncio.to_thread(
            self._client.containers.get, container_id
        )

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
        """Async generator yielding (stream_type, chunk) from an exec instance."""
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
                        loop.call_soon_threadsafe(
                            queue.put_nowait,
                            ("stdout", stdout_chunk.decode("utf-8", errors="replace")),
                        )
                    if stderr_chunk:
                        loop.call_soon_threadsafe(
                            queue.put_nowait,
                            ("stderr", stderr_chunk.decode("utf-8", errors="replace")),
                        )
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

    async def terminate_exec(self, container_id: str, exec_id: str) -> bool:
        """Best-effort termination of a running exec process."""
        try:
            inspect = await asyncio.to_thread(self._client.api.exec_inspect, exec_id)
            pid = inspect.get("Pid")
            if not pid:
                return False
            kill_exec = await asyncio.to_thread(
                self._client.api.exec_create,
                container_id,
                ["sh", "-c", "kill -TERM {} || true".format(int(pid))],
                stdout=False,
                stderr=False,
                tty=False,
                workdir="/workspace",
            )
            await asyncio.to_thread(
                self._client.api.exec_start,
                kill_exec["Id"],
                stream=False,
                demux=False,
            )
            return True
        except Exception:
            logger.exception(
                "Failed to terminate exec %s in container %s",
                exec_id,
                container_id[:12],
            )
            return False

    async def exec_simple(self, container_id: str, command: str) -> str:
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
            raise RuntimeError(
                stderr.strip() or "Command failed with exit code {}".format(exit_code)
            )
        return output
