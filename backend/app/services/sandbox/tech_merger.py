"""Technology merging and dependency resolution for sandbox provisioning."""

import logging
from typing import Dict, List

from app.services.templates import TechnologyDefinition, TemplateDefinition, TemplateRegistry

logger = logging.getLogger("workstation.sandbox")


class TechMerger:
    """Merges multiple technology definitions into a synthetic template."""

    def __init__(self, registry: TemplateRegistry) -> None:
        self._registry = registry

    def merge_technologies(self, technology_ids: List[str]) -> TemplateDefinition:
        """Merge multiple technology definitions into a synthetic TemplateDefinition.

        Resolves dependencies, checks for conflicts, and combines all configurations.
        Raises ValueError on conflicts or missing technologies.
        """
        resolved_ids = self._resolve_deps(technology_ids)

        technologies: List[TechnologyDefinition] = []
        for tid in resolved_ids:
            tech = self._registry.get_technology(tid)
            if tech is None:
                raise ValueError("Technology '{}' not found in registry".format(tid))
            technologies.append(tech)

        self._check_conflicts(technologies)
        docker_image = self._check_base_image_conflicts(technologies)

        return self._merge_into_template(technologies, docker_image)

    # -- Internal helpers ------------------------------------------------------

    def _check_conflicts(self, technologies: List[TechnologyDefinition]) -> None:
        """Validate no bidirectional conflicts exist."""
        all_ids = {t.id for t in technologies}
        conflict_pairs: set = set()
        for tech in technologies:
            for conflict in tech.conflicts_with:
                conflict_pairs.add((tech.id, conflict))
                conflict_pairs.add((conflict, tech.id))
        for src, dst in conflict_pairs:
            if src in all_ids and dst in all_ids:
                raise ValueError(
                    "Technology '{}' conflicts with '{}'. "
                    "Cannot use both in the same project.".format(src, dst)
                )

    @staticmethod
    def _check_base_image_conflicts(technologies: List[TechnologyDefinition]):
        """Ensure at most one technology provides a base Docker image."""
        docker_image_providers = [t for t in technologies if t.docker_image]
        if len(docker_image_providers) > 1:
            conflicts = ", ".join(
                "'{}' ({})".format(t.id, t.docker_image) for t in docker_image_providers
            )
            raise ValueError(
                "Multiple technologies provide conflicting base images: {}. "
                "Only one language runtime can be selected per project.".format(conflicts)
            )
        return docker_image_providers[0].docker_image if docker_image_providers else None

    def _merge_into_template(
        self,
        technologies: List[TechnologyDefinition],
        docker_image,
    ) -> TemplateDefinition:
        """Merge configs in dependency order into a TemplateDefinition."""
        merged_scaffold: Dict[str, str] = {}
        merged_setup: List[str] = []
        merged_env: Dict[str, str] = {}
        merged_sidecars: List = []
        merged_ports: List[int] = []
        sidecar_names: set = set()
        all_ids = {t.id for t in technologies}

        for tech in technologies:
            merged_scaffold.update(tech.scaffold_files)
            merged_setup.extend(tech.install_commands)
            merged_env.update(tech.environment)

            for sidecar in tech.sidecar_services:
                if sidecar.name not in sidecar_names:
                    sidecar_names.add(sidecar.name)
                    merged_sidecars.append(sidecar)

            for port in tech.exposed_ports:
                if port not in merged_ports:
                    merged_ports.append(port)

        # Install technology dependencies
        all_deps = []
        for tech in technologies:
            all_deps.extend(tech.dependencies)

        if all_deps:
            if "python" in all_ids:
                existing_reqs = merged_scaffold.get("requirements.txt", "")
                if existing_reqs and not existing_reqs.endswith("\n"):
                    existing_reqs += "\n"
                merged_scaffold["requirements.txt"] = existing_reqs + "\n".join(all_deps) + "\n"
                pip_cmd = "/workspace/.venv/bin/pip install -r /workspace/requirements.txt"
                if not any("pip install -r" in cmd for cmd in merged_setup):
                    insert_at = 0
                    for i, cmd in enumerate(merged_setup):
                        if ".venv" in cmd and ("venv" in cmd or "upgrade" in cmd):
                            insert_at = i + 1
                    merged_setup.insert(insert_at, pip_cmd)
            elif "node" in all_ids:
                merged_setup.append("npm install {}".format(" ".join(all_deps)))

        return TemplateDefinition(
            id="merged-{}".format("_".join(t.id for t in technologies)),
            name="Merged: {}".format(", ".join(t.name for t in technologies)),
            description="Auto-merged from technologies: {}".format(
                ", ".join(t.id for t in technologies)
            ),
            category="merged",
            docker_image=docker_image,
            scaffold_files=merged_scaffold,
            setup_commands=merged_setup,
            exposed_ports=merged_ports,
            environment=merged_env,
            sidecar_services=merged_sidecars,
            selected_technologies=[t.id for t in technologies],
        )

    def _resolve_deps(self, technology_ids: List[str], max_depth: int = 20) -> List[str]:
        """Resolve technology dependencies via topological sort."""
        visited: Dict[str, int] = {}
        order: List[str] = []

        def _visit(tid: str, depth: int = 0) -> None:
            if depth > max_depth:
                raise ValueError(
                    "Technology dependency chain exceeds max depth ({})".format(max_depth)
                )
            if tid in visited:
                if visited[tid] == 0:
                    raise ValueError(
                        "Circular dependency detected involving '{}'".format(tid)
                    )
                return
            tech = self._registry.get_technology(tid)
            if tech is None:
                raise ValueError(
                    "Technology '{}' not found in registry".format(tid)
                )
            visited[tid] = 0
            for dep in tech.requires_technologies:
                _visit(dep, depth + 1)
            visited[tid] = 1
            order.append(tid)

        for tid in technology_ids:
            _visit(tid)

        return order
