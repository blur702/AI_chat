"""
Comprehensive security test suite.

Covers password validation, account lockout, rate limiting,
audit logging, login flows, password changes, and attack simulations.
"""

import asyncio
import time
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import UUID, uuid4

import bcrypt as _bcrypt
import pytest
import fakeredis.aioredis

from app.auth import (
    create_access_token,
    extract_request_metadata,
    log_security_event,
    verify_token,
)
import app.middleware.rate_limit as _rl_mod
from app.middleware.rate_limit import (
    _check_rate_limit,
    get_client_ip,
    get_user_identifier,
    rate_limit_login,
    rate_limit_password_reset,
    rate_limit_user_creation,
)
from app.models.user import User
from app.models.utils import (
    COMMON_PASSWORDS,
    validate_password_strength,
)

# ---------------------------------------------------------------------------
# Password helpers — use bcrypt directly to avoid passlib compatibility
# issues with bcrypt >= 4.1 on Python 3.14.
# ---------------------------------------------------------------------------

_DEFAULT_PASSWORD = "SecureP@ss123"
_DEFAULT_PASSWORD_HASH = _bcrypt.hashpw(
    _DEFAULT_PASSWORD.encode(), _bcrypt.gensalt()
).decode()


def _hash_password(raw: str) -> str:
    return _bcrypt.hashpw(raw.encode(), _bcrypt.gensalt()).decode()


def _verify_password(raw: str, hashed: str) -> bool:
    return _bcrypt.checkpw(raw.encode(), hashed.encode())


# ---------------------------------------------------------------------------
# Auto-reset rate limiter state between tests
# ---------------------------------------------------------------------------


@pytest.fixture(autouse=True)
def _reset_rate_limiter():
    """Prevent rate limiter state from leaking between tests."""
    _rl_mod._state.script_sha = None
    _rl_mod._state.use_evalsha = True
    _rl_mod._state.memory_limiter = _rl_mod._InMemoryRateLimiter()
    _rl_mod._state.redis_client = None
    yield


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_user(**overrides) -> User:
    """Create a User instance with sensible defaults for testing.

    Uses the normal SQLAlchemy constructor so ``_sa_instance_state`` is
    initialised correctly.  Fields that only have ``server_default``
    (``id``, ``created_at``, ``updated_at``) are set after construction.
    """
    defaults = {
        "username": "testuser",
        "email": "test@example.com",
        "hashed_password": _DEFAULT_PASSWORD_HASH,
        "role": "user",
        "is_active": True,
        "failed_login_attempts": 0,
        "locked_until": None,
        "last_login_at": None,
        "last_password_change": None,
        "email_verified": False,
        "email_verification_token": None,
        "password_reset_token": None,
        "password_reset_expires": None,
        "first_name": None,
        "last_name": None,
        "screen_name": None,
    }
    defaults.update(overrides)

    # Separate out the server-default-only fields
    uid = defaults.pop("id", uuid4())
    created = defaults.pop("created_at", datetime.now(tz=timezone.utc))
    updated = defaults.pop("updated_at", datetime.now(tz=timezone.utc))

    user = User(**defaults)
    user.id = uid
    user.created_at = created
    user.updated_at = updated
    return user


def _make_request(
    ip: str = "127.0.0.1",
    user_agent: str = "test-agent",
    headers: dict | None = None,
) -> MagicMock:
    """Create a mock FastAPI Request."""
    request = MagicMock()
    request.client = MagicMock()
    request.client.host = ip
    _headers = {"user-agent": user_agent}
    if headers:
        _headers.update(headers)
    request.headers = _headers
    request.url = MagicMock()
    request.url.path = "/api/auth/login"
    return request


def _mock_scalar_result(value):
    """Return a mock SQLAlchemy result whose .scalar_one_or_none() yields *value*."""
    result = MagicMock()
    result.scalar_one_or_none.return_value = value
    return result


# =========================================================================
# 1. Password Validation Unit Tests
# =========================================================================


@pytest.mark.unit
class TestPasswordValidation:
    def test_password_too_short(self):
        ok, msg = validate_password_strength("Ab1!xyz")
        assert not ok
        assert "at least 8 characters" in msg

    def test_password_missing_uppercase(self):
        ok, msg = validate_password_strength("abcdefg1!")
        assert not ok
        assert "uppercase" in msg

    def test_password_missing_lowercase(self):
        ok, msg = validate_password_strength("ABCDEFG1!")
        assert not ok
        assert "lowercase" in msg

    def test_password_missing_digit(self):
        ok, msg = validate_password_strength("Abcdefgh!")
        assert not ok
        assert "digit" in msg

    def test_password_missing_special_char(self):
        ok, msg = validate_password_strength("Abcdefg1")
        assert not ok
        assert "special character" in msg

    @pytest.mark.parametrize("common", ["password", "123456", "admin", "letmein"])
    def test_password_common_password(self, common):
        # Common passwords often fail earlier rules too; pad to satisfy them.
        padded = common.capitalize() + "1!"
        if padded.lower() in COMMON_PASSWORDS:
            # Ensure it still gets caught (the common check is case-insensitive).
            ok, msg = validate_password_strength(padded)
            # It might fail on another rule first, but shouldn't pass overall.
            assert not ok

    def test_password_valid_strong(self):
        ok, msg = validate_password_strength("SecureP@ss123")
        assert ok
        assert msg is None

    def test_password_case_insensitive_common(self):
        # "PASSWORD" is in COMMON_PASSWORDS (case-insensitive).
        # It fails earlier rules too (no lowercase/digit/special), but the
        # important thing is it does NOT pass validation.
        ok, _ = validate_password_strength("PASSWORD")
        assert not ok
        # Verify the common-password set is case-insensitive
        assert "password" in COMMON_PASSWORDS
        assert "PASSWORD".lower() in COMMON_PASSWORDS

    def test_hash_and_verify_password(self):
        raw = "MyStr0ng!Pass"
        hashed = _hash_password(raw)
        assert hashed != raw
        assert _verify_password(raw, hashed)

    def test_verify_password_wrong(self):
        hashed = _hash_password("CorrectP@ss1")
        assert not _verify_password("WrongP@ss1!", hashed)


# =========================================================================
# 2. User Model Account Lockout
# =========================================================================


@pytest.mark.unit
class TestUserAccountLockout:
    def test_is_locked_no_lockout(self):
        user = _make_user(locked_until=None)
        assert not user.is_locked()

    def test_is_locked_expired(self):
        user = _make_user(
            locked_until=datetime.now(tz=timezone.utc) - timedelta(minutes=1)
        )
        assert not user.is_locked()

    def test_is_locked_active(self):
        user = _make_user(
            locked_until=datetime.now(tz=timezone.utc) + timedelta(minutes=10)
        )
        assert user.is_locked()

    def test_increment_failed_login_below_threshold(self):
        user = _make_user(failed_login_attempts=0)
        locked = user.increment_failed_login(5, 15)
        assert not locked
        assert user.failed_login_attempts == 1
        assert user.locked_until is None

    def test_increment_failed_login_at_threshold(self):
        user = _make_user(failed_login_attempts=4)
        locked = user.increment_failed_login(5, 15)
        assert locked
        assert user.failed_login_attempts == 5
        assert user.locked_until is not None
        expected = datetime.now(tz=timezone.utc) + timedelta(minutes=15)
        assert abs((user.locked_until - expected).total_seconds()) < 2

    def test_increment_failed_login_returns_true_on_lock(self):
        user = _make_user(failed_login_attempts=4)
        assert user.increment_failed_login(5, 15) is True

    def test_reset_failed_login(self):
        user = _make_user(
            failed_login_attempts=5,
            locked_until=datetime.now(tz=timezone.utc) + timedelta(minutes=10),
        )
        user.reset_failed_login()
        assert user.failed_login_attempts == 0
        assert user.locked_until is None

    def test_lock_account(self):
        user = _make_user()
        user.lock_account(30)
        assert user.locked_until is not None
        expected = datetime.now(tz=timezone.utc) + timedelta(minutes=30)
        assert abs((user.locked_until - expected).total_seconds()) < 2

    @pytest.mark.parametrize("minutes", [5, 15, 60])
    def test_lock_account_duration(self, minutes):
        user = _make_user()
        user.lock_account(minutes)
        expected = datetime.now(tz=timezone.utc) + timedelta(minutes=minutes)
        assert abs((user.locked_until - expected).total_seconds()) < 2


