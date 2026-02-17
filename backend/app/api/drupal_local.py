"""
Drupal local development API endpoints.

Provides file browsing, editing, Drush commands, module/theme management,
and config management for the locally mounted Drupal codebase.
"""

import asyncio
import logging
import os
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import List

import yaml
from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.auth import get_current_user_payload
from fastapi import Request

from app.schemas.drupal_local import (
    ConfigStatusResponse,
    ContrastPair,
    DirectoryCreateRequest,
    DrushRequest,
    DrushResponse,
    FileContentResponse,
    FileCreateRequest,
    FileRenameRequest,
    FileTreeNode,
    FileTreeResponse,
    FileUpdateRequest,
    ModuleInfo,
    ModuleScaffoldRequest,
    PaletteColor,
    PaletteGenerateRequest,
    PaletteResponse,
    PaletteValidateRequest,
    SiteStatusResponse,
    ThemeInfo,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/drupal-local", tags=["drupal-local"])

DRUPAL_MOUNT = os.getenv("DRUPAL_LOCAL_MOUNT", "/drupal-local")
DRUPAL_CONTAINER = os.getenv("DRUPAL_LOCAL_CONTAINER", "workstation-drupal")

# File extension -> Monaco language mapping (same as sandbox)
EXTENSION_LANGUAGE_MAP = {
    ".py": "python",
    ".js": "javascript",
    ".jsx": "javascript",
    ".ts": "typescript",
    ".tsx": "typescript",
    ".json": "json",
    ".html": "html",
    ".htm": "html",
    ".css": "css",
    ".scss": "scss",
    ".less": "less",
    ".md": "markdown",
    ".yaml": "yaml",
    ".yml": "yaml",
    ".xml": "xml",
    ".sql": "sql",
    ".sh": "shell",
    ".bash": "shell",
    ".php": "php",
    ".module": "php",
    ".install": "php",
    ".inc": "php",
    ".theme": "php",
    ".profile": "php",
    ".engine": "php",
    ".twig": "twig",
    ".info": "yaml",
    ".ini": "ini",
    ".htaccess": "plaintext",
    ".txt": "plaintext",
    ".env": "shell",
    ".conf": "plaintext",
    ".lock": "json",
}

# Directories to skip in tree listing
SKIP_DIRS = {"vendor", "node_modules", ".git", ".idea", ".vscode"}

# Max file size for reading (5 MB)
MAX_FILE_SIZE = 5 * 1024 * 1024


def _detect_language(file_path: str) -> str:
    name = file_path.lower()
    basename = os.path.basename(name)
    if basename in ("dockerfile", "makefile", "jenkinsfile"):
        return "dockerfile" if basename == "dockerfile" else "plaintext"
    _, ext = os.path.splitext(name)
    return EXTENSION_LANGUAGE_MAP.get(ext, "plaintext")


def _sanitize_path(path: str) -> str:
    """Sanitize a file path to prevent directory traversal."""
    clean = os.path.normpath(path).replace("\\", "/")
    clean = clean.lstrip("/")
    if ".." in clean.split("/"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Path traversal not allowed",
        )
    if not clean or clean == ".":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid path",
        )
    if "\x00" in clean or any(ord(c) < 32 for c in clean):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Path contains invalid characters",
        )
    return clean


def _abs_path(relative: str) -> str:
    """Resolve a sanitized relative path to the Drupal mount."""
    return os.path.join(DRUPAL_MOUNT, relative)


def _build_tree_from_fs(root: str, prefix: str = "") -> tuple[list[FileTreeNode], int]:
    """Walk the filesystem and build a hierarchical tree."""
    nodes: list[FileTreeNode] = []
    total = 0

    try:
        entries = sorted(os.listdir(root))
    except PermissionError:
        return nodes, total

    for entry in entries:
        full = os.path.join(root, entry)
        rel = f"{prefix}/{entry}" if prefix else entry

        if os.path.isdir(full):
            if entry in SKIP_DIRS or entry.startswith("."):
                continue
            children, sub_total = _build_tree_from_fs(full, rel)
            nodes.append(FileTreeNode(
                name=entry,
                type="directory",
                path=rel,
                children=children,
            ))
            total += sub_total + 1
        else:
            try:
                st = os.stat(full)
                size = st.st_size
            except OSError:
                size = None
            nodes.append(FileTreeNode(
                name=entry,
                type="file",
                path=rel,
                size=size,
            ))
            total += 1

    return nodes, total


