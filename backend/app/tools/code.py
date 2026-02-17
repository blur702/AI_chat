"""Code editing tools for reading, writing, and patching files in sandbox containers."""

import asyncio
import logging
from typing import Any, Dict, Optional, Set
from uuid import UUID

from app.kernel.tool_base import BaseTool

logger = logging.getLogger(__name__)
RUN_COMMAND_TIMEOUT_SECONDS = 120


def _get_sandbox_manager():
    """Lazily import and return the sandbox manager from the kernel."""
    from app.main import app
    kernel = getattr(app.state, "kernel", None)
    if kernel is None:
        raise RuntimeError("Kernel not initialized")
    sm = kernel.get_service("sandbox_manager")
    if sm is None:
        raise RuntimeError("SandboxManager not available")
    return sm


class CodeReadTool(BaseTool):
    """Read a file from the project sandbox."""

    @property
    def name(self) -> str:
        return "code_read"

    @property
    def description(self) -> str:
        return (
            "Read the contents of a file from the project workspace. "
            "Use this to examine code before making changes."
        )

    @property
    def parameters_schema(self) -> Dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": (
                        "File path relative to /workspace (e.g., 'src/main.py', "
                        "'package.json'). Or absolute path starting with /."
                    ),
                },
            },
            "required": ["path"],
        }

    @property
    def required_permissions(self) -> Set[str]:
        return {"tools.execute", "tools.read"}

    async def execute(
        self,
        parameters: Dict[str, Any],
        context: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        path = parameters["path"]
        if not path.startswith("/"):
            path = f"/workspace/{path}"
        # Normalize and validate path stays within /workspace
        import posixpath
        path = posixpath.normpath(path)
        if not path.startswith("/workspace/"):
            return {"error": f"Path escapes workspace: {parameters['path']}"}

        project_id = (context or {}).get("project_id")
        if not project_id:
            return {"error": "No project context — cannot determine which sandbox to use."}

        sm = _get_sandbox_manager()
        container_id = await sm.get_or_create_container(UUID(str(project_id)))

        try:
            content = await sm.read_file(container_id, path)
            return {
                "path": path,
                "content": content,
                "size": len(content),
            }
        except FileNotFoundError:
            return {"error": f"File not found: {path}"}
        except Exception as e:
            return {"error": f"Failed to read file: {e}"}


class CodeWriteTool(BaseTool):
    """Write or create a file in the project sandbox."""

    @property
    def name(self) -> str:
        return "code_write"

    @property
    def description(self) -> str:
        return (
            "Write content to a file in the project workspace. "
            "Creates the file and parent directories if they don't exist. "
            "Overwrites existing content."
        )

    @property
    def parameters_schema(self) -> Dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "File path relative to /workspace or absolute.",
                },
                "content": {
                    "type": "string",
                    "description": "Full file content to write.",
                },
            },
            "required": ["path", "content"],
        }

    @property
    def required_permissions(self) -> Set[str]:
        return {"tools.execute", "tools.write"}

    async def execute(
        self,
        parameters: Dict[str, Any],
        context: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        path = parameters["path"]
        content = parameters["content"]
        if not path.startswith("/"):
            path = f"/workspace/{path}"
        import posixpath
        path = posixpath.normpath(path)
        if not path.startswith("/workspace/"):
            return {"error": f"Path escapes workspace: {parameters['path']}"}

        project_id = (context or {}).get("project_id")
        if not project_id:
            return {"error": "No project context — cannot determine which sandbox to use."}

        sm = _get_sandbox_manager()
        container_id = await sm.get_or_create_container(UUID(str(project_id)))

        try:
            await sm.write_file(container_id, path, content)
            return {
                "path": path,
                "written_bytes": len(content.encode("utf-8")),
                "success": True,
            }
        except Exception as e:
            return {"error": f"Failed to write file: {e}"}


class CodePatchTool(BaseTool):
    """Apply a search-and-replace patch to a file."""

    @property
    def name(self) -> str:
        return "code_patch"

    @property
    def description(self) -> str:
        return (
            "Apply a search-and-replace edit to a file. Finds the exact "
            "'old_text' string and replaces it with 'new_text'. Use this "
            "for targeted edits instead of rewriting entire files."
        )

    @property
    def parameters_schema(self) -> Dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "File path relative to /workspace or absolute.",
                },
                "old_text": {
                    "type": "string",
                    "description": "Exact text to find in the file.",
                },
                "new_text": {
                    "type": "string",
                    "description": "Text to replace it with.",
                },
            },
            "required": ["path", "old_text", "new_text"],
        }

    @property
    def required_permissions(self) -> Set[str]:
        return {"tools.execute", "tools.write"}

    async def execute(
        self,
        parameters: Dict[str, Any],
        context: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        path = parameters["path"]
        old_text = parameters["old_text"]
        new_text = parameters["new_text"]
        if not path.startswith("/"):
            path = f"/workspace/{path}"
        import posixpath
        path = posixpath.normpath(path)
        if not path.startswith("/workspace/"):
            return {"error": f"Path escapes workspace: {parameters['path']}"}

        project_id = (context or {}).get("project_id")
        if not project_id:
            return {"error": "No project context — cannot determine which sandbox to use."}

        sm = _get_sandbox_manager()
        container_id = await sm.get_or_create_container(UUID(str(project_id)))

        try:
            current = await sm.read_file(container_id, path)
        except FileNotFoundError:
            return {"error": f"File not found: {path}"}

        if old_text not in current:
            return {
                "error": "old_text not found in file. Make sure you're matching the exact text.",
                "path": path,
            }

        count = current.count(old_text)
        patched = current.replace(old_text, new_text, 1)
        await sm.write_file(container_id, path, patched)

        return {
            "path": path,
            "replacements": 1,
            "total_matches": count,
            "success": True,
        }


class RunCommandTool(BaseTool):
    """Run a shell command in the project sandbox."""

    @property
    def name(self) -> str:
        return "run_command"

    @property
    def description(self) -> str:
        return (
            "Execute a shell command in the project sandbox container. "
            "Use for running tests, installing packages, building, etc. "
            "Commands run in /workspace with sh."
        )

    @property
    def parameters_schema(self) -> Dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "command": {
                    "type": "string",
                    "description": "Shell command to execute (e.g., 'npm test', 'python -m pytest').",
                },
            },
            "required": ["command"],
        }

    @property
    def required_permissions(self) -> Set[str]:
        return {"tools.execute", "tools.write"}

    async def execute(
        self,
        parameters: Dict[str, Any],
        context: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        command = parameters["command"]

        project_id = (context or {}).get("project_id")
        if not project_id:
            return {"error": "No project context — cannot determine which sandbox to use."}

        sm = _get_sandbox_manager()
        container_id = await sm.get_or_create_container(UUID(str(project_id)))

        try:
            exec_info: Dict[str, Any] = {}
            stdout = ""
            stderr = ""

            async def _run() -> int:
                nonlocal exec_info, stdout, stderr
                exec_info = await sm.execute_command(container_id, command)
                async for stream_type, chunk in sm.stream_exec_output(exec_info["exec_id"]):
                    if stream_type == "stdout":
                        stdout += chunk
                    else:
                        stderr += chunk
                return await sm.get_exec_exit_code(exec_info["exec_id"])

            try:
                exit_code = await asyncio.wait_for(_run(), timeout=RUN_COMMAND_TIMEOUT_SECONDS)
            except asyncio.TimeoutError:
                if exec_info.get("exec_id"):
                    terminate = getattr(sm, "terminate_exec", None)
                    if callable(terminate):
                        try:
                            await terminate(container_id, exec_info["exec_id"])
                        except Exception:
                            logger.warning("Failed to terminate timed-out exec %s", exec_info["exec_id"])
                timeout_note = f"Command timed out after {RUN_COMMAND_TIMEOUT_SECONDS} seconds"
                combined_stderr = f"{stderr}\n{timeout_note}" if stderr else timeout_note
                return {
                    "command": command,
                    "exit_code": -1,
                    "stdout": stdout,
                    "stderr": combined_stderr,
                }

            # Truncate long outputs
            max_len = 8000
            if len(stdout) > max_len:
                stdout = stdout[:max_len] + f"\n... (truncated, {len(stdout)} total chars)"
            if len(stderr) > max_len:
                stderr = stderr[:max_len] + f"\n... (truncated, {len(stderr)} total chars)"

            return {
                "command": command,
                "exit_code": exit_code,
                "stdout": stdout,
                "stderr": stderr,
            }
        except Exception as e:
            return {"error": f"Command execution failed: {e}"}