# =========================================================================
# 3. Login Flow Integration Tests
# =========================================================================


@pytest.mark.integration
class TestLoginFlow:
    """Tests that exercise the login endpoint logic from app.api.auth.

    We patch ``verify_password`` to use bcrypt directly (avoiding passlib
    compatibility issues with bcrypt >= 4.1 on Python 3.14).
    """

    _VP = "app.api.auth.verify_password"
    _HP = "app.api.auth.hash_password"

    async def test_successful_login(self, mock_db_session):
        user = _make_user()
        mock_db_session.execute = AsyncMock(
            return_value=_mock_scalar_result(user)
        )
        mock_db_session.flush = AsyncMock()

        from app.api.auth import login
        from app.schemas.auth import LoginRequest

        body = LoginRequest(identifier=user.username, password=_DEFAULT_PASSWORD)
        request = _make_request()

        with patch(self._VP, side_effect=_verify_password):
            resp = await login(
                body=body, request=request, db=mock_db_session
            )

        assert resp.access_token
        assert resp.user_id == user.id
        assert user.failed_login_attempts == 0
        assert user.last_login_at is not None

    async def test_login_user_not_found(self, mock_db_session):
        mock_db_session.execute = AsyncMock(
            return_value=_mock_scalar_result(None)
        )
        mock_db_session.flush = AsyncMock()

        from app.api.auth import login
        from app.schemas.auth import LoginRequest
        from fastapi import HTTPException

        body = LoginRequest(identifier="nobody", password="Whatever1!")
        request = _make_request()

        with pytest.raises(HTTPException) as exc_info:
            await login(body=body, request=request, db=mock_db_session)
        assert exc_info.value.status_code == 401

    async def test_login_wrong_password(self, mock_db_session):
        user = _make_user()
        mock_db_session.execute = AsyncMock(
            return_value=_mock_scalar_result(user)
        )
        mock_db_session.flush = AsyncMock()

        from app.api.auth import login
        from app.schemas.auth import LoginRequest
        from fastapi import HTTPException

        body = LoginRequest(identifier=user.username, password="WrongP@ss1!")
        request = _make_request()

        with patch(self._VP, side_effect=_verify_password):
            with pytest.raises(HTTPException) as exc_info:
                await login(body=body, request=request, db=mock_db_session)
        assert exc_info.value.status_code == 401
        assert user.failed_login_attempts == 1

    async def test_login_account_locked(self, mock_db_session):
        user = _make_user(
            locked_until=datetime.now(tz=timezone.utc) + timedelta(minutes=10)
        )
        mock_db_session.execute = AsyncMock(
            return_value=_mock_scalar_result(user)
        )
        mock_db_session.flush = AsyncMock()

        from app.api.auth import login
        from app.schemas.auth import LoginRequest
        from fastapi import HTTPException

        body = LoginRequest(
            identifier=user.username, password=_DEFAULT_PASSWORD
        )
        request = _make_request()

        with pytest.raises(HTTPException) as exc_info:
            await login(body=body, request=request, db=mock_db_session)
        assert exc_info.value.status_code == 401
        assert "temporarily locked" in exc_info.value.detail

    async def test_login_failed_attempts_increment(self, mock_db_session):
        user = _make_user(failed_login_attempts=0)
        mock_db_session.flush = AsyncMock()

        from app.api.auth import login
        from app.schemas.auth import LoginRequest
        from fastapi import HTTPException

        request = _make_request()

        with patch(self._VP, side_effect=_verify_password):
            for i in range(1, 4):
                user_fresh = _make_user(
                    failed_login_attempts=i - 1, id=user.id
                )
                mock_db_session.execute = AsyncMock(
                    return_value=_mock_scalar_result(user_fresh)
                )
                body = LoginRequest(
                    identifier=user.username, password="WrongP@ss1!"
                )
                with pytest.raises(HTTPException):
                    await login(
                        body=body, request=request, db=mock_db_session
                    )
                assert user_fresh.failed_login_attempts == i

    async def test_login_lockout_after_threshold(self, mock_db_session):
        user = _make_user(failed_login_attempts=4)
        mock_db_session.execute = AsyncMock(
            return_value=_mock_scalar_result(user)
        )
        mock_db_session.flush = AsyncMock()

        from app.api.auth import login
        from app.schemas.auth import LoginRequest
        from fastapi import HTTPException

        body = LoginRequest(identifier=user.username, password="WrongP@ss1!")
        request = _make_request()

        with patch(self._VP, side_effect=_verify_password):
            with pytest.raises(HTTPException):
                await login(body=body, request=request, db=mock_db_session)

        assert user.failed_login_attempts == 5
        assert user.locked_until is not None

    async def test_login_clears_expired_lock(self, mock_db_session):
        user = _make_user(
            locked_until=datetime.now(tz=timezone.utc) - timedelta(minutes=1),
            failed_login_attempts=5,
        )
        mock_db_session.execute = AsyncMock(
            return_value=_mock_scalar_result(user)
        )
        mock_db_session.flush = AsyncMock()

        from app.api.auth import login
        from app.schemas.auth import LoginRequest

        body = LoginRequest(
            identifier=user.username, password=_DEFAULT_PASSWORD
        )
        request = _make_request()

        with patch(self._VP, side_effect=_verify_password):
            resp = await login(body=body, request=request, db=mock_db_session)
        assert resp.access_token
        assert user.locked_until is None
        assert user.failed_login_attempts == 0

    async def test_login_updates_last_login_at(self, mock_db_session):
        user = _make_user(last_login_at=None)
        mock_db_session.execute = AsyncMock(
            return_value=_mock_scalar_result(user)
        )
        mock_db_session.flush = AsyncMock()

        from app.api.auth import login
        from app.schemas.auth import LoginRequest

        body = LoginRequest(
            identifier=user.username, password=_DEFAULT_PASSWORD
        )
        request = _make_request()

        with patch(self._VP, side_effect=_verify_password):
            await login(body=body, request=request, db=mock_db_session)
        assert user.last_login_at is not None
        delta = abs(
            (
                user.last_login_at - datetime.now(tz=timezone.utc)
            ).total_seconds()
        )
        assert delta < 2

    async def test_login_creates_valid_token(self, mock_db_session):
        user = _make_user()
        mock_db_session.execute = AsyncMock(
            return_value=_mock_scalar_result(user)
        )
        mock_db_session.flush = AsyncMock()

        from app.api.auth import login
        from app.schemas.auth import LoginRequest

        body = LoginRequest(
            identifier=user.username, password=_DEFAULT_PASSWORD
        )
        request = _make_request()

        with patch(self._VP, side_effect=_verify_password):
            resp = await login(body=body, request=request, db=mock_db_session)
        payload = verify_token(resp.access_token)
        assert payload is not None
        assert payload["user_id"] == str(user.id)
        assert payload["role"] == user.role
        assert payload["username"] == user.username


