"""Pydantic schemas for Ollama model management."""

import re
from typing import List, Optional

from pydantic import BaseModel, field_validator

# Ollama model names: alphanumeric, dots, colons, hyphens, slashes, underscores
_MODEL_NAME_RE = re.compile(r"^[a-zA-Z0-9._:/-]+$")
_KEEP_ALIVE_RE = re.compile(r"^\d+[smhd]?$")


def _validate_model_name(v: str) -> str:
    v = v.strip()
    if not v or len(v) > 256:
        raise ValueError("model_name must be 1-256 characters")
    if not _MODEL_NAME_RE.match(v):
        raise ValueError("model_name contains invalid characters")
    return v


class OllamaModelDetails(BaseModel):
    family: Optional[str] = None
    parameter_size: Optional[str] = None
    quantization_level: Optional[str] = None
    format: Optional[str] = None


class OllamaModelInfo(BaseModel):
    name: str
    size: Optional[int] = None
    modified_at: Optional[str] = None
    details: Optional[OllamaModelDetails] = None
    description: Optional[str] = None


class RunningModelInfo(BaseModel):
    name: str
    size_vram: Optional[int] = None
    size_disk: Optional[int] = None
    expires_at: Optional[str] = None
    details: Optional[OllamaModelDetails] = None


class RemoteModelInfo(BaseModel):
    name: str
    description: str
    sizes: List[str]


class OllamaModelListResponse(BaseModel):
    local: List[OllamaModelInfo]
    running: List[RunningModelInfo]
    remote: List[RemoteModelInfo]


class ModelLoadRequest(BaseModel):
    model_name: str
    keep_alive: Optional[str] = "5m"

    @field_validator("model_name")
    @classmethod
    def check_model_name(cls, v: str) -> str:
        return _validate_model_name(v)

    @field_validator("keep_alive")
    @classmethod
    def check_keep_alive(cls, v: str | None) -> str | None:
        if v is None:
            return v
        if not _KEEP_ALIVE_RE.match(v):
            raise ValueError("keep_alive must be a duration like '5m', '1h', or '0'")
        return v


class ModelUnloadRequest(BaseModel):
    model_name: str

    @field_validator("model_name")
    @classmethod
    def check_model_name(cls, v: str) -> str:
        return _validate_model_name(v)


class ModelPullRequest(BaseModel):
    model_name: str

    @field_validator("model_name")
    @classmethod
    def check_model_name(cls, v: str) -> str:
        return _validate_model_name(v)


class ModelActionResponse(BaseModel):
    success: bool
    model_name: str
    action: str
    message: str


class ModelPullProgress(BaseModel):
    status: str
    digest: Optional[str] = None
    total: Optional[int] = None
    completed: Optional[int] = None
    percent: Optional[float] = None
