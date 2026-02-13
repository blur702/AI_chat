"""API router for Ollama model management."""

import asyncio
import json
import logging
import re
from typing import Any, Dict, List

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse

from app.auth import get_current_user_payload, require_admin
from app.kernel import WorkstationKernel
from app.kernel.event_types import MODEL_LOADING, MODEL_LOADED, MODEL_UNLOADED, MODEL_PULLING, INFO
from app.schemas.models import (
    ModelActionResponse,
    ModelLoadRequest,
    ModelPullRequest,
    ModelUnloadRequest,
    OllamaModelDetails,
    OllamaModelInfo,
    OllamaModelListResponse,
    RemoteModelInfo,
    RunningModelInfo,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/models", tags=["models"])

_MODEL_NAME_RE = re.compile(r"^[a-zA-Z0-9._:/-]+$")

POPULAR_MODELS: List[Dict[str, Any]] = [
    {"name": "llama3.2", "description": "Meta Llama 3.2 — fast, general-purpose", "sizes": ["1b", "3b"]},
    {"name": "llama3.1", "description": "Meta Llama 3.1 — strong reasoning", "sizes": ["8b", "70b"]},
    {"name": "llama3.3", "description": "Meta Llama 3.3 — latest generation", "sizes": ["70b"]},
    {"name": "mistral", "description": "Mistral AI — balanced performance", "sizes": ["7b"]},
    {"name": "mixtral", "description": "Mistral MoE — multi-expert reasoning", "sizes": ["8x7b", "8x22b"]},
    {"name": "codellama", "description": "Meta Code Llama — code generation", "sizes": ["7b", "13b", "34b"]},
    {"name": "deepseek-coder-v2", "description": "DeepSeek — code specialist", "sizes": ["16b"]},
    {"name": "phi3", "description": "Microsoft Phi-3 — compact & capable", "sizes": ["3.8b", "14b"]},
    {"name": "gemma2", "description": "Google Gemma 2 — efficient", "sizes": ["2b", "9b", "27b"]},
    {"name": "qwen2.5", "description": "Alibaba Qwen 2.5 — multilingual", "sizes": ["7b", "14b", "32b"]},
    {"name": "qwen2.5-coder", "description": "Alibaba Qwen 2.5 — code-focused", "sizes": ["7b", "14b", "32b"]},
    {"name": "command-r", "description": "Cohere — RAG optimized", "sizes": ["35b"]},
    {"name": "starcoder2", "description": "BigCode — code completion", "sizes": ["3b", "7b", "15b"]},
    {"name": "nomic-embed-text", "description": "Nomic — text embedding model", "sizes": ["v1.5"]},
    {"name": "mxbai-embed-large", "description": "Mixedbread — embedding model", "sizes": ["335m"]},
]


def _get_kernel(request: Request) -> WorkstationKernel:
    kernel: WorkstationKernel = getattr(request.app.state, "kernel", None)
    if kernel is None:
        raise HTTPException(status_code=503, detail="Kernel not initialized")
    return kernel


def _validate_path_model_name(name: str) -> str:
    """Validate a model name received as a path parameter."""
    name = name.strip()
    if not name or len(name) > 256 or not _MODEL_NAME_RE.match(name):
        raise HTTPException(status_code=400, detail="Invalid model name")
    return name


def _generate_description(model: Dict[str, Any]) -> str:
    """Build a human-readable description from Ollama model metadata."""
    details = model.get("details", {}) or {}
    parts = []
    if details.get("family"):
        parts.append(details["family"])
    if details.get("parameter_size"):
        parts.append(details["parameter_size"])
    if details.get("quantization_level"):
        parts.append(f"({details['quantization_level']})")
    if details.get("format"):
        parts.append(f"[{details['format']}]")
    size_bytes = model.get("size")
    if size_bytes and isinstance(size_bytes, (int, float)):
        size_gb = size_bytes / (1024 ** 3)
        parts.append(f"{size_gb:.1f} GB")
    return " ".join(parts) if parts else ""


def _parse_details(raw: Dict[str, Any] | None) -> OllamaModelDetails | None:
    if not raw:
        return None
    return OllamaModelDetails(
        family=raw.get("family"),
        parameter_size=raw.get("parameter_size"),
        quantization_level=raw.get("quantization_level"),
        format=raw.get("format"),
    )


@router.get("", response_model=OllamaModelListResponse)
async def list_models(
    request: Request,
    _user: dict = Depends(get_current_user_payload),
):
    """List local, running, and popular remote models."""
    kernel = _get_kernel(request)
    ollama = kernel.get_service("ollama_client")
    if not ollama:
        raise HTTPException(status_code=503, detail="Ollama service not available")

    # Fetch local and running models in parallel
    local_raw, running_raw = await asyncio.gather(
        ollama.list_models(),
        ollama.list_running_models(),
        return_exceptions=True,
    )

    if isinstance(local_raw, Exception):
        logger.warning("Failed to list local models: %s", local_raw)
        local_raw = []
    if isinstance(running_raw, Exception):
        logger.warning("Failed to list running models: %s", running_raw)
        running_raw = []

    local_models = [
        OllamaModelInfo(
            name=m.get("name", ""),
            size=m.get("size"),
            modified_at=m.get("modified_at"),
            details=_parse_details(m.get("details")),
            description=_generate_description(m),
        )
        for m in local_raw
    ]

    running_models = [
        RunningModelInfo(
            name=m.get("name", ""),
            size_vram=m.get("size_vram"),
            size_disk=m.get("size"),
            expires_at=m.get("expires_at"),
            details=_parse_details(m.get("details")),
        )
        for m in running_raw
    ]

    # Filter remote models: exclude any whose name prefix matches a local model
    local_prefixes = {m.name.split(":")[0] for m in local_models}
    remote_models = [
        RemoteModelInfo(name=pm["name"], description=pm["description"], sizes=pm["sizes"])
        for pm in POPULAR_MODELS
        if pm["name"] not in local_prefixes
    ]

    return OllamaModelListResponse(
        local=local_models,
        running=running_models,
        remote=remote_models,
    )


@router.post("/load", response_model=ModelActionResponse)
async def load_model(
    body: ModelLoadRequest,
    request: Request,
    _user: dict = Depends(get_current_user_payload),
):
    """Load a model into GPU VRAM."""
    kernel = _get_kernel(request)
    ollama = kernel.get_service("ollama_client")
    if not ollama:
        raise HTTPException(status_code=503, detail="Ollama service not available")

    event_bus = kernel.get_service("event_bus")
    if event_bus:
        await event_bus.publish(MODEL_LOADING, {
            "model": body.model_name,
            "action": "loading",
        }, severity=INFO, source="models_api")

    try:
        await ollama.load_model(body.model_name, keep_alive=body.keep_alive or "5m")
    except Exception as e:
        logger.error("Failed to load model %s: %s", body.model_name, e, exc_info=True)
        raise HTTPException(status_code=502, detail=f"Failed to load model '{body.model_name}'")

    if event_bus:
        await event_bus.publish(MODEL_LOADED, {
            "model": body.model_name,
            "action": "loaded",
        }, severity=INFO, source="models_api")

    return ModelActionResponse(
        success=True,
        model_name=body.model_name,
        action="load",
        message=f"Model {body.model_name} loaded into VRAM",
    )


@router.post("/unload", response_model=ModelActionResponse)
async def unload_model(
    body: ModelUnloadRequest,
    request: Request,
    _user: dict = Depends(get_current_user_payload),
):
    """Unload a model from GPU VRAM."""
    kernel = _get_kernel(request)
    ollama = kernel.get_service("ollama_client")
    if not ollama:
        raise HTTPException(status_code=503, detail="Ollama service not available")

    try:
        await ollama.unload_model(body.model_name)
    except Exception as e:
        logger.error("Failed to unload model %s: %s", body.model_name, e, exc_info=True)
        raise HTTPException(status_code=502, detail=f"Failed to unload model '{body.model_name}'")

    event_bus = kernel.get_service("event_bus")
    if event_bus:
        await event_bus.publish(MODEL_UNLOADED, {
            "model": body.model_name,
            "action": "unloaded",
        }, severity=INFO, source="models_api")

    return ModelActionResponse(
        success=True,
        model_name=body.model_name,
        action="unload",
        message=f"Model {body.model_name} unloaded from VRAM",
    )


@router.post("/pull")
async def pull_model(
    body: ModelPullRequest,
    request: Request,
    _user: dict = Depends(require_admin),
):
    """Pull/download a model with SSE streaming progress. Admin only."""
    kernel = _get_kernel(request)
    ollama = kernel.get_service("ollama_client")
    if not ollama:
        raise HTTPException(status_code=503, detail="Ollama service not available")

    event_bus = kernel.get_service("event_bus")

    async def generate():
        try:
            if event_bus:
                await event_bus.publish(MODEL_PULLING, {
                    "model": body.model_name,
                    "action": "pulling",
                    "status": "started",
                }, severity=INFO, source="models_api")

            async for chunk in ollama.pull_model(body.model_name):
                status = chunk.get("status", "")
                total = chunk.get("total")
                completed = chunk.get("completed")
                percent = None
                if total and completed:
                    percent = round((completed / total) * 100, 1)

                progress = {
                    "status": status,
                    "digest": chunk.get("digest"),
                    "total": total,
                    "completed": completed,
                    "percent": percent,
                }
                yield f"data: {json.dumps(progress)}\n\n"

            # Final success event
            done = {"status": "success", "percent": 100}
            yield f"data: {json.dumps(done)}\n\n"

            if event_bus:
                await event_bus.publish(MODEL_PULLING, {
                    "model": body.model_name,
                    "action": "pulled",
                    "status": "completed",
                }, severity=INFO, source="models_api")

        except Exception as e:
            logger.error("Pull failed for %s: %s", body.model_name, e, exc_info=True)
            error = {"status": "error", "message": f"Failed to pull model '{body.model_name}'"}
            yield f"data: {json.dumps(error)}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@router.delete("/{model_name:path}", response_model=ModelActionResponse)
async def delete_model(
    model_name: str,
    request: Request,
    _user: dict = Depends(require_admin),
):
    """Delete a locally downloaded model. Admin only."""
    model_name = _validate_path_model_name(model_name)

    kernel = _get_kernel(request)
    ollama = kernel.get_service("ollama_client")
    if not ollama:
        raise HTTPException(status_code=503, detail="Ollama service not available")

    try:
        await ollama.delete_model(model_name)
    except Exception as e:
        logger.error("Failed to delete model %s: %s", model_name, e, exc_info=True)
        raise HTTPException(status_code=502, detail=f"Failed to delete model '{model_name}'")

    return ModelActionResponse(
        success=True,
        model_name=model_name,
        action="delete",
        message=f"Model {model_name} deleted",
    )
