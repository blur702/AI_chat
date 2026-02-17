"""Unit tests for the EventBus kernel service."""

import asyncio
import json
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.kernel.event_bus import CHANNEL_ALL, CHANNEL_PREFIX, EventBus


# =========================================================================
# Lifecycle Tests
# =========================================================================

class TestEventBusLifecycle:
    """Tests for EventBus startup/shutdown/health."""

    @pytest.mark.unit
    async def test_startup_creates_connections(self, mock_redis):
        """startup() creates Redis connection, pub/sub, and listener."""
        bus = EventBus(session_factory=None, redis_client=mock_redis)
        await bus.startup()

        assert bus.is_running
        assert bus.name == "event_bus"
        assert bus._pubsub is not None
        assert bus._listener_task is not None
        assert not bus._listener_task.done()

        await bus.shutdown()

    @pytest.mark.unit
    async def test_startup_idempotent(self, mock_redis):
        """Calling startup() twice is safe."""
        bus = EventBus(session_factory=None, redis_client=mock_redis)
        await bus.startup()
        await bus.startup()

        assert bus.is_running
        await bus.shutdown()

    @pytest.mark.unit
    async def test_shutdown_cancels_listener(self, mock_redis):
        """shutdown() cancels listener task and closes connections."""
        bus = EventBus(session_factory=None, redis_client=mock_redis)
        await bus.startup()
        await bus.shutdown()

        assert not bus.is_running
        assert bus._listener_task is None
        assert bus._pubsub is None

    @pytest.mark.unit
    async def test_shutdown_clears_subscribers(self, mock_redis):
        """shutdown() clears all subscribers."""
        bus = EventBus(session_factory=None, redis_client=mock_redis)
        await bus.startup()

        callback = AsyncMock()
        await bus.subscribe("test_event", callback)
        assert len(bus._subscribers) > 0

        await bus.shutdown()
        assert len(bus._subscribers) == 0

    @pytest.mark.unit
    async def test_health_check_healthy(self, mock_redis):
        """health_check returns (True, 'ok') when running."""
        bus = EventBus(session_factory=None, redis_client=mock_redis)
        await bus.startup()

        healthy, msg = await bus.health_check()
        assert healthy is True
        assert msg == "ok"
        await bus.shutdown()

    @pytest.mark.unit
    async def test_health_check_not_running(self, mock_redis):
        """health_check returns (False, ...) when not running."""
        bus = EventBus(session_factory=None, redis_client=mock_redis)

        healthy, msg = await bus.health_check()
        assert healthy is False
        assert "not running" in msg

    @pytest.mark.unit
    async def test_health_check_no_redis(self):
        """health_check detects missing Redis."""
        bus = EventBus(session_factory=None, redis_client=None)
        bus._running = True
        bus._redis = None

        healthy, msg = await bus.health_check()
        assert healthy is False
        assert "not connected" in msg


# =========================================================================
# Event Publishing Tests
# =========================================================================

