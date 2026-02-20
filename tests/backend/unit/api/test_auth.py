"""
Unit tests for auth utility functions.

Tests JWT creation/verification, admin role enforcement,
and request metadata extraction — all without HTTP transport.
"""

import os
from datetime import timedelta
from unittest.mock import MagicMock
from uuid import uuid4

import pytest

# Ensure a valid SECRET_KEY is available before importing auth module.
# The LRU-cached get_jwt_secret_key() validates this on first call.
_TEST_SECRET = "test-secret-key-that-is-at-least-32-characters-long-for-unit-tests"
if not os.environ.get("SECRET_KEY") or len(os.environ.get("SECRET_KEY", "")) < 32:
    os.environ["SECRET_KEY"] = _TEST_SECRET

# Clear the LRU cache so it picks up our test SECRET_KEY
from app.auth import get_jwt_secret_key  # noqa: E402

get_jwt_secret_key.cache_clear()

from app.auth import (  # noqa: E402
    create_access_token,
    extract_request_metadata,
    require_admin,
    verify_token,
)


def _make_request(ip: str = "127.0.0.1", user_agent: str = "test-agent") -> MagicMock:
    """Create a mock FastAPI Request."""
    request = MagicMock()
    request.client = MagicMock()
    request.client.host = ip
    request.headers = {"user-agent": user_agent}
    request.cookies = {}
    return request


@pytest.mark.unit
class TestCreateAccessToken:
    def test_produces_valid_jwt_with_claims(self):
        user_id = str(uuid4())
        token = create_access_token(
            data={"user_id": user_id, "role": "admin", "username": "alice"}
        )
        assert isinstance(token, str)
        assert len(token) > 0

        payload = verify_token(token)
        assert payload is not None
        assert payload["user_id"] == user_id
        assert payload["role"] == "admin"
        assert payload["username"] == "alice"

    def test_token_contains_exp_and_iat(self):
        token = create_access_token(data={"user_id": str(uuid4())})
        payload = verify_token(token)
        assert "exp" in payload
        assert "iat" in payload

    def test_custom_expiration(self):
        token = create_access_token(
            data={"user_id": str(uuid4())},
            expires_delta=timedelta(minutes=5),
        )
        payload = verify_token(token)
        assert payload is not None
        # exp should be about 5 minutes from iat
        assert payload["exp"] - payload["iat"] == pytest.approx(300, abs=2)


@pytest.mark.unit
class TestVerifyToken:
    def test_valid_token_returns_payload(self):
        user_id = str(uuid4())
        token = create_access_token(data={"user_id": user_id, "role": "user"})
        payload = verify_token(token)
        assert payload is not None
        assert payload["user_id"] == user_id
        assert payload["role"] == "user"

    def test_expired_token_returns_none(self):
        token = create_access_token(
            data={"user_id": str(uuid4())},
            expires_delta=timedelta(seconds=-10),
        )
        payload = verify_token(token)
        assert payload is None

    def test_invalid_token_returns_none(self):
        payload = verify_token("not.a.valid.jwt.token")
        assert payload is None

    def test_empty_string_returns_none(self):
        payload = verify_token("")
        assert payload is None

    def test_tampered_token_returns_none(self):
        token = create_access_token(data={"user_id": str(uuid4())})
        # Flip a character in the signature portion
        tampered = token[:-1] + ("A" if token[-1] != "A" else "B")
        payload = verify_token(tampered)
        assert payload is None


@pytest.mark.unit
class TestRequireAdmin:
    def test_admin_role_succeeds(self):
        token = create_access_token(
            data={"user_id": str(uuid4()), "role": "admin", "username": "admin_user"}
        )
        request = _make_request()
        payload = require_admin(request=request, authorization=f"Bearer {token}")
        assert payload["role"] == "admin"

    def test_user_role_raises_403(self):
        from fastapi import HTTPException

        token = create_access_token(
            data={"user_id": str(uuid4()), "role": "user", "username": "normal_user"}
        )
        request = _make_request()
        with pytest.raises(HTTPException) as exc_info:
            require_admin(request=request, authorization=f"Bearer {token}")
        assert exc_info.value.status_code == 403

    def test_missing_token_raises_401(self):
        from fastapi import HTTPException

        request = _make_request()
        request.cookies = {}
        with pytest.raises(HTTPException) as exc_info:
            require_admin(request=request, authorization=None)
        assert exc_info.value.status_code == 401

    def test_invalid_token_raises_401(self):
        from fastapi import HTTPException

        request = _make_request()
        with pytest.raises(HTTPException) as exc_info:
            require_admin(request=request, authorization="Bearer invalid.token.here")
        assert exc_info.value.status_code == 401


@pytest.mark.unit
class TestExtractRequestMetadata:
    def test_extracts_ip_and_user_agent(self):
        request = _make_request(ip="203.0.113.5", user_agent="Mozilla/5.0")
        meta = extract_request_metadata(request)
        assert meta["ip_address"] == "203.0.113.5"
        assert meta["user_agent"] == "Mozilla/5.0"

    def test_no_client_returns_none_ip(self):
        request = _make_request()
        request.client = None
        meta = extract_request_metadata(request)
        assert meta["ip_address"] is None

    def test_missing_user_agent(self):
        request = _make_request()
        request.headers = {}
        meta = extract_request_metadata(request)
        assert meta["user_agent"] is None
