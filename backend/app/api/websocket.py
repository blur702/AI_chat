"""
WebSocket endpoint for real-time event broadcasting.

Provides WebSocket connections for clients to receive real-time event notifications
from the EventBus. Supports message type multiplexing, connection management,
JWT authentication, and state snapshot delivery on reconnection.
"""

import asyncio
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, Request, WebSocket, WebSocketDisconnect

from app.auth import get_user_id_from_token, verify_token

logger = logging.getLogger("workstation.websocket")

router = APIRouter(prefix="/ws", tags=["websocket"])


class ConnectionManager:
    """
    Manages WebSocket connections and message broadcasting.

    Maintains a registry of active WebSocket connections and provides methods
    for sending messages to individual connections or broadcasting to all.

    Thread-safe for concurrent connection/disconnection operations.
    """

    def __init__(self):
        self._active_connections: Dict[str, WebSocket] = {}
        self._connection_metadata: Dict[str, dict] = {}
        self._lock = asyncio.Lock()

    async def connect(
        self,
        connection_id: str,
        websocket: WebSocket,
        metadata: Optional[dict] = None
    ) -> None:
        """
        Accept and register a new WebSocket connection.

        Args:
            connection_id: Unique identifier for this connection
            websocket: The WebSocket instance to register
            metadata: Optional metadata (e.g., user_id, authenticated_at)
        """
        await websocket.accept()
        async with self._lock:
            self._active_connections[connection_id] = websocket
            self._connection_metadata[connection_id] = metadata or {}
        logger.info(f"WebSocket connected: {connection_id}")

    async def disconnect(self, connection_id: str) -> None:
        """
        Remove a WebSocket connection from the registry.

        Args:
            connection_id: The connection to remove
        """
        async with self._lock:
            if connection_id in self._active_connections:
                del self._active_connections[connection_id]
            if connection_id in self._connection_metadata:
                del self._connection_metadata[connection_id]
        logger.info(f"WebSocket disconnected: {connection_id}")

    async def send_message(self, connection_id: str, message: dict) -> bool:
        """
        Send a message to a specific connection.

        Args:
            connection_id: Target connection
            message: JSON-serializable message dict

        Returns:
            True if message was sent, False if connection not found
        """
        async with self._lock:
            websocket = self._active_connections.get(connection_id)

        if websocket:
            try:
                await websocket.send_json(message)
                return True
            except Exception as e:
                logger.error(f"Error sending to {connection_id}: {e}")
                await self.disconnect(connection_id)
        return False

    async def broadcast(self, message: dict) -> int:
        """
        Send a message to all connected clients.

        Args:
            message: JSON-serializable message dict

        Returns:
            Number of clients that received the message
        """
        async with self._lock:
            connections = list(self._active_connections.items())

        sent_count = 0
        disconnected = []

        for conn_id, websocket in connections:
            try:
                await websocket.send_json(message)
                sent_count += 1
            except Exception as e:
                logger.warning(f"Broadcast failed for {conn_id}: {e}")
                disconnected.append(conn_id)

        # Clean up failed connections
        for conn_id in disconnected:
            await self.disconnect(conn_id)

        return sent_count

    async def send_typed_message(
        self, connection_id: str, message_type: str, data: Dict[str, Any]
    ) -> bool:
        """
        Send a typed message to a specific connection.

        Args:
            connection_id: Target connection
            message_type: Message type identifier
            data: Message payload

        Returns:
            True if message was sent, False otherwise
        """
        message = {
            "type": message_type,
            "data": data,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        return await self.send_message(connection_id, message)

    async def broadcast_typed(self, message_type: str, data: Dict[str, Any]) -> int:
        """
        Broadcast a typed message to all connected clients.

        Args:
            message_type: Message type identifier
            data: Message payload

        Returns:
            Number of clients that received the message
        """
        message = {
            "type": message_type,
            "data": data,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        return await self.broadcast(message)

    async def send_state_snapshot(self, connection_id: str, snapshot: dict) -> bool:
        """
        Send a state snapshot to a specific connection.

        Args:
            connection_id: Target connection
            snapshot: State snapshot dictionary

        Returns:
            True if message was sent, False otherwise
        """
        return await self.send_typed_message(connection_id, "state_snapshot", snapshot)

    def get_connection_metadata(self, connection_id: str) -> Optional[dict]:
        """
        Retrieve metadata for a connection.

        Args:
            connection_id: The connection ID

        Returns:
            Metadata dictionary or None if not found
        """
        return self._connection_metadata.get(connection_id)

    def get_connections_by_user(self, user_id: UUID) -> List[str]:
        """
        Find all connections for a specific user.

        Args:
            user_id: UUID of the user

        Returns:
            List of connection IDs belonging to the user
        """
        user_id_str = str(user_id)
        connections = []
        for conn_id, metadata in self._connection_metadata.items():
            if metadata.get("user_id") == user_id_str:
                connections.append(conn_id)
        return connections

    @property
    def connection_count(self) -> int:
        """Return the number of active connections."""
        return len(self._active_connections)

    @property
    def connection_ids(self) -> list[str]:
        """Return list of active connection IDs."""
        return list(self._active_connections.keys())


# Global connection manager instance
manager = ConnectionManager()


async def generate_state_snapshot(
    kernel,
    user_id: Optional[UUID] = None
) -> dict:
    """
    Generate a comprehensive state snapshot for a client.

    Collects active operations, resource status, VRAM statistics,
    and kernel health information.

    Args:
        kernel: WorkstationKernel instance
        user_id: Optional user ID to filter operations

    Returns:
        Dictionary containing system state snapshot
    """
    snapshot = {
        "active_operations": [],
        "resources": [],
        "vram_stats": {},
        "kernel_health": {},
        "preview_states": {},
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }

    try:
        # Get ResourceManager
        resource_manager = kernel.get_service("resource_manager")

        if resource_manager:
            # Collect active operations from Redis
            try:
                operation_keys = await resource_manager.scan_operation_keys()
                for operation_id in operation_keys:
                    state = await resource_manager.get_operation_state(operation_id)
                    if state:
                        # Filter by user_id if provided
                        if user_id:
                            op_user_id = state.get("user_id")
                            if op_user_id and op_user_id != str(user_id):
                                continue
                        snapshot["active_operations"].append({
                            "operation_id": operation_id,
                            **state
                        })
            except Exception as e:
                logger.warning(f"Failed to collect active operations: {e}")

            # Collect resource status
            try:
                loaded_resources = await resource_manager.get_loaded_resources()
                for resource in loaded_resources:
                    snapshot["resources"].append({
                        "resource_id": resource.resource_id,
                        "status": resource.status,
                        "vram_mb": resource.vram_mb or 0,
                        "user_locked": resource.user_locked,
                        "priority": resource.priority,
                        "last_used_at": resource.last_used_at.isoformat() if resource.last_used_at else None,
                    })
            except Exception as e:
                logger.warning(f"Failed to collect resource status: {e}")

            # Collect VRAM statistics
            try:
                snapshot["vram_stats"] = await resource_manager.get_cached_vram_stats()
            except Exception as e:
                logger.warning(f"Failed to collect VRAM stats: {e}")

        # Collect kernel health
        try:
            snapshot["kernel_health"] = await kernel.health_check()
        except Exception as e:
            logger.warning(f"Failed to collect kernel health: {e}")
            snapshot["kernel_health"] = {"healthy": False, "error": str(e)}

    except Exception as e:
        logger.error(f"Error generating state snapshot: {e}")

    return snapshot


@router.websocket("/events")
async def websocket_events_endpoint(
    websocket: WebSocket,
    token: Optional[str] = Query(None)
):
    """
    WebSocket endpoint for receiving real-time events.

    Clients connect to this endpoint to receive event notifications from the
    EventBus. The connection remains open until the client disconnects or
    an error occurs.

    Authentication:
        Token is passed as query parameter: /ws/events?token=<jwt_token>

    Message format:
        {
            "type": "event_type",
            "data": {...},
            "timestamp": "ISO-8601 timestamp"
        }

    State Snapshot:
        On successful connection, a state_snapshot message is sent containing
        the current system state for state recovery after reconnection.
    """
    connection_id = str(uuid4())
    user_id: Optional[UUID] = None

    # Validate authentication token
    if token is None:
        await websocket.close(code=1008, reason="Authentication required")
        logger.warning(f"WebSocket connection rejected: no token provided")
        return

    payload = verify_token(token)
    if payload is None:
        await websocket.close(code=1008, reason="Invalid or expired token")
        logger.warning(f"WebSocket connection rejected: invalid token")
        return

    # Extract and validate user_id from token (required)
    user_id_str = payload.get("user_id")
    if not user_id_str:
        await websocket.close(code=1008, reason="Invalid user")
        logger.warning(f"WebSocket connection rejected: missing user_id in token")
        return

    try:
        user_id = UUID(user_id_str)
    except (ValueError, TypeError):
        await websocket.close(code=1008, reason="Invalid user")
        logger.warning(f"WebSocket connection rejected: invalid user_id format: {user_id_str}")
        return

    try:
        # Connect with metadata
        await manager.connect(
            connection_id,
            websocket,
            metadata={
                "user_id": str(user_id) if user_id else None,
                "authenticated_at": datetime.now(timezone.utc).isoformat(),
                "token_exp": payload.get("exp"),
            }
        )

        # Send connection confirmation
        await manager.send_typed_message(
            connection_id,
            "connected",
            {
                "connection_id": connection_id,
                "user_id": str(user_id) if user_id else None,
                "message": "Successfully connected to event stream",
            },
        )

        # Generate and send state snapshot
        try:
            kernel = getattr(websocket.app.state, "kernel", None)
            if kernel:
                snapshot = await generate_state_snapshot(kernel, user_id)
                await manager.send_state_snapshot(connection_id, snapshot)
                logger.info(f"State snapshot sent to {connection_id}")
            else:
                logger.warning("Kernel not available, skipping state snapshot")
        except Exception as e:
            logger.error(f"Failed to send state snapshot: {e}")
            # Don't close connection on snapshot failure

        # Keep connection alive and handle client messages
        while True:
            try:
                # Wait for client messages (ping/pong, subscription requests, etc.)
                data = await websocket.receive_text()

                # Handle ping messages
                if data == "ping":
                    await manager.send_typed_message(
                        connection_id, "pong", {"timestamp": datetime.now(timezone.utc).isoformat()}
                    )

            except WebSocketDisconnect:
                logger.info(f"Client {connection_id} disconnected normally")
                break

    except Exception as e:
        logger.error(f"WebSocket error for {connection_id}: {e}")

    finally:
        await manager.disconnect(connection_id)


@router.get("/state-snapshot")
async def get_state_snapshot(
    request: Request,
    token: str = Query(..., description="JWT authentication token")
) -> dict:
    """
    REST endpoint to retrieve current state snapshot.

    Useful for debugging and initial page loads before WebSocket connection.

    Args:
        request: FastAPI request object
        token: JWT authentication token

    Returns:
        State snapshot dictionary
    """
    # Validate token
    payload = verify_token(token)
    if payload is None:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    # Extract and validate user_id (required)
    user_id_str = payload.get("user_id")
    if not user_id_str:
        raise HTTPException(status_code=401, detail="Invalid user")

    try:
        user_id = UUID(user_id_str)
    except (ValueError, TypeError):
        raise HTTPException(status_code=401, detail="Invalid user")

    # Get kernel from app state
    kernel = getattr(request.app.state, "kernel", None)
    if not kernel:
        raise HTTPException(status_code=503, detail="Kernel not available")

    # Generate snapshot
    snapshot = await generate_state_snapshot(kernel, user_id)
    return snapshot


def get_websocket_manager() -> ConnectionManager:
    """Get the global WebSocket connection manager."""
    return manager
