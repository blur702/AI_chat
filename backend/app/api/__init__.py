"""API routers for AI Workstation backend."""

from app.api.resources import router as resources_router
from app.api.tools import router as tools_router

__all__ = ["resources_router", "tools_router"]