# =========================================================================
# 4. Rate Limiting Tests
# =========================================================================


def _reset_rate_limit_globals():
    """Reset rate limiter caches so each test starts clean."""
    _rl_mod._state.script_sha = None
    _rl_mod._state.use_evalsha = True
    _rl_mod._state.memory_limiter = _rl_mod._InMemoryRateLimiter()
    _rl_mod._state.redis_client = None


@pytest.mark.integration
class TestRateLimiting:
    def setup_method(self):
        _reset_rate_limit_globals()

    async def test_rate_limit_allows_within_limit(self):
        server = fakeredis.aioredis.FakeServer()
        redis = fakeredis.aioredis.FakeRedis(
            server=server, decode_responses=True
        )
        try:
            allowed, remaining, retry = await _check_rate_limit(
                redis, "test:key", max_requests=5, window_seconds=60
            )
            assert allowed
            assert remaining == 4
            assert retry == 0
        finally:
            await redis.aclose()

    async def test_rate_limit_blocks_over_limit(self):
        server = fakeredis.aioredis.FakeServer()
        redis = fakeredis.aioredis.FakeRedis(
            server=server, decode_responses=True
        )
        try:
            for _ in range(5):
                await _check_rate_limit(
                    redis, "test:key", max_requests=5, window_seconds=60
                )

            allowed, remaining, retry = await _check_rate_limit(
                redis, "test:key", max_requests=5, window_seconds=60
            )
            assert not allowed
            assert remaining == 0
            assert retry > 0
        finally:
            await redis.aclose()

    async def test_rate_limit_sliding_window(self):
        server = fakeredis.aioredis.FakeServer()
        redis = fakeredis.aioredis.FakeRedis(
            server=server, decode_responses=True
        )
        try:
            key = "test:sliding"
            # Manually seed an old entry that should be pruned
            old_time = time.time() - 120
            await redis.zadd(key, {str(old_time): old_time})

            allowed, remaining, _ = await _check_rate_limit(
                redis, key, max_requests=5, window_seconds=60
            )
            assert allowed
            # Old entry should have been removed
            count = await redis.zcard(key)
            assert count == 1  # only the new entry
        finally:
            await redis.aclose()

    async def test_rate_limit_redis_unavailable(self):
        """When Redis is None the decorator should fail open."""
        with patch(
            "app.middleware.rate_limit.get_rate_limit_redis",
            return_value=None,
        ):
            from app.middleware.rate_limit import rate_limit

            @rate_limit(max_requests=1, window_seconds=60)
            async def fake_endpoint(request):
                return "ok"

            request = _make_request()
            result = await fake_endpoint(request=request)
            assert result == "ok"

    def test_get_client_ip_from_header(self):
        request = _make_request(
            headers={"x-forwarded-for": "10.0.0.1, 10.0.0.2"}
        )
        assert get_client_ip(request) == "10.0.0.1"

    def test_get_client_ip_fallback(self):
        request = _make_request(ip="192.168.1.1")
        # Ensure no x-forwarded-for header
        request.headers = {"user-agent": "test"}
        assert get_client_ip(request) == "192.168.1.1"

    async def test_rate_limit_key_generation(self):
        """Verify rate limit keys follow the expected format."""
        server = fakeredis.aioredis.FakeServer()
        redis = fakeredis.aioredis.FakeRedis(
            server=server, decode_responses=True
        )
        try:
            key = "rate_limit:ip:127.0.0.1:/api/auth/login"
            await _check_rate_limit(
                redis, key, max_requests=5, window_seconds=60
            )
            count = await redis.zcard(key)
            assert count == 1
        finally:
            await redis.aclose()

    async def test_rate_limit_separate_keys_per_ip(self):
        """Different IPs should have separate rate limit counters."""
        server = fakeredis.aioredis.FakeServer()
        redis = fakeredis.aioredis.FakeRedis(
            server=server, decode_responses=True
        )
        try:
            key1 = "rate_limit:ip:1.1.1.1:/api/auth/login"
            key2 = "rate_limit:ip:2.2.2.2:/api/auth/login"

            for _ in range(5):
                await _check_rate_limit(
                    redis, key1, max_requests=5, window_seconds=60
                )

            # key1 is exhausted
            allowed1, _, _ = await _check_rate_limit(
                redis, key1, max_requests=5, window_seconds=60
            )
            assert not allowed1

            # key2 should still be allowed
            allowed2, _, _ = await _check_rate_limit(
                redis, key2, max_requests=5, window_seconds=60
            )
            assert allowed2
        finally:
            await redis.aclose()

    async def test_rate_limit_remaining_header(self):
        """RateLimitMiddleware adds X-RateLimit-Remaining header."""
        from app.middleware.rate_limit import RateLimitMiddleware

        middleware = RateLimitMiddleware(app=MagicMock())
        request = _make_request()

        response_mock = MagicMock()
        response_mock.headers = {}
        call_next = AsyncMock(return_value=response_mock)

        server = fakeredis.aioredis.FakeServer()
        redis = fakeredis.aioredis.FakeRedis(
            server=server, decode_responses=True
        )
        try:
            with patch(
                "app.middleware.rate_limit.get_rate_limit_redis",
                return_value=redis,
            ):
                resp = await middleware.dispatch(request, call_next)
            assert "X-RateLimit-Remaining" in resp.headers
        finally:
            await redis.aclose()


# =========================================================================
# 4b. Rate Limit Decorator Integration Tests
# =========================================================================