class TestEventPublishing:
    """Tests for event publishing."""

    @pytest.mark.unit
    async def test_publish_event(self, mock_redis):
        """publish_event publishes to Redis channel."""
        bus = EventBus(session_factory=None, redis_client=mock_redis)
        await bus.startup()

        result = await bus.publish_event(
            event_type="model_loaded",
            event_data={"model": "llama"},
            severity="info",
            source="test",
        )
        # Non-persisted events return None
        assert result is None
        await bus.shutdown()

    @pytest.mark.unit
    async def test_publish_includes_metadata(self, mock_redis):
        """Event payload includes all metadata fields."""
        bus = EventBus(session_factory=None, redis_client=mock_redis)
        await bus.startup()

        # Subscribe to capture the published message
        pubsub = mock_redis.pubsub()
        await pubsub.psubscribe(CHANNEL_ALL)

        user_id = uuid.uuid4()
        chat_id = uuid.uuid4()

        await bus.publish_event(
            event_type="test_event",
            event_data={"key": "value"},
            severity="warning",
            source="test_source",
            user_id=user_id,
            chat_id=chat_id,
            resource_id="res-1",
        )

        # Read from pub/sub
        msg = await pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)
        assert msg is not None, "Expected a pub/sub message but got None"
        payload = json.loads(msg["data"])
        assert payload["event_type"] == "test_event"
        assert payload["severity"] == "warning"
        assert payload["source"] == "test_source"
        assert payload["user_id"] == str(user_id)
        assert payload["chat_id"] == str(chat_id)
        assert payload["resource_id"] == "res-1"

        await pubsub.aclose()
        await bus.shutdown()

    @pytest.mark.unit
    async def test_publish_channel_naming(self, mock_redis):
        """Events are published to events:{event_type} channel."""
        bus = EventBus(session_factory=None, redis_client=mock_redis)
        await bus.startup()

        pubsub = mock_redis.pubsub()
        await pubsub.subscribe(f"{CHANNEL_PREFIX}model_loaded")

        await bus.publish_event(
            event_type="model_loaded",
            event_data={"model": "test"},
        )

        msg = await pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)
        assert msg is not None, "Expected a pub/sub message but got None"
        assert msg["channel"] == f"{CHANNEL_PREFIX}model_loaded"

        await pubsub.aclose()
        await bus.shutdown()

    @pytest.mark.unit
    async def test_publish_not_running_returns_none(self, mock_redis):
        """Publishing when not running logs warning and returns None."""
        bus = EventBus(session_factory=None, redis_client=mock_redis)

        result = await bus.publish_event(
            event_type="test",
            event_data={},
        )
        assert result is None

    @pytest.mark.unit
    async def test_publish_with_persistence(self, mock_redis, mock_session_factory, mock_db_session):
        """Persistence saves event to database when persist=True."""
        mock_event = MagicMock()
        mock_event.id = uuid.uuid4()
        mock_db_session.refresh = AsyncMock(side_effect=lambda e: setattr(e, 'id', mock_event.id))

        bus = EventBus(session_factory=mock_session_factory, redis_client=mock_redis)
        await bus.startup()

        event_id = await bus.publish_event(
            event_type="important_event",
            event_data={"critical": True},
            persist=True,
        )
        assert event_id == mock_event.id
        # Should have attempted to persist
        mock_db_session.add.assert_called_once()
        mock_db_session.commit.assert_awaited_once()
        await bus.shutdown()

    @pytest.mark.unit
    async def test_publish_without_persistence(self, mock_redis):
        """No database persistence when persist=False."""
        mock_factory = AsyncMock()
        bus = EventBus(session_factory=mock_factory, redis_client=mock_redis)
        await bus.startup()

        await bus.publish_event(
            event_type="regular_event",
            event_data={},
            persist=False,
        )
        mock_factory.assert_not_called()
        await bus.shutdown()


# =========================================================================
# Event Persistence Tests
# =========================================================================

class TestEventPersistence:
    """Tests for _save_event_to_db."""

    @pytest.mark.unit
    async def test_save_event_creates_record(self, mock_session_factory, mock_db_session):
        """_save_event_to_db creates Event record and returns ID."""
        mock_event = MagicMock()
        mock_event.id = uuid.uuid4()

        async def refresh_side_effect(event):
            event.id = mock_event.id
        mock_db_session.refresh = AsyncMock(side_effect=refresh_side_effect)

        bus = EventBus(session_factory=mock_session_factory)

        event_id = await bus._save_event_to_db(
            event_type="test",
            event_data={"key": "value"},
            severity="info",
            source="test",
        )
        assert event_id == mock_event.id

        mock_db_session.add.assert_called_once()
        mock_db_session.commit.assert_awaited_once()

    @pytest.mark.unit
    async def test_save_event_with_associations(self, mock_session_factory, mock_db_session):
        """Event stores user_id, chat_id, resource_id when provided."""
        mock_event = MagicMock()
        mock_event.id = uuid.uuid4()

        async def refresh_side_effect(event):
            event.id = mock_event.id
        mock_db_session.refresh = AsyncMock(side_effect=refresh_side_effect)

        bus = EventBus(session_factory=mock_session_factory)

        user_id = uuid.uuid4()
        chat_id = uuid.uuid4()

        await bus._save_event_to_db(
            event_type="test",
            event_data={},
            severity="info",
            source="test",
            user_id=user_id,
            chat_id=chat_id,
            resource_id="res-1",
        )

        # Verify the Event was created with correct fields
        add_call = mock_db_session.add.call_args[0][0]
        assert add_call.user_id == user_id
        assert add_call.chat_id == chat_id
        assert add_call.resource_id == "res-1"

    @pytest.mark.unit
    async def test_save_event_handles_failure(self, mock_session_factory, mock_db_session):
        """Persistence failure is handled gracefully."""
        mock_db_session.commit = AsyncMock(side_effect=Exception("db error"))

        bus = EventBus(session_factory=mock_session_factory)
        result = await bus._save_event_to_db(
            event_type="test", event_data={}, severity="info", source="test"
        )
        assert result is None

    @pytest.mark.unit
    async def test_save_event_no_session_factory(self):
        """Returns None when no session factory configured."""
        bus = EventBus(session_factory=None)
        result = await bus._save_event_to_db(
            event_type="test", event_data={}, severity="info", source="test"
        )
        assert result is None


