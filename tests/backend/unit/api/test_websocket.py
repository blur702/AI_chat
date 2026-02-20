"""Tests for WebSocket connection management and message handling."""

import asyncio
import sys
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

# Pre-mock sandbox_manager to avoid circular import (sandbox.__init__ re-imports it)
if "app.services.sandbox_manager" not in sys.modules:
    sys.modules["app.services.sandbox_manager"] = MagicMock()

from app.api.websocket import ConnectionManager, generate_state_snapshot, _WSRateLimiter


# ---------------------------------------------------------------------------
# ConnectionManager
# ---------------------------------------------------------------------------

class TestConnectionManager:
    @pytest.fixture
    def manager(self):
        return ConnectionManager()

    @pytest.mark.asyncio
    async def test_connect_registers_connection(self, manager):
        ws = AsyncMock()
        await manager.connect("conn-1", ws)
        ws.accept.assert_awaited_once()
        assert manager.connection_count == 1
        assert "conn-1" in manager.connection_ids

    @pytest.mark.asyncio
    async def test_connect_with_metadata(self, manager):
        ws = AsyncMock()
        meta = {"user_id": "user-abc", "authenticated_at": "2024-01-01"}
        await manager.connect("conn-1", ws, metadata=meta)
        stored = manager.get_connection_metadata("conn-1")
        assert stored["user_id"] == "user-abc"

    @pytest.mark.asyncio
    async def test_disconnect_removes_connection(self, manager):
        ws = AsyncMock()
        await manager.connect("conn-1", ws)
        await manager.disconnect("conn-1")
        assert manager.connection_count == 0
        assert "conn-1" not in manager.connection_ids

    @pytest.mark.asyncio
    async def test_disconnect_nonexistent_is_safe(self, manager):
        await manager.disconnect("nonexistent")  # Should not raise

    @pytest.mark.asyncio
    async def test_send_message_to_connected(self, manager):
        ws = AsyncMock()
        await manager.connect("conn-1", ws)
        result = await manager.send_message("conn-1", {"type": "test"})
        assert result is True
        ws.send_json.assert_awaited_once_with({"type": "test"})

    @pytest.mark.asyncio
    async def test_send_message_to_nonexistent(self, manager):
        result = await manager.send_message("nonexistent", {"type": "test"})
        assert result is False

    @pytest.mark.asyncio
    async def test_send_message_disconnects_on_error(self, manager):
        ws = AsyncMock()
        ws.send_json = AsyncMock(side_effect=Exception("broken pipe"))
        await manager.connect("conn-1", ws)
        result = await manager.send_message("conn-1", {"type": "test"})
        assert result is False
        assert manager.connection_count == 0

    @pytest.mark.asyncio
    async def test_broadcast_to_all(self, manager):
        ws1 = AsyncMock()
        ws2 = AsyncMock()
        await manager.connect("conn-1", ws1)
        await manager.connect("conn-2", ws2)
        count = await manager.broadcast({"type": "event"})
        assert count == 2
        ws1.send_json.assert_awaited_once()
        ws2.send_json.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_broadcast_handles_failed_connections(self, manager):
        ws1 = AsyncMock()
        ws2 = AsyncMock()
        ws2.send_json = AsyncMock(side_effect=Exception("disconnected"))
        await manager.connect("conn-1", ws1)
        await manager.connect("conn-2", ws2)
        count = await manager.broadcast({"type": "event"})
        assert count == 1
        # Failed connection should be cleaned up
        assert manager.connection_count == 1

    @pytest.mark.asyncio
    async def test_broadcast_to_empty(self, manager):
        count = await manager.broadcast({"type": "event"})
        assert count == 0

    @pytest.mark.asyncio
    async def test_send_typed_message(self, manager):
        ws = AsyncMock()
        await manager.connect("conn-1", ws)
        result = await manager.send_typed_message("conn-1", "notification", {"msg": "hi"})
        assert result is True
        call_args = ws.send_json.call_args[0][0]
        assert call_args["type"] == "notification"
        assert call_args["data"]["msg"] == "hi"
        assert "timestamp" in call_args

    @pytest.mark.asyncio
    async def test_broadcast_typed(self, manager):
        ws = AsyncMock()
        await manager.connect("conn-1", ws)
        count = await manager.broadcast_typed("event_type", {"key": "val"})
        assert count == 1

    @pytest.mark.asyncio
    async def test_send_state_snapshot(self, manager):
        ws = AsyncMock()
        await manager.connect("conn-1", ws)
        result = await manager.send_state_snapshot("conn-1", {"resources": []})
        assert result is True
        call_args = ws.send_json.call_args[0][0]
        assert call_args["type"] == "state_snapshot"

    def test_get_connection_metadata_not_found(self, manager):
        assert manager.get_connection_metadata("nonexistent") is None

    @pytest.mark.asyncio
    async def test_get_connections_by_user(self, manager):
        user_id = uuid4()
        ws1 = AsyncMock()
        ws2 = AsyncMock()
        ws3 = AsyncMock()
        await manager.connect("conn-1", ws1, metadata={"user_id": str(user_id)})
        await manager.connect("conn-2", ws2, metadata={"user_id": str(user_id)})
        await manager.connect("conn-3", ws3, metadata={"user_id": str(uuid4())})

        connections = manager.get_connections_by_user(user_id)
        assert len(connections) == 2
        assert "conn-1" in connections
        assert "conn-2" in connections

    @pytest.mark.asyncio
    async def test_connection_count_property(self, manager):
        assert manager.connection_count == 0
        ws = AsyncMock()
        await manager.connect("conn-1", ws)
        assert manager.connection_count == 1

    @pytest.mark.asyncio
    async def test_connection_ids_property(self, manager):
        ws = AsyncMock()
        await manager.connect("conn-1", ws)
        await manager.connect("conn-2", AsyncMock())
        ids = manager.connection_ids
        assert set(ids) == {"conn-1", "conn-2"}