@pytest.mark.integration
class TestRateLimitDecorators:
    """Integration tests for pre-configured rate-limit decorators with fakeredis.

    Verifies quota enforcement (success up to limit, 429 + Retry-After on
    overflow) and per-identifier isolation for each decorator.
    """

    def setup_method(self):
        _reset_rate_limit_globals()

    async def test_rate_limit_login_allows_up_to_quota(self):
        """rate_limit_login allows 5 requests per IP within 60s."""
        server = fakeredis.aioredis.FakeServer()
        redis = fakeredis.aioredis.FakeRedis(server=server, decode_responses=True)

        @rate_limit_login
        async def handler(request):
            return "ok"

        try:
            with patch(
                "app.middleware.rate_limit.get_rate_limit_redis",
                AsyncMock(return_value=redis),
            ):
                request = _make_request(ip="10.0.0.1")
                for _ in range(5):
                    result = await handler(request=request)
                    assert result == "ok"
        finally:
            await redis.aclose()

    async def test_rate_limit_login_blocks_over_quota(self):
        """rate_limit_login returns 429 with Retry-After on the 6th request."""
        from fastapi import HTTPException

        server = fakeredis.aioredis.FakeServer()
        redis = fakeredis.aioredis.FakeRedis(server=server, decode_responses=True)

        @rate_limit_login
        async def handler(request):
            return "ok"

        try:
            with patch(
                "app.middleware.rate_limit.get_rate_limit_redis",
                AsyncMock(return_value=redis),
            ):
                request = _make_request(ip="10.0.0.2")
                for _ in range(5):
                    await handler(request=request)

                with pytest.raises(HTTPException) as exc_info:
                    await handler(request=request)
                assert exc_info.value.status_code == 429
                assert "Retry-After" in exc_info.value.headers
        finally:
            await redis.aclose()

    async def test_rate_limit_login_per_ip_isolation(self):
        """Exhausting quota for one IP does not affect another."""
        from fastapi import HTTPException

        server = fakeredis.aioredis.FakeServer()
        redis = fakeredis.aioredis.FakeRedis(server=server, decode_responses=True)

        @rate_limit_login
        async def handler(request):
            return "ok"

        try:
            with patch(
                "app.middleware.rate_limit.get_rate_limit_redis",
                AsyncMock(return_value=redis),
            ):
                req1 = _make_request(ip="10.0.0.10")
                for _ in range(5):
                    await handler(request=req1)

                with pytest.raises(HTTPException):
                    await handler(request=req1)

                req2 = _make_request(ip="10.0.0.11")
                result = await handler(request=req2)
                assert result == "ok"
        finally:
            await redis.aclose()

    async def test_rate_limit_password_reset_allows_up_to_quota(self):
        """rate_limit_password_reset allows 3 requests per email within 3600s."""
        server = fakeredis.aioredis.FakeServer()
        redis = fakeredis.aioredis.FakeRedis(server=server, decode_responses=True)

        @rate_limit_password_reset
        async def handler(request, body):
            return "ok"

        body = MagicMock()
        body.email = "user@example.com"

        try:
            with patch(
                "app.middleware.rate_limit.get_rate_limit_redis",
                AsyncMock(return_value=redis),
            ):
                request = _make_request()
                for _ in range(3):
                    result = await handler(request=request, body=body)
                    assert result == "ok"
        finally:
            await redis.aclose()

    async def test_rate_limit_password_reset_blocks_over_quota(self):
        """rate_limit_password_reset returns 429 on the 4th request."""
        from fastapi import HTTPException

        server = fakeredis.aioredis.FakeServer()
        redis = fakeredis.aioredis.FakeRedis(server=server, decode_responses=True)

        @rate_limit_password_reset
        async def handler(request, body):
            return "ok"

        body = MagicMock()
        body.email = "blocked@example.com"

        try:
            with patch(
                "app.middleware.rate_limit.get_rate_limit_redis",
                AsyncMock(return_value=redis),
            ):
                request = _make_request()
                for _ in range(3):
                    await handler(request=request, body=body)

                with pytest.raises(HTTPException) as exc_info:
                    await handler(request=request, body=body)
                assert exc_info.value.status_code == 429
                assert "Retry-After" in exc_info.value.headers
        finally:
            await redis.aclose()

    async def test_rate_limit_password_reset_per_email_isolation(self):
        """Different emails should have independent rate limits."""
        from fastapi import HTTPException

        server = fakeredis.aioredis.FakeServer()
        redis = fakeredis.aioredis.FakeRedis(server=server, decode_responses=True)

        @rate_limit_password_reset
        async def handler(request, body):
            return "ok"

        try:
            with patch(
                "app.middleware.rate_limit.get_rate_limit_redis",
                AsyncMock(return_value=redis),
            ):
                request = _make_request()

                body1 = MagicMock()
                body1.email = "email1@example.com"
                for _ in range(3):
                    await handler(request=request, body=body1)

                with pytest.raises(HTTPException):
                    await handler(request=request, body=body1)

                body2 = MagicMock()
                body2.email = "email2@example.com"
                result = await handler(request=request, body=body2)
                assert result == "ok"
        finally:
            await redis.aclose()

    async def test_rate_limit_user_creation_allows_up_to_quota(self):
        """rate_limit_user_creation allows 10 requests per identifier within 3600s."""
        server = fakeredis.aioredis.FakeServer()
        redis = fakeredis.aioredis.FakeRedis(server=server, decode_responses=True)

        @rate_limit_user_creation
        async def handler(request):
            return "ok"

        try:
            with patch(
                "app.middleware.rate_limit.get_rate_limit_redis",
                AsyncMock(return_value=redis),
            ):
                request = _make_request(ip="10.0.0.50")
                for _ in range(10):
                    result = await handler(request=request)
                    assert result == "ok"
        finally:
            await redis.aclose()

    async def test_rate_limit_user_creation_blocks_over_quota(self):
        """rate_limit_user_creation returns 429 on the 11th request."""
        from fastapi import HTTPException

        server = fakeredis.aioredis.FakeServer()
        redis = fakeredis.aioredis.FakeRedis(server=server, decode_responses=True)

        @rate_limit_user_creation
        async def handler(request):
            return "ok"

        try:
            with patch(
                "app.middleware.rate_limit.get_rate_limit_redis",
                AsyncMock(return_value=redis),
            ):
                request = _make_request(ip="10.0.0.51")
                for _ in range(10):
                    await handler(request=request)

                with pytest.raises(HTTPException) as exc_info:
                    await handler(request=request)
                assert exc_info.value.status_code == 429
                assert "Retry-After" in exc_info.value.headers
        finally:
            await redis.aclose()

    async def test_rate_limit_user_creation_per_identifier_isolation(self):
        """Different user identifiers should have independent rate limits."""
        from fastapi import HTTPException

        server = fakeredis.aioredis.FakeServer()
        redis = fakeredis.aioredis.FakeRedis(server=server, decode_responses=True)

        @rate_limit_user_creation
        async def handler(request):
            return "ok"

        try:
            with patch(
                "app.middleware.rate_limit.get_rate_limit_redis",
                AsyncMock(return_value=redis),
            ):
                req1 = _make_request(ip="10.0.0.60")
                for _ in range(10):
                    await handler(request=req1)

                with pytest.raises(HTTPException):
                    await handler(request=req1)

                req2 = _make_request(ip="10.0.0.61")
                result = await handler(request=req2)
                assert result == "ok"
        finally:
            await redis.aclose()


# =========================================================================
# 5. Audit Logging Tests
# =========================================================================


@pytest.mark.integration
class TestAuditLogging:
    async def test_log_security_event_creates_record(self, mock_db_session):
        mock_db_session.flush = AsyncMock()
        uid = uuid4()
        await log_security_event(
            db=mock_db_session,
            action="login_success",
            event_status="success",
            user_id=uid,
            resource="/api/auth/login",
            ip_address="10.0.0.1",
            user_agent="test-agent",
            details={"method": "password"},
        )
        mock_db_session.add.assert_called_once()
        added = mock_db_session.add.call_args[0][0]
        assert added.action == "login_success"
        assert added.status == "success"
        assert added.user_id == uid
        assert added.ip_address == "10.0.0.1"
        assert added.details == {"method": "password"}

    async def test_log_security_event_minimal(self, mock_db_session):
        mock_db_session.flush = AsyncMock()
        await log_security_event(
            db=mock_db_session,
            action="test_action",
            event_status="success",
        )
        mock_db_session.add.assert_called_once()
        added = mock_db_session.add.call_args[0][0]
        assert added.action == "test_action"
        assert added.user_id is None
        assert added.details == {}

    async def test_log_security_event_with_details(self, mock_db_session):
        mock_db_session.flush = AsyncMock()
        details = {"reason": "invalid_password", "attempt": 3}
        await log_security_event(
            db=mock_db_session,
            action="login_failed",
            event_status="failure",
            details=details,
        )
        added = mock_db_session.add.call_args[0][0]
        assert added.details == details

    async def test_log_security_event_failure_handling(self, mock_db_session):
        mock_db_session.flush = AsyncMock(
            side_effect=Exception("db error")
        )
        result = await log_security_event(
            db=mock_db_session,
            action="login_success",
            event_status="success",
        )
        assert result is None

    async def test_audit_log_with_null_user_id(self, mock_db_session):
        mock_db_session.flush = AsyncMock()
        await log_security_event(
            db=mock_db_session,
            action="anonymous_action",
            event_status="success",
            user_id=None,
        )
        added = mock_db_session.add.call_args[0][0]
        assert added.user_id is None


