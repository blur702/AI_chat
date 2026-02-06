"""
EventBus - Real-time event distribution service.

The EventBus provides pub/sub messaging for real-time event distribution across
backend instances using Redis, with optional persistence to PostgreSQL and
WebSocket broadcasting to connected clients.
"""

import asyncio
import json
import logging
import os
from datetime import datetime, timezone
from typing import Any, Callable, Dict, List, Optional, Tuple
from uuid import UUID

import redis.asyncio as redis

from app.kernel.base import BaseKernelService
from app.models.event import Event

logger = logging.getLogger("workstation.event_bus")

# Channel patterns
CHANNEL_PREFIX = "events:"
CHANNEL_ALL = "events:*"


class EventBus(BaseKernelService):
    """
    Kernel service for event distribution and persistence.

    The EventBus manages:
    - Real-time event publishing via Redis pub/sub
    - Event persistence to PostgreSQL for audit trails
    - WebSocket broadcasting to connected clients
    - In-process callback subscriptions

    Usage:
        event_bus = EventBus(session_factory=AsyncSessionLocal)
        kernel.register_service(event_bus)
        await kernel.startup()

        # Publish an event
        await event_bus.publish_event(
            event_type="model_loaded",
            event_data={"model_name": "llama-3"},
            persist=True
        )

        # Subscribe to events
        async def my_handler(event_type, event_data, metadata):
            print(f"Received: {event_type}")

        await event_bus.subscribe("model_loaded", my_handler)
    """

    def __init__(
        self,
        session_factory: Optional[Callable] = None,
        redis_client: Optional[redis.Redis] = None,
    ):
        """
        Initialize the EventBus.

        Args:
            session_factory: Async SQLAlchemy session factory for persistence
            redis_client: Optional pre-configured Redis client
        """
        self._session_factory = session_factory
        self._redis: Optional[redis.Redis] = redis_client
        self._pubsub: Optional[redis.client.PubSub] = None
        self._running = False
        self._subscribers: Dict[str, List[Callable]] = {}
        self._listener_task: Optional[asyncio.Task] = None
        self._websocket_manager = None
        self._owns_redis = redis_client is None

    @property
    def name(self) -> str:
        """Return service name."""
        return "event_bus"

    @property
    def is_running(self) -> bool:
        """Return whether the service is running."""
        return self._running

    def set_websocket_manager(self, manager) -> None:
        """
        Set the WebSocket connection manager for broadcasting.

        Args:
            manager: ConnectionManager instance from websocket module
        """
        self._websocket_manager = manager
        logger.info("WebSocket manager attached to EventBus")

    async def startup(self) -> None:
        """Initialize Redis connection and start listener."""
        if self._running:
            return

        logger.info("Starting EventBus...")

        # Initialize Redis client if not provided
        if self._redis is None:
            redis_url = os.getenv("REDIS_URL", "redis://localhost:6379/0")
            self._redis = redis.from_url(
                redis_url,
                decode_responses=True,
                socket_connect_timeout=5.0,
                socket_timeout=5.0,
            )
            logger.info(f"Connected to Redis: {redis_url.split('@')[-1]}")

        # Create pub/sub connection
        self._pubsub = self._redis.pubsub()

        # Subscribe to all event channels
        await self._pubsub.psubscribe(CHANNEL_ALL)
        logger.info(f"Subscribed to Redis channel pattern: {CHANNEL_ALL}")

        # Start background listener task
        self._listener_task = asyncio.create_task(self._listen_loop())
        self._listener_task.add_done_callback(self._listener_done_callback)

        self._running = True
        logger.info("EventBus started successfully")

    async def shutdown(self) -> None:
        """Stop listener and close Redis connections."""
        logger.info("Shutting down EventBus...")

        # Cancel listener task
        if self._listener_task and not self._listener_task.done():
            self._listener_task.cancel()
            try:
                await self._listener_task
            except asyncio.CancelledError:
                pass
            self._listener_task = None

        # Close pub/sub connection
        if self._pubsub:
            try:
                await self._pubsub.punsubscribe(CHANNEL_ALL)
                await self._pubsub.close()
            except Exception as e:
                logger.warning(f"Error closing pub/sub: {e}")
            self._pubsub = None

        # Close Redis client if we own it
        if self._redis and self._owns_redis:
            try:
                await self._redis.aclose()
            except Exception as e:
                logger.warning(f"Error closing Redis: {e}")
            self._redis = None

        # Clear subscribers
        self._subscribers.clear()
        self._websocket_manager = None

        self._running = False
        logger.info("EventBus shutdown complete")

    async def health_check(self) -> Tuple[bool, str]:
        """Check EventBus health status."""
        if not self._running:
            return False, "not running"

        if self._redis is None:
            return False, "Redis not connected"

        try:
            await self._redis.ping()
            return True, "ok"
        except Exception as e:
            return False, f"Redis ping failed: {str(e)}"

    async def publish_event(
        self,
        event_type: str,
        event_data: Dict[str, Any],
        severity: str = "info",
        source: str = "system",
        persist: bool = False,
        user_id: Optional[UUID] = None,
        chat_id: Optional[UUID] = None,
        resource_id: Optional[str] = None,
    ) -> Optional[UUID]:
        """
        Publish an event to all subscribers.

        Args:
            event_type: Event category (e.g., 'model_loaded')
            event_data: Event payload dictionary
            severity: Severity level (info, warning, error, critical)
            source: Component generating the event
            persist: Whether to save to database
            user_id: Associated user ID
            chat_id: Associated chat ID
            resource_id: Associated resource identifier

        Returns:
            Event ID if persisted, None otherwise
        """
        if not self._running:
            logger.warning("EventBus not running, event not published")
            return None

        timestamp = datetime.now(timezone.utc).isoformat()
        event_id = None

        # Prepare event payload
        payload = {
            "event_type": event_type,
            "event_data": event_data,
            "severity": severity,
            "source": source,
            "timestamp": timestamp,
            "user_id": str(user_id) if user_id else None,
            "chat_id": str(chat_id) if chat_id else None,
            "resource_id": resource_id,
        }

        # Publish to Redis
        channel = f"{CHANNEL_PREFIX}{event_type}"
        try:
            await self._redis.publish(channel, json.dumps(payload))
            logger.debug(
                f"Published event: type={event_type}, severity={severity}, "
                f"persist={persist}, source={source}"
            )
        except Exception as e:
            logger.error(f"Failed to publish to Redis: {e}")

        # Persist to database if requested
        if persist and self._session_factory:
            event_id = await self._save_event_to_db(
                event_type=event_type,
                event_data=event_data,
                severity=severity,
                source=source,
                user_id=user_id,
                chat_id=chat_id,
                resource_id=resource_id,
            )

        # Broadcast to WebSocket clients
        if self._websocket_manager:
            try:
                await self._websocket_manager.broadcast_typed(event_type, {
                    "event_data": event_data,
                    "severity": severity,
                    "source": source,
                    "user_id": str(user_id) if user_id else None,
                    "chat_id": str(chat_id) if chat_id else None,
                    "resource_id": resource_id,
                })
            except Exception as e:
                logger.warning(
                    f"WebSocket broadcast failed for event_type={event_type}: {e}"
                )

        return event_id

    async def _save_event_to_db(
        self,
        event_type: str,
        event_data: Dict[str, Any],
        severity: str,
        source: str,
        user_id: Optional[UUID] = None,
        chat_id: Optional[UUID] = None,
        resource_id: Optional[str] = None,
    ) -> Optional[UUID]:
        """
        Persist an event to the database.

        Returns:
            Event ID if successful, None on failure
        """
        if not self._session_factory:
            logger.warning("No session factory, cannot persist event")
            return None

        try:
            async with self._session_factory() as session:
                event = Event(
                    event_type=event_type,
                    event_data=event_data,
                    severity=severity,
                    source=source,
                    user_id=user_id,
                    chat_id=chat_id,
                    resource_id=resource_id,
                )
                session.add(event)
                await session.commit()
                await session.refresh(event)
                logger.debug(f"Persisted event {event.id} to database")
                return event.id
        except Exception as e:
            logger.error(f"Failed to persist event: {e}")
            return None

    async def subscribe(self, event_type: str, callback: Callable) -> None:
        """
        Subscribe to events of a specific type.

        Args:
            event_type: Event type to subscribe to, or '*' for all events
            callback: Async function(event_type, event_data, metadata) to call
        """
        if event_type not in self._subscribers:
            self._subscribers[event_type] = []

        if callback not in self._subscribers[event_type]:
            self._subscribers[event_type].append(callback)
            logger.info(
                f"Subscriber registered: event_type={event_type}, "
                f"callback={callback.__name__}"
            )

    async def unsubscribe(self, event_type: str, callback: Callable) -> bool:
        """
        Unsubscribe a callback from an event type.

        Args:
            event_type: Event type to unsubscribe from
            callback: The callback to remove

        Returns:
            True if callback was removed, False if not found
        """
        if event_type in self._subscribers:
            try:
                self._subscribers[event_type].remove(callback)
                logger.info(
                    f"Subscriber unregistered: event_type={event_type}, "
                    f"callback={callback.__name__}"
                )
                return True
            except ValueError:
                pass
        return False

    async def _listen_loop(self) -> None:
        """Background task that listens for Redis pub/sub messages."""
        logger.info("EventBus listener started")

        try:
            async for message in self._pubsub.listen():
                if message["type"] == "pmessage":
                    try:
                        await self._handle_message(message)
                    except Exception as e:
                        logger.error(f"Error handling message: {e}")

        except asyncio.CancelledError:
            logger.info("EventBus listener cancelled")
            raise
        except Exception as e:
            logger.error(f"EventBus listener error: {e}")

    async def _handle_message(self, message: dict) -> None:
        """Process a received Redis pub/sub message."""
        channel = message.get("channel", "")
        data = message.get("data", "{}")

        # Extract event type from channel (events:event_type -> event_type)
        event_type = channel.replace(CHANNEL_PREFIX, "") if channel else "unknown"

        try:
            payload = json.loads(data)
        except json.JSONDecodeError:
            logger.warning(f"Invalid JSON in message: {data}")
            return

        event_data = payload.get("event_data", {})
        metadata = {
            "severity": payload.get("severity", "info"),
            "source": payload.get("source", "unknown"),
            "timestamp": payload.get("timestamp"),
            "user_id": payload.get("user_id"),
            "chat_id": payload.get("chat_id"),
            "resource_id": payload.get("resource_id"),
        }

        # Call registered callbacks
        await self._dispatch_to_subscribers(event_type, event_data, metadata)

        # Broadcast to WebSocket clients so cross-instance events reach local clients
        if self._websocket_manager:
            try:
                await self._websocket_manager.broadcast_typed(event_type, {
                    "event_data": event_data,
                    "severity": metadata.get("severity", "info"),
                    "source": metadata.get("source", "unknown"),
                    "timestamp": metadata.get("timestamp"),
                    "user_id": metadata.get("user_id"),
                    "chat_id": metadata.get("chat_id"),
                    "resource_id": metadata.get("resource_id"),
                })
            except Exception as e:
                logger.warning(f"WebSocket broadcast for Redis message failed: {e}")

    async def _dispatch_to_subscribers(
        self, event_type: str, event_data: Dict[str, Any], metadata: Dict[str, Any]
    ) -> None:
        """Dispatch event to all matching subscribers."""
        callbacks = []

        # Get callbacks for specific event type
        if event_type in self._subscribers:
            callbacks.extend(self._subscribers[event_type])

        # Get callbacks for wildcard subscription
        if "*" in self._subscribers:
            callbacks.extend(self._subscribers["*"])

        # Execute callbacks
        for callback in callbacks:
            try:
                if asyncio.iscoroutinefunction(callback):
                    await callback(event_type, event_data, metadata)
                else:
                    callback(event_type, event_data, metadata)
            except Exception as e:
                logger.error(f"Subscriber callback error: {e}")

    def _listener_done_callback(self, task: asyncio.Task) -> None:
        """Handle listener task completion."""
        if task.cancelled():
            return

        exc = task.exception()
        if exc:
            logger.error(f"Listener task failed: {exc}")
            # Could implement auto-restart logic here if needed
