"""Pydantic schemas for issues."""

from typing import List, Optional

from pydantic import BaseModel, Field


class IssueCreateRequest(BaseModel):
    project_id: str
    title: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None
    severity: str = Field(default="medium", pattern=r"^(low|medium|high|critical)$")
    reproduction_steps: Optional[str] = None
    note_id: Optional[str] = None


class IssueUpdateRequest(BaseModel):
    title: Optional[str] = Field(default=None, max_length=255)
    description: Optional[str] = None
    severity: Optional[str] = Field(
        default=None, pattern=r"^(low|medium|high|critical)$"
    )
    status: Optional[str] = Field(
        default=None,
        pattern=r"^(open|in_progress|fix_pending_review|resolved|closed)$",
    )
    reproduction_steps: Optional[str] = None
    fix_branch: Optional[str] = Field(default=None, max_length=255)
    fix_pr_url: Optional[str] = Field(default=None, max_length=500)
    coderabbit_review_url: Optional[str] = Field(default=None, max_length=500)


class IssueResponse(BaseModel):
    id: str
    project_id: str
    project_name: Optional[str] = None
    note_id: Optional[str] = None
    title: str
    description: Optional[str] = None
    severity: str = "medium"
    status: str = "open"
    reproduction_steps: Optional[str] = None
    fix_branch: Optional[str] = None
    fix_pr_url: Optional[str] = None
    coderabbit_review_url: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class IssueListResponse(BaseModel):
    issues: List[IssueResponse] = Field(default_factory=list)
    count: int = 0


class StartFixResponse(BaseModel):
    issue_id: str
    branch: str
    message: str