# =========================================================================
# 5b. Audit Log Integration Tests
# =========================================================================


@pytest.mark.integration
class TestAuditLogIntegration:
    """Verify auth flow endpoints invoke log_security_event with correct params."""

    _VP = "app.api.auth.verify_password"
    _HP = "app.api.auth.hash_password"
    _LOG = "app.api.auth.log_security_event"

    async def test_login_success_logs_event(self, mock_db_session):
        """Successful login logs 'login_success' with status 'success'."""
        user = _make_user()
        mock_db_session.execute = AsyncMock(
            return_value=_mock_scalar_result(user)
        )
        mock_db_session.flush = AsyncMock()

        from app.api.auth import login
        from app.schemas.auth import LoginRequest

        body = LoginRequest(identifier=user.username, password=_DEFAULT_PASSWORD)
        request = _make_request()

        with (
            patch(self._VP, side_effect=_verify_password),
            patch(self._LOG, new_callable=AsyncMock) as mock_log,
        ):
            await login(body=body, request=request, db=mock_db_session)

        mock_log.assert_called_once()
        kwargs = mock_log.call_args.kwargs
        assert kwargs["action"] == "login_success"
        assert kwargs["event_status"] == "success"
        assert kwargs["user_id"] == user.id

    async def test_login_failure_logs_event(self, mock_db_session):
        """Failed login logs 'login_failed' with status 'failure'."""
        user = _make_user()
        mock_db_session.execute = AsyncMock(
            return_value=_mock_scalar_result(user)
        )
        mock_db_session.flush = AsyncMock()

        from app.api.auth import login
        from app.schemas.auth import LoginRequest
        from fastapi import HTTPException

        body = LoginRequest(identifier=user.username, password="WrongP@ss1!")
        request = _make_request()

        with (
            patch(self._VP, side_effect=_verify_password),
            patch(self._LOG, new_callable=AsyncMock) as mock_log,
        ):
            with pytest.raises(HTTPException):
                await login(body=body, request=request, db=mock_db_session)

        mock_log.assert_called_once()
        kwargs = mock_log.call_args.kwargs
        assert kwargs["action"] == "login_failed"
        assert kwargs["event_status"] == "failure"

    async def test_lockout_logs_account_locked(self, mock_db_session):
        """5th failed attempt logs 'account_locked' with status 'warning'."""
        user = _make_user(failed_login_attempts=4)
        mock_db_session.execute = AsyncMock(
            return_value=_mock_scalar_result(user)
        )
        mock_db_session.flush = AsyncMock()

        from app.api.auth import login
        from app.schemas.auth import LoginRequest
        from fastapi import HTTPException

        body = LoginRequest(identifier=user.username, password="WrongP@ss1!")
        request = _make_request()

        with (
            patch(self._VP, side_effect=_verify_password),
            patch(self._LOG, new_callable=AsyncMock) as mock_log,
        ):
            with pytest.raises(HTTPException):
                await login(body=body, request=request, db=mock_db_session)

        mock_log.assert_called_once()
        kwargs = mock_log.call_args.kwargs
        assert kwargs["action"] == "account_locked"
        assert kwargs["event_status"] == "warning"

    async def test_change_password_success_logs_event(self, mock_db_session):
        """Successful password change logs 'password_change' / 'success'."""
        user = _make_user()
        mock_db_session.execute = AsyncMock(
            return_value=_mock_scalar_result(user)
        )
        mock_db_session.flush = AsyncMock()

        from app.api.auth import change_password
        from app.schemas.auth import PasswordChangeRequest

        body = PasswordChangeRequest(
            current_password=_DEFAULT_PASSWORD,
            new_password="NewStr0ng!Pass",
        )
        request = _make_request()
        payload = {"user_id": str(user.id)}

        with (
            patch(self._VP, side_effect=_verify_password),
            patch(self._HP, side_effect=_hash_password),
            patch(self._LOG, new_callable=AsyncMock) as mock_log,
        ):
            await change_password(
                body=body, request=request, payload=payload, db=mock_db_session,
            )

        mock_log.assert_called_once()
        kwargs = mock_log.call_args.kwargs
        assert kwargs["action"] == "password_change"
        assert kwargs["event_status"] == "success"
        assert kwargs["user_id"] == user.id

    async def test_change_password_failure_logs_event(self, mock_db_session):
        """Wrong current password logs 'password_change_failed' / 'failure'."""
        user = _make_user()
        mock_db_session.execute = AsyncMock(
            return_value=_mock_scalar_result(user)
        )
        mock_db_session.flush = AsyncMock()

        from app.api.auth import change_password
        from app.schemas.auth import PasswordChangeRequest
        from fastapi import HTTPException

        body = PasswordChangeRequest(
            current_password="WrongP@ss1!",
            new_password="NewStr0ng!Pass",
        )
        request = _make_request()
        payload = {"user_id": str(user.id)}

        with (
            patch(self._VP, side_effect=_verify_password),
            patch(self._LOG, new_callable=AsyncMock) as mock_log,
        ):
            with pytest.raises(HTTPException):
                await change_password(
                    body=body, request=request, payload=payload, db=mock_db_session,
                )

        mock_log.assert_called_once()
        kwargs = mock_log.call_args.kwargs
        assert kwargs["action"] == "password_change_failed"
        assert kwargs["event_status"] == "failure"

    async def test_password_reset_request_logs_event(self, mock_db_session):
        """Password reset for existing email logs 'password_reset_requested' / 'success'."""
        user = _make_user(email="user@example.com")
        mock_db_session.execute = AsyncMock(
            return_value=_mock_scalar_result(user)
        )
        mock_db_session.flush = AsyncMock()

        from app.api.auth import request_password_reset
        from app.schemas.auth import PasswordResetRequest

        body = PasswordResetRequest(email="user@example.com")
        request = _make_request()

        with patch(self._LOG, new_callable=AsyncMock) as mock_log:
            await request_password_reset(
                body=body, request=request, db=mock_db_session,
            )

        mock_log.assert_called_once()
        kwargs = mock_log.call_args.kwargs
        assert kwargs["action"] == "password_reset_requested"
        assert kwargs["event_status"] == "success"
        assert kwargs["user_id"] == user.id


# =========================================================================
# 6. Password Change Tests
# =========================================================================