# ---------------------------------------------------------------------------
# generate_state_snapshot
# ---------------------------------------------------------------------------

class TestGenerateStateSnapshot:
    @pytest.mark.asyncio
    async def test_returns_snapshot_structure(self):
        kernel = MagicMock()
        kernel.get_service.return_value = None
        kernel.health_check = AsyncMock(return_value={"healthy": True})

        snapshot = await generate_state_snapshot(kernel)
        assert "active_operations" in snapshot
        assert "resources" in snapshot
        assert "vram_stats" in snapshot
        assert "kernel_health" in snapshot
        assert "timestamp" in snapshot

    @pytest.mark.asyncio
    async def test_handles_missing_resource_manager(self):
        kernel = MagicMock()
        kernel.get_service.return_value = None
        kernel.health_check = AsyncMock(return_value={"healthy": True})

        snapshot = await generate_state_snapshot(kernel)
        assert snapshot["active_operations"] == []

    @pytest.mark.asyncio
    async def test_handles_kernel_health_error(self):
        kernel = MagicMock()
        kernel.get_service.return_value = None
        kernel.health_check = AsyncMock(side_effect=Exception("health failed"))

        snapshot = await generate_state_snapshot(kernel)
        assert snapshot["kernel_health"]["healthy"] is False

    @pytest.mark.asyncio
    async def test_filters_by_user_id(self):
        user_id = uuid4()
        other_user = uuid4()

        resource_manager = AsyncMock()
        resource_manager.scan_operation_keys = AsyncMock(return_value=["op1", "op2"])
        resource_manager.get_operation_state = AsyncMock(side_effect=[
            {"user_id": str(user_id), "status": "running"},
            {"user_id": str(other_user), "status": "running"},
        ])
        resource_manager.get_loaded_resources = AsyncMock(return_value=[])
        resource_manager.get_cached_vram_stats = AsyncMock(return_value={})

        kernel = MagicMock()
        kernel.get_service.return_value = resource_manager
        kernel.health_check = AsyncMock(return_value={"healthy": True})

        snapshot = await generate_state_snapshot(kernel, user_id=user_id)
        assert len(snapshot["active_operations"]) == 1


# ---------------------------------------------------------------------------
# _WSRateLimiter
# ---------------------------------------------------------------------------

class TestWSRateLimiter:
    def test_allow_under_limit(self):
        limiter = _WSRateLimiter(max_messages=5, window_seconds=10.0)
        for _ in range(5):
            assert limiter.allow() is True

    def test_deny_over_limit(self):
        limiter = _WSRateLimiter(max_messages=3, window_seconds=10.0)
        for _ in range(3):
            assert limiter.allow() is True
        assert limiter.allow() is False

    def test_sliding_window_expires(self):
        import time
        limiter = _WSRateLimiter(max_messages=2, window_seconds=0.1)
        assert limiter.allow() is True
        assert limiter.allow() is True
        assert limiter.allow() is False
        time.sleep(0.15)
        assert limiter.allow() is True


# ---------------------------------------------------------------------------
# ConnectionManager per-user connection limit
# ---------------------------------------------------------------------------

class TestConnectionManagerUserLimit:
    @pytest.fixture
    def manager(self):
        return ConnectionManager()

    @pytest.mark.asyncio
    async def test_per_user_connection_limit(self, manager):
        user_id = str(uuid4())
        # Connect MAX_CONNECTIONS_PER_USER (5) connections for same user
        for i in range(5):
            ws = AsyncMock()
            result = await manager.connect(
                f"conn-{i}", ws, metadata={"user_id": user_id}
            )
            assert result is True

        # 6th connection should be rejected
        ws = AsyncMock()
        result = await manager.connect(
            "conn-6", ws, metadata={"user_id": user_id}
        )
        assert result is False
        assert manager.connection_count == 5

    @pytest.mark.asyncio
    async def test_different_users_not_limited(self, manager):
        for i in range(6):
            ws = AsyncMock()
            result = await manager.connect(
                f"conn-{i}", ws, metadata={"user_id": str(uuid4())}
            )
            assert result is True
        assert manager.connection_count == 6
