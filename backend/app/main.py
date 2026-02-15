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
from app.kernel import WorkstationKernel, ResourceManager, EventBus, ToolRegistry, ContextManager, TokenCounter
from app.services.ollama_client import OllamaClient
from app.services.kb_ingestion import KBIngestionService
from app.services.embedding_service import EmbeddingService
from app.services.comfyui_client import ComfyUIClient
from app.services.drupal_mcp import DrupalMCPService
from app.services.sandbox_manager import SandboxManager
from app.api.auth import router as auth_router, users_router
from app.api.resources import router as resources_router
from app.api.events import router as events_router
from app.api.tools import router as tools_router
from app.api.context import router as context_router, projects_router, messages_router, chats_router, context_projects_router
from app.api.system_prompts import router as system_prompts_router
from app.api.websocket import router as websocket_router, get_websocket_manager
from app.api.operations import router as operations_router
from app.api.admin import router as admin_router, user_router as admin_user_router
from app.api.kb import router as kb_router
from app.api.image import router as image_router
from app.api.sandbox import router as sandbox_router
from app.api.automation import router as automation_router
from app.api.yolo import router as yolo_router
from app.api.templates import router as templates_router
from app.api.project_import import router as project_import_router
from app.api.drupal import router as drupal_router
from app.api.models import router as models_router

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

    # Seed default admin user if none exists
    await _seed_admin_user()

    # Seed master admin user (protected, cannot be modified by others)
    await _seed_master_user()

    # Initialize kernel and register services
    kernel = WorkstationKernel()

    # Register EventBus first so it's available for other services
    event_bus = EventBus(session_factory=AsyncSessionLocal)
    kernel.register_service(event_bus)
    logger.info("EventBus registered with kernel")

    # Register ResourceManager with database session factory and kernel reference
    resource_manager = ResourceManager(session_factory=AsyncSessionLocal)
    resource_manager._kernel = kernel
    kernel.register_service(resource_manager)
    logger.info("ResourceManager registered with kernel")

    # Register ToolRegistry
    tool_registry = ToolRegistry()
    kernel.register_service(tool_registry)
    logger.info("ToolRegistry registered with kernel")

    # Register ContextManager with database session factory
    context_manager = ContextManager(session_factory=AsyncSessionLocal)
    kernel.register_service(context_manager)
    logger.info("ContextManager registered with kernel")

    # Register TokenCounter for accurate token counting
    token_counter = TokenCounter()
    kernel.register_service(token_counter)
    logger.info("TokenCounter registered with kernel")

    # Register OllamaClient for LLM chat completion
    ollama_client = OllamaClient(
        base_url=os.getenv("OLLAMA_BASE_URL", "http://ollama:11434")
    )
    kernel.register_service(ollama_client)
    logger.info("OllamaClient registered with kernel")

    # Register KBIngestionService for document processing
    kb_ingestion = KBIngestionService()
    kernel.register_service(kb_ingestion)
    logger.info("KBIngestionService registered with kernel")

    # Register EmbeddingService for vector embedding generation
    embedding_service = EmbeddingService(
        base_url=os.getenv("OLLAMA_BASE_URL", "http://ollama:11434")
    )
    kernel.register_service(embedding_service)
    logger.info("EmbeddingService registered with kernel")

    # Register ComfyUIClient for image generation
    comfyui_client = ComfyUIClient(
        base_url=os.getenv("COMFYUI_BASE_URL", "http://comfyui:8188")
    )
    kernel.register_service(comfyui_client)
    logger.info("ComfyUIClient registered with kernel")

    # Register SandboxManager for Docker container sandboxes
    sandbox_manager = SandboxManager()
    kernel.register_service(sandbox_manager)
    logger.info("SandboxManager registered with kernel")

    # Register DrupalMCPService for remote Drupal site management
    try:
        drupal_mcp = DrupalMCPService()
        kernel.register_service(drupal_mcp)
        logger.info("DrupalMCPService registered with kernel")
    except Exception as e:
        logger.warning("DrupalMCPService not available: %s", e)

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
        logger.error("Kernel startup failed: %s", e)
        raise

    yield

    # Shutdown: stop kernel, close database connections
    try:
        logger.info("Shutting down kernel...")
        await kernel.shutdown()
    except Exception as e:
        logger.error("Kernel shutdown error: %s", e)

    logger.info("Closing database connections...")
    await close_db()
    logger.info("Shutdown complete")


