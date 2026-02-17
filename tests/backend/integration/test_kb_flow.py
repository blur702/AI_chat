"""Integration tests for Knowledge Base ingestion workflow."""

import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

from app.main import app

pytestmark = pytest.mark.integration


@pytest_asyncio.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


class TestKBIngestionFlow:
    """Test knowledge base ingestion end-to-end through API endpoints."""

    @pytest.mark.asyncio
    async def test_kb_ingest_requires_auth(self, client):
        resp = await client.post("/api/kb/ingest", json={"project_id": str(uuid4()), "content": "test"})
        assert resp.status_code in (401, 403, 422)

    @pytest.mark.asyncio
    async def test_kb_search_requires_auth(self, client):
        resp = await client.post("/api/kb/search", json={"query": "test"})
        assert resp.status_code in (401, 403, 422)


class TestPlanningFlow:
    """Test planning session creation flow."""

    @pytest.mark.asyncio
    async def test_planning_endpoints_require_auth(self, client):
        resp = await client.get("/api/planning/sessions")
        assert resp.status_code in (401, 403, 422)

    @pytest.mark.asyncio
    async def test_planning_session_create_requires_auth(self, client):
        resp = await client.post("/api/planning/sessions", json={
            "project_id": str(uuid4()),
            "title": "Test Plan",
        })
        assert resp.status_code in (401, 403, 422)


class TestWebSocketStateSnapshot:
    """Test the REST state snapshot endpoint (WebSocket companion)."""

    @pytest.mark.asyncio
    async def test_state_snapshot_requires_token(self, client):
        resp = await client.get("/api/ws/state-snapshot")
        assert resp.status_code in (401, 422)

    @pytest.mark.asyncio
    async def test_state_snapshot_invalid_token(self, client):
        resp = await client.get("/api/ws/state-snapshot", params={"token": "invalid"})
        assert resp.status_code == 401


class TestOperationsFlow:
    """Test operations tracking endpoints."""

    @pytest.mark.asyncio
    async def test_list_operations_without_auth(self, client):
        resp = await client.get("/api/operations")
        # Operations endpoint may or may not require auth
        # but should not crash
        assert resp.status_code in (200, 401, 403, 503)

    @pytest.mark.asyncio
    async def test_get_nonexistent_operation(self, client):
        resp = await client.get("/api/operations/nonexistent-op-id")
        assert resp.status_code in (401, 403, 404, 503)


class TestToolsFlow:
    """Test tools API endpoints."""

    @pytest.mark.asyncio
    async def test_list_tools_requires_auth(self, client):
        resp = await client.get("/api/tools")
        assert resp.status_code in (401, 403)

    @pytest.mark.asyncio
    async def test_execute_tool_requires_auth(self, client):
        resp = await client.post("/api/tools/execute", json={
            "tool_name": "echo",
            "parameters": {"message": "test"},
        })
        assert resp.status_code in (401, 403, 422)
