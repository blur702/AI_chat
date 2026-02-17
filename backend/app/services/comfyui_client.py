"""ComfyUIClient - Async HTTP client for ComfyUI image generation API."""

import base64
import logging
import os
import random
import uuid
from typing import Any, Dict, List, Optional, Tuple

import httpx

from app.kernel.base import BaseKernelService

logger = logging.getLogger(__name__)

COMFYUI_OUTPUT_DIR = os.getenv("COMFYUI_OUTPUT_DIR", "/tmp/comfyui_outputs")
DEFAULT_CHECKPOINT = os.getenv("COMFYUI_DEFAULT_MODEL", "v1-5-pruned-emaonly.safetensors")


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

    async def upload_image(self, image_bytes: bytes, filename: str, folder_type: str = "input") -> str:
        """Upload an image into ComfyUI and return stored filename."""
        if self._client is None:
            raise RuntimeError("ComfyUIClient not started")
        files = {"image": (filename, image_bytes, "application/octet-stream")}
        data = {"type": folder_type, "overwrite": "true"}
        resp = await self._client.post("/upload/image", files=files, data=data, timeout=60.0)
        resp.raise_for_status()
        payload = resp.json()
        uploaded_name = payload.get("name") or payload.get("filename")
        if not uploaded_name:
            raise ValueError("ComfyUI upload did not return filename")
        return str(uploaded_name)

    async def upload_base64_image(self, image_value: str, prefix: str = "input") -> str:
        """Accept a data URL or raw base64 string and upload it to ComfyUI input."""
        if image_value.startswith("data:"):
            _, b64 = image_value.split(",", 1)
        else:
            b64 = image_value
        image_bytes = base64.b64decode(b64)
        filename = f"{prefix}-{uuid.uuid4().hex}.png"
        return await self.upload_image(image_bytes=image_bytes, filename=filename, folder_type="input")

    async def get_node_info(self, node_class: str) -> Dict[str, Any]:
        """Get ComfyUI object info for a node class."""
        if self._client is None:
            raise RuntimeError("ComfyUIClient not started")
        # Newer builds support /object_info/{node}; older builds expose /object_info.
        try:
            resp = await self._client.get(f"/object_info/{node_class}", timeout=20.0)
            resp.raise_for_status()
            data = resp.json()
            if isinstance(data, dict) and node_class in data:
                return data[node_class]
            if isinstance(data, dict):
                return data
        except Exception:
            pass

        resp = await self._client.get("/object_info", timeout=20.0)
        resp.raise_for_status()
        data = resp.json()
        return data.get(node_class, {}) if isinstance(data, dict) else {}

    async def get_generation_options(self) -> Dict[str, List[str]]:
        """Discover checkpoints, LoRAs, samplers, and schedulers."""
        checkpoints: List[str] = []
        loras: List[str] = []
        samplers: List[str] = []
        schedulers: List[str] = []
        try:
            ckpt_info = await self.get_node_info("CheckpointLoaderSimple")
            checkpoints = self._extract_enum_choices(ckpt_info, "ckpt_name")
        except Exception:
            logger.debug("Failed to fetch checkpoint list from ComfyUI", exc_info=True)

        try:
            lora_info = await self.get_node_info("LoraLoader")
            loras = self._extract_enum_choices(lora_info, "lora_name")
        except Exception:
            logger.debug("Failed to fetch LoRA list from ComfyUI", exc_info=True)

        try:
            sampler_info = await self.get_node_info("KSampler")
            samplers = self._extract_enum_choices(sampler_info, "sampler_name")
            schedulers = self._extract_enum_choices(sampler_info, "scheduler")
        except Exception:
            logger.debug("Failed to fetch sampler/scheduler lists from ComfyUI", exc_info=True)

        upscale_models: List[str] = []
        try:
            upscale_info = await self.get_node_info("UpscaleModelLoader")
            upscale_models = self._extract_enum_choices(upscale_info, "model_name")
        except Exception:
            logger.debug("Failed to fetch upscale model list from ComfyUI", exc_info=True)

        if DEFAULT_CHECKPOINT and DEFAULT_CHECKPOINT not in checkpoints:
            checkpoints = [DEFAULT_CHECKPOINT, *checkpoints]

        if not samplers:
            samplers = ["euler"]
        if not schedulers:
            schedulers = ["normal"]

        return {
            "models": checkpoints,
            "loras": loras,
            "samplers": samplers,
            "schedulers": schedulers,
            "upscale_models": upscale_models,
        }

    # -- Workflow Templates --------------------------------------------------

    @staticmethod
    def _extract_enum_choices(node_info: Dict[str, Any], field_name: str) -> List[str]:
        """Extract enum-like values from ComfyUI object_info for a node input."""
        if not isinstance(node_info, dict):
            return []
        inputs = node_info.get("input", {})
        required = inputs.get("required", {}) if isinstance(inputs, dict) else {}
        field = required.get(field_name)
        if isinstance(field, (list, tuple)) and field:
            first = field[0]
            if isinstance(first, list):
                return [str(v) for v in first]
            if isinstance(first, tuple):
                return [str(v) for v in first]
        return []

    @staticmethod
    def _coerce_seed(seed: Optional[int]) -> int:
        if seed is None:
            return random.randint(0, 2**63 - 1)
        return int(seed)

    @staticmethod
    def _normalize_loras(loras: Optional[List[Dict[str, Any]]]) -> List[Dict[str, Any]]:
        normalized: List[Dict[str, Any]] = []
        for item in loras or []:
            if not isinstance(item, dict):
                continue
            name = str(item.get("name", "")).strip()
            if not name:
                continue
            normalized.append(
                {
                    "name": name,
                    "strength_model": float(item.get("strength_model", 1.0)),
                    "strength_clip": float(item.get("strength_clip", 1.0)),
                }
            )
        return normalized

    @staticmethod
    def _with_model_and_loras(
        graph: Dict[str, Any],
        next_node_id: int,
        model_name: Optional[str],
        loras: Optional[List[Dict[str, Any]]],
    ) -> Tuple[List[Any], List[Any], List[Any], int]:
        """Create checkpoint + LoRA chain and return model/clip/vae refs."""
        ckpt_id = str(next_node_id)
        next_node_id += 1
        graph[ckpt_id] = {
            "class_type": "CheckpointLoaderSimple",
            "inputs": {
                "ckpt_name": model_name or DEFAULT_CHECKPOINT,
            },
        }

        model_ref: List[Any] = [ckpt_id, 0]
        clip_ref: List[Any] = [ckpt_id, 1]
        vae_ref: List[Any] = [ckpt_id, 2]

        for lora in ComfyUIClient._normalize_loras(loras):
            lora_id = str(next_node_id)
            next_node_id += 1
            graph[lora_id] = {
                "class_type": "LoraLoader",
                "inputs": {
                    "model": model_ref,
                    "clip": clip_ref,
                    "lora_name": lora["name"],
                    "strength_model": lora["strength_model"],
                    "strength_clip": lora["strength_clip"],
                },
            }
            model_ref = [lora_id, 0]
            clip_ref = [lora_id, 1]

        return model_ref, clip_ref, vae_ref, next_node_id

    # IPAdapter filename mappings per checkpoint type
    IPADAPTER_FILES = {
        "sd15": {
            "ipadapter_file": "ip-adapter_sd15.safetensors",
            "clip_name": "sd1.5_model.safetensors",
        },
        "sdxl": {
            "ipadapter_file": "ip-adapter_sdxl_vit-h.safetensors",
            "clip_name": "sdxl_model.safetensors",
        },
    }

    @staticmethod
    def _infer_checkpoint_type(model_name: Optional[str]) -> str:
        """Infer checkpoint type from model filename."""
        if model_name:
            name_lower = model_name.lower()
            if "xl" in name_lower or "sdxl" in name_lower:
                return "sdxl"
        return "sd15"

    @staticmethod
    def _with_ipadapter(
        graph: Dict[str, Any],
        next_node_id: int,
        model_ref: List[Any],
        reference_image_path: str,
        weight: float = 0.7,
        noise: float = 0.0,
        checkpoint_type: str = "sd15",
    ) -> Tuple[List[Any], int]:
        """Chain IPAdapter onto the model for style transfer from a reference image."""
        load_ref_id = str(next_node_id)
        next_node_id += 1
        ipa_model_id = str(next_node_id)
        next_node_id += 1
        clip_vision_id = str(next_node_id)
        next_node_id += 1
        ipa_apply_id = str(next_node_id)
        next_node_id += 1

        ipa_files = ComfyUIClient.IPADAPTER_FILES.get(
            checkpoint_type, ComfyUIClient.IPADAPTER_FILES["sd15"]
        )

        graph[load_ref_id] = {
            "class_type": "LoadImage",
            "inputs": {"image": reference_image_path},
        }
        graph[ipa_model_id] = {
            "class_type": "IPAdapterModelLoader",
            "inputs": {
                "ipadapter_file": ipa_files["ipadapter_file"],
            },
        }
        graph[clip_vision_id] = {
            "class_type": "CLIPVisionLoader",
            "inputs": {
                "clip_name": ipa_files["clip_name"],
            },
        }
        graph[ipa_apply_id] = {
            "class_type": "IPAdapter",
            "inputs": {
                "model": model_ref,
                "ipadapter": [ipa_model_id, 0],
                "clip_vision": [clip_vision_id, 0],
                "image": [load_ref_id, 0],
                "weight": weight,
                "noise": noise,
            },
        }
        return [ipa_apply_id, 0], next_node_id

    CONTROLNET_FILES = {
        "sd15": {
            "canny": "control_v11p_sd15_canny.safetensors",
            "depth": "control_v11f1p_sd15_depth.safetensors",
            "openpose": "control_v11p_sd15_openpose.safetensors",
            "lineart": "control_v11p_sd15_lineart.safetensors",
            "scribble": "control_v11p_sd15_scribble.safetensors",
            "softedge": "control_v11p_sd15_softedge.safetensors",
        },
        "sdxl": {
            "canny": "diffusers_xl_canny_full.safetensors",
            "depth": "diffusers_xl_depth_full.safetensors",
            "openpose": "control-lora-openposexl2-rank256.safetensors",
            "lineart": "sai_xl_sketch_256lora.safetensors",
            "scribble": "sai_xl_sketch_256lora.safetensors",
        },
    }

    @staticmethod
    def _with_controlnet(
        graph: Dict[str, Any],
        next_node_id: int,
        positive_cond_ref: List[Any],
        controlnet_image_path: str,
        controlnet_type: str = "canny",
        strength: float = 1.0,
        checkpoint_type: str = "sd15",
    ) -> Tuple[List[Any], int]:
        """Chain ControlNet onto positive conditioning."""
        load_cn_img_id = str(next_node_id)
        next_node_id += 1
        cn_loader_id = str(next_node_id)
        next_node_id += 1
        cn_apply_id = str(next_node_id)
        next_node_id += 1

        cn_model_map = ComfyUIClient.CONTROLNET_FILES.get(
            checkpoint_type, ComfyUIClient.CONTROLNET_FILES["sd15"]
        )
        if checkpoint_type == "sdxl" and controlnet_type not in cn_model_map:
            raise ValueError(
                f"ControlNet type '{controlnet_type}' is not supported for SDXL checkpoints"
            )
        if checkpoint_type == "sd15" and controlnet_type not in cn_model_map:
            raise ValueError(
                f"ControlNet type '{controlnet_type}' is not supported for SD15 checkpoints"
            )

        fallback_model = (
            f"control_v11p_sd15_{controlnet_type}.safetensors"
            if checkpoint_type == "sd15"
            else f"diffusers_xl_{controlnet_type}_full.safetensors"
        )
        cn_model = cn_model_map.get(controlnet_type, fallback_model)

        graph[load_cn_img_id] = {
            "class_type": "LoadImage",
            "inputs": {"image": controlnet_image_path},
        }
        graph[cn_loader_id] = {
            "class_type": "ControlNetLoader",
            "inputs": {"control_net_name": cn_model},
        }
        graph[cn_apply_id] = {
            "class_type": "ControlNetApply",
            "inputs": {
                "conditioning": positive_cond_ref,
                "control_net": [cn_loader_id, 0],
                "image": [load_cn_img_id, 0],
                "strength": strength,
            },
        }
        return [cn_apply_id, 0], next_node_id

    @staticmethod
    def get_upscale_workflow(
        input_image_path: str,
        upscale_model: str = "RealESRGAN_x4plus.pth",
    ) -> Dict[str, Any]:
        """Build an upscaling workflow using a model-based upscaler."""
        return {
            "1": {
                "class_type": "LoadImage",
                "inputs": {"image": input_image_path},
            },
            "2": {
                "class_type": "UpscaleModelLoader",
                "inputs": {"model_name": upscale_model},
            },
            "3": {
                "class_type": "ImageUpscaleWithModel",
                "inputs": {
                    "upscale_model": ["2", 0],
                    "image": ["1", 0],
                },
            },
            "4": {
                "class_type": "SaveImage",
                "inputs": {
                    "filename_prefix": "workstation_upscale",
                    "images": ["3", 0],
                },
            },
        }

    @staticmethod
    def get_text_to_image_workflow(
        prompt: str,
        negative_prompt: str = "",
        width: int = 512,
        height: int = 512,
        steps: int = 20,
        cfg_scale: float = 7.0,
        seed: Optional[int] = None,
        sampler_name: str = "euler",
        scheduler: str = "normal",
        batch_size: int = 1,
        model_name: Optional[str] = None,
        loras: Optional[List[Dict[str, Any]]] = None,
        reference_image_path: Optional[str] = None,
        reference_weight: float = 0.7,
        reference_noise: float = 0.0,
        controlnet_image_path: Optional[str] = None,
        controlnet_type: Optional[str] = None,
        controlnet_strength: float = 1.0,
    ) -> Dict[str, Any]:
        """Build a standard text-to-image ComfyUI workflow (API format)."""
        graph: Dict[str, Any] = {}
        model_ref, clip_ref, vae_ref, next_id = ComfyUIClient._with_model_and_loras(
            graph=graph,
            next_node_id=1,
            model_name=model_name,
            loras=loras,
        )

        # Optional IPAdapter reference image
        ckpt_type = ComfyUIClient._infer_checkpoint_type(model_name)
        if reference_image_path:
            model_ref, next_id = ComfyUIClient._with_ipadapter(
                graph, next_id, model_ref, reference_image_path,
                weight=reference_weight, noise=reference_noise,
                checkpoint_type=ckpt_type,
            )

        latent_id = str(next_id)
        next_id += 1
        pos_id = str(next_id)
        next_id += 1
        neg_id = str(next_id)
        next_id += 1

        graph[latent_id] = {
            "class_type": "EmptyLatentImage",
            "inputs": {
                "width": width,
                "height": height,
                "batch_size": batch_size,
            },
        }
        graph[pos_id] = {
            "class_type": "CLIPTextEncode",
            "inputs": {
                "text": prompt,
                "clip": clip_ref,
            },
        }
        graph[neg_id] = {
            "class_type": "CLIPTextEncode",
            "inputs": {
                "text": negative_prompt,
                "clip": clip_ref,
            },
        }

        positive_ref: List[Any] = [pos_id, 0]

        # Optional ControlNet
        if controlnet_image_path and controlnet_type:
            positive_ref, next_id = ComfyUIClient._with_controlnet(
                graph, next_id, positive_ref, controlnet_image_path,
                controlnet_type=controlnet_type, strength=controlnet_strength,
                checkpoint_type=ckpt_type,
            )

        sample_id = str(next_id)
        next_id += 1
        decode_id = str(next_id)
        next_id += 1
        save_id = str(next_id)

        graph[sample_id] = {
            "class_type": "KSampler",
            "inputs": {
                "seed": ComfyUIClient._coerce_seed(seed),
                "steps": steps,
                "cfg": cfg_scale,
                "sampler_name": sampler_name,
                "scheduler": scheduler,
                "denoise": 1.0,
                "model": model_ref,
                "positive": positive_ref,
                "negative": [neg_id, 0],
                "latent_image": [latent_id, 0],
            },
        }
        graph[decode_id] = {
            "class_type": "VAEDecode",
            "inputs": {
                "samples": [sample_id, 0],
                "vae": vae_ref,
            },
        }
        graph[save_id] = {
            "class_type": "SaveImage",
            "inputs": {
                "filename_prefix": "workstation",
                "images": [decode_id, 0],
            },
        }
        return graph

    @staticmethod
    def get_image_to_image_workflow(
        prompt: str,
        input_image_path: str,
        negative_prompt: str = "",
        denoise: float = 0.75,
        steps: int = 20,
        cfg_scale: float = 7.0,
        seed: Optional[int] = None,
        sampler_name: str = "euler",
        scheduler: str = "normal",
        model_name: Optional[str] = None,
        loras: Optional[List[Dict[str, Any]]] = None,
        reference_image_path: Optional[str] = None,
        reference_weight: float = 0.7,
        reference_noise: float = 0.0,
        controlnet_image_path: Optional[str] = None,
        controlnet_type: Optional[str] = None,
        controlnet_strength: float = 1.0,
    ) -> Dict[str, Any]:
        """Build a standard image-to-image ComfyUI workflow (API format)."""
        graph: Dict[str, Any] = {}
        model_ref, clip_ref, vae_ref, next_id = ComfyUIClient._with_model_and_loras(
            graph=graph,
            next_node_id=1,
            model_name=model_name,
            loras=loras,
        )

        ckpt_type = ComfyUIClient._infer_checkpoint_type(model_name)
        if reference_image_path:
            model_ref, next_id = ComfyUIClient._with_ipadapter(
                graph, next_id, model_ref, reference_image_path,
                weight=reference_weight, noise=reference_noise,
                checkpoint_type=ckpt_type,
            )

        load_id = str(next_id)
        next_id += 1
        encode_id = str(next_id)
        next_id += 1
        pos_id = str(next_id)
        next_id += 1
        neg_id = str(next_id)
        next_id += 1

        graph[load_id] = {
            "class_type": "LoadImage",
            "inputs": {"image": input_image_path},
        }
        graph[encode_id] = {
            "class_type": "VAEEncode",
            "inputs": {
                "pixels": [load_id, 0],
                "vae": vae_ref,
            },
        }
        graph[pos_id] = {
            "class_type": "CLIPTextEncode",
            "inputs": {
                "text": prompt,
                "clip": clip_ref,
            },
        }
        graph[neg_id] = {
            "class_type": "CLIPTextEncode",
            "inputs": {
                "text": negative_prompt,
                "clip": clip_ref,
            },
        }

        positive_ref: List[Any] = [pos_id, 0]
        if controlnet_image_path and controlnet_type:
            positive_ref, next_id = ComfyUIClient._with_controlnet(
                graph, next_id, positive_ref, controlnet_image_path,
                controlnet_type=controlnet_type, strength=controlnet_strength,
                checkpoint_type=ckpt_type,
            )

        sample_id = str(next_id)
        next_id += 1
        decode_id = str(next_id)
        next_id += 1
        save_id = str(next_id)

        graph[sample_id] = {
            "class_type": "KSampler",
            "inputs": {
                "seed": ComfyUIClient._coerce_seed(seed),
                "steps": steps,
                "cfg": cfg_scale,
                "sampler_name": sampler_name,
                "scheduler": scheduler,
                "denoise": denoise,
                "model": model_ref,
                "positive": positive_ref,
                "negative": [neg_id, 0],
                "latent_image": [encode_id, 0],
            },
        }
        graph[decode_id] = {
            "class_type": "VAEDecode",
            "inputs": {
                "samples": [sample_id, 0],
                "vae": vae_ref,
            },
        }
        graph[save_id] = {
            "class_type": "SaveImage",
            "inputs": {
                "filename_prefix": "workstation",
                "images": [decode_id, 0],
            },
        }
        return graph

    @staticmethod
    def get_inpainting_workflow(
        prompt: str,
        input_image_path: str,
        mask_image_path: str,
        negative_prompt: str = "",
        denoise: float = 0.75,
        steps: int = 20,
        cfg_scale: float = 7.0,
        seed: Optional[int] = None,
        sampler_name: str = "euler",
        scheduler: str = "normal",
        model_name: Optional[str] = None,
        loras: Optional[List[Dict[str, Any]]] = None,
    ) -> Dict[str, Any]:
        """Build an inpainting workflow with explicit mask."""
        graph: Dict[str, Any] = {}
        model_ref, clip_ref, vae_ref, next_id = ComfyUIClient._with_model_and_loras(
            graph=graph,
            next_node_id=1,
            model_name=model_name,
            loras=loras,
        )
        load_img_id = str(next_id)
        next_id += 1
        load_mask_id = str(next_id)
        next_id += 1
        inpaint_encode_id = str(next_id)
        next_id += 1
        pos_id = str(next_id)
        next_id += 1
        neg_id = str(next_id)
        next_id += 1
        sample_id = str(next_id)
        next_id += 1
        decode_id = str(next_id)
        next_id += 1
        save_id = str(next_id)

        graph[load_img_id] = {
            "class_type": "LoadImage",
            "inputs": {"image": input_image_path},
        }
        graph[load_mask_id] = {
            "class_type": "LoadImage",
            "inputs": {"image": mask_image_path},
        }
        graph[inpaint_encode_id] = {
            "class_type": "VAEEncodeForInpaint",
            "inputs": {
                "pixels": [load_img_id, 0],
                "mask": [load_mask_id, 0],
                "vae": vae_ref,
                "grow_mask_by": 6,
            },
        }
        graph[pos_id] = {
            "class_type": "CLIPTextEncode",
            "inputs": {"text": prompt, "clip": clip_ref},
        }
        graph[neg_id] = {
            "class_type": "CLIPTextEncode",
            "inputs": {"text": negative_prompt, "clip": clip_ref},
        }
        graph[sample_id] = {
            "class_type": "KSampler",
            "inputs": {
                "seed": ComfyUIClient._coerce_seed(seed),
                "steps": steps,
                "cfg": cfg_scale,
                "sampler_name": sampler_name,
                "scheduler": scheduler,
                "denoise": denoise,
                "model": model_ref,
                "positive": [pos_id, 0],
                "negative": [neg_id, 0],
                "latent_image": [inpaint_encode_id, 0],
            },
        }
        graph[decode_id] = {
            "class_type": "VAEDecode",
            "inputs": {"samples": [sample_id, 0], "vae": vae_ref},
        }
        graph[save_id] = {
            "class_type": "SaveImage",
            "inputs": {"filename_prefix": "workstation", "images": [decode_id, 0]},
        }
        return graph

    @staticmethod
    def get_face_morph_workflow(
        prompt: str,
        source_image_path: str,
        target_image_path: str,
        negative_prompt: str = "",
        morph_strength: float = 0.5,
        denoise: float = 0.55,
        steps: int = 20,
        cfg_scale: float = 7.0,
        seed: Optional[int] = None,
        sampler_name: str = "euler",
        scheduler: str = "normal",
        model_name: Optional[str] = None,
        loras: Optional[List[Dict[str, Any]]] = None,
    ) -> Dict[str, Any]:
        """Build a face-morph style workflow by blending source/target then img2img sampling."""
        graph: Dict[str, Any] = {}
        model_ref, clip_ref, vae_ref, next_id = ComfyUIClient._with_model_and_loras(
            graph=graph,
            next_node_id=1,
            model_name=model_name,
            loras=loras,
        )
        load_source_id = str(next_id)
        next_id += 1
        load_target_id = str(next_id)
        next_id += 1
        blend_id = str(next_id)
        next_id += 1
        encode_id = str(next_id)
        next_id += 1
        pos_id = str(next_id)
        next_id += 1
        neg_id = str(next_id)
        next_id += 1
        sample_id = str(next_id)
        next_id += 1
        decode_id = str(next_id)
        next_id += 1
        save_id = str(next_id)

        graph[load_source_id] = {
            "class_type": "LoadImage",
            "inputs": {"image": source_image_path},
        }
        graph[load_target_id] = {
            "class_type": "LoadImage",
            "inputs": {"image": target_image_path},
        }
        graph[blend_id] = {
            "class_type": "ImageBlend",
            "inputs": {
                "image1": [load_source_id, 0],
                "image2": [load_target_id, 0],
                "blend_factor": morph_strength,
                "blend_mode": "normal",
            },
        }
        graph[encode_id] = {
            "class_type": "VAEEncode",
            "inputs": {
                "pixels": [blend_id, 0],
                "vae": vae_ref,
            },
        }
        graph[pos_id] = {
            "class_type": "CLIPTextEncode",
            "inputs": {"text": prompt, "clip": clip_ref},
        }
        graph[neg_id] = {
            "class_type": "CLIPTextEncode",
            "inputs": {"text": negative_prompt, "clip": clip_ref},
        }
        graph[sample_id] = {
            "class_type": "KSampler",
            "inputs": {
                "seed": ComfyUIClient._coerce_seed(seed),
                "steps": steps,
                "cfg": cfg_scale,
                "sampler_name": sampler_name,
                "scheduler": scheduler,
                "denoise": denoise,
                "model": model_ref,
                "positive": [pos_id, 0],
                "negative": [neg_id, 0],
                "latent_image": [encode_id, 0],
            },
        }
        graph[decode_id] = {
            "class_type": "VAEDecode",
            "inputs": {"samples": [sample_id, 0], "vae": vae_ref},
        }
        graph[save_id] = {
            "class_type": "SaveImage",
            "inputs": {"filename_prefix": "workstation", "images": [decode_id, 0]},
        }
        return graph
