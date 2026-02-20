"""Tests for rate limiting middleware and decorators."""

import time

import pytest
from unittest.mock import MagicMock, patch

from app.middleware.rate_limit import (
    _InMemoryRateLimiter,
    get_client_ip,
    _is_trusted_proxy,
)


pytestmark = pytest.mark.unit


# ---------------------------------------------------------------------------
# _InMemoryRateLimiter
# ---------------------------------------------------------------------------

class TestInMemoryRateLimiter:
    def test_allows_under_limit(self):
        limiter = _InMemoryRateLimiter()
        for _ in range(5):
            allowed, remaining, retry_after = limiter.check("key1", 5, 60)
            assert allowed is True
            assert retry_after == 0

    def test_denies_over_limit(self):
        limiter = _InMemoryRateLimiter()
        for _ in range(3):
            limiter.check("key1", 3, 60)
        allowed, remaining, retry_after = limiter.check("key1", 3, 60)
        assert allowed is False
        assert remaining == 0
        assert retry_after > 0

    def test_separate_keys(self):
        limiter = _InMemoryRateLimiter()
        for _ in range(3):
            limiter.check("key1", 3, 60)
        # key2 should still be allowed
        allowed, _, _ = limiter.check("key2", 3, 60)
        assert allowed is True

    def test_sliding_window_expires(self):
        limiter = _InMemoryRateLimiter()
        for _ in range(2):
            limiter.check("key1", 2, 0.1)
        allowed, _, _ = limiter.check("key1", 2, 0.1)
        assert allowed is False
        time.sleep(0.15)
        allowed, _, _ = limiter.check("key1", 2, 0.1)
        assert allowed is True

    def test_cleanup_stale_buckets(self):
        limiter = _InMemoryRateLimiter()
        limiter.check("stale_key", 10, 60)
        # Force stale cleanup by manipulating last_cleanup time
        limiter._last_cleanup = time.time() - 400
        limiter.check("fresh_key", 10, 60)
        # stale_key should still exist since it's recent
        assert "stale_key" in limiter._windows


# ---------------------------------------------------------------------------
# get_client_ip
# ---------------------------------------------------------------------------

class TestGetClientIp:
    def _make_request(self, client_host="1.2.3.4", headers=None):
        request = MagicMock()
        request.client = MagicMock()
        request.client.host = client_host
        request.headers = headers or {}
        return request

    def test_returns_client_host_when_no_xff(self):
        request = self._make_request("1.2.3.4")
        assert get_client_ip(request) == "1.2.3.4"

    def test_returns_unknown_when_no_client(self):
        request = MagicMock()
        request.client = None
        assert get_client_ip(request) == "unknown"

    def test_ignores_xff_from_untrusted_proxy(self):
        request = self._make_request(
            "5.6.7.8",
            headers={"x-forwarded-for": "10.0.0.1, 1.2.3.4"},
        )
        assert get_client_ip(request) == "5.6.7.8"

    def test_respects_xff_from_trusted_proxy(self):
        request = self._make_request(
            "127.0.0.1",
            headers={"x-forwarded-for": "99.88.77.66"},
        )
        assert get_client_ip(request) == "99.88.77.66"

    def test_skips_trusted_proxies_in_xff_chain(self):
        request = self._make_request(
            "127.0.0.1",
            headers={"x-forwarded-for": "99.88.77.66, 10.0.0.5"},
        )
        # 10.0.0.5 is trusted (10.0.0.0/8), so it should return 99.88.77.66
        assert get_client_ip(request) == "99.88.77.66"


# ---------------------------------------------------------------------------
# _is_trusted_proxy
# ---------------------------------------------------------------------------

class TestIsTrustedProxy:
    def test_localhost_is_trusted(self):
        assert _is_trusted_proxy("127.0.0.1") is True

    def test_docker_network_is_trusted(self):
        assert _is_trusted_proxy("172.18.0.1") is True

    def test_public_ip_is_not_trusted(self):
        assert _is_trusted_proxy("8.8.8.8") is False

    def test_invalid_ip_is_not_trusted(self):
        assert _is_trusted_proxy("not-an-ip") is False
