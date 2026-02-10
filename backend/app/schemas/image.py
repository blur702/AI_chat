"""Pydantic schemas for image generation API."""

from datetime import datetime
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel, Field, model_validator


# -------------------------------------------------------------------------
# Request Schemas
# -------------------------------------------------------------------------


class ImageGenerationRequest(BaseModel):
    """Request body for submitting an image generation job."""

    workflow_type: str = Field(
        default="text-to-image",
        pattern="^(text-to-image|image-to-image)$",
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
        description="Input image filename (in ComfyUI input directory) for image-to-image workflows",
    )
    denoise: float = Field(
        default=0.75,
        ge=0.0,
        le=1.0,
        description="Denoise strength for image-to-image (0.0 = no change, 1.0 = full regeneration)",
    )

    @model_validator(mode="after")
    def validate_input_image_for_img2img(self) -> "ImageGenerationRequest":
        if self.workflow_type == "image-to-image" and not self.input_image:
            raise ValueError(
                "input_image is required for image-to-image workflow_type"
            )
        return self


# -------------------------------------------------------------------------
# Response Schemas
# -------------------------------------------------------------------------


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
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class ImageGenerationListResponse(BaseModel):
    """Paginated list of image generation jobs."""

    generations: List[ImageGenerationResponse] = Field(default_factory=list)
    count: int = 0
