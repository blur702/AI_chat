"""Tests for ProjectDetector — project type detection from file structure."""

from unittest.mock import AsyncMock, MagicMock

import pytest

from app.services.project_detector import DetectionResult, ProjectDetector


class TestDetectionResult:
    def test_defaults(self):
        r = DetectionResult(project_type="python")
        assert r.project_type == "python"
        assert r.framework is None
        assert r.suggested_template_id is None
        assert r.confidence == 0.0


class TestDetectPython:
    def test_detects_fastapi(self):
        files = ["requirements.txt", "app/main.py", "app/__init__.py"]
        result = ProjectDetector.detect(files)
        assert result.project_type == "python"
        assert result.framework == "fastapi"
        assert result.confidence >= 0.8

    def test_detects_django(self):
        files = ["requirements.txt", "manage.py", "myapp/settings.py"]
        result = ProjectDetector.detect(files)
        assert result.project_type == "python"
        assert result.framework == "django"

    def test_detects_generic_python(self):
        files = ["pyproject.toml", "src/module.py"]
        result = ProjectDetector.detect(files)
        assert result.project_type == "python"
        assert result.framework is None
        assert result.suggested_template_id == "python-blank"

    def test_detects_python_with_setup_py(self):
        files = ["setup.py", "src/app.py"]
        result = ProjectDetector.detect(files)
        assert result.project_type == "python"


class TestDetectNode:
    def test_detects_nextjs(self):
        files = ["package.json", "next.config.js", "pages/index.tsx"]
        result = ProjectDetector.detect(files)
        assert result.project_type == "node"
        assert result.framework == "nextjs"
        assert result.suggested_template_id == "node-nextjs"

    def test_detects_nextjs_mjs(self):
        files = ["package.json", "next.config.mjs"]
        result = ProjectDetector.detect(files)
        assert result.framework == "nextjs"

    def test_detects_nextjs_ts(self):
        files = ["package.json", "next.config.ts"]
        result = ProjectDetector.detect(files)
        assert result.framework == "nextjs"

    def test_detects_vite(self):
        files = ["package.json", "vite.config.ts", "src/main.tsx"]
        result = ProjectDetector.detect(files)
        assert result.framework == "vite"
        assert result.suggested_template_id == "node-react-vite"

    def test_detects_nuxt(self):
        files = ["package.json", "nuxt.config.ts"]
        result = ProjectDetector.detect(files)
        assert result.framework == "nuxt"

    def test_detects_angular(self):
        files = ["package.json", "angular.json"]
        result = ProjectDetector.detect(files)
        assert result.framework == "angular"

    def test_detects_svelte(self):
        files = ["package.json", "svelte.config.js"]
        result = ProjectDetector.detect(files)
        assert result.framework == "svelte"

    def test_detects_generic_node(self):
        files = ["package.json", "index.js"]
        result = ProjectDetector.detect(files)
        assert result.project_type == "node"
        assert result.framework is None


class TestDetectPHP:
    def test_detects_drupal(self):
        files = ["composer.json", "core/lib/Drupal.php"]
        result = ProjectDetector.detect(files)
        assert result.project_type == "php"
        assert result.framework == "drupal"

    def test_detects_laravel(self):
        files = ["composer.json", "artisan", "app/Http/Controllers"]
        result = ProjectDetector.detect(files)
        assert result.framework == "laravel"

    def test_detects_wordpress(self):
        files = ["composer.json", "wp-config.php"]
        result = ProjectDetector.detect(files)
        assert result.framework == "wordpress"

    def test_detects_generic_php(self):
        files = ["composer.json", "index.php"]
        result = ProjectDetector.detect(files)
        assert result.project_type == "php"
        assert result.framework is None


class TestDetectOtherLanguages:
    def test_detects_rust(self):
        files = ["Cargo.toml", "src/main.rs"]
        result = ProjectDetector.detect(files)
        assert result.project_type == "rust"

    def test_detects_go(self):
        files = ["go.mod", "main.go"]
        result = ProjectDetector.detect(files)
        assert result.project_type == "go"

    def test_detects_ruby_rails(self):
        files = ["Gemfile", "Rakefile", "config/routes.rb"]
        result = ProjectDetector.detect(files)
        assert result.project_type == "ruby"
        assert result.framework == "rails"

    def test_detects_generic_ruby(self):
        files = ["Gemfile", "lib/app.rb"]
        result = ProjectDetector.detect(files)
        assert result.project_type == "ruby"
        assert result.framework is None

    def test_detects_java_maven(self):
        files = ["pom.xml", "src/main/java/App.java"]
        result = ProjectDetector.detect(files)
        assert result.project_type == "java"
        assert result.confidence >= 0.7

    def test_detects_java_gradle(self):
        files = ["build.gradle", "src/main/java/Main.java"]
        result = ProjectDetector.detect(files)
        assert result.project_type == "java"

    def test_detects_java_gradle_kts(self):
        files = ["build.gradle.kts"]
        result = ProjectDetector.detect(files)
        assert result.project_type == "java"

    def test_detects_docker_only(self):
        files = ["Dockerfile", "data/config.yaml"]
        result = ProjectDetector.detect(files)
        assert result.project_type == "docker"
        assert result.confidence == 0.5


class TestDetectFallback:
    def test_unknown_project(self):
        files = ["README.md", "LICENSE"]
        result = ProjectDetector.detect(files)
        assert result.project_type == "unknown"
        assert result.confidence == 0.0

    def test_empty_file_list(self):
        result = ProjectDetector.detect([])
        assert result.project_type == "unknown"


class TestDetectFromContainer:
    @pytest.mark.asyncio
    async def test_detect_from_container_success(self):
        sandbox = AsyncMock()
        sandbox.list_directory_recursive = AsyncMock(return_value=[
            {"path": "package.json"},
            {"path": "next.config.js"},
        ])
        result = await ProjectDetector.detect_from_container(sandbox, "container123")
        assert result.project_type == "node"
        assert result.framework == "nextjs"

    @pytest.mark.asyncio
    async def test_detect_from_container_failure(self):
        sandbox = AsyncMock()
        sandbox.list_directory_recursive = AsyncMock(side_effect=Exception("container not found"))
        result = await ProjectDetector.detect_from_container(sandbox, "container123")
        assert result.project_type == "unknown"
        assert result.confidence == 0.0
