"""Pydantic schemas for image generation API."""

from datetime import datetime
from typing import List, Optional
from uuid import UUID

import re

from pydantic import BaseModel, Field, field_validator, model_validator

# Matches base64 data URLs or safe filenames (no path traversal)
_SAFE_FILENAME_RE = re.compile(r"^[a-zA-Z0-9_\-][a-zA-Z0-9_\-. ]*$")


# -------------------------------------------------------------------------
# Request Schemas
# -------------------------------------------------------------------------


class ImageGenerationRequest(BaseModel):
    """Request body for submitting an image generation job."""

    workflow_type: str = Field(
        default="text-to-image",
        pattern="^(text-to-image|image-to-image|inpainting|face-morph|upscale)$",
    )
    system_context: Optional[str] = Field(
        default=None,
        max_length=4000,
        description="Image-specific system context/instructions applied before prompt text",
    )
    prompt: str = Field(..., min_length=1, max_length=2000)
    negative_prompt: Optional[str] = Field(default=None, max_length=2000)
    project_id: Optional[UUID] = None
    width: int = Field(default=512, ge=64, le=2048)
    height: int = Field(default=512, ge=64, le=2048)
    steps: int = Field(default=20, ge=1, le=150)
    cfg_scale: float = Field(default=7.0, ge=1.0, le=30.0)
    input_image: Optional[str] = Field(
        default=None,
        description="Input image as base64 data URL or ComfyUI input filename",
    )
    mask_image: Optional[str] = Field(
        default=None,
        description="Mask image as base64 data URL or ComfyUI input filename (required for inpainting)",
    )
    target_image: Optional[str] = Field(
        default=None,
        description="Target face/image as base64 data URL or ComfyUI input filename (required for face-morph)",
    )
    denoise: float = Field(
        default=0.75,
        ge=0.0,
        le=1.0,
        description="Denoise strength for image-to-image (0.0 = no change, 1.0 = full regeneration)",
    )
    morph_strength: float = Field(
        default=0.5,
        ge=0.0,
        le=1.0,
        description="Blend ratio for face-morph workflows",
    )
    seed: Optional[int] = Field(
        default=None,
        ge=0,
        description="Optional fixed seed for reproducible generations",
    )
    sampler_name: str = Field(default="euler", max_length=100)
    scheduler: str = Field(default="normal", max_length=100)
    batch_size: int = Field(default=1, ge=1, le=8)
    model_name: Optional[str] = Field(
        default=None,
        max_length=255,
        description="Checkpoint model filename to load in CheckpointLoaderSimple",
    )
    loras: List[dict] = Field(
        default_factory=list,
        description="Optional LoRA stack: [{name, strength_model, strength_clip}]",
    )

    # Reference image (IPAdapter style transfer)
    reference_image: Optional[str] = Field(
        default=None,
        description="Reference image for style transfer (base64 data URL or ComfyUI filename)",
    )
    reference_weight: float = Field(default=0.7, ge=0.0, le=1.5)
    reference_noise: float = Field(default=0.0, ge=0.0, le=1.0)

    # ControlNet
    controlnet_image: Optional[str] = Field(
        default=None,
        description="ControlNet guide image (base64 data URL or ComfyUI filename)",
    )
    controlnet_type: Optional[str] = Field(
        default=None,
        pattern="^(canny|depth|openpose|lineart|scribble|softedge)$",
        description="ControlNet type: canny, depth, openpose, lineart, scribble, softedge",
    )
    controlnet_strength: float = Field(default=1.0, ge=0.0, le=2.0)

    # Upscaling (only used with workflow_type=upscale)
    upscale_model: Optional[str] = Field(default=None, max_length=255)
    source_generation_id: Optional[str] = Field(
        default=None,
        description="Source generation to upscale from",
    )

    @field_validator(
        "input_image", "mask_image", "target_image", "reference_image", "controlnet_image",
        mode="before",
    )
    @classmethod
    def validate_image_source(cls, v: str | None) -> str | None:
        """Reject path traversal in image filenames (base64 data URLs pass through)."""
        if v is None:
            return v
        if v.startswith("data:"):
            return v
        if ".." in v or "/" in v or "\\" in v:
            raise ValueError("Image filename must not contain path separators or '..'")
        if not _SAFE_FILENAME_RE.match(v):
            raise ValueError("Image filename contains invalid characters")
        return v

    @model_validator(mode="after")
    def validate_input_image_for_img2img(self) -> "ImageGenerationRequest":
        if self.workflow_type == "image-to-image" and not self.input_image:
            raise ValueError(
                "input_image is required for image-to-image workflow_type"
            )
        if self.workflow_type == "inpainting":
            if not self.input_image:
                raise ValueError("input_image is required for inpainting workflow_type")
            if not self.mask_image:
                raise ValueError("mask_image is required for inpainting workflow_type")
        if self.workflow_type == "face-morph":
            if not self.input_image:
                raise ValueError("input_image is required for face-morph workflow_type")
            if not self.target_image:
                raise ValueError("target_image is required for face-morph workflow_type")
        return self


# -------------------------------------------------------------------------
# Response Schemas
# -------------------------------------------------------------------------


class ImageGenerationProgress(BaseModel):
    """Live progress info from ComfyUI queue."""

    queue_position: Optional[int] = Field(default=None, description="Position in ComfyUI queue (0 = currently running)")
    queue_pending: int = Field(default=0, description="Total pending jobs in ComfyUI queue")
    queue_running: int = Field(default=0, description="Total running jobs in ComfyUI queue")


class ImageGenerationResponse(BaseModel):
    """Response for a single image generation job."""

    id: str
    user_id: str
    project_id: Optional[str] = None
    workflow_type: str
    prompt: str
    negative_prompt: Optional[str] = None
    status: str
    result_images: List[str] = Field(default_factory=list)
    error_message: Optional[str] = None
    comfyui_job_id: Optional[str] = None
    progress: Optional[ImageGenerationProgress] = None
    seed_used: Optional[int] = Field(default=None, description="Actual seed used for generation")
    is_favorite: bool = False
    generation_metadata: Optional[dict] = None
    source_generation_id: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class ImageGenerationListResponse(BaseModel):
    """Paginated list of image generation jobs."""

    generations: List[ImageGenerationResponse] = Field(default_factory=list)
    count: int = 0


class ComfyUIStartResponse(BaseModel):
    """Response from a ComfyUI start attempt."""

    started: bool
    already_running: bool
    healthy: bool
    message: str
    container_status: Optional[str] = None
    health_status: Optional[str] = None


class ImageGenerationOptionsResponse(BaseModel):
    """Discoverable generation options from ComfyUI object info."""

    models: List[str] = Field(default_factory=list)
    loras: List[str] = Field(default_factory=list)
    samplers: List[str] = Field(default_factory=list)
    schedulers: List[str] = Field(default_factory=list)
    upscale_models: List[str] = Field(default_factory=list)
    controlnet_types: List[str] = Field(
        default_factory=lambda: [
            "canny", "depth", "openpose", "lineart", "scribble", "softedge",
        ]
    )
    workflows: List[str] = Field(
        default_factory=lambda: [
            "text-to-image",
            "image-to-image",
            "inpainting",
            "face-morph",
            "upscale",
        ]
    )
