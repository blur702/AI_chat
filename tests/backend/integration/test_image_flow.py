"""Integration tests for the image generation request flow.

POST /api/image/generate -> GET /api/image/generations

Tests the HTTP layer with mocked database, Redis/ARQ, and ComfyUI services.
"""

import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.models.image_generation import ImageGeneration

pytestmark = pytest.mark.integration


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

TEST_USER_ID = uuid.uuid4()
TEST_GENERATION_ID = uuid.uuid4()
NOW = datetime.now(tz=timezone.utc)


def _auth_payload(user_id=TEST_USER_ID, role="user"):
    return {
        "user_id": str(user_id),
        "role": role,
        "username": "testuser",
    }


def _mock_generation(
    gen_id=TEST_GENERATION_ID,
    user_id=TEST_USER_ID,
    prompt="A beautiful sunset",
    status_val="pending",
):
    gen = MagicMock(spec=ImageGeneration)
    gen.id = gen_id
    gen.user_id = user_id
    gen.project_id = None
    gen.workflow_type = "text-to-image"
    gen.prompt = prompt
    gen.negative_prompt = None
    gen.status = status_val
    gen.workflow_data = {}
    gen.result_images = []
    gen.error_message = None
    gen.comfyui_job_id = None
    gen.is_favorite = False
    gen.generation_metadata = None
    gen.source_generation_id = None
    gen.is_deleted = False
    gen.deleted_at = None
    gen.created_at = NOW
    gen.updated_at = NOW
    return gen


def _scalar_result(value):
    result = MagicMock()
    result.scalar_one_or_none.return_value = value
    return result


def _scalars_result(values):
    result = MagicMock()
    result.scalars.return_value.all.return_value = values
    return result


def _scalar_count_result(count):
    result = MagicMock()
    result.scalar.return_value = count
    return result


def _patch_auth(payload=None):
    if payload is None:
        payload = _auth_payload()
    return patch("app.auth.get_current_user_payload", return_value=payload)


def _mock_comfyui_client():
    """Create a mock ComfyUIClient that passes health checks."""
    comfyui = AsyncMock()
    comfyui.health_check = AsyncMock(return_value=(True, "OK"))
    comfyui.get_generation_options = AsyncMock(return_value={
        "checkpoints": [],
        "samplers": [],
        "schedulers": [],
        "loras": [],
        "upscale_models": [],
    })
    return comfyui


def _mock_kernel_with_comfyui():
    """Create a mock kernel that returns a ComfyUIClient."""
    kernel = MagicMock()
    comfyui = _mock_comfyui_client()
    kernel.get_service = MagicMock(side_effect=lambda name: comfyui if name == "comfyui_client" else None)
    return kernel, comfyui


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


# ---------------------------------------------------------------------------
# Tests: POST /api/image/generate with valid request
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_generate_image_valid_request(client):
    """POST /api/image/generate with valid prompt returns 201."""
    generation = _mock_generation()
    kernel, comfyui = _mock_kernel_with_comfyui()

    mock_db = AsyncMock()
    # First execute: UserPreference query
    mock_db.execute = AsyncMock(return_value=_scalar_result(None))
    mock_db.commit = AsyncMock()
    mock_db.add = MagicMock()

    async def fake_get_db():
        yield mock_db

    mock_redis_pool = AsyncMock()
    mock_redis_pool.enqueue_job = AsyncMock()
    mock_redis_pool.close = AsyncMock()

    with (
        _patch_auth(),
        patch("app.api.image.get_db_session", fake_get_db),
        patch("app.api.image._get_comfyui_client", return_value=comfyui),
        patch("app.api.image.create_pool", new_callable=AsyncMock, return_value=mock_redis_pool),
        patch("app.api.image.ComfyUIClient") as MockComfyUIClass,
    ):
        MockComfyUIClass.get_text_to_image_workflow.return_value = {"nodes": {}}

        resp = await client.post(
            "/api/image/generate",
            json={
                "prompt": "A beautiful sunset over mountains",
                "workflow_type": "text-to-image",
                "width": 512,
                "height": 512,
                "steps": 20,
            },
            headers={"Authorization": "Bearer fake-token"},
        )

    assert resp.status_code == 201
    data = resp.json()
    assert data["status"] == "pending"
    assert data["workflow_type"] == "text-to-image"


# ---------------------------------------------------------------------------
# Tests: POST /api/image/generate with missing prompt returns 422
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_generate_image_missing_prompt(client):
    """POST /api/image/generate without prompt returns 422."""
    with _patch_auth():
        resp = await client.post(
            "/api/image/generate",
            json={
                "workflow_type": "text-to-image",
                "width": 512,
                "height": 512,
            },
            headers={"Authorization": "Bearer fake-token"},
        )

    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_generate_image_empty_prompt(client):
    """POST /api/image/generate with empty prompt returns 422."""
    with _patch_auth():
        resp = await client.post(
            "/api/image/generate",
            json={
                "prompt": "",
                "workflow_type": "text-to-image",
            },
            headers={"Authorization": "Bearer fake-token"},
        )

    assert resp.status_code == 422


# ---------------------------------------------------------------------------
# Tests: GET /api/image/generations lists generations
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_list_generations(client):
    """GET /api/image/generations returns user's image generations."""
    gen1 = _mock_generation(gen_id=uuid.uuid4(), prompt="Sunset")
    gen2 = _mock_generation(gen_id=uuid.uuid4(), prompt="Mountains")

    mock_db = AsyncMock()
    # The endpoint makes two queries: count + paginated list
    mock_db.execute = AsyncMock(
        side_effect=[
            _scalar_count_result(2),  # count query
            _scalars_result([gen1, gen2]),  # paginated query
        ]
    )

    async def fake_get_db():
        yield mock_db

    with (
        _patch_auth(),
        patch("app.api.image.get_db_session", fake_get_db),
    ):
        resp = await client.get(
            "/api/image/generations",
            headers={"Authorization": "Bearer fake-token"},
        )

    assert resp.status_code == 200
    data = resp.json()
    assert data["count"] == 2
    assert len(data["generations"]) == 2


# ---------------------------------------------------------------------------
# Tests: Authentication required
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_generate_image_requires_auth(client):
    """POST /api/image/generate without auth returns 401."""
    resp = await client.post(
        "/api/image/generate",
        json={"prompt": "test", "workflow_type": "text-to-image"},
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_list_generations_requires_auth(client):
    """GET /api/image/generations without auth returns 401."""
    resp = await client.get("/api/image/generations")
    assert resp.status_code == 401