@pytest.mark.integration
class TestPasswordChange:
    _VP = "app.api.auth.verify_password"
    _HP = "app.api.auth.hash_password"

    async def test_password_change_success(self, mock_db_session):
        user = _make_user()
        mock_db_session.execute = AsyncMock(
            return_value=_mock_scalar_result(user)
        )
        mock_db_session.flush = AsyncMock()

        from app.api.auth import change_password
        from app.schemas.auth import PasswordChangeRequest

        body = PasswordChangeRequest(
            current_password=_DEFAULT_PASSWORD,
            new_password="NewStr0ng!Pass",
        )
        request = _make_request()
        payload = {"user_id": str(user.id)}

        with (
            patch(self._VP, side_effect=_verify_password),
            patch(self._HP, side_effect=_hash_password),
        ):
            resp = await change_password(
                body=body,
                request=request,
                payload=payload,
                db=mock_db_session,
            )
        assert "successfully" in resp.message
        assert user.last_password_change is not None

    async def test_password_change_wrong_current(self, mock_db_session):
        user = _make_user()
        mock_db_session.execute = AsyncMock(
            return_value=_mock_scalar_result(user)
        )
        mock_db_session.flush = AsyncMock()

        from app.api.auth import change_password
        from app.schemas.auth import PasswordChangeRequest
        from fastapi import HTTPException

        body = PasswordChangeRequest(
            current_password="WrongP@ss1!",
            new_password="NewStr0ng!Pass",
        )
        request = _make_request()
        payload = {"user_id": str(user.id)}

        with patch(self._VP, side_effect=_verify_password):
            with pytest.raises(HTTPException) as exc_info:
                await change_password(
                    body=body,
                    request=request,
                    payload=payload,
                    db=mock_db_session,
                )
        assert exc_info.value.status_code == 401
        assert "incorrect" in exc_info.value.detail.lower()

    async def test_password_change_same_password(self, mock_db_session):
        user = _make_user()
        mock_db_session.execute = AsyncMock(
            return_value=_mock_scalar_result(user)
        )
        mock_db_session.flush = AsyncMock()

        from app.api.auth import change_password
        from app.schemas.auth import PasswordChangeRequest
        from fastapi import HTTPException

        body = PasswordChangeRequest(
            current_password=_DEFAULT_PASSWORD,
            new_password=_DEFAULT_PASSWORD,
        )
        request = _make_request()
        payload = {"user_id": str(user.id)}

        with patch(self._VP, side_effect=_verify_password):
            with pytest.raises(HTTPException) as exc_info:
                await change_password(
                    body=body,
                    request=request,
                    payload=payload,
                    db=mock_db_session,
                )
        assert exc_info.value.status_code == 400
        assert "different" in exc_info.value.detail.lower()

    async def test_password_change_weak_new_password(self, mock_db_session):
        user = _make_user()
        mock_db_session.execute = AsyncMock(
            return_value=_mock_scalar_result(user)
        )
        mock_db_session.flush = AsyncMock()

        from app.api.auth import change_password
        from app.schemas.auth import PasswordChangeRequest
        from fastapi import HTTPException

        body = PasswordChangeRequest(
            current_password=_DEFAULT_PASSWORD,
            new_password="weakpass1",
        )
        request = _make_request()
        payload = {"user_id": str(user.id)}

        with patch(self._VP, side_effect=_verify_password):
            with pytest.raises(HTTPException) as exc_info:
                await change_password(
                    body=body,
                    request=request,
                    payload=payload,
                    db=mock_db_session,
                )
        assert exc_info.value.status_code == 400

    async def test_password_reset_request_existing_email(
        self, mock_db_session
    ):
        user = _make_user(email="user@example.com")
        mock_db_session.execute = AsyncMock(
            return_value=_mock_scalar_result(user)
        )
        mock_db_session.flush = AsyncMock()

        from app.api.auth import request_password_reset
        from app.schemas.auth import PasswordResetRequest

        body = PasswordResetRequest(email="user@example.com")
        request = _make_request()

        resp = await request_password_reset(
            body=body, request=request, db=mock_db_session
        )
        assert "reset token" in resp.message.lower()
        assert user.password_reset_token is not None
        assert user.password_reset_expires is not None

    async def test_password_reset_request_nonexistent_email(
        self, mock_db_session
    ):
        mock_db_session.execute = AsyncMock(
            return_value=_mock_scalar_result(None)
        )
        mock_db_session.flush = AsyncMock()

        from app.api.auth import request_password_reset
        from app.schemas.auth import PasswordResetRequest

        body = PasswordResetRequest(email="nobody@example.com")
        request = _make_request()

        resp = await request_password_reset(
            body=body, request=request, db=mock_db_session
        )
        # Same message to avoid email enumeration
        assert "reset token" in resp.message.lower()

    async def test_password_reset_confirm_valid_token(self, mock_db_session):
        user = _make_user(
            password_reset_token="valid-token-abc",
            password_reset_expires=datetime.now(tz=timezone.utc)
            + timedelta(minutes=30),
        )
        mock_db_session.execute = AsyncMock(
            return_value=_mock_scalar_result(user)
        )
        mock_db_session.flush = AsyncMock()

        from app.api.auth import confirm_password_reset
        from app.schemas.auth import PasswordResetConfirmRequest

        body = PasswordResetConfirmRequest(
            token="valid-token-abc", new_password="BrandN3w!Pass"
        )
        request = _make_request()

        with patch(self._HP, side_effect=_hash_password):
            resp = await confirm_password_reset(
                body=body, request=request, db=mock_db_session
            )
        assert "successfully" in resp.message.lower()
        assert user.password_reset_token is None
        assert user.password_reset_expires is None

    async def test_password_reset_confirm_expired_token(
        self, mock_db_session
    ):
        user = _make_user(
            password_reset_token="expired-token",
            password_reset_expires=datetime.now(tz=timezone.utc)
            - timedelta(minutes=5),
        )
        mock_db_session.execute = AsyncMock(
            return_value=_mock_scalar_result(user)
        )
        mock_db_session.flush = AsyncMock()

        from app.api.auth import confirm_password_reset
        from app.schemas.auth import PasswordResetConfirmRequest
        from fastapi import HTTPException

        body = PasswordResetConfirmRequest(
            token="expired-token", new_password="BrandN3w!Pass"
        )
        request = _make_request()

        with pytest.raises(HTTPException) as exc_info:
            await confirm_password_reset(
                body=body, request=request, db=mock_db_session
            )
        assert exc_info.value.status_code == 400

    async def test_password_reset_confirm_invalid_token(
        self, mock_db_session
    ):
        mock_db_session.execute = AsyncMock(
            return_value=_mock_scalar_result(None)
        )
        mock_db_session.flush = AsyncMock()

        from app.api.auth import confirm_password_reset
        from app.schemas.auth import PasswordResetConfirmRequest
        from fastapi import HTTPException

        body = PasswordResetConfirmRequest(
            token="bogus-token", new_password="BrandN3w!Pass"
        )
        request = _make_request()

        with pytest.raises(HTTPException) as exc_info:
            await confirm_password_reset(
                body=body, request=request, db=mock_db_session
            )
        assert exc_info.value.status_code == 400


# =========================================================================
# 7. Security Attack Simulation Tests
# =========================================================================