# =========================================================================
# Subscription Tests
# =========================================================================

class TestSubscriptions:
    """Tests for event subscription management."""

    @pytest.mark.unit
    async def test_subscribe_registers_callback(self, mock_redis):
        """subscribe() registers callback for event type."""
        bus = EventBus(session_factory=None, redis_client=mock_redis)
        callback = AsyncMock()
        await bus.subscribe("model_loaded", callback)

        assert "model_loaded" in bus._subscribers
        assert callback in bus._subscribers["model_loaded"]

    @pytest.mark.unit
    async def test_wildcard_subscription(self, mock_redis):
        """Wildcard '*' subscription receives all events."""
        bus = EventBus(session_factory=None, redis_client=mock_redis)
        callback = AsyncMock()
        await bus.subscribe("*", callback)

        assert "*" in bus._subscribers
        assert callback in bus._subscribers["*"]

    @pytest.mark.unit
    async def test_unsubscribe(self, mock_redis):
        """unsubscribe() removes callback."""
        bus = EventBus(session_factory=None, redis_client=mock_redis)
        callback = AsyncMock()
        await bus.subscribe("test_event", callback)

        result = await bus.unsubscribe("test_event", callback)
        assert result is True
        assert callback not in bus._subscribers.get("test_event", [])

    @pytest.mark.unit
    async def test_unsubscribe_not_found(self, mock_redis):
        """unsubscribe() returns False for non-existent callback."""
        bus = EventBus(session_factory=None, redis_client=mock_redis)
        callback = AsyncMock()

        result = await bus.unsubscribe("test_event", callback)
        assert result is False

    @pytest.mark.unit
    async def test_duplicate_subscription_prevented(self, mock_redis):
        """Same callback not added twice."""
        bus = EventBus(session_factory=None, redis_client=mock_redis)
        callback = AsyncMock()
        await bus.subscribe("test_event", callback)
        await bus.subscribe("test_event", callback)

        assert len(bus._subscribers["test_event"]) == 1


# =========================================================================
# Message Handling Tests
# =========================================================================

class TestMessageHandling:
    """Tests for _handle_message and _dispatch_to_subscribers."""

    @pytest.mark.unit
    async def test_handle_message_dispatches(self, mock_redis):
        """_handle_message parses payload and dispatches to subscribers."""
        bus = EventBus(session_factory=None, redis_client=mock_redis)
        callback = AsyncMock()
        await bus.subscribe("model_loaded", callback)

        message = {
            "type": "pmessage",
            "channel": f"{CHANNEL_PREFIX}model_loaded",
            "data": json.dumps({
                "event_type": "model_loaded",
                "event_data": {"model": "llama"},
                "severity": "info",
                "source": "test",
                "timestamp": "2025-01-01T00:00:00Z",
            }),
        }
        await bus._handle_message(message)

        callback.assert_awaited_once()
        call_args = callback.call_args
        assert call_args[0][0] == "model_loaded"
        assert call_args[0][1]["model"] == "llama"

    @pytest.mark.unit
    async def test_handle_message_wildcard(self, mock_redis):
        """Wildcard subscribers receive all event types."""
        bus = EventBus(session_factory=None, redis_client=mock_redis)
        wildcard = AsyncMock()
        specific = AsyncMock()
        await bus.subscribe("*", wildcard)
        await bus.subscribe("other_event", specific)

        message = {
            "type": "pmessage",
            "channel": f"{CHANNEL_PREFIX}model_loaded",
            "data": json.dumps({
                "event_type": "model_loaded",
                "event_data": {},
                "severity": "info",
                "source": "test",
            }),
        }
        await bus._handle_message(message)

        wildcard.assert_awaited_once()
        specific.assert_not_awaited()

    @pytest.mark.unit
    async def test_handle_message_invalid_json(self, mock_redis):
        """Invalid JSON in message is handled gracefully."""
        bus = EventBus(session_factory=None, redis_client=mock_redis)
        callback = AsyncMock()
        await bus.subscribe("test", callback)

        message = {
            "type": "pmessage",
            "channel": f"{CHANNEL_PREFIX}test",
            "data": "not-json",
        }
        await bus._handle_message(message)  # should not raise
        callback.assert_not_awaited()

    @pytest.mark.unit
    async def test_dispatch_sync_callback(self, mock_redis):
        """Sync callbacks are called without await."""
        bus = EventBus(session_factory=None, redis_client=mock_redis)
        sync_callback = MagicMock(__name__="sync_callback")
        await bus.subscribe("test_event", sync_callback)

        await bus._dispatch_to_subscribers(
            "test_event", {"key": "value"}, {"severity": "info"}
        )
        sync_callback.assert_called_once()

    @pytest.mark.unit
    async def test_dispatch_callback_error(self, mock_redis):
        """Subscriber callback errors are logged but don't crash dispatch."""
        bus = EventBus(session_factory=None, redis_client=mock_redis)
        bad_callback = AsyncMock(side_effect=RuntimeError("callback error"))
        good_callback = AsyncMock()
        await bus.subscribe("test_event", bad_callback)
        await bus.subscribe("test_event", good_callback)

        await bus._dispatch_to_subscribers("test_event", {}, {})

        bad_callback.assert_awaited_once()
        good_callback.assert_awaited_once()