def _extract_user_id(payload: dict) -> str:
    user_id = payload.get("user_id")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token: missing user_id",
        )
    return user_id


async def _run_drush(args: list[str], timeout: float = 30.0) -> tuple[int, str, str]:
    """Run a Drush command inside the Drupal container via docker exec.

    Uses asyncio.create_subprocess_exec with explicit arg list (no shell).
    """
    cmd = ["docker", "exec", DRUPAL_CONTAINER, "drush"] + args
    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout_bytes, stderr_bytes = await asyncio.wait_for(
            proc.communicate(), timeout=timeout
        )
        return (
            proc.returncode or 0,
            stdout_bytes.decode("utf-8", errors="replace"),
            stderr_bytes.decode("utf-8", errors="replace"),
        )
    except asyncio.TimeoutError:
        try:
            proc.kill()
        except Exception:
            pass
        return 1, "", "Command timed out"
    except FileNotFoundError:
        return 1, "", "docker command not found"


# -----------------------------------------------------------------------
# File endpoints
# -----------------------------------------------------------------------

@router.get("/files", response_model=FileTreeResponse)
async def list_files(
    path: str = Query("", description="Subdirectory to list (empty for root)"),
    payload: dict = Depends(get_current_user_payload),
):
    """List the Drupal codebase file tree."""
    _extract_user_id(payload)

    root = DRUPAL_MOUNT
    if path:
        clean = _sanitize_path(path)
        root = _abs_path(clean)

    if not os.path.isdir(root):
        raise HTTPException(status_code=404, detail="Directory not found")

    tree, total = _build_tree_from_fs(root, path if path else "")
    return FileTreeResponse(files=tree, total=total)


@router.get("/files/content", response_model=FileContentResponse)
async def get_file_content(
    path: str = Query(..., description="File path relative to Drupal root"),
    payload: dict = Depends(get_current_user_payload),
):
    """Read file content from the Drupal codebase."""
    _extract_user_id(payload)
    clean = _sanitize_path(path)
    abs_p = _abs_path(clean)

    if not os.path.isfile(abs_p):
        raise HTTPException(status_code=404, detail=f"File not found: {clean}")

    file_size = os.path.getsize(abs_p)
    if file_size > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail=f"File too large ({file_size} bytes)")

    try:
        with open(abs_p, "r", encoding="utf-8", errors="replace") as f:
            content = f.read()
    except Exception as e:
        logger.exception("Failed to read file %s: %s", clean, e)
        raise HTTPException(status_code=500, detail="Failed to read file")

    language = _detect_language(clean)
    return FileContentResponse(path=clean, content=content, language=language)


@router.put("/files/content")
async def update_file_content(
    body: FileUpdateRequest,
    payload: dict = Depends(get_current_user_payload),
):
    """Write file content to the Drupal codebase."""
    _extract_user_id(payload)
    clean = _sanitize_path(body.path)
    abs_p = _abs_path(clean)

    if not os.path.isfile(abs_p):
        raise HTTPException(status_code=404, detail=f"File not found: {clean}")

    try:
        with open(abs_p, "w", encoding="utf-8") as f:
            f.write(body.content)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Write error: {e}")

    return {"path": clean, "size": len(body.content)}


@router.post("/files", status_code=201)
async def create_file(
    body: FileCreateRequest,
    payload: dict = Depends(get_current_user_payload),
):
    """Create a new file in the Drupal codebase."""
    _extract_user_id(payload)
    clean = _sanitize_path(body.path)
    abs_p = _abs_path(clean)

    if os.path.exists(abs_p):
        raise HTTPException(status_code=409, detail=f"Already exists: {clean}")

    parent = os.path.dirname(abs_p)
    os.makedirs(parent, exist_ok=True)

    with open(abs_p, "w", encoding="utf-8") as f:
        f.write(body.content)

    return {"path": clean, "name": os.path.basename(clean), "type": "file", "size": len(body.content)}


