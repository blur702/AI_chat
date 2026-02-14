"""ComfyUIClient - Async HTTP client for ComfyUI image generation API."""

import logging
import os
import random
from typing import Any, Dict, List, Optional, Tuple

import httpx

from app.kernel.base import BaseKernelService

logger = logging.getLogger(__name__)

COMFYUI_OUTPUT_DIR = os.getenv("COMFYUI_OUTPUT_DIR", "/tmp/comfyui_outputs")


class ComfyUIClient(BaseKernelService):
    """
    Kernel service wrapping the ComfyUI HTTP API.

    Provides async methods for workflow submission, job status polling,
    and image downloading with connection pooling.
    """

    def __init__(self, base_url: str = "http://comfyui:8188") -> None:
        self._base_url = base_url.rstrip("/")
        self._running = False
        self._client: Optional[httpx.AsyncClient] = None

    # -- BaseKernelService lifecycle -----------------------------------------

    @property
    def name(self) -> str:
        return "comfyui_client"

    @property
    def is_running(self) -> bool:
        return self._running

    async def startup(self) -> None:
        if self._running:
            return
        self._client = httpx.AsyncClient(
            base_url=self._base_url,
            timeout=httpx.Timeout(connect=5.0, read=120.0, write=10.0, pool=5.0),
        )
        self._running = True
        logger.info("ComfyUIClient started (base_url=%s)", self._base_url)

    async def shutdown(self) -> None:
        if self._client:
            await self._client.aclose()
            self._client = None
        self._running = False
        logger.info("ComfyUIClient stopped")

    async def health_check(self) -> Tuple[bool, str]:
        if not self._running or not self._client:
            return False, "service not running"
        try:
            resp = await self._client.get("/system_stats", timeout=5.0)
            resp.raise_for_status()
            return True, "ok"
        except Exception as exc:
            return False, f"comfyui unreachable: {exc}"

    # -- Public API ----------------------------------------------------------

    async def submit_workflow(self, workflow_json: Dict[str, Any]) -> str:
        """Submit a workflow to ComfyUI and return the prompt_id (job ID)."""
        if self._client is None:
            raise RuntimeError("ComfyUIClient not started")
        payload = {"prompt": workflow_json}
        resp = await self._client.post("/prompt", json=payload)
        resp.raise_for_status()
        data = resp.json()
        prompt_id = data.get("prompt_id")
        if not prompt_id:
            raise ValueError("ComfyUI did not return a prompt_id")
        logger.info("Submitted workflow, prompt_id=%s", prompt_id)
        return prompt_id

    async def get_job_status(self, job_id: str) -> Dict[str, Any]:
        """Get the execution history for a completed job."""
        if self._client is None:
            raise RuntimeError("ComfyUIClient not started")
        resp = await self._client.get(f"/history/{job_id}", timeout=10.0)
        resp.raise_for_status()
        return resp.json()

    async def get_queue_status(self) -> Dict[str, Any]:
        """Get the current ComfyUI queue status."""
        if self._client is None:
            raise RuntimeError("ComfyUIClient not started")
        resp = await self._client.get("/queue", timeout=5.0)
        resp.raise_for_status()
        return resp.json()

    async def download_image(self, filename: str, subfolder: str = "", folder_type: str = "output") -> bytes:
        """Download a generated image from ComfyUI by filename."""
        if self._client is None:
            raise RuntimeError("ComfyUIClient not started")
        params = {"filename": filename, "subfolder": subfolder, "type": folder_type}
        resp = await self._client.get("/view", params=params, timeout=30.0)
        resp.raise_for_status()
        return resp.content

    # -- Workflow Templates --------------------------------------------------

    @staticmethod
    def get_text_to_image_workflow(
        prompt: str,
        negative_prompt: str = "",
        width: int = 512,
        height: int = 512,
        steps: int = 20,
        cfg_scale: float = 7.0,
    ) -> Dict[str, Any]:
        """Build a standard text-to-image ComfyUI workflow (API format)."""
        return {
            "3": {
                "class_type": "KSampler",
                "inputs": {
                    "seed": random.randint(0, 2**63 - 1),
                    "steps": steps,
                    "cfg": cfg_scale,
                    "sampler_name": "euler",
                    "scheduler": "normal",
                    "denoise": 1.0,
                    "model": ["4", 0],
                    "positive": ["6", 0],
                    "negative": ["7", 0],
                    "latent_image": ["5", 0],
                },
            },
            "4": {
                "class_type": "CheckpointLoaderSimple",
                "inputs": {
                    "ckpt_name": "v1-5-pruned-emaonly.safetensors",
                },
            },
            "5": {
                "class_type": "EmptyLatentImage",
                "inputs": {
                    "width": width,
                    "height": height,
                    "batch_size": 1,
                },
            },
            "6": {
                "class_type": "CLIPTextEncode",
                "inputs": {
                    "text": prompt,
                    "clip": ["4", 1],
                },
            },
            "7": {
                "class_type": "CLIPTextEncode",
                "inputs": {
                    "text": negative_prompt,
                    "clip": ["4", 1],
                },
            },
            "8": {
                "class_type": "VAEDecode",
                "inputs": {
                    "samples": ["3", 0],
                    "vae": ["4", 2],
                },
            },
            "9": {
                "class_type": "SaveImage",
                "inputs": {
                    "filename_prefix": "workstation",
                    "images": ["8", 0],
                },
            },
        }

    @staticmethod
    def get_image_to_image_workflow(
        prompt: str,
        input_image_path: str,
        negative_prompt: str = "",
        denoise: float = 0.75,
        steps: int = 20,
        cfg_scale: float = 7.0,
    ) -> Dict[str, Any]:
        """Build a standard image-to-image ComfyUI workflow (API format)."""
        return {
            "3": {
                "class_type": "KSampler",
                "inputs": {
                    "seed": random.randint(0, 2**63 - 1),
                    "steps": steps,
                    "cfg": cfg_scale,
                    "sampler_name": "euler",
                    "scheduler": "normal",
                    "denoise": denoise,
                    "model": ["4", 0],
                    "positive": ["6", 0],
                    "negative": ["7", 0],
                    "latent_image": ["10", 0],
                },
            },
            "4": {
                "class_type": "CheckpointLoaderSimple",
                "inputs": {
                    "ckpt_name": "v1-5-pruned-emaonly.safetensors",
                },
            },
            "6": {
                "class_type": "CLIPTextEncode",
                "inputs": {
                    "text": prompt,
                    "clip": ["4", 1],
                },
            },
            "7": {
                "class_type": "CLIPTextEncode",
                "inputs": {
                    "text": negative_prompt,
                    "clip": ["4", 1],
                },
            },
            "8": {
                "class_type": "VAEDecode",
                "inputs": {
                    "samples": ["3", 0],
                    "vae": ["4", 2],
                },
            },
            "9": {
                "class_type": "SaveImage",
                "inputs": {
                    "filename_prefix": "workstation",
                    "images": ["8", 0],
                },
            },
            "10": {
                "class_type": "VAEEncode",
                "inputs": {
                    "pixels": ["11", 0],
                    "vae": ["4", 2],
                },
            },
            "11": {
                "class_type": "LoadImage",
                "inputs": {
                    "image": input_image_path,
                },
            },
        }
