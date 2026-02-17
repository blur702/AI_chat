"""Tests for admin API endpoint helpers and utilities."""

import pytest

from app.api.admin import (
    _escape_like,
    _build_audit_filters,
    ALLOWED_USER_SORT_COLUMNS,
)
from datetime import datetime, timezone
from uuid import uuid4


class TestEscapeLike:
    def test_escapes_percent(self):
        assert _escape_like("100%") == "100\\%"

    def test_escapes_underscore(self):
        assert _escape_like("user_name") == "user\\_name"

    def test_escapes_backslash(self):
        assert _escape_like("path\\to") == "path\\\\to"

    def test_no_special_chars(self):
        assert _escape_like("hello") == "hello"

    def test_multiple_special_chars(self):
        assert _escape_like("100%_test\\") == "100\\%\\_test\\\\"

    def test_empty_string(self):
        assert _escape_like("") == ""


class TestBuildAuditFilters:
    def test_no_filters_returns_empty(self):
        filters = _build_audit_filters(None, None, None, None, None)
        assert filters == []

    def test_user_id_filter(self):
        uid = uuid4()
        filters = _build_audit_filters(uid, None, None, None, None)
        assert len(filters) == 1

    def test_action_filter(self):
        filters = _build_audit_filters(None, "login", None, None, None)
        assert len(filters) == 1

    def test_status_filter(self):
        filters = _build_audit_filters(None, None, "success", None, None)
        assert len(filters) == 1

    def test_date_range_filters(self):
        start = datetime(2024, 1, 1, tzinfo=timezone.utc)
        end = datetime(2024, 12, 31, tzinfo=timezone.utc)
        filters = _build_audit_filters(None, None, None, start, end)
        assert len(filters) == 2

    def test_ip_address_filter(self):
        filters = _build_audit_filters(None, None, None, None, None, ip_address="192.168")
        assert len(filters) == 1

    def test_search_filter(self):
        filters = _build_audit_filters(None, None, None, None, None, search="login")
        assert len(filters) == 1

    def test_all_filters_combined(self):
        uid = uuid4()
        start = datetime(2024, 1, 1, tzinfo=timezone.utc)
        end = datetime(2024, 12, 31, tzinfo=timezone.utc)
        filters = _build_audit_filters(
            uid, "login", "success", start, end,
            ip_address="192.168", search="admin",
        )
        assert len(filters) == 7


class TestAllowedSortColumns:
    def test_contains_expected_columns(self):
        expected = {"id", "username", "email", "role", "is_active", "created_at", "updated_at", "last_login_at"}
        assert expected == ALLOWED_USER_SORT_COLUMNS

    def test_is_frozen_set(self):
        assert isinstance(ALLOWED_USER_SORT_COLUMNS, frozenset)

    def test_dangerous_columns_not_allowed(self):
        assert "password_hash" not in ALLOWED_USER_SORT_COLUMNS
        assert "failed_login_attempts" not in ALLOWED_USER_SORT_COLUMNS