@router.post("/files/directory", status_code=201)
async def create_directory(
    body: DirectoryCreateRequest,
    payload: dict = Depends(get_current_user_payload),
):
    """Create a new directory in the Drupal codebase."""
    _extract_user_id(payload)
    clean = _sanitize_path(body.path)
    abs_p = _abs_path(clean)

    if os.path.exists(abs_p):
        raise HTTPException(status_code=409, detail=f"Already exists: {clean}")

    os.makedirs(abs_p, exist_ok=True)
    return {"path": clean, "name": os.path.basename(clean), "type": "directory"}


@router.delete("/files", status_code=204)
async def delete_file(
    path: str = Query(..., description="File/directory path"),
    payload: dict = Depends(get_current_user_payload),
):
    """Delete a file or directory from the Drupal codebase."""
    _extract_user_id(payload)
    clean = _sanitize_path(path)
    abs_p = _abs_path(clean)

    if not os.path.exists(abs_p) and not os.path.islink(abs_p):
        raise HTTPException(status_code=404, detail=f"Not found: {clean}")

    if os.path.islink(abs_p):
        os.remove(abs_p)
    elif os.path.isdir(abs_p):
        shutil.rmtree(abs_p)
    else:
        os.remove(abs_p)

    return None


@router.post("/files/rename")
async def rename_file(
    body: FileRenameRequest,
    payload: dict = Depends(get_current_user_payload),
):
    """Rename or move a file/directory."""
    _extract_user_id(payload)
    old_clean = _sanitize_path(body.old_path)
    new_clean = _sanitize_path(body.new_path)
    old_abs = _abs_path(old_clean)
    new_abs = _abs_path(new_clean)

    if not os.path.exists(old_abs):
        raise HTTPException(status_code=404, detail=f"Not found: {old_clean}")

    if os.path.exists(new_abs):
        raise HTTPException(status_code=409, detail=f"Already exists: {new_clean}")

    parent = os.path.dirname(new_abs)
    os.makedirs(parent, exist_ok=True)
    os.rename(old_abs, new_abs)

    node_type = "directory" if os.path.isdir(new_abs) else "file"
    return {"path": new_clean, "name": os.path.basename(new_clean), "type": node_type}


# -----------------------------------------------------------------------
# Drush endpoints
# -----------------------------------------------------------------------

@router.post("/drush", response_model=DrushResponse)
async def run_drush_command(
    body: DrushRequest,
    payload: dict = Depends(get_current_user_payload),
):
    """Run a Drush command inside the Drupal container."""
    _extract_user_id(payload)

    import shlex
    try:
        args = shlex.split(body.command)
    except ValueError:
        args = body.command.split()

    allowed_commands = {"cr", "status", "pm:list"}
    if not args:
        raise HTTPException(status_code=400, detail="Command is required")
    if args[0] not in allowed_commands:
        raise HTTPException(status_code=400, detail=f"Command '{args[0]}' is not allowed")

    exit_code, stdout, stderr = await _run_drush(args)
    return DrushResponse(
        command=body.command,
        exit_code=exit_code,
        stdout=stdout,
        stderr=stderr,
    )


# -----------------------------------------------------------------------
# Module / Theme endpoints
# -----------------------------------------------------------------------

def _parse_info_yml(info_path: str) -> dict:
    """Parse a Drupal .info.yml file."""
    try:
        with open(info_path, "r", encoding="utf-8") as f:
            return yaml.safe_load(f) or {}
    except Exception:
        return {}


def _list_custom_modules() -> list[ModuleInfo]:
    """List modules in modules/custom/."""
    modules_dir = os.path.join(DRUPAL_MOUNT, "web", "modules", "custom")
    if not os.path.isdir(modules_dir):
        return []

    result = []
    for entry in sorted(os.listdir(modules_dir)):
        mod_dir = os.path.join(modules_dir, entry)
        if not os.path.isdir(mod_dir):
            continue
        info_file = os.path.join(mod_dir, f"{entry}.info.yml")
        info = _parse_info_yml(info_file) if os.path.isfile(info_file) else {}
        result.append(ModuleInfo(
            machine_name=entry,
            name=info.get("name", entry),
            path=f"web/modules/custom/{entry}",
            description=info.get("description"),
        ))
    return result


