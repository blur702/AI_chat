"""Integration tests for the chat flow.

create project -> create chat -> list chats -> delete chat

Tests the full HTTP layer with mocked database and kernel services.
"""

import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.models.chat import Chat
from app.models.project import Project

pytestmark = pytest.mark.integration


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

TEST_USER_ID = uuid.uuid4()
TEST_PROJECT_ID = uuid.uuid4()
TEST_CHAT_ID = uuid.uuid4()
NOW = datetime.now(tz=timezone.utc)


def _auth_payload(user_id=TEST_USER_ID, role="user"):
    return {
        "user_id": str(user_id),
        "role": role,
        "username": "testuser",
    }


def _mock_project(project_id=TEST_PROJECT_ID, user_id=TEST_USER_ID):
    project = MagicMock(spec=Project)
    project.id = project_id
    project.user_id = user_id
    project.name = "Test Project"
    project.path = "test-project"
    project.type = "generic"
    project.is_deleted = False
    project.template_id = None
    project.settings = None
    project.custom_context = None
    project.important_files = None
    project.created_at = NOW
    project.updated_at = NOW
    return project


def _mock_chat(chat_id=TEST_CHAT_ID, project_id=TEST_PROJECT_ID, title="Test Chat"):
    chat = MagicMock(spec=Chat)
    chat.id = chat_id
    chat.project_id = project_id
    chat.title = title
    chat.is_pinned = False
    chat.is_archived = False
    chat.is_deleted = False
    chat.deleted_at = None
    chat.chat_instructions = None
    chat.system_prompt_id = None
    chat.chat_mode = "agent"
    chat.created_at = NOW
    chat.updated_at = NOW
    chat.soft_delete = MagicMock()
    return chat


def _scalar_result(value):
    result = MagicMock()
    result.scalar_one_or_none.return_value = value
    return result


def _row_result(row):
    """Mock a result that returns a tuple row from one_or_none."""
    result = MagicMock()
    result.one_or_none.return_value = row
    return result


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


def _patch_auth(payload=None):
    """Return a patch context for the auth dependency."""
    if payload is None:
        payload = _auth_payload()
    return patch("app.api.context_deps.get_current_user_payload", return_value=payload)


def _patch_context_manager():
    """Return a mock ContextManager and its patch context."""
    cm = AsyncMock()
    cm.invalidate_project_cache = AsyncMock()
    cm.invalidate_conversation_cache = AsyncMock()
    cm.get_all_chats_in_project = AsyncMock(return_value=[])
    return cm, patch("app.api.chats.get_context_manager", return_value=cm)


# ---------------------------------------------------------------------------
# Tests: Create chat in a project
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_chat_in_project(client):
    """POST /api/context/chats creates a chat in an existing project."""
    project = _mock_project()
    chat = _mock_chat()

    mock_db = AsyncMock()
    # First call: validate_project_access (returns row with user_id, template_id)
    # Second call: _validate_system_prompt_ownership (skipped if None)
    mock_db.execute = AsyncMock(
        side_effect=[
            _row_result((TEST_USER_ID, None)),  # validate_project_access_with_template
            _scalar_result(None),  # system_prompt check (skipped for None)
        ]
    )
    mock_db.commit = AsyncMock()
    mock_db.refresh = AsyncMock(side_effect=lambda obj: setattr(obj, "id", TEST_CHAT_ID) or None)
    mock_db.add = MagicMock()

    async def fake_get_db():
        yield mock_db

    cm, cm_patch = _patch_context_manager()

    with (
        _patch_auth(),
        cm_patch,
        patch("app.api.chats.get_db_session", fake_get_db),
        patch("app.api.context_deps.get_db_session", fake_get_db),
    ):
        resp = await client.post(
            "/api/context/chats",
            json={
                "project_id": str(TEST_PROJECT_ID),
                "title": "Test Chat",
            },
            headers={"Authorization": "Bearer fake-token"},
        )

    assert resp.status_code == 201
    data = resp.json()
    assert data["title"] == "Test Chat"
    assert data["project_id"] == str(TEST_PROJECT_ID)


# ---------------------------------------------------------------------------
# Tests: List chats
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_list_chats_returns_chats(client):
    """GET /api/context/project/{id}/chats returns chat list."""
    cm, cm_patch = _patch_context_manager()
    cm.get_all_chats_in_project.return_value = [
        {
            "id": str(TEST_CHAT_ID),
            "title": "Chat 1",
            "is_pinned": False,
            "is_archived": False,
            "chat_mode": "agent",
            "created_at": NOW.isoformat(),
            "updated_at": NOW.isoformat(),
        }
    ]

    mock_db = AsyncMock()
    mock_db.execute = AsyncMock(
        return_value=_row_result((TEST_USER_ID, None)),
    )

    async def fake_get_db():
        yield mock_db

    with (
        _patch_auth(),
        cm_patch,
        patch("app.api.chats.get_db_session", fake_get_db),
        patch("app.api.context_deps.get_db_session", fake_get_db),
    ):
        resp = await client.get(
            f"/api/context/project/{TEST_PROJECT_ID}/chats",
            headers={"Authorization": "Bearer fake-token"},
        )

    assert resp.status_code == 200
    data = resp.json()
    assert data["count"] == 1
    assert data["chats"][0]["title"] == "Chat 1"


# ---------------------------------------------------------------------------
# Tests: Delete chat (soft-delete)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_delete_chat_soft_deletes(client):
    """DELETE /api/context/chats/{id} soft-deletes the chat."""
    chat = _mock_chat()

    mock_db = AsyncMock()
    # First execute: validate_chat_access (join query returns row)
    # Second execute: fetch chat for deletion
    mock_db.execute = AsyncMock(
        side_effect=[
            _row_result((chat, TEST_USER_ID)),  # validate_chat_access
            _scalar_result(chat),  # select Chat
        ]
    )
    mock_db.commit = AsyncMock()

    async def fake_get_db():
        yield mock_db

    cm, cm_patch = _patch_context_manager()

    with (
        _patch_auth(),
        cm_patch,
        patch("app.api.chats.get_db_session", fake_get_db),
        patch("app.api.context_deps.get_db_session", fake_get_db),
    ):
        resp = await client.delete(
            f"/api/context/chats/{TEST_CHAT_ID}",
            headers={"Authorization": "Bearer fake-token"},
        )

    assert resp.status_code == 204
    chat.soft_delete.assert_called_once()


# ---------------------------------------------------------------------------
# Tests: Chat requires authentication
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_chat_requires_auth(client):
    """POST /api/context/chats without auth returns 401."""
    resp = await client.post(
        "/api/context/chats",
        json={
            "project_id": str(TEST_PROJECT_ID),
            "title": "Unauthorized Chat",
        },
    )

    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_list_chats_requires_auth(client):
    """GET /api/context/project/{id}/chats without auth returns 401."""
    resp = await client.get(
        f"/api/context/project/{TEST_PROJECT_ID}/chats",
    )

    assert resp.status_code == 401