# =========================================================================
# Listener Tests
# =========================================================================

class TestListener:
    """Tests for the background listener loop."""

    @pytest.mark.unit
    async def test_listener_done_callback_on_cancel(self, mock_redis):
        """Listener done callback handles cancellation gracefully."""
        bus = EventBus(session_factory=None, redis_client=mock_redis)

        task = MagicMock()
        task.cancelled.return_value = True
        bus._listener_done_callback(task)
        # Should not raise

    @pytest.mark.unit
    async def test_listener_done_callback_on_error(self, mock_redis):
        """Listener done callback logs errors."""
        bus = EventBus(session_factory=None, redis_client=mock_redis)

        task = MagicMock()
        task.cancelled.return_value = False
        task.exception.return_value = RuntimeError("listener died")
        bus._listener_done_callback(task)
        # Should not raise


# =========================================================================
# WebSocket Integration Tests
# =========================================================================

class TestWebSocketIntegration:
    """Tests for WebSocket broadcasting."""

    @pytest.mark.unit
    async def test_set_websocket_manager(self, mock_redis):
        """set_websocket_manager attaches manager."""
        bus = EventBus(session_factory=None, redis_client=mock_redis)
        manager = MagicMock()
        bus.set_websocket_manager(manager)
        assert bus._websocket_manager is manager

    @pytest.mark.unit
    async def test_broadcast_on_publish(self, mock_redis):
        """WebSocket broadcast_typed called on publish."""
        bus = EventBus(session_factory=None, redis_client=mock_redis)
        manager = MagicMock()
        manager.broadcast_typed = AsyncMock()
        bus.set_websocket_manager(manager)
        await bus.startup()

        await bus.publish_event(
            event_type="model_loaded",
            event_data={"model": "test"},
        )

        manager.broadcast_typed.assert_awaited_once()
        call_args = manager.broadcast_typed.call_args
        assert call_args[0][0] == "model_loaded"
        assert "event_data" in call_args[0][1]

        await bus.shutdown()

    @pytest.mark.unit
    async def test_broadcast_failure_logged(self, mock_redis):
        """WebSocket broadcast failure is logged but doesn't stop publishing."""
        bus = EventBus(session_factory=None, redis_client=mock_redis)
        manager = MagicMock()
        manager.broadcast_typed = AsyncMock(side_effect=RuntimeError("ws error"))
        bus.set_websocket_manager(manager)
        await bus.startup()

        # Should not raise
        await bus.publish_event(
            event_type="test",
            event_data={},
        )
        manager.broadcast_typed.assert_awaited_once()

        await bus.shutdown()

    @pytest.mark.unit
    async def test_shutdown_clears_websocket_manager(self, mock_redis):
        """shutdown() clears the WebSocket manager reference."""
        bus = EventBus(session_factory=None, redis_client=mock_redis)
        manager = MagicMock()
        bus.set_websocket_manager(manager)
        await bus.startup()
        await bus.shutdown()

        assert bus._websocket_manager is None
