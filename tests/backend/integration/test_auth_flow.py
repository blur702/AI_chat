"""Integration tests for the full auth flow.

login -> get token -> use token -> change password

Tests the complete HTTP layer with mocked database and rate limiting.
"""

import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import bcrypt
import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.models.user import User

pytestmark = pytest.mark.integration


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

TEST_USER_ID = uuid.uuid4()
TEST_USERNAME = "testuser"
TEST_EMAIL = "testuser@example.com"
TEST_PASSWORD = "SecureP@ss1"
TEST_ROLE = "user"


def _hash_password(plain: str) -> str:
    """Hash a password with bcrypt (via passlib-compatible $2b$ prefix)."""
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(plain.encode(), salt).decode()


def _make_user(
    user_id=TEST_USER_ID,
    username=TEST_USERNAME,
    email=TEST_EMAIL,
    password=TEST_PASSWORD,
    role=TEST_ROLE,
    is_active=True,
    locked_until=None,
    failed_login_attempts=0,
) -> MagicMock:
    """Create a mock User object that behaves like the ORM model."""
    user = MagicMock(spec=User)
    user.id = user_id
    user.username = username
    user.email = email
    user.hashed_password = _hash_password(password)
    user.role = role
    user.is_active = is_active
    user.screen_name = username
    user.first_name = None
    user.last_name = None
    user.locked_until = locked_until
    user.failed_login_attempts = failed_login_attempts
    user.last_login_at = None
    user.last_password_change = None

    # is_locked() checks locked_until > now
    user.is_locked = MagicMock(
        side_effect=lambda: locked_until is not None and locked_until > datetime.now(tz=timezone.utc)
    )
    user.reset_failed_login = MagicMock()
    user.increment_failed_login = MagicMock(return_value=False)

    return user


def _mock_scalar_one_or_none(user):
    """Return a mock result object whose scalar_one_or_none() returns user."""
    result = MagicMock()
    result.scalar_one_or_none.return_value = user
    return result


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


# ---------------------------------------------------------------------------
# Tests: POST /api/auth/login
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_login_valid_credentials(client):
    """POST /api/auth/login with valid credentials returns 200 + access_token."""
    user = _make_user()

    mock_db = AsyncMock()
    mock_db.execute = AsyncMock(return_value=_mock_scalar_one_or_none(user))
    mock_db.commit = AsyncMock()

    async def fake_get_db():
        yield mock_db

    with (
        patch("app.api.auth.get_db_session", fake_get_db),
        patch("app.api.auth.log_security_event", new_callable=AsyncMock),
        patch("app.api.auth.rate_limit_login", lambda fn: fn),
    ):
        resp = await client.post(
            "/api/auth/login",
            json={"identifier": TEST_USERNAME, "password": TEST_PASSWORD},
        )

    assert resp.status_code == 200
    data = resp.json()
    assert "access_token" in data
    assert data["username"] == TEST_USERNAME
    assert data["role"] == TEST_ROLE
    assert data["user_id"] == str(TEST_USER_ID)


@pytest.mark.asyncio
async def test_login_wrong_password(client):
    """POST /api/auth/login with wrong password returns 401."""
    user = _make_user()

    mock_db = AsyncMock()
    mock_db.execute = AsyncMock(return_value=_mock_scalar_one_or_none(user))
    mock_db.commit = AsyncMock()

    async def fake_get_db():
        yield mock_db

    with (
        patch("app.api.auth.get_db_session", fake_get_db),
        patch("app.api.auth.log_security_event", new_callable=AsyncMock),
        patch("app.api.auth.rate_limit_login", lambda fn: fn),
    ):
        resp = await client.post(
            "/api/auth/login",
            json={"identifier": TEST_USERNAME, "password": "WrongPassword1!"},
        )

    assert resp.status_code == 401
    assert "Invalid credentials" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_login_locked_account(client):
    """POST /api/auth/login with locked account returns 401."""
    future = datetime(2099, 1, 1, tzinfo=timezone.utc)
    user = _make_user(locked_until=future, failed_login_attempts=5)

    mock_db = AsyncMock()
    mock_db.execute = AsyncMock(return_value=_mock_scalar_one_or_none(user))
    mock_db.commit = AsyncMock()

    async def fake_get_db():
        yield mock_db

    with (
        patch("app.api.auth.get_db_session", fake_get_db),
        patch("app.api.auth.log_security_event", new_callable=AsyncMock),
        patch("app.api.auth.rate_limit_login", lambda fn: fn),
    ):
        resp = await client.post(
            "/api/auth/login",
            json={"identifier": TEST_USERNAME, "password": TEST_PASSWORD},
        )

    assert resp.status_code == 401
    assert "locked" in resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_login_user_not_found(client):
    """POST /api/auth/login with unknown user returns 401."""
    mock_db = AsyncMock()
    mock_db.execute = AsyncMock(return_value=_mock_scalar_one_or_none(None))
    mock_db.commit = AsyncMock()

    async def fake_get_db():
        yield mock_db

    with (
        patch("app.api.auth.get_db_session", fake_get_db),
        patch("app.api.auth.log_security_event", new_callable=AsyncMock),
        patch("app.api.auth.rate_limit_login", lambda fn: fn),
    ):
        resp = await client.post(
            "/api/auth/login",
            json={"identifier": "nobody", "password": "DoesNotMatter1!"},
        )

    assert resp.status_code == 401
    assert "Invalid credentials" in resp.json()["detail"]


# ---------------------------------------------------------------------------
# Tests: GET /api/auth/me
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_me_with_valid_token(client):
    """GET /api/auth/me with valid token returns user info."""
    user = _make_user()

    mock_db = AsyncMock()
    mock_db.execute = AsyncMock(return_value=_mock_scalar_one_or_none(user))

    async def fake_get_db():
        yield mock_db

    with (
        patch("app.api.auth.get_db_session", fake_get_db),
        patch(
            "app.auth.get_current_user_payload",
            return_value={
                "user_id": str(TEST_USER_ID),
                "role": TEST_ROLE,
                "username": TEST_USERNAME,
            },
        ),
        patch("app.api.auth.get_current_user_payload") as mock_dep,
    ):
        mock_dep.return_value = {
            "user_id": str(TEST_USER_ID),
            "role": TEST_ROLE,
            "username": TEST_USERNAME,
        }

        resp = await client.get(
            "/api/auth/me",
            headers={"Authorization": "Bearer fake-valid-token"},
        )

    assert resp.status_code == 200
    data = resp.json()
    assert data["username"] == TEST_USERNAME
    assert data["id"] == str(TEST_USER_ID)
    assert data["role"] == TEST_ROLE


@pytest.mark.asyncio
async def test_me_without_token(client):
    """GET /api/auth/me without token returns 401."""
    resp = await client.get("/api/auth/me")

    assert resp.status_code == 401
