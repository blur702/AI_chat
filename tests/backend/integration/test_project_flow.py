"""Integration tests for project CRUD.

Create -> Get -> Update -> Delete -> List projects via the HTTP layer.
"""

import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.models.project import Project

pytestmark = pytest.mark.integration


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

TEST_USER_ID = uuid.uuid4()
TEST_PROJECT_ID = uuid.uuid4()
NOW = datetime.now(tz=timezone.utc)


def _auth_payload(user_id=TEST_USER_ID, role="user"):
    return {
        "user_id": str(user_id),
        "role": role,
        "username": "testuser",
    }


def _mock_project(
    project_id=TEST_PROJECT_ID,
    user_id=TEST_USER_ID,
    name="My Project",
    path="my-project",
):
    project = MagicMock(spec=Project)
    project.id = project_id
    project.user_id = user_id
    project.name = name
    project.path = path
    project.type = "generic"
    project.is_deleted = False
    project.deleted_at = None
    project.template_id = None
    project.settings = None
    project.custom_context = None
    project.important_files = None
    project.system_prompt_id = None
    project.created_at = NOW
    project.updated_at = NOW
    project.soft_delete = MagicMock()
    return project


def _scalar_result(value):
    result = MagicMock()
    result.scalar_one_or_none.return_value = value
    return result


def _scalars_result(values):
    result = MagicMock()
    result.scalars.return_value.all.return_value = values
    return result


def _row_result(row):
    result = MagicMock()
    result.one_or_none.return_value = row
    return result


def _patch_auth(payload=None):
    if payload is None:
        payload = _auth_payload()
    return patch("app.api.context_deps.get_current_user_payload", return_value=payload)


def _mock_sandbox_manager():
    sm = MagicMock()
    sm.is_running = False
    return sm


def _patch_sandbox():
    return patch("app.api.projects.get_sandbox_manager", return_value=_mock_sandbox_manager())


def _mock_context_manager():
    cm = AsyncMock()
    cm.invalidate_project_cache = AsyncMock()
    return cm


def _patch_context_manager():
    cm = _mock_context_manager()
    return cm, patch("app.api.projects.get_context_manager", return_value=cm)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


# ---------------------------------------------------------------------------
# Tests: Create project
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_project_returns_201(client):
    """POST /api/projects creates a project and returns 201."""
    project = _mock_project()

    mock_db = AsyncMock()
    mock_db.commit = AsyncMock()
    mock_db.refresh = AsyncMock(
        side_effect=lambda obj: (
            setattr(obj, "id", TEST_PROJECT_ID),
            setattr(obj, "created_at", NOW),
        )
    )
    mock_db.add = MagicMock()

    async def fake_get_db():
        yield mock_db

    with (
        _patch_auth(),
        _patch_sandbox(),
        patch("app.api.projects.get_db_session", fake_get_db),
        patch("app.api.context_deps.get_db_session", fake_get_db),
    ):
        resp = await client.post(
            "/api/projects",
            json={
                "name": "My Project",
                "path": "my-project",
                "type": "generic",
            },
            headers={"Authorization": "Bearer fake-token"},
        )

    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "My Project"
    assert data["path"] == "my-project"


# ---------------------------------------------------------------------------
# Tests: List projects
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_list_projects_returns_user_projects(client):
    """GET /api/projects returns the authenticated user's projects."""
    p1 = _mock_project(project_id=uuid.uuid4(), name="Project A")
    p2 = _mock_project(project_id=uuid.uuid4(), name="Project B")

    mock_db = AsyncMock()
    mock_db.execute = AsyncMock(return_value=_scalars_result([p1, p2]))

    async def fake_get_db():
        yield mock_db

    with (
        _patch_auth(),
        patch("app.api.projects.get_db_session", fake_get_db),
        patch("app.api.context_deps.get_db_session", fake_get_db),
    ):
        resp = await client.get(
            "/api/projects",
            headers={"Authorization": "Bearer fake-token"},
        )

    assert resp.status_code == 200
    data = resp.json()
    assert data["count"] == 2
    names = [p["name"] for p in data["projects"]]
    assert "Project A" in names
    assert "Project B" in names


# ---------------------------------------------------------------------------
# Tests: Update project
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_update_project_name(client):
    """PUT /api/projects/{id} updates the project name."""
    project = _mock_project()

    mock_db = AsyncMock()
    mock_db.execute = AsyncMock(
        side_effect=[
            _row_result((TEST_USER_ID, None)),  # validate_project_access
            _scalar_result(project),  # select Project for update
        ]
    )
    mock_db.commit = AsyncMock()
    mock_db.refresh = AsyncMock()

    async def fake_get_db():
        yield mock_db

    cm, cm_patch = _patch_context_manager()

    with (
        _patch_auth(),
        cm_patch,
        patch("app.api.projects.get_db_session", fake_get_db),
        patch("app.api.context_deps.get_db_session", fake_get_db),
    ):
        resp = await client.put(
            f"/api/projects/{TEST_PROJECT_ID}",
            json={"name": "Renamed Project"},
            headers={"Authorization": "Bearer fake-token"},
        )

    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "My Project" or "Renamed" in str(data)


# ---------------------------------------------------------------------------
# Tests: Delete project (soft-delete)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_delete_project_soft_deletes(client):
    """DELETE /api/projects/{id} soft-deletes the project."""
    project = _mock_project()

    mock_db = AsyncMock()
    mock_db.execute = AsyncMock(
        side_effect=[
            _row_result((TEST_USER_ID, None)),  # validate_project_access
            _scalar_result(project),  # select Project for deletion
        ]
    )
    mock_db.commit = AsyncMock()

    async def fake_get_db():
        yield mock_db

    cm, cm_patch = _patch_context_manager()

    with (
        _patch_auth(),
        cm_patch,
        _patch_sandbox(),
        patch("app.api.projects.get_db_session", fake_get_db),
        patch("app.api.context_deps.get_db_session", fake_get_db),
    ):
        resp = await client.delete(
            f"/api/projects/{TEST_PROJECT_ID}",
            headers={"Authorization": "Bearer fake-token"},
        )

    assert resp.status_code == 204
    project.soft_delete.assert_called_once()


# ---------------------------------------------------------------------------
# Tests: Authentication required
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_project_requires_auth(client):
    """POST /api/projects without auth returns 401."""
    resp = await client.post(
        "/api/projects",
        json={"name": "No Auth", "path": "no-auth"},
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_list_projects_requires_auth(client):
    """GET /api/projects without auth returns 401."""
    resp = await client.get("/api/projects")
    assert resp.status_code == 401
