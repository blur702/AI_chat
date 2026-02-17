"""Unit tests for the Project model."""

from uuid import uuid4

import pytest

from app.models.project import Project


pytestmark = pytest.mark.unit


# ---------------------------------------------------------------------------
# Construction
# ---------------------------------------------------------------------------


class TestProjectConstruction:
    """Tests for Project model instantiation."""

    def test_basic_construction(self):
        user_id = uuid4()
        project = Project(
            id=uuid4(),
            user_id=user_id,
            name="My Project",
            path="/workspace",
        )
        assert project.user_id == user_id
        assert project.name == "My Project"
        assert project.path == "/workspace"

    def test_with_all_fields(self):
        project = Project(
            id=uuid4(),
            user_id=uuid4(),
            name="Full Project",
            path="/workspace/full",
            type="python",
            template_id="python-fastapi",
            settings={"key": "value"},
            custom_context="Custom instructions",
            important_files=["main.py", "README.md"],
        )
        assert project.type == "python"
        assert project.template_id == "python-fastapi"
        assert project.settings == {"key": "value"}
        assert project.custom_context == "Custom instructions"
        assert project.important_files == ["main.py", "README.md"]


# ---------------------------------------------------------------------------
# Default values
# ---------------------------------------------------------------------------


class TestProjectDefaults:
    """Tests for Project default column values.

    Note: SQLAlchemy mapped_column(default=X) sets INSERT-time defaults,
    not Python __init__ defaults.
    """

    def test_is_deleted_none_when_omitted(self):
        project = Project(
            id=uuid4(),
            user_id=uuid4(),
            name="Test",
            path="/workspace",
        )
        # Server-side INSERT default is False; Python-side is None
        assert project.is_deleted is None

    def test_is_deleted_when_explicitly_set(self):
        project = Project(
            id=uuid4(),
            user_id=uuid4(),
            name="Test",
            path="/workspace",
            is_deleted=False,
        )
        assert project.is_deleted is False

    def test_deleted_at_defaults_none(self):
        project = Project(
            id=uuid4(),
            user_id=uuid4(),
            name="Test",
            path="/workspace",
        )
        assert project.deleted_at is None

    def test_optional_fields_default_none(self):
        project = Project(
            id=uuid4(),
            user_id=uuid4(),
            name="Test",
            path="/workspace",
        )
        assert project.type is None
        assert project.template_id is None
        assert project.settings is None
        assert project.custom_context is None
        assert project.important_files is None
        assert project.system_prompt_id is None


# ---------------------------------------------------------------------------
# soft_delete / restore
# ---------------------------------------------------------------------------


class TestProjectSoftDelete:
    """Tests for soft_delete and restore methods."""

    def test_soft_delete(self):
        project = Project(
            id=uuid4(),
            user_id=uuid4(),
            name="Test",
            path="/workspace",
            is_deleted=False,
        )
        project.soft_delete()
        assert project.is_deleted is True
        # deleted_at is set via func.now(), which is a SQL expression
        assert project.deleted_at is not None

    def test_restore(self):
        project = Project(
            id=uuid4(),
            user_id=uuid4(),
            name="Test",
            path="/workspace",
            is_deleted=True,
        )
        project.restore()
        assert project.is_deleted is False
        assert project.deleted_at is None

    def test_soft_delete_then_restore(self):
        project = Project(
            id=uuid4(),
            user_id=uuid4(),
            name="Test",
            path="/workspace",
        )
        project.soft_delete()
        assert project.is_deleted is True
        project.restore()
        assert project.is_deleted is False
        assert project.deleted_at is None


# ---------------------------------------------------------------------------
# __repr__
# ---------------------------------------------------------------------------


class TestProjectRepr:
    """Tests for Project.__repr__."""

    def test_repr_format(self):
        uid = uuid4()
        user_id = uuid4()
        project = Project(
            id=uid,
            user_id=user_id,
            name="My Project",
            path="/workspace",
        )
        r = repr(project)
        assert "Project" in r
        assert "My Project" in r
        assert str(uid) in r
        assert str(user_id) in r
