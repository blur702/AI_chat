import os
import asyncio
import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from sqlalchemy import text

from app.database import engine, close_db, AsyncSessionLocal
from app.kernel import WorkstationKernel, ResourceManager, EventBus, ToolRegistry, ContextManager
from app.api.resources import router as resources_router
from app.api.events import router as events_router
from app.api.tools import router as tools_router
from app.api.context import router as context_router
from app.api.websocket import router as websocket_router, get_websocket_manager
from app.api.operations import router as operations_router
from app.api.admin import router as admin_router

# Configure application logger
logger = logging.getLogger("workstation.app")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Lifespan context manager for FastAPI application.

    Handles startup and shutdown events:
    - Startup: Verify database connection, initialize kernel
    - Shutdown: Shutdown kernel, close database connections

    Note: Alembic handles schema migrations, not create_all()
    """
    # Startup: verify database connection
    logger.info("Verifying database connection...")
    async with engine.connect() as conn:
        await conn.execute(text("SELECT 1"))
    logger.info("Database connection verified")

    # Initialize kernel and register services
    kernel = WorkstationKernel()

    # Register ResourceManager with database session factory
    resource_manager = ResourceManager(session_factory=AsyncSessionLocal)
    kernel.register_service(resource_manager)
    logger.info("ResourceManager registered with kernel")

    # Register EventBus with database session factory
    event_bus = EventBus(session_factory=AsyncSessionLocal)
    kernel.register_service(event_bus)
    logger.info("EventBus registered with kernel")

    # Register ToolRegistry
    tool_registry = ToolRegistry()
    kernel.register_service(tool_registry)
    logger.info("ToolRegistry registered with kernel")

    # Register ContextManager with database session factory
    context_manager = ContextManager(session_factory=AsyncSessionLocal)
    kernel.register_service(context_manager)
    logger.info("ContextManager registered with kernel")

    try:
        await kernel.startup()
        app.state.kernel = kernel
        app.state.kernel_started_at = datetime.now(timezone.utc)
        logger.info("Kernel attached to app state")

        # Connect EventBus to WebSocket manager for broadcasting
        event_bus_service = kernel.get_service("event_bus")
        if event_bus_service:
            event_bus_service.set_websocket_manager(get_websocket_manager())
            logger.info("WebSocket manager connected to EventBus")
    except Exception as e:
        logger.error(f"Kernel startup failed: {e}")
        raise

    yield

    # Shutdown: stop kernel, close database connections
    try:
        logger.info("Shutting down kernel...")
        await kernel.shutdown()
    except Exception as e:
        logger.error(f"Kernel shutdown error: {e}")

    logger.info("Closing database connections...")
    await close_db()
    logger.info("Shutdown complete")


app = FastAPI(
    title="AI Workstation API",
    description="Backend API for AI Workstation",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS configuration
cors_origins = os.getenv("CORS_ORIGINS", "http://localhost:3001,http://localhost:9080").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register API routers
app.include_router(resources_router, prefix="/api", tags=["resources"])
app.include_router(events_router, prefix="/api", tags=["events"])
app.include_router(tools_router, prefix="/api", tags=["tools"])
app.include_router(context_router, prefix="/api", tags=["context"])
app.include_router(websocket_router, prefix="/api", tags=["websocket"])
app.include_router(operations_router, prefix="/api", tags=["operations"])
app.include_router(admin_router, prefix="/api", tags=["admin"])


async def check_postgres() -> tuple[bool, str]:
    """Check PostgreSQL connectivity with a lightweight query."""
    import asyncpg
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        return False, "DATABASE_URL not configured"
    try:
        conn = await asyncio.wait_for(
            asyncpg.connect(database_url),
            timeout=2.0
        )
        try:
            await asyncio.wait_for(conn.fetchval("SELECT 1"), timeout=1.0)
            return True, "ok"
        finally:
            await conn.close()
    except asyncio.TimeoutError:
        return False, "connection timeout"
    except Exception as e:
        return False, str(e)


async def check_redis() -> tuple[bool, str]:
    """Check Redis connectivity with a PING command."""
    import redis.asyncio as redis
    redis_url = os.getenv("REDIS_URL")
    if not redis_url:
        return False, "REDIS_URL not configured"
    try:
        client = redis.from_url(redis_url, socket_connect_timeout=2.0, socket_timeout=1.0)
        try:
            await asyncio.wait_for(client.ping(), timeout=2.0)
            return True, "ok"
        finally:
            await client.aclose()
    except asyncio.TimeoutError:
        return False, "connection timeout"
    except Exception as e:
        return False, str(e)


async def check_kernel(request: Request) -> tuple[bool, str]:
    """Check kernel health status."""
    kernel: WorkstationKernel = getattr(request.app.state, "kernel", None)
    if kernel is None:
        return False, "kernel not initialized"
    if not kernel.is_initialized:
        return False, "kernel not running"
    try:
        health = await kernel.health_check()
        if health["healthy"]:
            return True, "ok"
        else:
            unhealthy = [
                name for name, status in health["services"].items()
                if not status["healthy"]
            ]
            return False, f"unhealthy services: {', '.join(unhealthy)}"
    except Exception as e:
        return False, f"health check error: {str(e)}"


@app.get("/")
async def root():
    return {"message": "AI Workstation API", "status": "running"}


@app.get("/health")
async def health(request: Request):
    """Health check endpoint with DB, Redis, and kernel connectivity checks."""
    postgres_ok, postgres_msg = await check_postgres()
    redis_ok, redis_msg = await check_redis()
    kernel_ok, kernel_msg = await check_kernel(request)

    checks = {
        "postgres": {"healthy": postgres_ok, "message": postgres_msg},
        "redis": {"healthy": redis_ok, "message": redis_msg},
        "kernel": {"healthy": kernel_ok, "message": kernel_msg},
    }

    all_healthy = postgres_ok and redis_ok and kernel_ok
    status_code = 200 if all_healthy else 503

    return JSONResponse(
        status_code=status_code,
        content={
            "status": "healthy" if all_healthy else "unhealthy",
            "checks": checks,
        }
    )


@app.get("/api/health")
async def api_health(request: Request):
    """API health check with full connectivity verification."""
    postgres_ok, postgres_msg = await check_postgres()
    redis_ok, redis_msg = await check_redis()
    kernel_ok, kernel_msg = await check_kernel(request)

    checks = {
        "postgres": {"healthy": postgres_ok, "message": postgres_msg},
        "redis": {"healthy": redis_ok, "message": redis_msg},
        "kernel": {"healthy": kernel_ok, "message": kernel_msg},
    }

    all_healthy = postgres_ok and redis_ok and kernel_ok
    status_code = 200 if all_healthy else 503

    return JSONResponse(
        status_code=status_code,
        content={
            "status": "healthy" if all_healthy else "unhealthy",
            "service": "backend",
            "checks": checks,
        }
    )


@app.get("/api/kernel/health")
async def kernel_health(request: Request):
    """
    Kernel-specific health check endpoint.

    Returns detailed health status for the kernel and all registered services.
    """
    kernel: WorkstationKernel = getattr(request.app.state, "kernel", None)

    if kernel is None:
        return JSONResponse(
            status_code=503,
            content={
                "status": "unhealthy",
                "kernel": {
                    "initialized": False,
                    "services": {}
                },
                "error": "kernel not attached to application"
            }
        )

    try:
        health = await kernel.health_check()
        status_code = 200 if health["healthy"] else 503

        return JSONResponse(
            status_code=status_code,
            content={
                "status": "healthy" if health["healthy"] else "unhealthy",
                "kernel": {
                    "initialized": health["initialized"],
                    "timestamp": health["timestamp"],
                    "services": health["services"]
                }
            }
        )
    except Exception as e:
        logger.error(f"Kernel health check failed: {e}")
        return JSONResponse(
            status_code=503,
            content={
                "status": "unhealthy",
                "kernel": {
                    "initialized": kernel.is_initialized,
                    "services": {}
                },
                "error": str(e)
            }
        )


@app.get("/api/kernel/status")
async def kernel_status(request: Request):
    """
    Detailed kernel status endpoint for debugging and monitoring.

    Returns comprehensive kernel information including registered services,
    initialization state, and last health check timestamp. Always returns 200.
    """
    kernel: WorkstationKernel = getattr(request.app.state, "kernel", None)
    current_time = datetime.now(timezone.utc).isoformat()

    if kernel is None:
        return JSONResponse(
            status_code=200,
            content={
                "timestamp": current_time,
                "kernel_attached": False,
                "initialized": False,
                "registered_services": [],
                "service_details": {},
                "last_health_check": None
            }
        )

    # Get health status for each service
    service_details = {}
    for name in kernel.registered_services:
        service = kernel.get_service(name)
        if service:
            try:
                healthy, message = await service.health_check()
                service_details[name] = {
                    "is_running": service.is_running,
                    "healthy": healthy,
                    "message": message
                }
            except Exception as e:
                service_details[name] = {
                    "is_running": service.is_running,
                    "healthy": False,
                    "message": f"health check error: {str(e)}"
                }

    last_health = kernel.last_health_check
    return JSONResponse(
        status_code=200,
        content={
            "timestamp": current_time,
            "kernel_attached": True,
            "initialized": kernel.is_initialized,
            "registered_services": kernel.registered_services,
            "service_details": service_details,
            "last_health_check": last_health.isoformat() if last_health else None
        }
    )
