"""
WebSocket endpoint for real-time event broadcasting.

Provides WebSocket connections for clients to receive real-time event notifications
from the EventBus. Supports message type multiplexing, connection management,
JWT authentication, and state snapshot delivery on reconnection.
"""

import asyncio
import json
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, Request, WebSocket, WebSocketDisconnect
from app.api.context_deps import check_project_ownership
from app.auth import get_user_id_from_token, verify_token
from app.database import AsyncSessionLocal
from app.services.sandbox_manager import COMMAND_TIMEOUT

logger = logging.getLogger("workstation.websocket")

MAX_COMMAND_LENGTH = 8192  # Max chars for terminal commands
MAX_CONNECTIONS_PER_USER = 5

router = APIRouter(prefix="/ws", tags=["websocket"])


class _WSRateLimiter:
    """Simple per-connection sliding window rate limiter for WebSocket messages."""

    def __init__(self, max_messages: int, window_seconds: float) -> None:
        self._max = max_messages
        self._window = window_seconds
        self._timestamps: List[float] = []

    def allow(self) -> bool:
        import time
        now = time.monotonic()
        cutoff = now - self._window
        self._timestamps = [t for t in self._timestamps if t > cutoff]
        if len(self._timestamps) >= self._max:
            return False
        self._timestamps.append(now)
        return True


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
    ) -> bool:
        """
        Accept and register a new WebSocket connection.

        Args:
            connection_id: Unique identifier for this connection
            websocket: The WebSocket instance to register
            metadata: Optional metadata (e.g., user_id, authenticated_at)

        Returns:
            True if connected, False if per-user connection limit exceeded.
        """
        meta = metadata or {}
        user_id = meta.get("user_id")

        async with self._lock:
            # Enforce per-user connection limit
            if user_id:
                user_conns = sum(
                    1 for m in self._connection_metadata.values()
                    if m.get("user_id") == user_id
                )
                if user_conns >= MAX_CONNECTIONS_PER_USER:
                    logger.warning(
                        "Connection limit (%d) reached for user %s",
                        MAX_CONNECTIONS_PER_USER, user_id,
                    )
                    return False

            # Accept and register atomically under the same lock to prevent
            # TOCTOU races where concurrent connects bypass the limit.
            await websocket.accept()
            self._active_connections[connection_id] = websocket
            self._connection_metadata[connection_id] = meta

        logger.info("WebSocket connected: %s", connection_id)
        return True

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
        logger.info("WebSocket disconnected: %s", connection_id)

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
                logger.error("Error sending to %s: %s", connection_id, e)
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
                logger.warning("Broadcast failed for %s: %s", conn_id, e)
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
                logger.warning("Failed to collect active operations: %s", e)

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
                logger.warning("Failed to collect resource status: %s", e)

            # Collect VRAM statistics
            try:
                snapshot["vram_stats"] = await resource_manager.get_cached_vram_stats()
            except Exception as e:
                logger.warning("Failed to collect VRAM stats: %s", e)

        # Collect kernel health
        try:
            snapshot["kernel_health"] = await kernel.health_check()
        except Exception as e:
            logger.warning("Failed to collect kernel health: %s", e)
            snapshot["kernel_health"] = {"healthy": False, "error": str(e)}

    except Exception as e:
        logger.error("Error generating state snapshot: %s", e)

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
        logger.warning("WebSocket connection rejected: no token provided")
        return

    payload = verify_token(token)
    if payload is None:
        await websocket.close(code=1008, reason="Invalid or expired token")
        logger.warning("WebSocket connection rejected: invalid token")
        return

    # Extract and validate user_id from token (required)
    user_id_str = payload.get("user_id")
    if not user_id_str:
        await websocket.close(code=1008, reason="Invalid user")
        logger.warning("WebSocket connection rejected: missing user_id in token")
        return

    try:
        user_id = UUID(user_id_str)
    except (ValueError, TypeError):
        await websocket.close(code=1008, reason="Invalid user")
        logger.warning("WebSocket connection rejected: invalid user_id format: %s", user_id_str)
        return

    try:
        # Connect with metadata (enforces per-user connection limit)
        connected = await manager.connect(
            connection_id,
            websocket,
            metadata={
                "user_id": str(user_id) if user_id else None,
                "authenticated_at": datetime.now(timezone.utc).isoformat(),
                "token_exp": payload.get("exp"),
            }
        )
        if not connected:
            await websocket.accept()
            await websocket.close(code=1008, reason="Too many connections")
            return

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
                logger.info("State snapshot sent to %s", connection_id)
            else:
                logger.warning("Kernel not available, skipping state snapshot")
        except Exception as e:
            logger.error("Failed to send state snapshot: %s", e)
            # Don't close connection on snapshot failure

        # Per-connection rate limiter: 30 msgs / 10s
        msg_limiter = _WSRateLimiter(max_messages=30, window_seconds=10)

        # Keep connection alive and handle client messages
        while True:
            try:
                # Wait for client messages (ping/pong, subscription requests, etc.)
                data = await websocket.receive_text()

                if not msg_limiter.allow():
                    await manager.send_typed_message(
                        connection_id, "error",
                        {"message": "Rate limit exceeded, slow down"},
                    )
                    continue

                # Handle ping messages
                if data == "ping":
                    await manager.send_typed_message(
                        connection_id, "pong", {"timestamp": datetime.now(timezone.utc).isoformat()}
                    )

            except WebSocketDisconnect:
                logger.info("Client %s disconnected normally", connection_id)
                break

    except Exception as e:
        logger.error("WebSocket error for %s: %s", connection_id, e)

    finally:
        await manager.disconnect(connection_id)


