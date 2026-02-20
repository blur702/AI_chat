"""Desktop control tools for computer use capabilities."""

import asyncio
import logging
from typing import Any, Dict, Optional, Set

from app.kernel.tool_base import BaseTool
from app.services import desktop_control

logger = logging.getLogger(__name__)


class ScreenshotTool(BaseTool):
    """Take a screenshot of the desktop or a specific region."""

    @property
    def name(self) -> str:
        return "screenshot"

    @property
    def description(self) -> str:
        return (
            "Capture a screenshot of the entire desktop or a specific region. "
            "Returns a base64-encoded PNG image. Use this to see what's on "
            "screen before performing click or type actions."
        )

    @property
    def parameters_schema(self) -> Dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "region": {
                    "type": "object",
                    "description": "Optional region to capture: {left, top, width, height}.",
                    "properties": {
                        "left": {"type": "integer"},
                        "top": {"type": "integer"},
                        "width": {"type": "integer"},
                        "height": {"type": "integer"},
                    },
                    "required": ["left", "top", "width", "height"],
                },
            },
            "required": [],
        }

    @property
    def required_permissions(self) -> Set[str]:
        return {"tools.execute"}

    async def execute(
        self,
        parameters: Dict[str, Any],
        context: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        region = parameters.get("region")
        region_tuple = None
        if region:
            region_tuple = (region["left"], region["top"], region["width"], region["height"])
        return await asyncio.to_thread(desktop_control.take_screenshot, region=region_tuple)


class ClickTool(BaseTool):
    """Click at screen coordinates."""

    @property
    def name(self) -> str:
        return "desktop_click"

    @property
    def description(self) -> str:
        return (
            "Click at specific screen coordinates. Take a screenshot first "
            "to identify the target location."
        )

    @property
    def parameters_schema(self) -> Dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "x": {"type": "integer", "description": "X coordinate (pixels from left)."},
                "y": {"type": "integer", "description": "Y coordinate (pixels from top)."},
                "button": {
                    "type": "string",
                    "enum": ["left", "right", "middle"],
                    "description": "Mouse button. Default: left.",
                },
                "clicks": {
                    "type": "integer",
                    "description": "Number of clicks (1=single, 2=double). Default: 1.",
                    "minimum": 1,
                    "maximum": 3,
                },
            },
            "required": ["x", "y"],
        }

    @property
    def required_permissions(self) -> Set[str]:
        return {"tools.execute", "tools.write"}

    async def execute(
        self,
        parameters: Dict[str, Any],
        context: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        return await asyncio.to_thread(
            desktop_control.click,
            x=parameters["x"],
            y=parameters["y"],
            button=parameters.get("button", "left"),
            clicks=parameters.get("clicks", 1),
        )


class TypeTextTool(BaseTool):
    """Type text using the keyboard."""

    @property
    def name(self) -> str:
        return "desktop_type"

    @property
    def description(self) -> str:
        return "Type text on the keyboard. Click on the target input field first."

    @property
    def parameters_schema(self) -> Dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "text": {"type": "string", "description": "Text to type."},
            },
            "required": ["text"],
        }

    @property
    def required_permissions(self) -> Set[str]:
        return {"tools.execute", "tools.write"}

    async def execute(
        self,
        parameters: Dict[str, Any],
        context: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        return await asyncio.to_thread(desktop_control.type_text, text=parameters["text"])


class PressKeyTool(BaseTool):
    """Press a key or key combination."""

    @property
    def name(self) -> str:
        return "desktop_key"

    @property
    def description(self) -> str:
        return (
            "Press a key or key combination (e.g., 'enter', 'tab', "
            "'ctrl+c', 'alt+f4'). Use for keyboard shortcuts and special keys."
        )

    @property
    def parameters_schema(self) -> Dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "key": {
                    "type": "string",
                    "description": (
                        "Key or combo to press. Examples: 'enter', 'tab', "
                        "'escape', 'ctrl+c', 'ctrl+shift+t'."
                    ),
                },
            },
            "required": ["key"],
        }

    @property
    def required_permissions(self) -> Set[str]:
        return {"tools.execute", "tools.write"}

    async def execute(
        self,
        parameters: Dict[str, Any],
        context: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        return await asyncio.to_thread(desktop_control.press_key, key=parameters["key"])


class ScreenInfoTool(BaseTool):
    """Get screen dimensions."""

    @property
    def name(self) -> str:
        return "screen_info"

    @property
    def description(self) -> str:
        return "Get the screen dimensions (width and height in pixels)."

    @property
    def parameters_schema(self) -> Dict[str, Any]:
        return {"type": "object", "properties": {}, "required": []}

    @property
    def required_permissions(self) -> Set[str]:
        return {"tools.execute"}

    async def execute(
        self,
        parameters: Dict[str, Any],
        context: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        return await asyncio.to_thread(desktop_control.get_screen_size)