def _list_custom_themes() -> list[ThemeInfo]:
    """List themes in themes/custom/."""
    themes_dir = os.path.join(DRUPAL_MOUNT, "web", "themes", "custom")
    if not os.path.isdir(themes_dir):
        return []

    result = []
    for entry in sorted(os.listdir(themes_dir)):
        theme_dir = os.path.join(themes_dir, entry)
        if not os.path.isdir(theme_dir):
            continue
        info_file = os.path.join(theme_dir, f"{entry}.info.yml")
        info = _parse_info_yml(info_file) if os.path.isfile(info_file) else {}
        result.append(ThemeInfo(
            machine_name=entry,
            name=info.get("name", entry),
            path=f"web/themes/custom/{entry}",
        ))
    return result


@router.get("/modules")
async def list_modules(payload: dict = Depends(get_current_user_payload)):
    """List custom Drupal modules."""
    _extract_user_id(payload)
    return {"modules": _list_custom_modules()}


@router.get("/themes")
async def list_themes(payload: dict = Depends(get_current_user_payload)):
    """List custom Drupal themes."""
    _extract_user_id(payload)
    return {"themes": _list_custom_themes()}


@router.post("/scaffold/module", status_code=201)
async def scaffold_module(
    body: ModuleScaffoldRequest,
    payload: dict = Depends(get_current_user_payload),
):
    """Generate module boilerplate files."""
    _extract_user_id(payload)
    mod_dir = os.path.join(DRUPAL_MOUNT, "web", "modules", "custom", body.machine_name)

    if os.path.exists(mod_dir):
        raise HTTPException(status_code=409, detail=f"Module already exists: {body.machine_name}")

    os.makedirs(mod_dir, exist_ok=True)
    os.makedirs(os.path.join(mod_dir, "src"), exist_ok=True)

    # .info.yml
    info_content = (
        f"name: '{body.name}'\n"
        f"type: module\n"
        f"description: '{body.description}'\n"
        f"package: '{body.package}'\n"
        f"core_version_requirement: ^10 || ^11\n"
    )
    with open(os.path.join(mod_dir, f"{body.machine_name}.info.yml"), "w") as f:
        f.write(info_content)

    # .module
    module_content = (
        f"<?php\n\n"
        f"/**\n"
        f" * @file\n"
        f" * Primary module hooks for {body.name}.\n"
        f" */\n"
    )
    with open(os.path.join(mod_dir, f"{body.machine_name}.module"), "w") as f:
        f.write(module_content)

    # .routing.yml
    routing_content = (
        f"# {body.machine_name}.routing.yml\n"
        f"# Define routes for {body.name} here.\n"
    )
    with open(os.path.join(mod_dir, f"{body.machine_name}.routing.yml"), "w") as f:
        f.write(routing_content)

    return {
        "machine_name": body.machine_name,
        "path": f"web/modules/custom/{body.machine_name}",
        "files_created": [
            f"{body.machine_name}.info.yml",
            f"{body.machine_name}.module",
            f"{body.machine_name}.routing.yml",
            "src/",
        ],
    }


# -----------------------------------------------------------------------
# Status / Config endpoints
# -----------------------------------------------------------------------

@router.get("/status", response_model=SiteStatusResponse)
async def site_status(payload: dict = Depends(get_current_user_payload)):
    """Get Drupal site status via drush status."""
    _extract_user_id(payload)
    exit_code, stdout, stderr = await _run_drush(["status", "--format=json"])

    result = SiteStatusResponse(raw=stdout)
    if exit_code == 0 and stdout.strip():
        try:
            import json
            data = json.loads(stdout)
            result.drupal_version = data.get("drupal-version")
            result.php_version = data.get("php-version")
            result.db_driver = data.get("db-driver")
            result.site_uri = data.get("uri")
        except Exception:
            pass
    return result


