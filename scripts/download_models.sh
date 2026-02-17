#!/usr/bin/env bash
# download_models.sh — Download SD/SDXL models, LoRAs, ControlNet, upscalers,
# and IPAdapter models into ComfyUI Docker volumes.
#
# Downloads to a temp directory on the host, then copies into the comfyui
# container via `docker cp` and fixes ownership (1024:1024).
#
# Usage:
#   bash scripts/download_models.sh [--category CATEGORY]
#
# Categories: checkpoints, loras, controlnet, upscale, ipadapter, all (default)

set -euo pipefail

CONTAINER="workstation-comfyui-1"
COMFY_BASE="/comfy/mnt/ComfyUI/models"
TEMP_DIR="${TMPDIR:-/tmp}/comfyui_models"

CATEGORY="${1:-all}"
if [[ "$CATEGORY" == "--category" ]]; then
  CATEGORY="${2:-all}"
fi

mkdir -p "$TEMP_DIR"

# ─── Helpers ───────────────────────────────────────────────────────────

download() {
  local url="$1"
  local dest="$2"
  local name
  name=$(basename "$dest")

  if [[ -f "$dest" ]]; then
    echo "  [skip] $name already exists"
    return 0
  fi

  echo "  [download] $name ..."
  mkdir -p "$(dirname "$dest")"
  if ! wget -q --show-progress -O "$dest.tmp" "$url"; then
    echo "  [error] Failed to download $name"
    rm -f "$dest.tmp"
    return 1
  fi
  mv "$dest.tmp" "$dest"
}

copy_to_container() {
  local src_dir="$1"
  local container_path="$2"

  if [[ ! -d "$src_dir" ]] || [[ -z "$(ls -A "$src_dir" 2>/dev/null)" ]]; then
    return 0
  fi

  echo "  Copying to $container_path ..."
  docker exec "$CONTAINER" mkdir -p "$container_path"
  docker cp "$src_dir/." "${CONTAINER}:${container_path}/"
  docker exec "$CONTAINER" chown -R 1024:1024 "$container_path"
}

# ─── Checkpoints ───────────────────────────────────────────────────────

download_checkpoints() {
  echo ""
  echo "═══ SD 1.5 Checkpoints ═══"
  local ckpt_dir="$TEMP_DIR/checkpoints"
  mkdir -p "$ckpt_dir"

  download \
    "https://huggingface.co/SG161222/Realistic_Vision_V5.1_noVAE/resolve/main/Realistic_Vision_V5.1_fp16-no-ema.safetensors" \
    "$ckpt_dir/realisticVisionV51_v51VAE.safetensors"

  download \
    "https://huggingface.co/Lykon/DreamShaper/resolve/main/DreamShaper_8_pruned.safetensors" \
    "$ckpt_dir/dreamshaper_8.safetensors"

  echo ""
  echo "═══ SDXL Checkpoints ═══"

  download \
    "https://huggingface.co/SG161222/RealVisXL_V5.0/resolve/main/RealVisXL_V5.0_fp16.safetensors" \
    "$ckpt_dir/realvisxl_v50.safetensors"

  download \
    "https://huggingface.co/Lykon/dreamshaper-xl-v2-turbo/resolve/main/DreamShaperXL_Turbo_v2_1.safetensors" \
    "$ckpt_dir/dreamshaperXL_turbo_v2.safetensors"

  copy_to_container "$ckpt_dir" "$COMFY_BASE/checkpoints"
}

# ─── LoRAs ─────────────────────────────────────────────────────────────

download_loras() {
  echo ""
  echo "═══ LoRAs ═══"
  local lora_dir="$TEMP_DIR/loras"
  mkdir -p "$lora_dir"

  download \
    "https://huggingface.co/latent-consistency/lcm-lora-sdv1-5/resolve/main/pytorch_lora_weights.safetensors" \
    "$lora_dir/lcm_lora_sd15.safetensors"

  download \
    "https://huggingface.co/latent-consistency/lcm-lora-sdxl/resolve/main/pytorch_lora_weights.safetensors" \
    "$lora_dir/lcm_lora_sdxl.safetensors"

  download \
    "https://huggingface.co/lordjia/DetailTweakerXL/resolve/main/add-detail-xl.safetensors" \
    "$lora_dir/add_detail_xl.safetensors"

  download \
    "https://huggingface.co/lordjia/add_more_details/resolve/main/add_more_details.safetensors" \
    "$lora_dir/add_more_details_sd15.safetensors"

  download \
    "https://huggingface.co/lordjia/film_grain_style/resolve/main/FilmVelvia3.safetensors" \
    "$lora_dir/film_grain.safetensors"

  copy_to_container "$lora_dir" "$COMFY_BASE/loras"
}

