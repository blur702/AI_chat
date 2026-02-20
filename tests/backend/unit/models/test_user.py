"""Unit tests for the User model."""

from datetime import datetime, timedelta, timezone
from unittest.mock import patch
from uuid import uuid4

import pytest

from app.models.user import User, is_master_user


pytestmark = pytest.mark.unit


# ---------------------------------------------------------------------------
# Construction
# ---------------------------------------------------------------------------


class TestUserConstruction:
    """Tests for User model instantiation with required fields."""

    def test_basic_construction(self):
        user = User(
            id=uuid4(),
            username="testuser",
            hashed_password="hashed_abc",
            role="user",
        )
        assert user.username == "testuser"
        assert user.hashed_password == "hashed_abc"
        assert user.role == "user"

    def test_optional_fields_default_none(self):
        user = User(
            id=uuid4(),
            username="testuser",
            hashed_password="hashed_abc",
        )
        assert user.email is None
        assert user.first_name is None
        assert user.last_name is None
        assert user.screen_name is None
        assert user.password_reset_token is None
        assert user.password_reset_expires is None
        assert user.last_login_at is None
        assert user.last_password_change is None

    def test_with_email(self):
        user = User(
            id=uuid4(),
            username="testuser",
            hashed_password="hashed_abc",
            email="test@example.com",
        )
        assert user.email == "test@example.com"

    def test_defaults_none_in_pure_python(self):
        """Server-side INSERT defaults are not applied in pure Python construction."""
        user = User(
            id=uuid4(),
            username="testuser",
            hashed_password="hashed_abc",
        )
        # mapped_column(default=X) is INSERT-time; Python-side yields None
        assert user.failed_login_attempts is None
        assert user.locked_until is None

    def test_defaults_when_explicitly_set(self):
        user = User(
            id=uuid4(),
            username="testuser",
            hashed_password="hashed_abc",
            failed_login_attempts=0,
            is_active=True,
            email_verified=False,
        )
        assert user.failed_login_attempts == 0
        assert user.is_active is True
        assert user.email_verified is False


# ---------------------------------------------------------------------------
# is_locked()
# ---------------------------------------------------------------------------


class TestIsLocked:
    """Tests for the is_locked method."""

    def test_not_locked_when_locked_until_is_none(self):
        user = User(
            id=uuid4(),
            username="testuser",
            hashed_password="h",
            locked_until=None,
        )
        assert user.is_locked() is False

    def test_locked_when_locked_until_is_future(self):
        user = User(
            id=uuid4(),
            username="testuser",
            hashed_password="h",
            locked_until=datetime.now(tz=timezone.utc) + timedelta(minutes=30),
        )
        assert user.is_locked() is True

    def test_not_locked_when_locked_until_is_past(self):
        user = User(
            id=uuid4(),
            username="testuser",
            hashed_password="h",
            locked_until=datetime.now(tz=timezone.utc) - timedelta(minutes=1),
        )
        assert user.is_locked() is False


# ---------------------------------------------------------------------------
# increment_failed_login
# ---------------------------------------------------------------------------


class TestIncrementFailedLogin:
    """Tests for the increment_failed_login method."""

    def test_increments_counter(self):
        user = User(
            id=uuid4(),
            username="testuser",
            hashed_password="h",
            failed_login_attempts=0,
        )
        locked = user.increment_failed_login(lockout_threshold=5, lockout_duration_minutes=15)
        assert locked is False
        assert user.failed_login_attempts == 1

    def test_locks_at_threshold(self):
        user = User(
            id=uuid4(),
            username="testuser",
            hashed_password="h",
            failed_login_attempts=4,
        )
        locked = user.increment_failed_login(lockout_threshold=5, lockout_duration_minutes=15)
        assert locked is True
        assert user.failed_login_attempts == 5
        assert user.locked_until is not None
        assert user.locked_until > datetime.now(tz=timezone.utc)

    def test_locks_beyond_threshold(self):
        user = User(
            id=uuid4(),
            username="testuser",
            hashed_password="h",
            failed_login_attempts=10,
        )
        locked = user.increment_failed_login(lockout_threshold=5, lockout_duration_minutes=30)
        assert locked is True
        assert user.failed_login_attempts == 11

    def test_lockout_duration(self):
        user = User(
            id=uuid4(),
            username="testuser",
            hashed_password="h",
            failed_login_attempts=4,
        )
        before = datetime.now(tz=timezone.utc)
        user.increment_failed_login(lockout_threshold=5, lockout_duration_minutes=60)
        after = datetime.now(tz=timezone.utc)
        assert user.locked_until >= before + timedelta(minutes=60)
        assert user.locked_until <= after + timedelta(minutes=60)


# ---------------------------------------------------------------------------
# reset_failed_login
# ---------------------------------------------------------------------------


class TestResetFailedLogin:
    """Tests for the reset_failed_login method."""

    def test_resets_counter_and_unlock(self):
        user = User(
            id=uuid4(),
            username="testuser",
            hashed_password="h",
            failed_login_attempts=5,
            locked_until=datetime.now(tz=timezone.utc) + timedelta(minutes=30),
        )
        user.reset_failed_login()
        assert user.failed_login_attempts == 0
        assert user.locked_until is None

    def test_reset_when_already_clean(self):
        user = User(
            id=uuid4(),
            username="testuser",
            hashed_password="h",
            failed_login_attempts=0,
            locked_until=None,
        )
        user.reset_failed_login()
        assert user.failed_login_attempts == 0
        assert user.locked_until is None


# ---------------------------------------------------------------------------
# lock_account
# ---------------------------------------------------------------------------


class TestLockAccount:
    """Tests for the lock_account method."""

    def test_lock_account(self):
        user = User(
            id=uuid4(),
            username="testuser",
            hashed_password="h",
        )
        before = datetime.now(tz=timezone.utc)
        user.lock_account(duration_minutes=120)
        after = datetime.now(tz=timezone.utc)

        assert user.locked_until is not None
        assert user.locked_until >= before + timedelta(minutes=120)
        assert user.locked_until <= after + timedelta(minutes=120)
        assert user.is_locked() is True


# ---------------------------------------------------------------------------
# __repr__
# ---------------------------------------------------------------------------


class TestUserRepr:
    """Tests for User.__repr__."""

    def test_repr_format(self):
        uid = uuid4()
        user = User(
            id=uid,
            username="testuser",
            hashed_password="h",
            role="admin",
        )
        r = repr(user)
        assert "User" in r
        assert "testuser" in r
        assert "admin" in r
        assert str(uid) in r


# ---------------------------------------------------------------------------
# is_master_user helper
# ---------------------------------------------------------------------------


class TestIsMasterUser:
    """Tests for the is_master_user module-level function."""

    def test_master_user_detection(self):
        # MASTER_USERNAMES is loaded from env at import time.
        # We test the function behavior with current env config.
        # The function checks against the frozenset.
        from app.models.user import MASTER_USERNAMES

        assert MASTER_USERNAMES, "MASTER_USERNAMES must be non-empty for this test"
        for name in MASTER_USERNAMES:
            assert is_master_user(name) is True

    def test_non_master_user(self):
        assert is_master_user("definitely_not_a_master_user_xyz") is False
