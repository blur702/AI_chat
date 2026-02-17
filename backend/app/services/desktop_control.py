"""Desktop control service for computer use capabilities."""

import base64
import io
import logging
import os
import sys
from typing import Any, Dict, Optional, Tuple

logger = logging.getLogger(__name__)

# Lazy imports — these may not be installed in all environments
_pyautogui = None
_mss = None
_Image = None
_pyperclip = None


def _ensure_imports(required: Optional[Tuple[str, ...]] = None):
    """Lazily import desktop control dependencies."""
    global _pyautogui, _mss, _Image, _pyperclip
    required = required or ()
    if _pyautogui is None:
        try:
            import pyautogui
            import mss
            from PIL import Image

            pyautogui.FAILSAFE = True
            pyautogui.PAUSE = 0.1

            _pyautogui = pyautogui
            _mss = mss
            _Image = Image
        except ImportError as e:
            raise RuntimeError(
                f"Desktop control dependencies not installed: {e}. "
                "Install with: pip install pyautogui mss Pillow pyperclip"
            )
    if "pyperclip" in required and _pyperclip is None:
        try:
            import pyperclip

            _pyperclip = pyperclip
        except ImportError as e:
            raise RuntimeError(
                f"Desktop control dependencies not installed: {e}. "
                "Install with: pip install pyautogui mss Pillow pyperclip"
            )


def is_enabled() -> bool:
    """Check if desktop control is enabled via environment variable."""
    return os.environ.get("DESKTOP_CONTROL_ENABLED", "false").lower() in ("true", "1", "yes")


def take_screenshot(
    region: Optional[Tuple[int, int, int, int]] = None,
    max_width: int = 1280,
) -> Dict[str, Any]:
    """
    Capture a screenshot of the desktop.

    Args:
        region: Optional (left, top, width, height) tuple to capture a specific region.
        max_width: Maximum width of the returned image (resized proportionally).

    Returns:
        Dict with base64-encoded PNG image and dimensions.
    """
    _ensure_imports()

    with _mss.mss() as sct:
        if region:
            left, top, width, height = region
            monitor = {"left": left, "top": top, "width": width, "height": height}
        else:
            monitor = sct.monitors[0]  # Full virtual screen

        screenshot = sct.grab(monitor)
        img = _Image.frombytes("RGB", screenshot.size, screenshot.bgra, "raw", "BGRX")

    # Resize if too large
    if img.width > max_width:
        ratio = max_width / img.width
        new_size = (max_width, int(img.height * ratio))
        img = img.resize(new_size, _Image.Resampling.LANCZOS)

    # Encode as base64 PNG
    buffer = io.BytesIO()
    img.save(buffer, format="PNG", optimize=True)
    b64 = base64.b64encode(buffer.getvalue()).decode("ascii")

    return {
        "image_base64": b64,
        "width": img.width,
        "height": img.height,
        "format": "png",
    }


def click(x: int, y: int, button: str = "left", clicks: int = 1) -> Dict[str, Any]:
    """Click at the given screen coordinates."""
    _ensure_imports()
    _pyautogui.click(x=x, y=y, button=button, clicks=clicks)
    return {"action": "click", "x": x, "y": y, "button": button, "clicks": clicks}


def type_text(text: str, interval: float = 0.02) -> Dict[str, Any]:
    """Type text using the keyboard.

    Uses pyautogui.typewrite for pure ASCII text (faster, supports interval)
    and falls back to pyperclip + hotkey paste for non-ASCII characters.
    """
    _ensure_imports()
    if all(ord(c) < 128 for c in text):
        _pyautogui.typewrite(text, interval=interval)
    else:
        _ensure_imports(("pyperclip",))
        _pyperclip.copy(text)
        paste_modifier = "command" if sys.platform == "darwin" else "ctrl"
        _pyautogui.hotkey(paste_modifier, "v")
    return {"action": "type", "length": len(text)}


def press_key(key: str) -> Dict[str, Any]:
    """Press a single key or key combination (e.g., 'enter', 'ctrl+c')."""
    _ensure_imports()
    if "+" in key:
        keys = [k.strip() for k in key.split("+")]
        _pyautogui.hotkey(*keys)
    else:
        _pyautogui.press(key)
    return {"action": "press_key", "key": key}


def move_mouse(x: int, y: int) -> Dict[str, Any]:
    """Move the mouse to the given screen coordinates."""
    _ensure_imports()
    _pyautogui.moveTo(x=x, y=y)
    return {"action": "move", "x": x, "y": y}


def get_screen_size() -> Dict[str, int]:
    """Get the primary screen dimensions."""
    _ensure_imports()
    w, h = _pyautogui.size()
    return {"width": w, "height": h}
