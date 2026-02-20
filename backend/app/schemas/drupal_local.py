"""Pydantic schemas for Drupal local development API."""

from typing import List, Optional

from pydantic import BaseModel, Field


class FileTreeNode(BaseModel):
    name: str
    type: str = Field(..., description="'file' or 'directory'")
    path: str
    size: Optional[int] = None
    children: Optional[List["FileTreeNode"]] = None


class FileTreeResponse(BaseModel):
    files: List[FileTreeNode] = Field(default_factory=list)
    total: int = 0


class FileContentResponse(BaseModel):
    path: str
    content: str
    language: str = "plaintext"


class FileCreateRequest(BaseModel):
    path: str = Field(..., min_length=1)
    content: str = Field(default="")


class FileUpdateRequest(BaseModel):
    path: str = Field(..., min_length=1)
    content: str


class FileRenameRequest(BaseModel):
    old_path: str = Field(..., min_length=1)
    new_path: str = Field(..., min_length=1)


class DirectoryCreateRequest(BaseModel):
    path: str = Field(..., min_length=1)


class DrushRequest(BaseModel):
    command: str = Field(..., min_length=1, description="Drush command (e.g. 'cr', 'status', 'pm:list')")


class DrushResponse(BaseModel):
    command: str
    exit_code: int
    stdout: str
    stderr: str


class ModuleScaffoldRequest(BaseModel):
    machine_name: str = Field(..., min_length=1, pattern=r"^[a-z][a-z0-9_]*$")
    name: str = Field(..., min_length=1)
    description: str = Field(default="")
    package: str = Field(default="Custom")


class ModuleInfo(BaseModel):
    machine_name: str
    name: str
    path: str
    status: Optional[str] = None
    description: Optional[str] = None


class ThemeInfo(BaseModel):
    machine_name: str
    name: str
    path: str
    status: Optional[str] = None


class SiteStatusResponse(BaseModel):
    drupal_version: Optional[str] = None
    php_version: Optional[str] = None
    db_driver: Optional[str] = None
    site_uri: Optional[str] = None
    raw: str = ""


class ConfigStatusResponse(BaseModel):
    items: List[dict] = Field(default_factory=list)
    raw: str = ""


# ---------------------------------------------------------------------------
# Color Palette / WCAG AA
# ---------------------------------------------------------------------------

class ContrastPair(BaseModel):
    fg: str = Field(..., description="Foreground hex color")
    bg: str = Field(..., description="Background hex color")
    ratio: float = Field(..., description="Contrast ratio (1-21)")
    aa_normal: bool = Field(..., description="Passes WCAG AA for normal text (>=4.5)")
    aa_large: bool = Field(..., description="Passes WCAG AA for large text (>=3.0)")
    aaa_normal: bool = Field(False, description="Passes WCAG AAA for normal text (>=7.0)")


class PaletteColor(BaseModel):
    hex: str
    name: str = ""
    role: str = Field(default="", description="e.g. primary, secondary, background, text, accent, success, warning, error")


class PaletteResponse(BaseModel):
    colors: List[PaletteColor]
    contrast_matrix: List[ContrastPair] = Field(default_factory=list)
    all_aa_pass: bool = False
    css_variables: str = ""
    scss_variables: str = ""


class PaletteGenerateRequest(BaseModel):
    description: str = Field(default="", description="Text description for AI-generated palette (e.g. 'ocean sunset theme')")
    seed_color: str = Field(default="", description="Hex seed color (e.g. '#3b82f6')")
    harmony: str = Field(
        default="complementary",
        description="Color harmony type: complementary, triadic, analogous, split-complementary, tetradic",
    )
    count: int = Field(default=6, ge=3, le=12, description="Number of colors")
    model: str = Field(default="", description="Ollama model to use (empty for default)")


class PaletteValidateRequest(BaseModel):
    colors: List[str] = Field(..., min_length=2, description="List of hex colors to validate")
