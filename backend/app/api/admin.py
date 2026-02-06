"""
Admin debugging API endpoints.

Provides REST endpoints for deep kernel introspection, per-service debugging,
and aggregated performance metrics. Intended for admin/operator use.
"""

import logging
import time
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, Header, Request, status

from app.auth import verify_token
from app.kernel import WorkstationKernel
from app.schemas.admin import (
    KernelDebugResponse,
    KernelMetricsResponse,
    ServiceDebugResponse,
)

logger = logging.getLogger(__name__)


def require_admin(
    authorization: Optional[str] = Header(None),
) -> dict:
    """
    Dependency that validates JWT and enforces admin role.

    Extracts the Bearer token from the Authorization header, verifies it,
    and checks that the payload contains role="admin".

    Returns:
        Decoded JWT payload if valid and admin.

    Raises:
        HTTPException 401: If token is missing or invalid.
        HTTPException 403: If authenticated user is not an admin.
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid Authorization header",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = authorization[len("Bearer "):]
    payload = verify_token(token)
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if payload.get("role") != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )

    return payload


router = APIRouter(
    prefix="/admin/kernel",
    tags=["admin"],
    dependencies=[Depends(require_admin)],
)


def _get_kernel(request: Request) -> WorkstationKernel:
    """Extract kernel from app state or raise 503."""
    kernel = getattr(request.app.state, "kernel", None)
    if kernel is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Kernel not initialized",
        )
    return kernel


# -------------------------------------------------------------------------
# Full Debug Endpoint
# -------------------------------------------------------------------------


@router.get("/debug", response_model=KernelDebugResponse)
async def kernel_debug(request: Request) -> KernelDebugResponse:
    """
    Comprehensive kernel debug snapshot.

    Returns kernel state, per-service debug info, Redis stats,
    and database connection pool info.
    """
    kernel = _get_kernel(request)
    now = datetime.now(timezone.utc)

    # Kernel info
    started_at = getattr(request.app.state, "kernel_started_at", None)
    uptime = (now - started_at).total_seconds() if started_at else None

    kernel_info: Dict[str, Any] = {
        "initialized": kernel.is_initialized,
        "registered_services": kernel.registered_services,
        "uptime_seconds": uptime,
        "last_health_check": (
            kernel.last_health_check.isoformat()
            if kernel.last_health_check
            else None
        ),
    }

    # Per-service debug
    services: Dict[str, ServiceDebugResponse] = {}
    for svc_name in kernel.registered_services:
        service = kernel.get_service(svc_name)
        if service is None:
            continue

        try:
            healthy, message = await service.health_check()
        except Exception as e:
            healthy, message = False, f"health check error: {e}"

        internal_state = _collect_service_state(svc_name, service)
        metrics = _collect_service_metrics(svc_name, service)

        services[svc_name] = ServiceDebugResponse(
            service_name=svc_name,
            is_running=service.is_running,
            health_status=healthy,
            health_message=message,
            internal_state=internal_state,
            metrics=metrics,
        )

    # Redis info
    redis_info = await _collect_redis_info(kernel)

    # Database pool info
    from app.database import engine
    pool = engine.pool
    database_info: Dict[str, Any] = {
        "pool_size": pool.size(),
        "checked_in": pool.checkedin(),
        "checked_out": pool.checkedout(),
        "overflow": pool.overflow(),
        "pool_status": pool.status(),
    }

    return KernelDebugResponse(
        kernel_info=kernel_info,
        services=services,
        redis_info=redis_info,
        database_info=database_info,
        timestamp=now,
    )


# -------------------------------------------------------------------------
# Per-Service Debug
# -------------------------------------------------------------------------


@router.get("/services/{service_name}", response_model=ServiceDebugResponse)
async def service_debug(service_name: str, request: Request) -> ServiceDebugResponse:
    """
    Debug information for a specific kernel service.

    Returns health status, internal state, and metrics.
    """
    kernel = _get_kernel(request)
    service = kernel.get_service(service_name)

    if service is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Service '{service_name}' not found",
        )

    try:
        healthy, message = await service.health_check()
    except Exception as e:
        healthy, message = False, f"health check error: {e}"

    return ServiceDebugResponse(
        service_name=service_name,
        is_running=service.is_running,
        health_status=healthy,
        health_message=message,
        internal_state=_collect_service_state(service_name, service),
        metrics=_collect_service_metrics(service_name, service),
    )


# -------------------------------------------------------------------------
# Metrics Endpoint
# -------------------------------------------------------------------------


@router.get("/metrics", response_model=KernelMetricsResponse)
async def kernel_metrics(request: Request) -> KernelMetricsResponse:
    """
    Aggregated kernel performance metrics.

    Returns uptime, service counts, subscriber stats, tool counts,
    active conversations, queue info, and Redis memory usage.
    """
    kernel = _get_kernel(request)
    now = datetime.now(timezone.utc)

    started_at = getattr(request.app.state, "kernel_started_at", None)
    uptime = (now - started_at).total_seconds() if started_at else None

    # Count healthy services
    healthy_count = 0
    for svc_name in kernel.registered_services:
        service = kernel.get_service(svc_name)
        if service:
            try:
                healthy, _ = await service.health_check()
                if healthy:
                    healthy_count += 1
            except Exception:
                pass

    # EventBus subscriber count
    subscriber_count = 0
    event_bus = kernel.get_service("event_bus")
    if event_bus:
        for callbacks in getattr(event_bus, "_subscribers", {}).values():
            subscriber_count += len(callbacks)

    # ToolRegistry stats
    tool_registry = kernel.get_service("tool_registry")
    registered_tools = len(getattr(tool_registry, "_tools", {})) if tool_registry else 0
    active_conversations = (
        len(getattr(tool_registry, "_conversation_contexts", {}))
        if tool_registry
        else 0
    )
    active_processors = (
        sum(
            1
            for t in getattr(tool_registry, "_queue_processors", {}).values()
            if not t.done()
        )
        if tool_registry
        else 0
    )

    # ResourceManager queue size
    resource_manager = kernel.get_service("resource_manager")
    queue_size = resource_manager.get_queue_size() if resource_manager else 0

    # Redis memory
    redis_memory = None
    redis_info = await _collect_redis_info(kernel)
    if "used_memory" in redis_info:
        redis_memory = redis_info["used_memory"]

    return KernelMetricsResponse(
        uptime_seconds=uptime,
        registered_service_count=len(kernel.registered_services),
        healthy_service_count=healthy_count,
        total_subscriber_count=subscriber_count,
        total_registered_tools=registered_tools,
        active_conversations=active_conversations,
        active_queue_processors=active_processors,
        redis_memory_bytes=redis_memory,
        queue_size=queue_size,
        timestamp=now,
    )


# -------------------------------------------------------------------------
# Helpers
# -------------------------------------------------------------------------


def _collect_service_state(service_name: str, service: Any) -> Dict[str, Any]:
    """Collect internal state details for a given service."""
    state: Dict[str, Any] = {}

    if service_name == "resource_manager":
        state["vram_tracker_active"] = getattr(service, "_vram_tracker", None) is not None
        state["queue_size"] = service.get_queue_size() if hasattr(service, "get_queue_size") else 0
        state["monitor_task_alive"] = (
            not service._monitor_task.done()
            if getattr(service, "_monitor_task", None)
            else False
        )

    elif service_name == "event_bus":
        subscribers = getattr(service, "_subscribers", {})
        state["subscriber_event_types"] = list(subscribers.keys())
        state["total_subscriber_callbacks"] = sum(len(v) for v in subscribers.values())
        state["listener_task_alive"] = (
            not service._listener_task.done()
            if getattr(service, "_listener_task", None)
            else False
        )
        state["websocket_manager_attached"] = getattr(service, "_websocket_manager", None) is not None

    elif service_name == "tool_registry":
        state["registered_tools"] = list(getattr(service, "_tools", {}).keys())
        state["active_conversation_count"] = len(getattr(service, "_conversation_contexts", {}))
        state["active_result_chats"] = len(getattr(service, "_conversation_results", {}))
        processors = getattr(service, "_queue_processors", {})
        state["queue_processor_count"] = len(processors)
        state["dead_queue_processors"] = sum(1 for t in processors.values() if t.done())

    elif service_name == "context_manager":
        state["owns_redis"] = getattr(service, "_owns_redis", False)

    return state


def _collect_service_metrics(service_name: str, service: Any) -> Dict[str, Any]:
    """Collect performance-relevant metrics for a given service."""
    metrics: Dict[str, Any] = {}

    if service_name == "resource_manager":
        metrics["monitor_task_running"] = (
            not service._monitor_task.done()
            if getattr(service, "_monitor_task", None)
            else False
        )

    elif service_name == "tool_registry":
        metrics["cache_ttl_seconds"] = getattr(service, "CACHE_TTL_SECONDS", None)
        metrics["max_results_per_chat"] = getattr(service, "MAX_RESULTS_PER_CHAT", None)
        metrics["queue_idle_timeout_seconds"] = getattr(service, "QUEUE_IDLE_TIMEOUT_SECONDS", None)

    elif service_name == "context_manager":
        metrics["conversation_cache_ttl"] = getattr(service, "CONVERSATION_CACHE_TTL", None)
        metrics["project_cache_ttl"] = getattr(service, "PROJECT_CACHE_TTL", None)
        metrics["compaction_threshold"] = getattr(service, "COMPACTION_THRESHOLD", None)

    return metrics


async def _collect_redis_info(kernel: WorkstationKernel) -> Dict[str, Any]:
    """Gather Redis memory and latency info from any service that holds a client."""
    info: Dict[str, Any] = {}

    # Find a Redis client from any running service
    redis_client = None
    for svc_name in ("event_bus", "resource_manager", "tool_registry", "context_manager"):
        service = kernel.get_service(svc_name)
        if service and getattr(service, "_redis", None) is not None:
            redis_client = service._redis
            break

    if redis_client is None:
        info["connected"] = False
        return info

    try:
        start = time.monotonic()
        await redis_client.ping()
        ping_ms = round((time.monotonic() - start) * 1000, 2)
        info["connected"] = True
        info["ping_latency_ms"] = ping_ms

        redis_info = await redis_client.info("memory")
        info["used_memory"] = redis_info.get("used_memory", 0)
        info["used_memory_human"] = redis_info.get("used_memory_human", "unknown")
        info["used_memory_peak_human"] = redis_info.get("used_memory_peak_human", "unknown")
    except Exception as e:
        info["connected"] = False
        info["error"] = str(e)

    return info
