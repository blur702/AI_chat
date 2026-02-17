"""
Unit tests for project schema validation.

Validates ProjectCreateRequest, ProjectUpdateRequest, ProjectSummary,
and ProjectListResponse Pydantic models.
"""

import pytest
from pydantic import ValidationError

from app.schemas.context import (
    ProjectCreateRequest,
    ProjectListResponse,
    ProjectSummary,
    ProjectUpdateRequest,
)


@pytest.mark.unit
class TestProjectCreateRequest:
    def test_requires_name_and_path(self):
        req = ProjectCreateRequest(name="My Project", path="/home/user/project")
        assert req.name == "My Project"
        assert req.path == "/home/user/project"

    def test_missing_name_raises(self):
        with pytest.raises(ValidationError) as exc_info:
            ProjectCreateRequest(path="/some/path")
        assert "name" in str(exc_info.value)

    def test_missing_path_raises(self):
        with pytest.raises(ValidationError) as exc_info:
            ProjectCreateRequest(name="Project")
        assert "path" in str(exc_info.value)

    def test_name_max_255_chars(self):
        req = ProjectCreateRequest(name="A" * 255, path="/path")
        assert len(req.name) == 255

        with pytest.raises(ValidationError):
            ProjectCreateRequest(name="A" * 256, path="/path")

    def test_optional_fields_default_none(self):
        req = ProjectCreateRequest(name="Proj", path="/path")
        assert req.type is None
        assert req.template_id is None
        assert req.settings is None
        assert req.custom_context is None
        assert req.important_files is None

    def test_with_all_optional_fields(self):
        req = ProjectCreateRequest(
            name="Full Project",
            path="/home/project",
            type="python",
            template_id="tmpl-1",
            settings={"key": "value"},
            custom_context="Some context",
            important_files=["README.md", "main.py"],
        )
        assert req.type == "python"
        assert req.template_id == "tmpl-1"
        assert req.settings == {"key": "value"}
        assert len(req.important_files) == 2


@pytest.mark.unit
class TestProjectUpdateRequest:
    def test_all_fields_optional(self):
        req = ProjectUpdateRequest()
        assert req.name is None
        assert req.path is None
        assert req.type is None
        assert req.template_id is None
        assert req.system_prompt_id is None
        assert req.settings is None
        assert req.custom_context is None
        assert req.important_files is None

    def test_partial_update(self):
        req = ProjectUpdateRequest(name="Updated Name", type="node")
        assert req.name == "Updated Name"
        assert req.type == "node"
        assert req.path is None

    def test_name_max_255_chars(self):
        with pytest.raises(ValidationError):
            ProjectUpdateRequest(name="A" * 256)


@pytest.mark.unit
class TestProjectSummary:
    def test_serialization(self):
        summary = ProjectSummary(
            id="proj-1",
            name="Test Project",
            path="/home/test",
        )
        data = summary.model_dump()
        assert data["id"] == "proj-1"
        assert data["name"] == "Test Project"
        assert data["path"] == "/home/test"
        assert data["type"] is None
        assert data["template_id"] is None
        assert data["created_at"] is None
        assert data["updated_at"] is None

    def test_full_serialization(self):
        summary = ProjectSummary(
            id="proj-2",
            name="Full Project",
            path="/home/full",
            type="python",
            template_id="tmpl-1",
            selected_technologies=["python", "fastapi"],
            created_at="2026-01-01T00:00:00Z",
            updated_at="2026-01-02T00:00:00Z",
        )
        data = summary.model_dump()
        assert data["type"] == "python"
        assert data["selected_technologies"] == ["python", "fastapi"]
        assert data["created_at"] == "2026-01-01T00:00:00Z"


@pytest.mark.unit
class TestProjectListResponse:
    def test_empty_list(self):
        resp = ProjectListResponse()
        assert resp.projects == []
        assert resp.count == 0

    def test_with_projects(self):
        projects = [
            ProjectSummary(id="p1", name="Project 1", path="/path1"),
            ProjectSummary(id="p2", name="Project 2", path="/path2"),
        ]
        resp = ProjectListResponse(projects=projects, count=2)
        assert len(resp.projects) == 2
        assert resp.count == 2
