"""Template scaffolding and sidecar creation for sandbox containers."""

import asyncio
import logging
import posixpath
from typing import List

from docker.errors import DockerException

from app.services.sandbox.constants import COMMAND_TIMEOUT, SANDBOX_IMAGE, SANDBOX_NETWORK
from app.services.sandbox.exec_runner import ExecRunner
from app.services.sandbox.file_ops import FileOps
from app.services.templates import TemplateDefinition, TemplateRegistry

logger = logging.getLogger("workstation.sandbox")


class TemplateApplier:
    """Applies template scaffolding, runs setup commands, and creates sidecars."""

    def __init__(
        self,
        exec_runner: ExecRunner,
        file_ops: FileOps,
        client,
        registry: TemplateRegistry,
        sidecars: dict,
    ) -> None:
        self._exec = exec_runner
        self._file_ops = file_ops
        self._client = client
        self._registry = registry
        self._sidecars = sidecars

    async def build_template_image(self, template: TemplateDefinition) -> str:
        """Build a Docker image from a template's Dockerfile. Returns the image tag."""
        definitions_dir = self._registry._definitions_dir
        dockerfile_path = definitions_dir / template.dockerfile
        if not dockerfile_path.exists():
            logger.error(
                "Dockerfile not found for template %s: %s",
                template.id, dockerfile_path,
            )
            return template.docker_image or SANDBOX_IMAGE

        tag = "workstation-template-{}:latest".format(template.id)
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

    async def apply_template(
        self, container_id: str, project_id: str, template: TemplateDefinition
    ) -> None:
        """Scaffold files, run setup commands, and create sidecars for a template."""
        for file_path, content in template.scaffold_files.items():
            if "\0" in file_path or file_path.startswith("/") or ".." in file_path.split("/"):
                logger.warning("Rejected scaffold path with traversal attempt: %s", file_path)
                continue
            abs_path = posixpath.normpath("/workspace/{}".format(file_path))
            if not abs_path.startswith("/workspace/"):
                logger.warning("Rejected scaffold path escaping /workspace: %s", file_path)
                continue
            try:
                await self._file_ops.write_file(container_id, abs_path, content)
            except Exception:
                logger.exception(
                    "Failed to scaffold %s in container %s",
                    file_path, container_id[:12],
                )

        setup_timeout = COMMAND_TIMEOUT
        for cmd in template.setup_commands:
            try:
                async def _run_setup_cmd() -> None:
                    exec_info = await self._exec.execute_command(container_id, cmd)
                    stderr = ""
                    async for stream_type, chunk in self._exec.stream_exec_output(exec_info["exec_id"]):
                        if stream_type == "stderr":
                            stderr += chunk
                    exit_code = await self._exec.get_exec_exit_code(exec_info["exec_id"])
                    if exit_code != 0:
                        logger.warning(
                            "Setup command failed (exit %d) in %s: %s — %s",
                            exit_code, container_id[:12], cmd, stderr[:200],
                        )

                await asyncio.wait_for(_run_setup_cmd(), timeout=setup_timeout)
            except asyncio.TimeoutError:
                logger.error(
                    "Setup command timed out after %ds in %s: %s",
                    setup_timeout, container_id[:12], cmd,
                )
            except Exception:
                logger.exception("Setup command error in %s: %s", container_id[:12], cmd)

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
                    name="sandbox-{}-{}".format(project_id[:12], sidecar.name),
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
