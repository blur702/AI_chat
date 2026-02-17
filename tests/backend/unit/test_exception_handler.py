"""Test the global exception handler returns structured JSON."""
import pytest
from fastapi import APIRouter
from httpx import AsyncClient, ASGITransport
from app.main import app


@pytest.mark.asyncio
async def test_health_endpoint_returns_json():
    """Health endpoint should always return JSON regardless of service state."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/api/health")
        # Health may return 200 or 503 depending on services, but should be JSON
        assert resp.headers.get("content-type", "").startswith("application/json")


@pytest.mark.asyncio
async def test_404_returns_json():
    """A non-existent route should return JSON, not HTML."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/api/this-does-not-exist-at-all")
        assert resp.status_code == 404
        data = resp.json()
        assert "detail" in data


@pytest.mark.asyncio
async def test_unhandled_exception_returns_json_500():
    """An unhandled exception in a route should return a JSON 500, not an HTML error page."""
    # Register a temporary route that raises an unhandled exception
    _test_router = APIRouter()

    @_test_router.get("/api/_test_exception_handler_crash")
    async def _crash():
        raise RuntimeError("Deliberate test crash")

    app.include_router(_test_router)
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get("/api/_test_exception_handler_crash")
            assert resp.status_code == 500
            assert resp.headers.get("content-type", "").startswith("application/json")
            data = resp.json()
            assert "detail" in data
    finally:
        # Remove the temporary route to avoid polluting other tests
        app.routes[:] = [r for r in app.routes if getattr(r, "path", "") != "/api/_test_exception_handler_crash"]
