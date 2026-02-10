"""
Admin debugging API endpoints.

Provides REST endpoints for deep kernel introspection, per-service debugging,
and aggregated performance metrics. Intended for admin/operator use.
"""

import csv
import io
import json
import logging
import time
from datetime import datetime, timezone
from typing import Any, Dict, Literal, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import StreamingResponse
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth import extract_request_metadata, log_security_event, require_admin
from app.database import get_db_session
from app.kernel import WorkstationKernel
from app.models.audit_log import AuditLog
from app.models.user import User
from app.models.user import is_master_user
from app.schemas.admin import (
    AdminUserListResponse,
    AdminUserResponse,
    AdminUserUpdateRequest,
    AdminUserUpdateResponse,
    AuditLogListResponse,
    AuditLogResponse,
    KernelDebugResponse,
    KernelMetricsResponse,
    ServiceDebugResponse,
    UserUnlockResponse,
)

logger = logging.getLogger(__name__)


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


# -------------------------------------------------------------------------
# User Management
# -------------------------------------------------------------------------

user_router = APIRouter(
    prefix="/admin/users",
    tags=["admin"],
    dependencies=[Depends(require_admin)],
)


@user_router.post("/{user_id}/unlock", response_model=UserUnlockResponse)
async def unlock_user_account(
    user_id: UUID,
    request: Request,
    _payload: dict = Depends(require_admin),
    db: AsyncSession = Depends(get_db_session),
) -> UserUnlockResponse:
    """Unlock a locked user account (admin only)."""
    meta = extract_request_metadata(request)
    admin_id = _payload.get("user_id")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    user.reset_failed_login()

    await log_security_event(
        db, action="account_unlocked", event_status="success",
        user_id=user.id,
        ip_address=meta["ip_address"], user_agent=meta["user_agent"],
        details={"admin_id": admin_id, "username": user.username},
    )
    await db.commit()

    return UserUnlockResponse(
        user_id=user.id,
        username=user.username,
        message="Account unlocked successfully",
        unlocked_at=datetime.now(timezone.utc),
    )


def _build_audit_filters(
    user_id: Optional[UUID],
    action: Optional[str],
    audit_status: Optional[str],
    start_date: Optional[datetime],
    end_date: Optional[datetime],
    ip_address: Optional[str] = None,
    search: Optional[str] = None,
) -> list:
    """Build a list of SQLAlchemy filter clauses for audit log queries."""
    filters = []
    if user_id is not None:
        filters.append(AuditLog.user_id == user_id)
    if action is not None:
        filters.append(AuditLog.action == action)
    if audit_status is not None:
        filters.append(AuditLog.status == audit_status)
    if start_date is not None:
        filters.append(AuditLog.created_at >= start_date)
    if end_date is not None:
        filters.append(AuditLog.created_at <= end_date)
    if ip_address is not None:
        filters.append(AuditLog.ip_address.ilike(f"%{ip_address}%"))
    if search is not None:
        term = f"%{search}%"
        filters.append(
            or_(
                AuditLog.action.ilike(term),
                AuditLog.resource.ilike(term),
                AuditLog.ip_address.ilike(term),
            )
        )
    return filters