@pytest.mark.integration
class TestSecurityAttacks:
    _VP = "app.api.auth.verify_password"

    def setup_method(self):
        _reset_rate_limit_globals()

    async def test_brute_force_attack_simulation(self, mock_db_session):
        """Simulate 10 rapid login attempts; account locks after 5.

        Later attempts may be blocked by the rate limiter (429) instead of
        the auth layer (401) — both are valid blocking responses.
        """
        user = _make_user(failed_login_attempts=0)
        mock_db_session.flush = AsyncMock()

        from app.api.auth import login
        from app.schemas.auth import LoginRequest
        from fastapi import HTTPException

        request = _make_request()

        with patch(self._VP, side_effect=_verify_password):
            for attempt in range(10):
                mock_db_session.execute = AsyncMock(
                    return_value=_mock_scalar_result(user)
                )
                body = LoginRequest(
                    identifier=user.username, password="WrongP@ss1!"
                )
                with pytest.raises(HTTPException) as exc_info:
                    await login(
                        body=body, request=request, db=mock_db_session
                    )
                assert exc_info.value.status_code in (401, 429)

        assert user.is_locked()
        assert user.failed_login_attempts >= 5

    async def test_rate_limit_bypass_attempt_different_ips(self):
        """Each IP should have an independent rate limit counter."""
        server = fakeredis.aioredis.FakeServer()
        redis = fakeredis.aioredis.FakeRedis(
            server=server, decode_responses=True
        )
        try:
            for _ in range(5):
                await _check_rate_limit(
                    redis, "rate_limit:ip1:/login", 5, 60
                )
            blocked, _, _ = await _check_rate_limit(
                redis, "rate_limit:ip1:/login", 5, 60
            )
            assert not blocked

            allowed, _, _ = await _check_rate_limit(
                redis, "rate_limit:ip2:/login", 5, 60
            )
            assert allowed
        finally:
            await redis.aclose()

    @pytest.mark.parametrize(
        "injection_payload",
        [
            "admin' OR '1'='1",
            "admin'; DROP TABLE users; --",
            "' UNION SELECT * FROM users --",
            "admin'/*",
        ],
    )
    async def test_sql_injection_in_login_username(
        self, mock_db_session, injection_payload
    ):
        """SQL injection strings should be treated as plain text."""
        mock_db_session.execute = AsyncMock(
            return_value=_mock_scalar_result(None)
        )
        mock_db_session.flush = AsyncMock()

        from app.api.auth import login
        from app.schemas.auth import LoginRequest
        from fastapi import HTTPException

        body = LoginRequest(
            identifier=injection_payload, password="Whatever1!"
        )
        request = _make_request()

        with pytest.raises(HTTPException) as exc_info:
            await login(body=body, request=request, db=mock_db_session)
        assert exc_info.value.status_code == 401

    @pytest.mark.parametrize(
        "injection_payload",
        [
            "admin' OR '1'='1",
            "admin'; DROP TABLE users; --",
            "' UNION SELECT * FROM users --",
            "admin'/*",
        ],
    )
    async def test_sql_injection_in_login_password(
        self, mock_db_session, injection_payload
    ):
        """SQL injection strings in password field should be treated as plain text."""
        user = _make_user()
        mock_db_session.execute = AsyncMock(
            return_value=_mock_scalar_result(user)
        )
        mock_db_session.flush = AsyncMock()

        from app.api.auth import login
        from app.schemas.auth import LoginRequest
        from fastapi import HTTPException

        body = LoginRequest(
            identifier=user.username, password=injection_payload
        )
        request = _make_request()

        with patch(self._VP, side_effect=_verify_password):
            with pytest.raises(HTTPException) as exc_info:
                await login(body=body, request=request, db=mock_db_session)
        assert exc_info.value.status_code == 401

    async def test_password_reset_email_enumeration_protection(
        self, mock_db_session
    ):
        """Reset endpoint returns the same message for existing and
        non-existing emails."""
        from app.api.auth import request_password_reset
        from app.schemas.auth import PasswordResetRequest

        request = _make_request()

        # Existing email
        user = _make_user(email="exists@example.com")
        mock_db_session.execute = AsyncMock(
            return_value=_mock_scalar_result(user)
        )
        mock_db_session.flush = AsyncMock()
        resp_exists = await request_password_reset(
            body=PasswordResetRequest(email="exists@example.com"),
            request=request,
            db=mock_db_session,
        )

        # Non-existing email
        mock_db_session.execute = AsyncMock(
            return_value=_mock_scalar_result(None)
        )
        resp_missing = await request_password_reset(
            body=PasswordResetRequest(email="missing@example.com"),
            request=request,
            db=mock_db_session,
        )

        assert resp_exists.message == resp_missing.message

    async def test_concurrent_login_attempts(self, mock_db_session):
        """Concurrent logins should still enforce lockout."""
        user = _make_user(failed_login_attempts=4)
        mock_db_session.execute = AsyncMock(
            return_value=_mock_scalar_result(user)
        )
        mock_db_session.flush = AsyncMock()

        from app.api.auth import login
        from app.schemas.auth import LoginRequest
        from fastapi import HTTPException

        request = _make_request()

        async def attempt():
            body = LoginRequest(
                identifier=user.username, password="WrongP@ss1!"
            )
            with pytest.raises(HTTPException):
                await login(body=body, request=request, db=mock_db_session)

        with patch(self._VP, side_effect=_verify_password):
            await asyncio.gather(attempt(), attempt(), attempt())
        assert user.is_locked()


# =========================================================================
# 8. Admin Functionality Tests
# =========================================================================


