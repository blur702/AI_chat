"""Workspace export, clone, snapshot, and Docker image export operations."""

import asyncio
import logging
import os
from typing import Dict, List
from uuid import UUID

from docker.errors import DockerException, NotFound

from app.services.sandbox.constants import EXPORTED_IMAGE_TRACKING_MAX, SANDBOX_NETWORK
from app.services.templates import TemplateRegistry

logger = logging.getLogger("workstation.sandbox")


class Portability:
    """Export, clone, snapshot, and Docker image operations for sandbox projects."""

    def __init__(
        self,
        client,
        containers: Dict[str, str],
        registry: TemplateRegistry,
        exported_images: Dict[str, str],
        # get_or_create callback to avoid circular dep
        get_or_create_fn,
        stop_fn,
    ) -> None:
        self._client = client
        self._containers = containers
        self._registry = registry
        self._exported_images = exported_images
        self._get_or_create = get_or_create_fn
        self._stop = stop_fn

    async def export_workspace_streaming(self, project_id: UUID):
        """Async generator yielding tar chunks of /workspace."""
        pid = str(project_id)
        container_id = self._containers.get(pid)
        if not container_id:
            raise RuntimeError("No container for project {}".format(pid))

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

    CLONE_MAX_SIZE = int(os.getenv("SANDBOX_CLONE_MAX_SIZE", str(2 * 1024 * 1024 * 1024)))

    async def clone_volume(self, source_project_id: UUID, dest_project_id: UUID) -> None:
        """Copy workspace data from one container to another."""
        import tempfile as _tempfile

        src_pid = str(source_project_id)
        src_container_id = self._containers.get(src_pid)
        if not src_container_id:
            raise RuntimeError("No container for source project {}".format(src_pid))

        dest_container_id = await self._get_or_create(dest_project_id)

        tmp = _tempfile.NamedTemporaryFile(delete=False, suffix=".tar")
        tmp_path = tmp.name
        max_size = self.CLONE_MAX_SIZE

        def _stream_to_file() -> int:
            stream, _stat = self._client.api.get_archive(src_container_id, "/workspace")
            written = 0
            for chunk in stream:
                written += len(chunk)
                if written > max_size:
                    tmp.close()
                    raise RuntimeError(
                        "Workspace archive exceeds size limit "
                        "({} > {} bytes)".format(written, max_size)
                    )
                tmp.write(chunk)
            tmp.close()
            return written

        def _put_from_file() -> None:
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
            raise RuntimeError("No container for project {}".format(pid))

        repo = "workstation-snapshot-{}/{}".format(pid[:12], snapshot_name)
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
        repo_prefix = "workstation-snapshot-{}".format(pid[:12])

        images = await asyncio.to_thread(
            self._client.images.list, name="{}/*".format(repo_prefix)
        )

        snapshots = []
        for img in images:
            for tag in img.tags:
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
        repo = "workstation-snapshot-{}/{}".format(pid[:12], snapshot_name)
        tag = "latest"
        image_ref = "{}:{}".format(repo, tag)

        try:
            await asyncio.to_thread(self._client.images.get, image_ref)
        except NotFound:
            raise RuntimeError(
                "Snapshot '{}' not found for project {}".format(snapshot_name, pid[:12])
            )

        await self._stop(project_id)
        container_id = await self._get_or_create(project_id, custom_image=image_ref)
        logger.info("Restored snapshot %s for project %s", snapshot_name, pid[:12])
        return container_id

    async def delete_snapshot(self, project_id: UUID, snapshot_name: str) -> None:
        """Remove a snapshot image."""
        pid = str(project_id)
        repo = "workstation-snapshot-{}/{}".format(pid[:12], snapshot_name)
        tag = "latest"
        image_ref = "{}:{}".format(repo, tag)

        try:
            await asyncio.to_thread(self._client.images.remove, image_ref)
            logger.info("Deleted snapshot %s for project %s", snapshot_name, pid[:12])
        except NotFound:
            raise RuntimeError("Snapshot '{}' not found".format(snapshot_name))

    async def export_as_docker_image(
        self,
        project_id: UUID,
        image_name: str | None = None,
        include_compose: bool = True,
        include_tar: bool = False,
        template_id: str | None = None,
    ) -> dict:
        """Export a project container as a portable Docker image."""
        pid = str(project_id)
        container_id = self._containers.get(pid)
        if not container_id:
            raise RuntimeError("No container for project {}".format(pid))

        if not image_name:
            image_name = "workstation-export-{}".format(pid[:12])
        image_name = image_name.lower().replace(" ", "-")
        repo = image_name
        tag = "latest"

        result = await asyncio.to_thread(
            self._client.api.commit, container_id, repo, tag
        )
        image_id = result.get("Id", "")
        logger.info("Exported project %s as image %s:%s", pid[:12], repo, tag)

        response: dict = {
            "image_id": image_id,
            "image_name": "{}:{}".format(repo, tag),
        }
        if image_id:
            self._track_exported_image(image_id, pid)

        if include_compose:
            compose = await self._generate_compose_file(
                pid, image_name, tag, container_id, template_id
            )
            response["compose_file"] = compose

        if include_tar:
            response["tar_download_url"] = "/api/projects/{}/export-docker/{}/download".format(pid, image_id)

        return response

    async def _generate_compose_file(
        self,
        project_id: str,
        image_name: str,
        tag: str,
        container_id: str,
        template_id: str | None,
    ) -> str:
        """Generate a docker-compose.yml based on the container and template metadata."""
        import yaml

        try:
            container = await asyncio.to_thread(self._client.containers.get, container_id)
            config = container.attrs.get("Config", {})
            labels = container.labels or {}
        except Exception:
            config = {}
            labels = {}

        exposed_ports_raw = config.get("ExposedPorts", {})
        ports = []
        for port_key in exposed_ports_raw:
            port_num = port_key.split("/")[0]
            ports.append("{}:{}".format(port_num, port_num))

        env_vars = config.get("Env", [])
        environment = [e for e in env_vars if not e.startswith("PATH=")]

        sidecar_services: list = []
        technology_ports: List[int] = []

        if template_id:
            template_def = self._registry.get(template_id)
            if template_def:
                sidecar_services = list(template_def.sidecar_services)
                technology_ports = list(template_def.exposed_ports)
        else:
            tech_label = labels.get("technologies", "")
            if tech_label:
                tech_ids = [t.strip() for t in tech_label.split(",") if t.strip()]
                seen_sidecars: set = set()
                for tech_id in tech_ids:
                    tech = self._registry.get_technology(tech_id)
                    if tech is None:
                        continue
                    for sc in tech.sidecar_services:
                        if sc.name not in seen_sidecars:
                            seen_sidecars.add(sc.name)
                            sidecar_services.append(sc)
                    for p in tech.exposed_ports:
                        if p not in technology_ports:
                            technology_ports.append(p)

        if not ports and technology_ports:
            ports = ["{}:{}".format(p, p) for p in technology_ports]

        service = {
            "image": "{}:{}".format(image_name, tag),
            "ports": ports if ports else ["3000:3000"],
            "volumes": ["./workspace:/workspace"],
            "working_dir": "/workspace",
            "restart": "unless-stopped",
        }
        if environment:
            service["environment"] = environment

        compose_dict = {
            "version": "3.8",
            "services": {
                "app": service,
            },
        }

        for sidecar in sidecar_services:
            sidecar_ports = ["{}:{}".format(p, p) for p in sidecar.exposed_ports]
            sidecar_svc: dict = {
                "image": sidecar.image,
                "restart": "unless-stopped",
            }
            if sidecar_ports:
                sidecar_svc["ports"] = sidecar_ports
            if sidecar.environment:
                sidecar_svc["environment"] = sidecar.environment
            compose_dict["services"][sidecar.name] = sidecar_svc

        return yaml.dump(compose_dict, default_flow_style=False, sort_keys=False)

    async def export_docker_tar_streaming(self, image_id: str):
        """Async generator yielding tar chunks of a Docker image for download."""
        try:
            image = await asyncio.to_thread(self._client.images.get, image_id)
        except Exception as e:
            raise RuntimeError("Image not found: {}".format(e))

        queue: asyncio.Queue = asyncio.Queue()
        sentinel = object()
        loop = asyncio.get_running_loop()

        def _reader() -> None:
            try:
                tar_stream = image.save(named=True)
                for chunk in tar_stream:
                    loop.call_soon_threadsafe(queue.put_nowait, chunk)
            except Exception as exc:
                loop.call_soon_threadsafe(queue.put_nowait, exc)
            finally:
                loop.call_soon_threadsafe(queue.put_nowait, sentinel)

        loop.run_in_executor(None, _reader)

        try:
            while True:
                item = await queue.get()
                if item is sentinel:
                    break
                if isinstance(item, Exception):
                    raise RuntimeError("Docker image export failed: {}".format(item))
                yield item
        finally:
            self._exported_images.pop(image_id, None)

    async def is_exported_image_owned_by_project(self, project_id: UUID, image_id: str) -> bool:
        """Return True if an image was exported by the given project."""
        return self._exported_images.get(image_id) == str(project_id)

    def _track_exported_image(self, image_id: str, project_id: str) -> None:
        """Track exported image ownership with bounded memory growth."""
        self._exported_images[image_id] = project_id
        while len(self._exported_images) > EXPORTED_IMAGE_TRACKING_MAX:
            oldest_image_id = next(iter(self._exported_images))
            self._exported_images.pop(oldest_image_id, None)
