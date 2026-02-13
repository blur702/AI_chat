"""Automation action executor service.

Handles execution of different automation action types within project
sandboxes using the SandboxManager.
"""

import logging
import os
import re
import shlex
from typing import Any, Dict, Optional
from uuid import UUID

from app.services.sandbox_manager import SandboxManager

logger = logging.getLogger(__name__)


def _validate_sandbox_path(path: str) -> str:
    """Validate that a path stays within /workspace and return the clean path.

    Raises ValueError if the path attempts directory traversal.
    """
    normalized = os.path.normpath(path).replace("\\", "/")
    if not normalized.startswith("/workspace/") and normalized != "/workspace":
        raise ValueError(f"Path must be under /workspace: {path}")
    if ".." in normalized.split("/"):
        raise ValueError(f"Path traversal not allowed: {path}")
    return normalized


class AutomationExecutor:
    """Executes automation actions in project sandboxes."""

    def __init__(self, sandbox_manager: SandboxManager) -> None:
        self._sandbox = sandbox_manager
        self._current_template_id: Optional[str] = None

    async def execute(
        self,
        project_id: UUID,
        action_type: str,
        action_data: Dict[str, Any] | None,
        template_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Dispatch and execute an action based on its type.

        Returns a result dict with 'success' bool and relevant output.
        """
        self._current_template_id = template_id
        data = action_data or {}
        handlers = {
            "file_create": self._execute_file_create,
            "file_modify": self._execute_file_modify,
            "file_delete": self._execute_file_delete,
            "run_command": self._execute_run_command,
            "install_package": self._execute_install_package,
        }

        handler = handlers.get(action_type)
        if handler is None:
            return {"success": False, "error": f"Unknown action type: {action_type}"}

        try:
            return await handler(project_id, data)
        except Exception as exc:
            logger.error(
                "Automation execution failed: type=%s project=%s error=%s",
                action_type, project_id, exc,
            )
            return {"success": False, "error": str(exc)}

    async def _get_container(self, project_id: UUID) -> str:
        return await self._sandbox.get_or_create_container(
            project_id, template_id=self._current_template_id
        )

    async def _execute_file_create(
        self, project_id: UUID, data: Dict[str, Any]
    ) -> Dict[str, Any]:
        path = data.get("path", "")
        content = data.get("content", "")
        if not path:
            return {"success": False, "error": "Missing 'path' in action_data"}

        try:
            safe_path = _validate_sandbox_path(path)
        except ValueError as exc:
            return {"success": False, "error": str(exc)}

        container_id = await self._get_container(project_id)
        await self._sandbox.write_file(container_id, safe_path, content)
        return {"success": True, "path": safe_path}

    async def _execute_file_modify(
        self, project_id: UUID, data: Dict[str, Any]
    ) -> Dict[str, Any]:
        path = data.get("path", "")
        content = data.get("content", "")
        if not path:
            return {"success": False, "error": "Missing 'path' in action_data"}

        try:
            safe_path = _validate_sandbox_path(path)
        except ValueError as exc:
            return {"success": False, "error": str(exc)}

        container_id = await self._get_container(project_id)
        await self._sandbox.write_file(container_id, safe_path, content)
        return {"success": True, "path": safe_path}

    async def _execute_file_delete(
        self, project_id: UUID, data: Dict[str, Any]
    ) -> Dict[str, Any]:
        path = data.get("path", "")
        if not path:
            return {"success": False, "error": "Missing 'path' in action_data"}

        try:
            safe_path = _validate_sandbox_path(path)
        except ValueError as exc:
            return {"success": False, "error": str(exc)}

        container_id = await self._get_container(project_id)
        await self._sandbox.delete_path(container_id, safe_path)
        return {"success": True, "path": safe_path}

    async def _execute_run_command(
        self, project_id: UUID, data: Dict[str, Any]
    ) -> Dict[str, Any]:
        command = data.get("command", "")
        if not command:
            return {"success": False, "error": "Missing 'command' in action_data"}

        container_id = await self._get_container(project_id)
        result = await self._sandbox.execute_command(container_id, command)
        return {
            "success": result.get("exit_code", 1) == 0,
            "exit_code": result.get("exit_code"),
            "stdout": result.get("stdout", ""),
            "stderr": result.get("stderr", ""),
        }

    _SAFE_PACKAGE_PATTERN = re.compile(r"^[a-zA-Z0-9_\-\.@/>=<\[\],: ]{1,200}$")

    async def _execute_install_package(
        self, project_id: UUID, data: Dict[str, Any]
    ) -> Dict[str, Any]:
        package = data.get("package", "")
        manager = data.get("manager", "pip")
        if not package:
            return {"success": False, "error": "Missing 'package' in action_data"}
        if not self._SAFE_PACKAGE_PATTERN.match(package):
            return {"success": False, "error": "Invalid package name"}

        quoted = shlex.quote(package)
        install_commands = {
            "pip": f"pip install {quoted}",
            "npm": f"npm install {quoted}",
            "yarn": f"yarn add {quoted}",
            "pnpm": f"pnpm add {quoted}",
        }

        command = install_commands.get(manager)
        if command is None:
            return {"success": False, "error": f"Unknown package manager: {manager}"}

        container_id = await self._get_container(project_id)
        result = await self._sandbox.execute_command(container_id, command)
        return {
            "success": result.get("exit_code", 1) == 0,
            "exit_code": result.get("exit_code"),
            "stdout": result.get("stdout", ""),
            "stderr": result.get("stderr", ""),
        }