@pytest.mark.integration
class TestAdminFunctionality:
    async def test_admin_unlock_account(self, mock_db_session):
        user = _make_user(
            failed_login_attempts=5,
            locked_until=datetime.now(tz=timezone.utc)
            + timedelta(minutes=10),
        )
        mock_db_session.execute = AsyncMock(
            return_value=_mock_scalar_result(user)
        )
        mock_db_session.flush = AsyncMock()

        from app.api.admin import unlock_user_account

        request = _make_request()
        admin_payload = {"user_id": str(uuid4()), "role": "admin"}

        resp = await unlock_user_account(
            user_id=user.id,
            request=request,
            _payload=admin_payload,
            db=mock_db_session,
        )
        assert "unlocked" in resp.message.lower()
        assert user.failed_login_attempts == 0
        assert user.locked_until is None

    async def test_admin_unlock_nonexistent_user(self, mock_db_session):
        mock_db_session.execute = AsyncMock(
            return_value=_mock_scalar_result(None)
        )
        mock_db_session.flush = AsyncMock()

        from app.api.admin import unlock_user_account
        from fastapi import HTTPException

        request = _make_request()
        admin_payload = {"user_id": str(uuid4()), "role": "admin"}

        with pytest.raises(HTTPException) as exc_info:
            await unlock_user_account(
                user_id=uuid4(),
                request=request,
                _payload=admin_payload,
                db=mock_db_session,
            )
        assert exc_info.value.status_code == 404

    async def test_admin_unlock_requires_admin_role(self):
        """The require_admin dependency rejects non-admin payloads."""
        from app.auth import create_access_token, require_admin
        from fastapi import HTTPException

        token = create_access_token(
            data={"user_id": str(uuid4()), "role": "user"}
        )
        auth_header = f"Bearer {token}"

        with pytest.raises(HTTPException) as exc_info:
            require_admin(authorization=auth_header)
        assert exc_info.value.status_code == 403

    async def _call_get_audit_logs(self, mock_db_session, admin_payload, **kwargs):
        """Helper to call get_audit_logs with explicit defaults for Query(...) params.

        When calling the endpoint directly (bypassing FastAPI), Query(...)
        defaults produce FieldInfo objects instead of their default values.
        This helper ensures those params always receive proper Python values.
        """
        from app.api.admin import get_audit_logs

        defaults = dict(
            page=1,
            page_size=50,
            audit_status=None,
            ip_address=None,
            search=None,
            sort_by="created_at",
            order="desc",
        )
        defaults.update(kwargs)
        return await get_audit_logs(
            _payload=admin_payload,
            db=mock_db_session,
            **defaults,
        )

    async def test_admin_audit_log_retrieval(self, mock_db_session):
        log_mock = MagicMock()
        log_mock.id = uuid4()
        log_mock.user_id = uuid4()
        log_mock.user = MagicMock()
        log_mock.user.username = "testuser"
        log_mock.action = "login_success"
        log_mock.resource = None
        log_mock.ip_address = "10.0.0.1"
        log_mock.user_agent = "test-agent"
        log_mock.status = "success"
        log_mock.details = {}
        log_mock.created_at = datetime.now(tz=timezone.utc)

        count_result = MagicMock()
        count_result.scalar.return_value = 1

        log_result = MagicMock()
        log_result.scalars.return_value.all.return_value = [log_mock]

        mock_db_session.execute = AsyncMock(
            side_effect=[count_result, log_result]
        )
        admin_payload = {"user_id": str(uuid4()), "role": "admin"}

        resp = await self._call_get_audit_logs(mock_db_session, admin_payload)
        assert resp.total == 1
        assert len(resp.logs) == 1
        assert resp.logs[0].action == "login_success"

    async def test_admin_audit_log_filter_by_action(self, mock_db_session):
        count_result = MagicMock()
        count_result.scalar.return_value = 0
        log_result = MagicMock()
        log_result.scalars.return_value.all.return_value = []

        mock_db_session.execute = AsyncMock(
            side_effect=[count_result, log_result]
        )
        admin_payload = {"user_id": str(uuid4()), "role": "admin"}

        resp = await self._call_get_audit_logs(
            mock_db_session, admin_payload, action="login_failed",
        )
        assert resp.total == 0
        assert resp.logs == []

    async def test_admin_audit_log_pagination(self, mock_db_session):
        count_result = MagicMock()
        count_result.scalar.return_value = 100
        log_result = MagicMock()
        log_result.scalars.return_value.all.return_value = []

        mock_db_session.execute = AsyncMock(
            side_effect=[count_result, log_result]
        )
        admin_payload = {"user_id": str(uuid4()), "role": "admin"}

        resp = await self._call_get_audit_logs(
            mock_db_session, admin_payload, page=3, page_size=10,
        )
        assert resp.total == 100
        assert resp.page == 3
        assert resp.page_size == 10

    async def test_admin_audit_log_filter_by_user_id(self, mock_db_session):
        target_user_id = uuid4()
        count_result = MagicMock()
        count_result.scalar.return_value = 0
        log_result = MagicMock()
        log_result.scalars.return_value.all.return_value = []

        mock_db_session.execute = AsyncMock(
            side_effect=[count_result, log_result]
        )
        admin_payload = {"user_id": str(uuid4()), "role": "admin"}

        resp = await self._call_get_audit_logs(
            mock_db_session, admin_payload, user_id=target_user_id,
        )
        assert resp.total == 0
        assert mock_db_session.execute.call_count == 2

    async def test_admin_audit_log_filter_by_status(self, mock_db_session):
        count_result = MagicMock()
        count_result.scalar.return_value = 0
        log_result = MagicMock()
        log_result.scalars.return_value.all.return_value = []

        mock_db_session.execute = AsyncMock(
            side_effect=[count_result, log_result]
        )
        admin_payload = {"user_id": str(uuid4()), "role": "admin"}

        resp = await self._call_get_audit_logs(
            mock_db_session, admin_payload, audit_status="failure",
        )
        assert resp.total == 0
        assert mock_db_session.execute.call_count == 2

    async def test_admin_audit_log_filter_by_start_date(self, mock_db_session):
        count_result = MagicMock()
        count_result.scalar.return_value = 0
        log_result = MagicMock()
        log_result.scalars.return_value.all.return_value = []

        mock_db_session.execute = AsyncMock(
            side_effect=[count_result, log_result]
        )
        admin_payload = {"user_id": str(uuid4()), "role": "admin"}

        start = datetime.now(tz=timezone.utc) - timedelta(days=7)
        resp = await self._call_get_audit_logs(
            mock_db_session, admin_payload, start_date=start,
        )
        assert resp.total == 0
        assert mock_db_session.execute.call_count == 2

    async def test_admin_audit_log_filter_by_end_date(self, mock_db_session):
        count_result = MagicMock()
        count_result.scalar.return_value = 0
        log_result = MagicMock()
        log_result.scalars.return_value.all.return_value = []

        mock_db_session.execute = AsyncMock(
            side_effect=[count_result, log_result]
        )
        admin_payload = {"user_id": str(uuid4()), "role": "admin"}

        end = datetime.now(tz=timezone.utc)
        resp = await self._call_get_audit_logs(
            mock_db_session, admin_payload, end_date=end,
        )
        assert resp.total == 0
        assert mock_db_session.execute.call_count == 2

    async def test_admin_audit_log_filter_by_date_range(self, mock_db_session):
        count_result = MagicMock()
        count_result.scalar.return_value = 0
        log_result = MagicMock()
        log_result.scalars.return_value.all.return_value = []

        mock_db_session.execute = AsyncMock(
            side_effect=[count_result, log_result]
        )
        admin_payload = {"user_id": str(uuid4()), "role": "admin"}

        start = datetime.now(tz=timezone.utc) - timedelta(days=7)
        end = datetime.now(tz=timezone.utc)
        resp = await self._call_get_audit_logs(
            mock_db_session, admin_payload, start_date=start, end_date=end,
        )
        assert resp.total == 0
        assert mock_db_session.execute.call_count == 2


# =========================================================================
# 9. Request Metadata Extraction
# =========================================================================


@pytest.mark.unit
class TestRequestMetadata:
    def test_extract_request_metadata(self):
        request = _make_request(ip="203.0.113.5", user_agent="Mozilla/5.0")
        meta = extract_request_metadata(request)
        assert meta["ip_address"] == "203.0.113.5"
        assert meta["user_agent"] == "Mozilla/5.0"

    def test_extract_request_metadata_no_client(self):
        request = _make_request()
        request.client = None
        meta = extract_request_metadata(request)
        assert meta["ip_address"] is None


# =========================================================================
# 10. Edge Cases
# =========================================================================


@pytest.mark.unit
class TestEdgeCases:
    def test_lock_expiration_boundary(self):
        """At the exact expiration moment the account should NOT be locked
        (the check uses strict > comparison)."""
        now = datetime.now(tz=timezone.utc)
        user = _make_user(locked_until=now)
        assert not user.is_locked()

    def test_failed_attempts_counter_overflow(self):
        user = _make_user(failed_login_attempts=999_999)
        locked = user.increment_failed_login(5, 15)
        assert locked
        assert user.failed_login_attempts == 1_000_000

    def test_password_validation_unicode_characters(self):
        ok, msg = validate_password_strength("Abcdefg1@")
        assert ok
        assert msg is None

    def test_password_validation_empty_string(self):
        ok, msg = validate_password_strength("")
        assert not ok
        assert "8 characters" in msg

    def test_password_validation_very_long_password(self):
        long_pw = "A" * 200 + "a1!"
        ok, msg = validate_password_strength(long_pw)
        assert ok
        assert msg is None

    async def test_rate_limit_with_missing_redis(self):
        """Rate limiter should fail open when Redis is unavailable."""
        from app.middleware.rate_limit import rate_limit

        @rate_limit(max_requests=1, window_seconds=60)
        async def endpoint(request):
            return "allowed"

        request = _make_request()

        with patch(
            "app.middleware.rate_limit.get_rate_limit_redis",
            return_value=None,
        ):
            result = await endpoint(request=request)
        assert result == "allowed"

    def test_user_repr(self):
        user = _make_user(username="alice", role="admin")
        assert "alice" in repr(user)
        assert "admin" in repr(user)

    async def test_get_user_identifier_with_token(self):
        token = create_access_token(data={"user_id": str(uuid4())})
        request = _make_request()
        request.headers = {
            "authorization": f"Bearer {token}",
            "user-agent": "test",
        }
        ident = get_user_identifier(request)
        assert ident.startswith("user:")

    async def test_get_user_identifier_fallback_to_ip(self):
        request = _make_request(ip="10.0.0.5")
        request.headers = {"user-agent": "test"}
        ident = get_user_identifier(request)
        assert ident == "ip:10.0.0.5"
