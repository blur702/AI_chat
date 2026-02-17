"""Container creation, recovery, and cleanup for sandbox management."""

import asyncio
import logging
import time
from typing import Dict, List, Optional, Tuple
from uuid import UUID

from docker.errors import APIError, DockerException, NotFound

from app.services.sandbox.constants import (
    CREATION_FAILURE_COOLDOWN,
    SANDBOX_CPU_QUOTA,
    SANDBOX_IDLE_TIMEOUT,
    SANDBOX_IMAGE,
    SANDBOX_MEMORY_LIMIT,
    SANDBOX_NETWORK,
)
from app.services.sandbox.tech_merger import TechMerger
from app.services.sandbox.template_applier import TemplateApplier
from app.services.templates import TemplateDefinition, TemplateRegistry

logger = logging.getLogger("workstation.sandbox")


class ContainerLifecycle:
    """Manages container creation, recovery, and idle cleanup."""

    def __init__(
        self,
        client,
        containers: Dict[str, str],
        last_activity: Dict[str, float],
        creation_locks: Dict[str, asyncio.Lock],
        applied_templates: Dict[str, str],
        creation_failures: Dict[str, Tuple[float, str]],
        sidecars: Dict[str, List[str]],
        registry: TemplateRegistry,
        tech_merger: TechMerger,
        template_applier: TemplateApplier,
    ) -> None:
        self._client = client
        self._containers = containers
        self._last_activity = last_activity
        self._creation_locks = creation_locks
        self._applied_templates = applied_templates
        self._creation_failures = creation_failures
        self._sidecars = sidecars
        self._registry = registry
        self._tech_merger = tech_merger
        self._template_applier = template_applier

    async def get_or_create_container(
        self,
        project_id: UUID,
        template_id: Optional[str] = None,
        custom_image: Optional[str] = None,
        selected_technologies: Optional[List[str]] = None,
    ) -> str:
        """Get existing or create new container for a project."""
        pid = str(project_id)
        config_key = template_id or ""
        if selected_technologies:
            config_key = ",".join(sorted(selected_technologies))

        self._check_circuit_breaker(pid)

        # Fast path: container already tracked and running
        fast = await self._try_fast_path(pid, config_key)
        if fast is not None:
            return fast

        lock = self._creation_locks.setdefault(pid, asyncio.Lock())

        async with lock:
            # Re-check under lock
            if pid in self._containers:
                container_id = self._containers[pid]
                try:
                    container = await asyncio.to_thread(
                        self._client.containers.get, container_id
                    )
                    if container.status != "running":
                        await asyncio.to_thread(container.start)
                    self._last_activity[container_id] = time.time()

                    if config_key and self._applied_templates.get(pid) != config_key:
                        if selected_technologies:
                            merged = self._tech_merger.merge_technologies(selected_technologies)
                            await self._template_applier.apply_template(container_id, pid, merged)
                            self._applied_templates[pid] = config_key
                            logger.info(
                                "Applied technologies %s to existing container for project %s",
                                selected_technologies, pid[:12],
                            )
                        elif template_id:
                            template = self._registry.get(template_id)
                            if template:
                                await self._template_applier.apply_template(container_id, pid, template)
                                self._applied_templates[pid] = config_key
                                logger.info(
                                    "Applied template '%s' to existing container for project %s",
                                    template_id, pid[:12],
                                )

                    return container_id
                except NotFound:
                    del self._containers[pid]
                    if container_id in self._last_activity:
                        del self._last_activity[container_id]

            # Resolve configuration
            template: Optional[TemplateDefinition] = None
            if selected_technologies:
                template = self._tech_merger.merge_technologies(selected_technologies)
            elif template_id:
                template = self._registry.get(template_id)
                if template is None:
                    logger.warning("Template '%s' not found, using default image", template_id)

            image, mem_limit, cpu_quota, env_vars = self._resolve_template_config(
                template, custom_image,
            )

            # Build image if needed
            if template and template.dockerfile:
                image = await self._template_applier.build_template_image(template)

            container_name = "sandbox-{}".format(pid[:12])
            run_kwargs = self._build_run_kwargs(
                pid, container_name, image, template_id,
                selected_technologies, env_vars, mem_limit, cpu_quota,
            )

            try:
                container = await self._create_container_with_retry(
                    container_name, run_kwargs
                )
            except Exception as create_err:
                self._creation_failures[pid] = (time.time(), str(create_err)[:200])
                raise

            container_id = container.id
            self._containers[pid] = container_id
            self._last_activity[container_id] = time.time()
            logger.info(
                "Created sandbox container %s for project %s",
                container_id[:12], pid[:12],
            )

            if template:
                try:
                    await self._template_applier.apply_template(container_id, pid, template)
                except Exception:
                    logger.exception(
                        "Template application failed for project %s, "
                        "marking as applied to prevent infinite retry",
                        pid[:12],
                    )
                self._applied_templates[pid] = config_key

            return container_id

    def _check_circuit_breaker(self, pid: str) -> None:
        """Raise if this project failed container creation recently."""
        if pid in self._creation_failures:
            fail_time, _fail_msg = self._creation_failures[pid]
            if time.time() - fail_time < CREATION_FAILURE_COOLDOWN:
                raise RuntimeError(
                    "Container creation for project {} is in cooldown "
                    "({}s). Please retry later.".format(pid[:12], CREATION_FAILURE_COOLDOWN)
                )
            self._creation_failures.pop(pid, None)

    async def _try_fast_path(self, pid: str, config_key: str) -> Optional[str]:
        """Return container_id if already running, else None."""
        if pid in self._containers and (not config_key or self._applied_templates.get(pid) == config_key):
            container_id = self._containers[pid]
            try:
                container = await asyncio.to_thread(
                    self._client.containers.get, container_id
                )
                if container.status == "running":
                    self._last_activity[container_id] = time.time()
                    return container_id
                await asyncio.to_thread(container.start)
                self._last_activity[container_id] = time.time()
                return container_id
            except NotFound:
                del self._containers[pid]
                if container_id in self._last_activity:
                    del self._last_activity[container_id]
        return None

    @staticmethod
    def _resolve_template_config(template, custom_image):
        """Return (image, mem_limit, cpu_quota, env_vars) from template or defaults."""
        image = custom_image or SANDBOX_IMAGE
        mem_limit = SANDBOX_MEMORY_LIMIT
        cpu_quota = SANDBOX_CPU_QUOTA
        env_vars: Dict[str, str] = {}

        if template:
            if template.docker_image and not template.dockerfile:
                image = template.docker_image
            mem_limit = template.memory_limit
            cpu_quota = template.cpu_quota
            env_vars = dict(template.environment)

        return image, mem_limit, cpu_quota, env_vars

    @staticmethod
    def _build_run_kwargs(
        pid, container_name, image, template_id,
        selected_technologies, env_vars, mem_limit, cpu_quota,
    ) -> dict:
        """Construct Docker run kwargs (pure function)."""
        return dict(
            image=image,
            command="sleep infinity",
            detach=True,
            name=container_name,
            labels={
                "project_id": pid,
                "managed_by": "workstation",
                "template_id": template_id or "",
                "technologies": ",".join(selected_technologies) if selected_technologies else "",
            },
            network=SANDBOX_NETWORK,
            working_dir="/workspace",
            volumes={
                "sandbox-{}".format(pid): {"bind": "/workspace", "mode": "rw"},
            },
            environment=env_vars or None,
            mem_limit=mem_limit,
            cpu_quota=cpu_quota,
            read_only=False,
            security_opt=["no-new-privileges"],
            cap_drop=["ALL"],
            cap_add=["CHOWN", "SETUID", "SETGID", "DAC_OVERRIDE", "FOWNER"],
        )

    async def _create_container_with_retry(self, container_name: str, run_kwargs: dict):
        """Create a container, handling 409 name conflicts with one retry."""
        for attempt in range(2):
            try:
                return await asyncio.to_thread(
                    self._client.containers.run, **run_kwargs
                )
            except APIError as exc:
                if exc.status_code in (400, 500):
                    logger.warning(
                        "Container '%s' failed to start (attempt %d, status %d): %s",
                        container_name, attempt + 1, exc.status_code, str(exc)[:200],
                    )
                    await self._remove_container_by_name(container_name)
                    if attempt == 0:
                        await asyncio.sleep(1)
                        continue
                    raise RuntimeError(
                        "Container '{}' failed to start after cleanup retry: {}".format(
                            container_name, str(exc)[:200]
                        )
                    ) from exc

                if exc.status_code == 409 and attempt == 0:
                    logger.warning(
                        "Container name '%s' conflict (409), removing stale container",
                        container_name,
                    )
                    await self._remove_container_by_name(container_name)
                    await asyncio.sleep(0.5)
                    continue

                raise

        raise RuntimeError("Failed to create container '{}'".format(container_name))

    async def _remove_container_by_name(self, name: str) -> None:
        """Force-remove a container by name, ignoring NotFound."""
        try:
            stale = await asyncio.to_thread(self._client.containers.get, name)
            await asyncio.to_thread(stale.remove, force=True)
        except NotFound:
            pass
        except APIError as e:
            logger.warning("Failed to remove container '%s': %s", name, e)

    async def stop_container(self, project_id: UUID) -> bool:
        """Stop and remove a container and its sidecars for a project."""
        pid = str(project_id)
        container_id = self._containers.pop(pid, None)
        self._creation_locks.pop(pid, None)
        self._applied_templates.pop(pid, None)
        self._creation_failures.pop(pid, None)
        if not container_id:
            return False

        self._last_activity.pop(container_id, None)

        sidecar_ids = self._sidecars.pop(pid, [])
        for sc_id in sidecar_ids:
            try:
                sc = await asyncio.to_thread(self._client.containers.get, sc_id)
                await asyncio.to_thread(sc.stop, timeout=10)
                await asyncio.to_thread(sc.remove, force=True)
                logger.info(
                    "Stopped sidecar container %s for project %s",
                    sc_id[:12], pid[:12],
                )
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
            logger.info(
                "Stopped sandbox container %s for project %s",
                container_id[:12], pid[:12],
            )
            return True
        except NotFound:
            return True
        except DockerException as e:
            logger.error("Failed to stop container %s: %s", container_id[:12], e)
            return False

    async def recover_containers(self) -> None:
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
                recovered_techs = container.labels.get("technologies", "")
                recovered_template = container.labels.get("template_id", "")
                if recovered_techs:
                    self._applied_templates[pid] = ",".join(sorted(recovered_techs.split(",")))
                elif recovered_template:
                    self._applied_templates[pid] = recovered_template
            if self._containers:
                logger.info("Recovered %d sandbox containers", len(self._containers))
            if removed:
                logger.info("Cleaned up %d stale containers", removed)
        except DockerException as e:
            logger.warning("Failed to recover containers: %s", e)

    async def cleanup_idle_containers(self) -> None:
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
