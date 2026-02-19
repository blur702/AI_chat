"""Pydantic schemas for Claude Code chat messages."""

from pydantic import BaseModel, Field


class ClaudeCodeMessageCreate(BaseModel):
    content: str = Field(..., min_length=1, max_length=50000)
    role: str = Field(default="user", pattern="^(user|assistant)$")
    page_url: str | None = None
    console_logs: str | None = None


class ClaudeCodeMessageResponse(BaseModel):
    id: str
    role: str
    content: str
    page_url: str | None = None
    console_logs: str | None = None
    created_at: str | None = None


class ClaudeCodeMessageList(BaseModel):
    messages: list[ClaudeCodeMessageResponse] = Field(default_factory=list)
    count: int = 0