@user_router.get("", response_model=AdminUserListResponse)
async def list_users(
    search: Optional[str] = Query(None, description="Search by username, email, or name"),
    role: Optional[str] = Query(None, description="Filter by role (admin/user)"),
    is_active: Optional[bool] = Query(None, description="Filter by active status"),
    sort_by: str = Query("created_at", description="Sort field"),
    sort_order: str = Query("desc", pattern="^(asc|desc)$"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    _payload: dict = Depends(require_admin),
    db: AsyncSession = Depends(get_db_session),
) -> AdminUserListResponse:
    """List all users with search, filter, sort, and pagination (admin only)."""
    query = select(User)
    count_query = select(func.count()).select_from(User)

    filters = []
    if search:
        search_term = f"%{search}%"
        filters.append(
            (User.username.ilike(search_term))
            | (User.email.ilike(search_term))
            | (User.first_name.ilike(search_term))
            | (User.last_name.ilike(search_term))
            | (User.screen_name.ilike(search_term))
        )
    if role is not None:
        filters.append(User.role == role)
    if is_active is not None:
        filters.append(User.is_active == is_active)

    for f in filters:
        query = query.where(f)
        count_query = count_query.where(f)

    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    sort_column = getattr(User, sort_by, User.created_at)
    order = sort_column.asc() if sort_order == "asc" else sort_column.desc()
    query = query.order_by(order).offset((page - 1) * page_size).limit(page_size)

    result = await db.execute(query)
    users = result.scalars().all()

    return AdminUserListResponse(
        users=[
            AdminUserResponse(
                id=u.id,
                username=u.username,
                email=u.email,
                role=u.role,
                is_active=u.is_active,
                first_name=u.first_name,
                last_name=u.last_name,
                screen_name=u.screen_name,
                email_verified=u.email_verified,
                failed_login_attempts=u.failed_login_attempts,
                locked_until=u.locked_until,
                last_login_at=u.last_login_at,
                last_password_change=u.last_password_change,
                created_at=u.created_at,
                updated_at=u.updated_at,
                is_master=is_master_user(u.username),
            )
            for u in users
        ],
        total=total,
        page=page,
        page_size=page_size,
    )


@user_router.get("/{user_id}", response_model=AdminUserResponse)
async def get_user_details(
    user_id: UUID,
    _payload: dict = Depends(require_admin),
    db: AsyncSession = Depends(get_db_session),
) -> AdminUserResponse:
    """Get detailed user information (admin only)."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    return AdminUserResponse(
        id=user.id,
        username=user.username,
        email=user.email,
        role=user.role,
        is_active=user.is_active,
        first_name=user.first_name,
        last_name=user.last_name,
        screen_name=user.screen_name,
        email_verified=user.email_verified,
        failed_login_attempts=user.failed_login_attempts,
        locked_until=user.locked_until,
        last_login_at=user.last_login_at,
        last_password_change=user.last_password_change,
        created_at=user.created_at,
        updated_at=user.updated_at,
        is_master=is_master_user(user.username),
    )


@user_router.put("/{user_id}", response_model=AdminUserUpdateResponse)
async def update_user_as_admin(
    user_id: UUID,
    body: AdminUserUpdateRequest,
    request: Request,
    _payload: dict = Depends(require_admin),
    db: AsyncSession = Depends(get_db_session),
) -> AdminUserUpdateResponse:
    """Update user fields including role and is_active (admin only)."""
    meta = extract_request_metadata(request)
    admin_id = _payload.get("user_id")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    if is_master_user(user.username):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot modify a master user account",
        )

    changes = {}
    if body.role is not None and body.role != user.role:
        changes["role"] = {"from": user.role, "to": body.role}
        user.role = body.role
    if body.is_active is not None and body.is_active != user.is_active:
        changes["is_active"] = {"from": user.is_active, "to": body.is_active}
        user.is_active = body.is_active
    if body.first_name is not None:
        user.first_name = body.first_name
    if body.last_name is not None:
        user.last_name = body.last_name
    if body.screen_name is not None:
        user.screen_name = body.screen_name
    if body.email is not None:
        user.email = body.email

    await log_security_event(
        db, action="admin_user_update", event_status="success",
        user_id=user.id,
        ip_address=meta["ip_address"], user_agent=meta["user_agent"],
        details={"admin_id": admin_id, "username": user.username, "changes": changes},
    )
    await db.commit()
    await db.refresh(user)

    return AdminUserUpdateResponse(
        user=AdminUserResponse(
            id=user.id,
            username=user.username,
            email=user.email,
            role=user.role,
            is_active=user.is_active,
            first_name=user.first_name,
            last_name=user.last_name,
            screen_name=user.screen_name,
            email_verified=user.email_verified,
            failed_login_attempts=user.failed_login_attempts,
            locked_until=user.locked_until,
            last_login_at=user.last_login_at,
            last_password_change=user.last_password_change,
            created_at=user.created_at,
            updated_at=user.updated_at,
            is_master=is_master_user(user.username),
        ),
        message="User updated successfully",
    )


@user_router.get("/audit-logs", response_model=AuditLogListResponse)
async def get_audit_logs(
    user_id: Optional[UUID] = None,
    action: Optional[str] = None,
    audit_status: Optional[str] = Query(None, alias="status"),
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    ip_address: Optional[str] = Query(None, description="Filter by IP address (partial match)"),
    search: Optional[str] = Query(None, description="Search across action, resource, IP"),
    sort_by: str = Query("created_at", description="Sort field (created_at, action, status, ip_address)"),
    order: Literal["asc", "desc"] = Query("desc", description="Sort order"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    _payload: dict = Depends(require_admin),
    db: AsyncSession = Depends(get_db_session),
) -> AuditLogListResponse:
    """Retrieve audit logs with optional filtering, search, and sorting (admin only)."""
    filters = _build_audit_filters(
        user_id, action, audit_status, start_date, end_date,
        ip_address=ip_address, search=search,
    )

    # Build base query with filters
    query = select(AuditLog).options(selectinload(AuditLog.user))
    for f in filters:
        query = query.where(f)

    # Count total matching records using same filters
    count_query = select(func.count()).select_from(AuditLog)
    for f in filters:
        count_query = count_query.where(f)

    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    # Dynamic sorting
    sort_col = getattr(AuditLog, sort_by, AuditLog.created_at)
    sort_order = sort_col.asc() if order == "asc" else sort_col.desc()

    # Fetch paginated results
    query = (
        query
        .order_by(sort_order)
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    result = await db.execute(query)
    logs = result.scalars().all()

    return AuditLogListResponse(
        logs=[
            AuditLogResponse(
                id=log.id,
                user_id=log.user_id,
                username=log.user.username if log.user else None,
                action=log.action,
                resource=log.resource,
                ip_address=log.ip_address,
                user_agent=log.user_agent,
                status=log.status,
                details=log.details,
                created_at=log.created_at,
            )
            for log in logs
        ],
        total=total,
        page=page,
        page_size=page_size,
    )


@user_router.get("/audit-logs/export")
async def export_audit_logs(
    user_id: Optional[UUID] = None,
    action: Optional[str] = None,
    audit_status: Optional[str] = Query(None, alias="status"),
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    ip_address: Optional[str] = None,
    search: Optional[str] = None,
    sort_by: str = Query("created_at"),
    order: Literal["asc", "desc"] = Query("desc"),
    format: Literal["csv", "json"] = Query("csv", description="Export format"),
    limit: int = Query(10000, ge=1, le=100000, description="Max rows to export"),
    _payload: dict = Depends(require_admin),
    db: AsyncSession = Depends(get_db_session),
) -> StreamingResponse:
    """Export audit logs as CSV or JSON (admin only). Streams results in chunks."""
    chunk_size = 500

    filters = _build_audit_filters(
        user_id, action, audit_status, start_date, end_date,
        ip_address=ip_address, search=search,
    )

    base_query = select(AuditLog).options(selectinload(AuditLog.user))
    for f in filters:
        base_query = base_query.where(f)

    sort_col = getattr(AuditLog, sort_by, AuditLog.created_at)
    sort_order_clause = sort_col.asc() if order == "asc" else sort_col.desc()
    base_query = base_query.order_by(sort_order_clause)

    def _log_to_dict(log: AuditLog) -> Dict[str, Any]:
        return {
            "id": str(log.id),
            "user_id": str(log.user_id) if log.user_id else None,
            "username": log.user.username if log.user else None,
            "action": log.action,
            "resource": log.resource,
            "ip_address": log.ip_address,
            "user_agent": log.user_agent,
            "status": log.status,
            "details": log.details,
            "created_at": log.created_at.isoformat() if log.created_at else None,
        }

    if format == "json":
        async def stream_json():
            yield "[\n"
            first = True
            offset = 0
            emitted = 0
            while emitted < limit:
                batch_size = min(chunk_size, limit - emitted)
                batch_q = base_query.offset(offset).limit(batch_size)
                result = await db.execute(batch_q)
                batch = result.scalars().all()
                if not batch:
                    break
                for log in batch:
                    if not first:
                        yield ",\n"
                    first = False
                    yield json.dumps(_log_to_dict(log))
                emitted += len(batch)
                offset += len(batch)
                if len(batch) < batch_size:
                    break
            yield "\n]"

        return StreamingResponse(
            stream_json(),
            media_type="application/json",
            headers={"Content-Disposition": "attachment; filename=audit_logs.json"},
        )

    # CSV format — streamed in chunks
    async def stream_csv():
        buf = io.StringIO()
        writer = csv.writer(buf)
        writer.writerow([
            "id", "user_id", "username", "action", "resource",
            "ip_address", "user_agent", "status", "details", "created_at",
        ])
        yield buf.getvalue()
        buf.seek(0)
        buf.truncate(0)

        offset = 0
        emitted = 0
        while emitted < limit:
            batch_size = min(chunk_size, limit - emitted)
            batch_q = base_query.offset(offset).limit(batch_size)
            result = await db.execute(batch_q)
            batch = result.scalars().all()
            if not batch:
                break
            for log in batch:
                writer.writerow([
                    str(log.id),
                    str(log.user_id) if log.user_id else "",
                    log.user.username if log.user else "",
                    log.action,
                    log.resource or "",
                    log.ip_address or "",
                    log.user_agent or "",
                    log.status,
                    json.dumps(log.details) if log.details else "",
                    log.created_at.isoformat() if log.created_at else "",
                ])
            yield buf.getvalue()
            buf.seek(0)
            buf.truncate(0)
            emitted += len(batch)
            offset += len(batch)
            if len(batch) < batch_size:
                break

    return StreamingResponse(
        stream_csv(),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=audit_logs.csv"},
    )