# ─── ControlNet ────────────────────────────────────────────────────────

download_controlnet() {
  echo ""
  echo "═══ ControlNet Models ═══"
  local cn_dir="$TEMP_DIR/controlnet"
  mkdir -p "$cn_dir"

  download \
    "https://huggingface.co/lllyasviel/ControlNet-v1-1/resolve/main/control_v11p_sd15_canny.pth" \
    "$cn_dir/control_v11p_sd15_canny.pth"

  download \
    "https://huggingface.co/lllyasviel/ControlNet-v1-1/resolve/main/control_v11p_sd15_openpose.pth" \
    "$cn_dir/control_v11p_sd15_openpose.pth"

  download \
    "https://huggingface.co/diffusers/controlnet-canny-sdxl-1.0/resolve/main/diffusion_pytorch_model.fp16.safetensors" \
    "$cn_dir/controlnet_canny_sdxl.safetensors"

  copy_to_container "$cn_dir" "$COMFY_BASE/controlnet"
}

# ─── Upscale Models ────────────────────────────────────────────────────

download_upscale() {
  echo ""
  echo "═══ Upscale Models ═══"
  local up_dir="$TEMP_DIR/upscale_models"
  mkdir -p "$up_dir"

  download \
    "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.1.0/RealESRGAN_x4plus.pth" \
    "$up_dir/RealESRGAN_x4plus.pth"

  download \
    "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.2.4/RealESRGAN_x4plus_anime_6B.pth" \
    "$up_dir/RealESRGAN_x4plus_anime_6B.pth"

  copy_to_container "$up_dir" "$COMFY_BASE/upscale_models"
}

# ─── IPAdapter ─────────────────────────────────────────────────────────

download_ipadapter() {
  echo ""
  echo "═══ IPAdapter Models ═══"
  local ip_dir="$TEMP_DIR/ipadapter"
  local clip_dir="$TEMP_DIR/clip_vision"
  mkdir -p "$ip_dir" "$clip_dir"

  download \
    "https://huggingface.co/h94/IP-Adapter/resolve/main/models/ip-adapter_sd15.safetensors" \
    "$ip_dir/ip-adapter_sd15.safetensors"

  download \
    "https://huggingface.co/h94/IP-Adapter/resolve/main/sdxl_models/ip-adapter_sdxl_vit-h.safetensors" \
    "$ip_dir/ip-adapter_sdxl_vit-h.safetensors"

  echo ""
  echo "═══ CLIP Vision (required by IPAdapter) ═══"

  download \
    "https://huggingface.co/h94/IP-Adapter/resolve/main/models/image_encoder/model.safetensors" \
    "$clip_dir/CLIP-ViT-H-14-laion2B-s32B-b79K.safetensors"

  copy_to_container "$ip_dir" "$COMFY_BASE/ipadapter"
  copy_to_container "$clip_dir" "$COMFY_BASE/clip_vision"
}

# ─── Main ──────────────────────────────────────────────────────────────

echo "ComfyUI Model Downloader"
echo "========================"
echo "Container: $CONTAINER"
echo "Temp dir:  $TEMP_DIR"
echo "Category:  $CATEGORY"
echo ""

# Verify container is running
if ! docker inspect "$CONTAINER" &>/dev/null; then
  echo "ERROR: Container '$CONTAINER' not found. Start the stack first:"
  echo "  docker compose up -d"
  exit 1
fi

case "$CATEGORY" in
  checkpoints) download_checkpoints ;;
  loras)       download_loras ;;
  controlnet)  download_controlnet ;;
  upscale)     download_upscale ;;
  ipadapter)   download_ipadapter ;;
  all)
    download_checkpoints
    download_loras
    download_controlnet
    download_upscale
    download_ipadapter
    ;;
  *)
    echo "Unknown category: $CATEGORY"
    echo "Valid: checkpoints, loras, controlnet, upscale, ipadapter, all"
    exit 1
    ;;
esac

echo ""
echo "Done! Restart ComfyUI to pick up new models:"
echo "  docker compose restart comfyui"