@router.get("/config/status", response_model=ConfigStatusResponse)
async def config_status(payload: dict = Depends(get_current_user_payload)):
    """Get config diff via drush config:status."""
    _extract_user_id(payload)
    exit_code, stdout, stderr = await _run_drush(["config:status", "--format=json"])

    result = ConfigStatusResponse(raw=stdout)
    if exit_code == 0 and stdout.strip():
        try:
            import json
            data = json.loads(stdout)
            if isinstance(data, dict):
                result.items = [{"name": k, "state": v} for k, v in data.items()]
            elif isinstance(data, list):
                result.items = data
        except Exception:
            pass
    return result


@router.post("/config/export")
async def config_export(payload: dict = Depends(get_current_user_payload)):
    """Run drush config:export."""
    _extract_user_id(payload)
    exit_code, stdout, stderr = await _run_drush(["config:export", "-y"], timeout=60.0)
    return {"exit_code": exit_code, "stdout": stdout, "stderr": stderr}


@router.post("/config/import")
async def config_import(payload: dict = Depends(get_current_user_payload)):
    """Run drush config:import."""
    _extract_user_id(payload)
    exit_code, stdout, stderr = await _run_drush(["config:import", "-y"], timeout=60.0)
    return {"exit_code": exit_code, "stdout": stdout, "stderr": stderr}


# -----------------------------------------------------------------------
# Color Palette / WCAG AA utilities
# -----------------------------------------------------------------------

import colorsys
import json
import math
import re


def _hex_to_rgb(hex_color: str) -> tuple[int, int, int]:
    """Convert hex color to RGB tuple."""
    h = hex_color.lstrip("#")
    if len(h) == 3:
        h = h[0] * 2 + h[1] * 2 + h[2] * 2
    return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)


def _rgb_to_hex(r: int, g: int, b: int) -> str:
    return f"#{r:02x}{g:02x}{b:02x}"


def _srgb_to_linear(c: float) -> float:
    """Convert sRGB component (0-1) to linear light."""
    if c <= 0.04045:
        return c / 12.92
    return ((c + 0.055) / 1.055) ** 2.4


def _relative_luminance(hex_color: str) -> float:
    """Calculate WCAG relative luminance."""
    r, g, b = _hex_to_rgb(hex_color)
    rl = _srgb_to_linear(r / 255.0)
    gl = _srgb_to_linear(g / 255.0)
    bl = _srgb_to_linear(b / 255.0)
    return 0.2126 * rl + 0.7152 * gl + 0.0722 * bl


def _contrast_ratio(color1: str, color2: str) -> float:
    """Calculate WCAG contrast ratio between two hex colors."""
    l1 = _relative_luminance(color1)
    l2 = _relative_luminance(color2)
    lighter = max(l1, l2)
    darker = min(l1, l2)
    return (lighter + 0.05) / (darker + 0.05)


def _check_contrast(fg: str, bg: str) -> ContrastPair:
    ratio = round(_contrast_ratio(fg, bg), 2)
    return ContrastPair(
        fg=fg,
        bg=bg,
        ratio=ratio,
        aa_normal=ratio >= 4.5,
        aa_large=ratio >= 3.0,
        aaa_normal=ratio >= 7.0,
    )


def _hsl_to_hex(h: float, s: float, l: float) -> str:
    """Convert HSL (0-360, 0-1, 0-1) to hex."""
    r, g, b = colorsys.hls_to_rgb(h / 360.0, l, s)
    return _rgb_to_hex(int(r * 255), int(g * 255), int(b * 255))


def _hex_to_hsl(hex_color: str) -> tuple[float, float, float]:
    """Convert hex to HSL (0-360, 0-1, 0-1)."""
    r, g, b = _hex_to_rgb(hex_color)
    h, l, s = colorsys.rgb_to_hls(r / 255.0, g / 255.0, b / 255.0)
    return h * 360.0, s, l


