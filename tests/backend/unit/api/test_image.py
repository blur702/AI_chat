"""
Unit tests for image generation schema validation.

Validates ImageGenerationRequest defaults, workflow_type constraints,
image-to-image/inpainting requirements, dimension ranges,
and path traversal protection.
"""

import pytest
from pydantic import ValidationError

from app.schemas.image import ImageGenerationRequest, ImageGenerationResponse


@pytest.mark.unit
class TestImageGenerationRequestDefaults:
    def test_default_width_height_steps(self):
        req = ImageGenerationRequest(prompt="a sunset")
        assert req.width == 512
        assert req.height == 512
        assert req.steps == 20

    def test_default_workflow_type(self):
        req = ImageGenerationRequest(prompt="a sunset")
        assert req.workflow_type == "text-to-image"

    def test_default_cfg_scale(self):
        req = ImageGenerationRequest(prompt="test")
        assert req.cfg_scale == 7.0

    def test_default_batch_size(self):
        req = ImageGenerationRequest(prompt="test")
        assert req.batch_size == 1


@pytest.mark.unit
class TestWorkflowTypeValidation:
    @pytest.mark.parametrize(
        "wf_type",
        ["text-to-image", "image-to-image", "inpainting", "face-morph", "upscale"],
    )
    def test_allowed_workflow_types(self, wf_type):
        kwargs = {"prompt": "test", "workflow_type": wf_type}
        # Provide required images for workflows that need them
        if wf_type == "image-to-image":
            kwargs["input_image"] = "data:image/png;base64,abc"
        elif wf_type == "inpainting":
            kwargs["input_image"] = "data:image/png;base64,abc"
            kwargs["mask_image"] = "data:image/png;base64,def"
        elif wf_type == "face-morph":
            kwargs["input_image"] = "data:image/png;base64,abc"
            kwargs["target_image"] = "data:image/png;base64,def"
        req = ImageGenerationRequest(**kwargs)
        assert req.workflow_type == wf_type

    def test_invalid_workflow_type_raises(self):
        with pytest.raises(ValidationError):
            ImageGenerationRequest(prompt="test", workflow_type="invalid-type")


@pytest.mark.unit
class TestImageToImageRequirements:
    def test_img2img_requires_input_image(self):
        with pytest.raises(ValidationError) as exc_info:
            ImageGenerationRequest(
                prompt="test", workflow_type="image-to-image"
            )
        assert "input_image" in str(exc_info.value)

    def test_img2img_with_input_image_succeeds(self):
        req = ImageGenerationRequest(
            prompt="test",
            workflow_type="image-to-image",
            input_image="data:image/png;base64,abc",
        )
        assert req.input_image is not None


@pytest.mark.unit
class TestInpaintingRequirements:
    def test_inpainting_requires_input_and_mask(self):
        with pytest.raises(ValidationError) as exc_info:
            ImageGenerationRequest(
                prompt="test", workflow_type="inpainting"
            )
        assert "input_image" in str(exc_info.value)

    def test_inpainting_requires_mask_image(self):
        with pytest.raises(ValidationError) as exc_info:
            ImageGenerationRequest(
                prompt="test",
                workflow_type="inpainting",
                input_image="data:image/png;base64,abc",
            )
        assert "mask_image" in str(exc_info.value)

    def test_inpainting_with_both_images_succeeds(self):
        req = ImageGenerationRequest(
            prompt="test",
            workflow_type="inpainting",
            input_image="data:image/png;base64,abc",
            mask_image="data:image/png;base64,def",
        )
        assert req.input_image is not None
        assert req.mask_image is not None


@pytest.mark.unit
class TestDimensionRangeValidation:
    def test_width_minimum_64(self):
        with pytest.raises(ValidationError):
            ImageGenerationRequest(prompt="test", width=63)

    def test_width_maximum_2048(self):
        with pytest.raises(ValidationError):
            ImageGenerationRequest(prompt="test", width=2049)

    def test_height_minimum_64(self):
        with pytest.raises(ValidationError):
            ImageGenerationRequest(prompt="test", height=63)

    def test_height_maximum_2048(self):
        with pytest.raises(ValidationError):
            ImageGenerationRequest(prompt="test", height=2049)

    def test_valid_boundary_dimensions(self):
        req_min = ImageGenerationRequest(prompt="test", width=64, height=64)
        assert req_min.width == 64
        assert req_min.height == 64

        req_max = ImageGenerationRequest(prompt="test", width=2048, height=2048)
        assert req_max.width == 2048
        assert req_max.height == 2048

    def test_steps_range(self):
        with pytest.raises(ValidationError):
            ImageGenerationRequest(prompt="test", steps=0)
        with pytest.raises(ValidationError):
            ImageGenerationRequest(prompt="test", steps=151)

        req = ImageGenerationRequest(prompt="test", steps=1)
        assert req.steps == 1
        req = ImageGenerationRequest(prompt="test", steps=150)
        assert req.steps == 150


@pytest.mark.unit
class TestPathTraversalProtection:
    def test_path_traversal_double_dot_rejected(self):
        with pytest.raises(ValidationError) as exc_info:
            ImageGenerationRequest(
                prompt="test",
                workflow_type="image-to-image",
                input_image="../../../etc/passwd",
            )
        assert "path" in str(exc_info.value).lower() or ".." in str(exc_info.value)

    def test_forward_slash_rejected(self):
        with pytest.raises(ValidationError):
            ImageGenerationRequest(
                prompt="test",
                workflow_type="image-to-image",
                input_image="images/malicious.png",
            )

    def test_backslash_rejected(self):
        with pytest.raises(ValidationError):
            ImageGenerationRequest(
                prompt="test",
                workflow_type="image-to-image",
                input_image="images\\malicious.png",
            )

    def test_safe_filename_accepted(self):
        req = ImageGenerationRequest(
            prompt="test",
            workflow_type="image-to-image",
            input_image="my_image-01.png",
        )
        assert req.input_image == "my_image-01.png"

    def test_base64_data_url_accepted(self):
        req = ImageGenerationRequest(
            prompt="test",
            workflow_type="image-to-image",
            input_image="data:image/png;base64,iVBORw0KGgo=",
        )
        assert req.input_image.startswith("data:")

    def test_none_image_accepted(self):
        req = ImageGenerationRequest(prompt="test")
        assert req.input_image is None


@pytest.mark.unit
class TestImageGenerationResponse:
    def test_expected_fields(self):
        resp = ImageGenerationResponse(
            id="gen-1",
            user_id="user-1",
            workflow_type="text-to-image",
            prompt="a sunset",
            status="completed",
        )
        assert resp.id == "gen-1"
        assert resp.user_id == "user-1"
        assert resp.workflow_type == "text-to-image"
        assert resp.status == "completed"
        assert resp.result_images == []
        assert resp.error_message is None
        assert resp.is_favorite is False
