"""ProjectDetector - Stateless utility for auto-detecting project types."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import TYPE_CHECKING, List, Optional

if TYPE_CHECKING:
    from app.services.sandbox_manager import SandboxManager

logger = logging.getLogger("workstation.project_detector")


@dataclass
class DetectionResult:
    """Result of project type detection."""

    project_type: str
    framework: Optional[str] = None
    suggested_template_id: Optional[str] = None
    confidence: float = 0.0


class ProjectDetector:
    """Detects project type from file structure.

    Stateless utility — not a kernel service. Uses prioritized rules
    where specific framework markers take precedence over generic ones.
    """

    @staticmethod
    def detect(file_paths: List[str]) -> DetectionResult:
        """Detect project type from a list of relative file paths."""
        names = {p.rsplit("/", 1)[-1] if "/" in p else p for p in file_paths}
        paths_set = set(file_paths)

        # Helper to check if any path ends with a suffix
        def has_file(name: str) -> bool:
            return name in names

        def has_path_containing(fragment: str) -> bool:
            return any(fragment in p for p in paths_set)

        # -- Python frameworks (high priority) --
        if has_file("requirements.txt") or has_file("pyproject.toml") or has_file("setup.py"):
            if has_path_containing("app/main.py") or has_file("uvicorn") or has_path_containing("fastapi"):
                return DetectionResult("python", "fastapi", "python-fastapi", 0.9)
            if (has_file("wsgi.py") or has_file("app.py")) and has_file("flask"):
                return DetectionResult("python", "flask", "python-flask", 0.85)
            if has_file("manage.py") and has_path_containing("settings.py"):
                return DetectionResult("python", "django", "python-django", 0.9)
            return DetectionResult("python", None, "python-blank", 0.7)

        # -- Node.js frameworks (high priority) --
        if has_file("package.json"):
            if has_file("next.config.js") or has_file("next.config.mjs") or has_file("next.config.ts"):
                return DetectionResult("node", "nextjs", "node-nextjs", 0.9)
            if has_file("vite.config.js") or has_file("vite.config.ts") or has_file("vite.config.mjs"):
                return DetectionResult("node", "vite", "node-react-vite", 0.85)
            if has_file("nuxt.config.js") or has_file("nuxt.config.ts"):
                return DetectionResult("node", "nuxt", "node-nuxt", 0.85)
            if has_file("angular.json"):
                return DetectionResult("node", "angular", "node-angular", 0.85)
            if has_file("svelte.config.js"):
                return DetectionResult("node", "svelte", "node-svelte", 0.85)
            return DetectionResult("node", None, "node-blank", 0.7)

        # -- PHP frameworks --
        if has_file("composer.json"):
            if has_path_containing("core/lib/Drupal.php"):
                return DetectionResult("php", "drupal", "php-drupal", 0.85)
            if has_file("artisan"):
                return DetectionResult("php", "laravel", "php-laravel", 0.9)
            if has_path_containing("wp-config.php") or has_path_containing("wp-content"):
                return DetectionResult("php", "wordpress", "php-wordpress", 0.85)
            return DetectionResult("php", None, "php-blank", 0.7)

        # -- Other languages --
        if has_file("Cargo.toml"):
            return DetectionResult("rust", None, "rust-blank", 0.8)

        if has_file("go.mod"):
            return DetectionResult("go", None, "go-blank", 0.8)

        if has_file("Gemfile"):
            if has_file("Rakefile") and has_path_containing("config/routes.rb"):
                return DetectionResult("ruby", "rails", "ruby-rails", 0.9)
            return DetectionResult("ruby", None, "ruby-blank", 0.7)

        if has_file("pom.xml") or has_file("build.gradle") or has_file("build.gradle.kts"):
            if has_path_containing("src/main/java"):
                return DetectionResult("java", None, "java-blank", 0.75)
            return DetectionResult("java", None, "java-blank", 0.6)

        if has_file("Dockerfile") or has_file("docker-compose.yml") or has_file("docker-compose.yaml"):
            return DetectionResult("docker", None, None, 0.5)

        # -- Fallback --
        return DetectionResult("unknown", None, None, 0.0)

    @staticmethod
    async def detect_from_container(
        sandbox_manager: "SandboxManager", container_id: str
    ) -> DetectionResult:
        """Detect project type by listing files inside a container."""
        try:
            entries = await sandbox_manager.list_directory_recursive(container_id)
            file_paths = [e["path"] for e in entries]
            return ProjectDetector.detect(file_paths)
        except Exception as exc:
            logger.warning("Detection failed for container %s: %s", container_id[:12], exc)
            return DetectionResult("unknown", None, None, 0.0)