def _adjust_lightness_for_aa(fg_hex: str, bg_hex: str, min_ratio: float = 4.5) -> str:
    """Adjust foreground lightness to meet WCAG AA against background."""
    ratio = _contrast_ratio(fg_hex, bg_hex)
    if ratio >= min_ratio:
        return fg_hex

    h, s, l = _hex_to_hsl(fg_hex)
    bg_lum = _relative_luminance(bg_hex)

    # Try making lighter or darker
    best = fg_hex
    best_ratio = ratio

    for direction in [1, -1]:
        test_l = l
        for _ in range(100):
            test_l = max(0.0, min(1.0, test_l + direction * 0.01))
            candidate = _hsl_to_hex(h, s, test_l)
            r = _contrast_ratio(candidate, bg_hex)
            if r >= min_ratio:
                return candidate
            if r > best_ratio:
                best = candidate
                best_ratio = r

    return best


def _generate_harmony(seed_hex: str, harmony: str, count: int) -> list[str]:
    """Generate harmonious colors from a seed."""
    h, s, l = _hex_to_hsl(seed_hex)
    colors = [seed_hex]

    if harmony == "complementary":
        angles = [180]
    elif harmony == "triadic":
        angles = [120, 240]
    elif harmony == "analogous":
        angles = [30, -30, 60, -60]
    elif harmony == "split-complementary":
        angles = [150, 210]
    elif harmony == "tetradic":
        angles = [90, 180, 270]
    else:
        angles = [180]

    for angle in angles:
        new_h = (h + angle) % 360
        colors.append(_hsl_to_hex(new_h, s, l))
        if len(colors) >= count:
            break

    # Fill remaining with lightness/saturation variations
    while len(colors) < count:
        variant_l = max(0.1, min(0.9, l + (len(colors) * 0.12 - 0.3)))
        variant_s = max(0.2, min(1.0, s - len(colors) * 0.05))
        variant_h = (h + len(colors) * 37) % 360  # golden angle spread
        colors.append(_hsl_to_hex(variant_h, variant_s, variant_l))

    return colors[:count]


def _build_palette_response(hex_colors: list[str], names: list[str] | None = None) -> PaletteResponse:
    """Build a full PaletteResponse with contrast matrix and CSS output."""
    roles = ["primary", "secondary", "accent", "background", "surface", "text",
             "success", "warning", "error", "muted", "border", "highlight"]

    palette_colors = []
    for i, hex_c in enumerate(hex_colors):
        palette_colors.append(PaletteColor(
            hex=hex_c,
            name=names[i] if names and i < len(names) else "",
            role=roles[i] if i < len(roles) else f"color-{i + 1}",
        ))

    # Build contrast matrix for key fg/bg pairs
    contrast_pairs = []
    for i, c1 in enumerate(hex_colors):
        for j, c2 in enumerate(hex_colors):
            if i >= j:
                continue
            contrast_pairs.append(_check_contrast(c1, c2))

    all_aa = all(p.aa_large for p in contrast_pairs)

    # CSS/SCSS variables
    css_lines = [":root {"]
    scss_lines = []
    for pc in palette_colors:
        var_name = pc.role or f"color-{palette_colors.index(pc) + 1}"
        css_lines.append(f"  --color-{var_name}: {pc.hex};")
        scss_lines.append(f"${var_name}: {pc.hex};")
    css_lines.append("}")

    return PaletteResponse(
        colors=palette_colors,
        contrast_matrix=contrast_pairs,
        all_aa_pass=all_aa,
        css_variables="\n".join(css_lines),
        scss_variables="\n".join(scss_lines),
    )


PALETTE_SYSTEM_PROMPT = """You are a color palette designer. Generate a color palette as a JSON array of objects.
Each object must have: "hex" (valid 6-digit hex like "#3b82f6"), "name" (short color name), "role" (one of: primary, secondary, accent, background, surface, text, success, warning, error, muted, border, highlight).
Rules:
- All colors must meet WCAG AA contrast requirements when used as text on background colors (minimum 4.5:1 ratio)
- Background colors should be light or dark enough to support readable text
- Include at least one dark color suitable for text and one light color suitable for backgrounds
- Return ONLY valid JSON, no other text"""


