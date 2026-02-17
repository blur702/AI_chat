"""Unit tests for the ImageGeneration model."""

from uuid import uuid4

import pytest

from app.models.image_generation import ImageGeneration


pytestmark = pytest.mark.unit


# ---------------------------------------------------------------------------
# Construction
# ---------------------------------------------------------------------------


class TestImageGenerationConstruction:
    """Tests for ImageGeneration model instantiation."""

    def test_basic_construction(self):
        user_id = uuid4()
        gen = ImageGeneration(
            id=uuid4(),
            user_id=user_id,
            workflow_type="text_to_image",
            prompt="a beautiful sunset",
        )
        assert gen.user_id == user_id
        assert gen.workflow_type == "text_to_image"
        assert gen.prompt == "a beautiful sunset"

    def test_with_all_fields(self):
        user_id = uuid4()
        project_id = uuid4()
        source_id = uuid4()
        gen = ImageGeneration(
            id=uuid4(),
            user_id=user_id,
            project_id=project_id,
            workflow_type="image_to_image",
            prompt="enhance the photo",
            negative_prompt="blurry, low quality",
            status="completed",
            workflow_data={"steps": 20, "cfg": 7.0},
            result_images=["output_001.png", "output_002.png"],
            error_message=None,
            comfyui_job_id="job-abc-123",
            is_favorite=True,
            generation_metadata={"model": "sdxl"},
            source_generation_id=source_id,
            is_deleted=False,
        )
        assert gen.project_id == project_id
        assert gen.negative_prompt == "blurry, low quality"
        assert gen.status == "completed"
        assert gen.workflow_data == {"steps": 20, "cfg": 7.0}
        assert gen.result_images == ["output_001.png", "output_002.png"]
        assert gen.comfyui_job_id == "job-abc-123"
        assert gen.is_favorite is True
        assert gen.generation_metadata == {"model": "sdxl"}
        assert gen.source_generation_id == source_id


# ---------------------------------------------------------------------------
# Default values
# ---------------------------------------------------------------------------


class TestImageGenerationDefaults:
    """Tests for ImageGeneration default column values.

    Note: SQLAlchemy mapped_column(default=X) sets INSERT-time defaults,
    not Python __init__ defaults. Pure Python construction yields None.
    """

    def test_fields_none_when_omitted(self):
        gen = ImageGeneration(
            id=uuid4(),
            user_id=uuid4(),
            workflow_type="text_to_image",
            prompt="test",
        )
        # Server-side INSERT defaults; Python-side is None
        assert gen.status is None
        assert gen.is_deleted is None
        assert gen.is_favorite is None
        assert gen.workflow_data is None
        assert gen.result_images is None

    def test_fields_when_explicitly_set(self):
        gen = ImageGeneration(
            id=uuid4(),
            user_id=uuid4(),
            workflow_type="text_to_image",
            prompt="test",
            status="pending",
            is_deleted=False,
            is_favorite=False,
            workflow_data={},
            result_images=[],
        )
        assert gen.status == "pending"
        assert gen.is_deleted is False
        assert gen.is_favorite is False
        assert gen.workflow_data == {}
        assert gen.result_images == []

    def test_optional_fields_default_none(self):
        gen = ImageGeneration(
            id=uuid4(),
            user_id=uuid4(),
            workflow_type="text_to_image",
            prompt="test",
        )
        assert gen.project_id is None
        assert gen.negative_prompt is None
        assert gen.error_message is None
        assert gen.comfyui_job_id is None
        assert gen.generation_metadata is None
        assert gen.source_generation_id is None
        assert gen.deleted_at is None


# ---------------------------------------------------------------------------
# Status values
# ---------------------------------------------------------------------------


class TestImageGenerationStatus:
    """Tests that status field accepts various valid statuses."""

    @pytest.mark.parametrize("status", ["pending", "processing", "completed", "failed"])
    def test_valid_statuses(self, status):
        gen = ImageGeneration(
            id=uuid4(),
            user_id=uuid4(),
            workflow_type="text_to_image",
            prompt="test",
            status=status,
        )
        assert gen.status == status


# ---------------------------------------------------------------------------
# Workflow types
# ---------------------------------------------------------------------------


class TestImageGenerationWorkflowType:
    """Tests for different workflow types."""

    @pytest.mark.parametrize(
        "wf_type",
        ["text_to_image", "image_to_image", "inpainting", "upscale", "face_morph"],
    )
    def test_workflow_types(self, wf_type):
        gen = ImageGeneration(
            id=uuid4(),
            user_id=uuid4(),
            workflow_type=wf_type,
            prompt="test",
        )
        assert gen.workflow_type == wf_type


# ---------------------------------------------------------------------------
# __repr__
# ---------------------------------------------------------------------------


class TestImageGenerationRepr:
    """Tests for ImageGeneration.__repr__."""

    def test_repr_format(self):
        uid = uuid4()
        user_id = uuid4()
        gen = ImageGeneration(
            id=uid,
            user_id=user_id,
            workflow_type="text_to_image",
            prompt="test prompt",
            status="completed",
        )
        r = repr(gen)
        assert "ImageGeneration" in r
        assert str(uid) in r
        assert str(user_id) in r
        assert "completed" in r
        assert "text_to_image" in r
