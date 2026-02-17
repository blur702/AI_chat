"""Async SSH client for VPS operations (clone/push Drupal staging)."""

import asyncio
import logging
import os
import tempfile
from pathlib import Path
from typing import Optional

import asyncssh

from app.kernel import KernelService

logger = logging.getLogger(__name__)


class SSHClient(KernelService):
    """Async SSH client for executing commands and transferring files on the VPS."""

    service_name = "ssh_client"

    def __init__(self):
        super().__init__()
        self._host = os.getenv("DRUPAL_VPS_HOST", "")
        self._user = os.getenv("DRUPAL_VPS_USER", "root")
        self._password = os.getenv("DRUPAL_VPS_PASSWORD", "")
        self._key_path = os.getenv("DRUPAL_VPS_KEY_PATH", "")
        self._port = int(os.getenv("DRUPAL_VPS_PORT", "22"))
        self._conn: Optional[asyncssh.SSHClientConnection] = None

    @property
    def is_configured(self) -> bool:
        return bool(self._host and (self._password or self._key_path))

    async def startup(self) -> None:
        if not self.is_configured:
            logger.info("SSHClient not configured (no DRUPAL_VPS_HOST or credentials)")
            return
        logger.info("SSHClient configured for %s@%s:%d", self._user, self._host, self._port)

    async def shutdown(self) -> None:
        if self._conn:
            self._conn.close()
            self._conn = None
            logger.info("SSHClient connection closed")

    async def health_check(self) -> tuple[bool, str]:
        if not self.is_configured:
            return False, "SSH not configured (missing DRUPAL_VPS_HOST or credentials)"
        try:
            conn = await self._get_connection()
            result = await conn.run("echo ok", timeout=5)
            if result.stdout.strip() == "ok":
                return True, "ok"
            return False, f"unexpected output: {result.stdout.strip()}"
        except Exception as e:
            self._conn = None
            return False, f"SSH health check failed: {e}"

    async def _get_connection(self) -> asyncssh.SSHClientConnection:
        """Get or create an SSH connection."""
        if self._conn is not None:
            try:
                # Test if connection is still alive
                await asyncio.wait_for(self._conn.run("true", timeout=3), timeout=5)
                return self._conn
            except Exception:
                self._conn = None

        connect_kwargs: dict = {
            "host": self._host,
            "port": self._port,
            "username": self._user,
            "known_hosts": None,  # Accept any host key (trusted VPS)
        }
        if self._key_path and os.path.isfile(self._key_path):
            connect_kwargs["client_keys"] = [self._key_path]
        elif self._password:
            connect_kwargs["password"] = self._password

        self._conn = await asyncio.wait_for(
            asyncssh.connect(**connect_kwargs),
            timeout=30,
        )
        logger.info("SSH connection established to %s@%s", self._user, self._host)
        return self._conn

    async def execute(self, command: str, timeout: float = 60) -> dict:
        """Run a command on the VPS and return stdout/stderr/exit_code."""
        conn = await self._get_connection()
        result = await conn.run(command, timeout=timeout)
        return {
            "stdout": result.stdout or "",
            "stderr": result.stderr or "",
            "exit_code": result.exit_status or 0,
        }

    async def download_stream(self, remote_cmd: str, local_path: str, timeout: float = 600) -> str:
        """Stream a remote command's stdout to a local file.

        Useful for: mysqldump | gzip, tar czf - ...
        Returns the local file path.
        """
        conn = await self._get_connection()

        async def _stream():
            async with conn.create_process(remote_cmd) as process:
                with open(local_path, "wb") as f:
                    async for chunk in process.stdout:
                        if isinstance(chunk, str):
                            f.write(chunk.encode())
                        else:
                            f.write(chunk)

        await asyncio.wait_for(_stream(), timeout=timeout)
        return local_path

    async def upload_stream(self, remote_cmd: str, local_path: str, timeout: float = 600) -> dict:
        """Pipe a local file to a remote command's stdin.

        Useful for: gunzip | mysql, tar xzf - ...
        """
        conn = await self._get_connection()
        async with conn.create_process(remote_cmd) as process:
            with open(local_path, "rb") as f:
                while True:
                    chunk = f.read(65536)
                    if not chunk:
                        break
                    process.stdin.write(chunk)
                process.stdin.write_eof()
            await asyncio.wait_for(process.wait(), timeout=timeout)
            stderr_output = await process.stderr.read() if process.stderr else ""
        return {
            "exit_code": process.exit_status or 0,
            "stderr": stderr_output,
        }

    async def download_file(self, remote_path: str, local_path: str) -> str:
        """SCP download a single file."""
        conn = await self._get_connection()
        await asyncssh.scp((conn, remote_path), local_path)
        return local_path

    async def upload_file(self, local_path: str, remote_path: str) -> None:
        """SCP upload a single file."""
        conn = await self._get_connection()
        await asyncssh.scp(local_path, (conn, remote_path))
