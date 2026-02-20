"""Pydantic schemas for reusable color palettes."""

import re
from typing import List, Optional

from pydantic import BaseModel, Field, field_validator, constr

HEX_RE = re.compile(r"^#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})$")


class PaletteColorInput(BaseModel):
    hex: str = Field(..., min_length=4, max_length=7)
    name: Optional[str] = Field(default=None, max_length=100)
    role: Optional[str] = Field(default=None, max_length=100)

    @field_validator("hex")
    @classmethod
    def validate_hex(cls, value: str) -> str:
        v = value.strip()
        if not HEX_RE.match(v):
            raise ValueError("Invalid hex color")
        if len(v) == 4:
            v = "#" + "".join(ch * 2 for ch in v[1:])
        return v.lower()


class PaletteCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None
    colors: List[PaletteColorInput] = Field(..., min_length=1, max_length=64)
    tags: List[constr(min_length=1, max_length=100)] = Field(default_factory=list, max_length=50)


class PaletteUpdateRequest(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    description: Optional[str] = None
    colors: Optional[List[PaletteColorInput]] = Field(default=None, min_length=1, max_length=64)
    tags: Optional[List[constr(min_length=1, max_length=100)]] = Field(default=None, max_length=50)


class PaletteResponse(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    colors: List[PaletteColorInput] = Field(default_factory=list)
    tags: List[str] = Field(default_factory=list)
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class PaletteListResponse(BaseModel):
    palettes: List[PaletteResponse] = Field(default_factory=list)
    count: int = 0