async def _seed_admin_user() -> None:
    """Seed default admin user if no admin exists.

    Reads ADMIN_USERNAME and ADMIN_PASSWORD from environment variables.
    Skips creation if ADMIN_PASSWORD is absent or shorter than 8 characters.
    """
    from app.models.user import User
    from app.models.utils import hash_password, validate_password_strength

    admin_username = os.getenv("ADMIN_USERNAME", "admin")
    admin_password = os.getenv("ADMIN_PASSWORD")

    if not admin_password:
        logger.warning("ADMIN_PASSWORD not set, skipping admin user seed")
        return

    is_valid, error_msg = validate_password_strength(admin_password)
    if not is_valid:
        logger.warning("ADMIN_PASSWORD does not meet strength requirements: %s — skipping admin user seed", error_msg)
        return

    async with AsyncSessionLocal() as session:
        result = await session.execute(
            text("SELECT id FROM users WHERE role = 'admin' LIMIT 1")
        )
        if result.scalar_one_or_none() is not None:
            logger.info("Admin user already exists, skipping seed")
            return

        admin = User(
            username=admin_username,
            email=f"{admin_username}@workstation.local",
            hashed_password=hash_password(admin_password),
            role="admin",
            screen_name=admin_username,
        )
        session.add(admin)
        await session.commit()
        logger.info("Default admin user created successfully")


async def _seed_master_user() -> None:
    """Ensure the protected master admin user exists.

    This user has full admin privileges and cannot be modified or
    deactivated by other users through the API.
    Reads MASTER_USERNAMES and MASTER_PASSWORD from environment variables.
    In production, both are required; in development, seeding is silently skipped.
    """
    from app.models.user import User, MASTER_USERNAMES
    from app.models.utils import hash_password, validate_password_strength

    env = os.getenv("ENVIRONMENT", "development").lower()

    master_password = os.getenv("MASTER_PASSWORD")
    if not master_password:
        if env == "production":
            logger.error(
                "MASTER_PASSWORD is required in production but not set — "
                "set MASTER_PASSWORD in your environment to proceed"
            )
            raise RuntimeError("MASTER_PASSWORD must be set in production")
        logger.warning("MASTER_PASSWORD not set, skipping master user seed")
        return

    if not MASTER_USERNAMES:
        if env == "production":
            logger.error(
                "MASTER_USERNAMES is required in production but not set — "
                "set MASTER_USERNAMES (comma-separated) in your environment"
            )
            raise RuntimeError("MASTER_USERNAMES must be set in production")
        logger.warning("MASTER_USERNAMES not set, skipping master user seed")
        return

    is_valid, error_msg = validate_password_strength(master_password)
    if not is_valid:
        logger.warning("MASTER_PASSWORD does not meet strength requirements: %s — skipping master user seed", error_msg)
        return

    async with AsyncSessionLocal() as session:
        for username in MASTER_USERNAMES:
            result = await session.execute(
                text("SELECT id FROM users WHERE username = :u"),
                {"u": username},
            )
            if result.scalar_one_or_none() is not None:
                logger.info("Master user '%s' already exists, skipping seed", username)
                continue

            master = User(
                username=username,
                email=f"{username}@workstation.local",
                hashed_password=hash_password(master_password),
                role="admin",
                first_name=os.getenv("MASTER_FIRST_NAME", username),
                screen_name=os.getenv("MASTER_SCREEN_NAME", username),
                is_active=True,
            )
            session.add(master)
        await session.commit()
        logger.info("Master user seeding complete")


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

# Rate limiting middleware (global safety net)
from app.middleware.rate_limit import RateLimitMiddleware  # noqa: E402
app.add_middleware(RateLimitMiddleware)

# Register API routers
app.include_router(auth_router, prefix="/api", tags=["auth"])
app.include_router(users_router, prefix="/api", tags=["users"])
app.include_router(resources_router, prefix="/api", tags=["resources"])
app.include_router(events_router, prefix="/api", tags=["events"])
app.include_router(tools_router, prefix="/api", tags=["tools"])
app.include_router(context_router, prefix="/api", tags=["context"])
app.include_router(messages_router, prefix="/api", tags=["context"])
app.include_router(chats_router, prefix="/api", tags=["context"])
app.include_router(context_projects_router, prefix="/api", tags=["context"])
app.include_router(projects_router, prefix="/api", tags=["projects"])
app.include_router(system_prompts_router, prefix="/api", tags=["context"])
app.include_router(websocket_router, prefix="/api", tags=["websocket"])
app.include_router(operations_router, prefix="/api", tags=["operations"])
app.include_router(admin_router, prefix="/api", tags=["admin"])
app.include_router(admin_user_router, prefix="/api", tags=["admin"])
app.include_router(kb_router, prefix="/api", tags=["kb"])
app.include_router(image_router, prefix="/api", tags=["image"])
app.include_router(sandbox_router, prefix="/api", tags=["sandbox"])
app.include_router(automation_router, prefix="/api", tags=["automation"])
app.include_router(yolo_router, prefix="/api", tags=["yolo"])
app.include_router(templates_router, prefix="/api", tags=["templates"])
app.include_router(project_import_router, prefix="/api", tags=["projects"])
app.include_router(drupal_router, prefix="/api", tags=["drupal"])
app.include_router(models_router, prefix="/api", tags=["models"])


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
        logger.error("Kernel health check failed: %s", e)
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