@router.websocket("/sandbox/{project_id}/terminal")
async def websocket_terminal_endpoint(
    websocket: WebSocket,
    project_id: str,
    token: Optional[str] = Query(None),
):
    """
    WebSocket endpoint for interactive terminal sessions.

    Creates or reuses a Docker container for the project and streams
    command I/O back to the client.

    Authentication:
        Token is passed as query parameter: /ws/sandbox/{project_id}/terminal?token=<jwt>

    Client messages:
        {"type": "command", "data": {"command": "ls -la"}}

    Server messages:
        {"type": "connected", "data": {"container_id": "..."}}
        {"type": "output", "data": {"stream": "stdout", "content": "..."}}
        {"type": "exit", "data": {"code": 0}}
        {"type": "error", "data": {"message": "..."}}
    """
    # -- Authenticate --
    if token is None:
        await websocket.close(code=1008, reason="Authentication required")
        return

    payload = verify_token(token)
    if payload is None:
        await websocket.close(code=1008, reason="Invalid or expired token")
        return

    user_id_str = payload.get("user_id")
    if not user_id_str:
        await websocket.close(code=1008, reason="Invalid user")
        return

    try:
        user_id = UUID(user_id_str)
    except (ValueError, TypeError):
        await websocket.close(code=1008, reason="Invalid user")
        return

    try:
        project_uuid = UUID(project_id)
    except (ValueError, TypeError):
        await websocket.close(code=1008, reason="Invalid project ID")
        return

    # -- Verify project exists and user owns it --
    project_template_id = None
    async with AsyncSessionLocal() as db:
        try:
            project_template_id = await check_project_ownership(
                project_uuid, user_id, db
            )
        except ValueError:
            await websocket.close(code=1008, reason="Project not found")
            return
        except PermissionError:
            await websocket.close(code=1008, reason="Access denied")
            return

    # -- Get SandboxManager from kernel --
    kernel = getattr(websocket.app.state, "kernel", None)
    if kernel is None:
        await websocket.close(code=1011, reason="Kernel not available")
        return

    sandbox_manager = kernel.get_service("sandbox_manager")
    if sandbox_manager is None:
        await websocket.close(code=1011, reason="Sandbox service not available")
        return

    await websocket.accept()
    logger.info("Terminal WebSocket accepted for project %s, user %s", project_id[:12], user_id_str[:12])

    try:
        # Get or create sandbox container
        container_id = await sandbox_manager.get_or_create_container(
            project_uuid, template_id=project_template_id
        )

        await websocket.send_json({
            "type": "connected",
            "data": {"container_id": container_id[:12]},
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })

        # Per-connection rate limiter: 10 msgs / 5s
        cmd_limiter = _WSRateLimiter(max_messages=10, window_seconds=5)

        # Command loop
        while True:
            raw = await websocket.receive_text()

            if not cmd_limiter.allow():
                await websocket.send_json({
                    "type": "error",
                    "data": {"message": "Rate limit exceeded, slow down"},
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                })
                continue

            try:
                msg = json.loads(raw)
            except (ValueError, TypeError):
                await websocket.send_json({
                    "type": "error",
                    "data": {"message": "Invalid JSON"},
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                })
                continue

            msg_type = msg.get("type")
            if msg_type != "command":
                continue

            command = (msg.get("data") or {}).get("command", "").strip()
            if not command:
                continue

            if len(command) > MAX_COMMAND_LENGTH:
                await websocket.send_json({
                    "type": "error",
                    "data": {"message": f"Command too long (max {MAX_COMMAND_LENGTH} chars)"},
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                })
                continue

            try:
                exec_info = await sandbox_manager.execute_command(container_id, command)
                exec_id = exec_info["exec_id"]

                async def _run_and_stream() -> int:
                    """Stream output then return exit code."""
                    async for stream_type, chunk in sandbox_manager.stream_exec_output(exec_id):
                        await websocket.send_json({
                            "type": "output",
                            "data": {"stream": stream_type, "content": chunk},
                            "timestamp": datetime.now(timezone.utc).isoformat(),
                        })
                    return await sandbox_manager.get_exec_exit_code(exec_id)

                try:
                    exit_code = await asyncio.wait_for(
                        _run_and_stream(), timeout=COMMAND_TIMEOUT
                    )
                except asyncio.TimeoutError:
                    logger.warning(
                        "Command timed out after %ds in container %s",
                        COMMAND_TIMEOUT, container_id[:12],
                    )
                    await sandbox_manager.kill_exec(exec_id)
                    await websocket.send_json({
                        "type": "error",
                        "data": {"message": f"Command timed out after {COMMAND_TIMEOUT}s"},
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                    })
                    exit_code = 124  # conventional timeout exit code

                await websocket.send_json({
                    "type": "exit",
                    "data": {"code": exit_code},
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                })

            except Exception as exec_err:
                logger.error("Command execution error: %s", exec_err)
                await websocket.send_json({
                    "type": "error",
                    "data": {"message": "Command execution failed"},
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                })

    except WebSocketDisconnect:
        logger.info("Terminal WebSocket disconnected for project %s", project_id[:12])
    except Exception as e:
        logger.error("Terminal WebSocket error for project %s: %s", project_id[:12], e)
        try:
            await websocket.send_json({
                "type": "error",
                "data": {"message": "Internal server error"},
                "timestamp": datetime.now(timezone.utc).isoformat(),
            })
        except Exception:
            pass


@router.get("/state-snapshot")
async def get_state_snapshot(
    request: Request,
    token: str = Query(..., description="JWT authentication token")
) -> dict:
    """
    REST endpoint to retrieve current state snapshot.

    Useful for debugging and initial page loads before WebSocket connection.
    Authentication is via query parameter (same pattern as the WebSocket
    endpoint) rather than the standard Authorization header, since this
    endpoint is often called alongside the WebSocket connection setup.

    Args:
        request: FastAPI request object
        token: JWT authentication token (query parameter)

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