@router.post("/palette/generate", response_model=PaletteResponse)
async def generate_palette(
    body: PaletteGenerateRequest,
    request: Request,
    payload: dict = Depends(get_current_user_payload),
):
    """Generate an accessible color palette.

    If a text description is provided AND Ollama is available, uses AI to generate
    creative palettes. Otherwise falls back to algorithmic generation from seed color
    and harmony rules. All palettes are validated and auto-adjusted for WCAG AA.
    """
    _extract_user_id(payload)

    hex_colors: list[str] = []
    names: list[str] | None = None

    # Try AI generation if description is provided
    if body.description.strip():
        try:
            from app.api.context_deps import get_ollama_client
            ollama = get_ollama_client(request)

            model = body.model or "llama3.2"
            user_msg = (
                f"Generate a {body.count}-color palette for: {body.description}\n"
                f"Return a JSON array with exactly {body.count} color objects."
            )

            result = await ollama.chat_completion(
                messages=[
                    {"role": "system", "content": PALETTE_SYSTEM_PROMPT},
                    {"role": "user", "content": user_msg},
                ],
                model=model,
                temperature=0.8,
                max_tokens=800,
            )

            content = result.get("message", {}).get("content", "")
            # Extract JSON from response
            json_match = re.search(r'\[.*\]', content, re.DOTALL)
            if json_match:
                parsed = json.loads(json_match.group())
                if isinstance(parsed, list) and len(parsed) >= 2:
                    hex_colors = []
                    names = []
                    for item in parsed[:body.count]:
                        hex_val = item.get("hex", "").strip()
                        if re.match(r'^#[0-9a-fA-F]{6}$', hex_val):
                            hex_colors.append(hex_val.lower())
                            names.append(item.get("name", ""))
        except Exception as e:
            logger.warning("AI palette generation failed, falling back to algorithmic: %s", e)

    # Fallback: algorithmic generation
    if len(hex_colors) < 2:
        seed = body.seed_color.strip() if body.seed_color.strip() else "#3b82f6"
        if not re.match(r'^#[0-9a-fA-F]{6}$', seed):
            seed = "#3b82f6"
        hex_colors = _generate_harmony(seed, body.harmony, body.count)
        names = None

    # Ensure WCAG AA: adjust colors that fail against likely bg pairs
    # Find the lightest color as presumed background
    lums = [(c, _relative_luminance(c)) for c in hex_colors]
    lums.sort(key=lambda x: x[1], reverse=True)
    bg_color = lums[0][0]

    adjusted = []
    for c in hex_colors:
        if c == bg_color:
            adjusted.append(c)
        else:
            adjusted.append(_adjust_lightness_for_aa(c, bg_color))

    return _build_palette_response(adjusted, names)


@router.post("/palette/validate", response_model=PaletteResponse)
async def validate_palette(
    body: PaletteValidateRequest,
    payload: dict = Depends(get_current_user_payload),
):
    """Validate an existing set of colors for WCAG AA compliance."""
    _extract_user_id(payload)

    # Validate hex format
    clean_colors = []
    for c in body.colors:
        c = c.strip()
        if not re.match(r'^#[0-9a-fA-F]{6}$', c):
            raise HTTPException(status_code=400, detail=f"Invalid hex color: {c}")
        clean_colors.append(c.lower())

    return _build_palette_response(clean_colors)


@router.post("/palette/adjust", response_model=PaletteResponse)
async def adjust_palette(
    body: PaletteValidateRequest,
    payload: dict = Depends(get_current_user_payload),
):
    """Auto-adjust a palette to meet WCAG AA requirements."""
    _extract_user_id(payload)

    clean_colors = []
    for c in body.colors:
        c = c.strip()
        if not re.match(r'^#[0-9a-fA-F]{6}$', c):
            raise HTTPException(status_code=400, detail=f"Invalid hex color: {c}")
        clean_colors.append(c.lower())

    # Find lightest as background
    lums = [(c, _relative_luminance(c)) for c in clean_colors]
    lums.sort(key=lambda x: x[1], reverse=True)
    bg_color = lums[0][0]

    adjusted = []
    for c in clean_colors:
        if c == bg_color:
            adjusted.append(c)
        else:
            adjusted.append(_adjust_lightness_for_aa(c, bg_color))

    return _build_palette_response(adjusted)
