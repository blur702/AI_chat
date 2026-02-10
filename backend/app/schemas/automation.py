"""Pydantic schemas for automation actions API."""

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


# -------------------------------------------------------------------------
# Request Schemas
# -------------------------------------------------------------------------


class AutomationActionCreateRequest(BaseModel):
    """Request body for creating a new automation action."""

    project_id: str
    action_type: str = Field(..., min_length=1, max_length=100)
    action_data: Optional[Dict[str, Any]] = None


class AutomationActionApproveRequest(BaseModel):
    """Optional request body when approving an action (allows modifying action_data)."""

    action_data: Optional[Dict[str, Any]] = None


# -------------------------------------------------------------------------
# Response Schemas
# -------------------------------------------------------------------------


class AutomationActionResponse(BaseModel):
    """Response for a single automation action."""

    id: str
    project_id: str
    action_type: str
    action_data: Optional[Dict[str, Any]] = None
    user_approved: bool
    executed_at: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class AutomationActionListResponse(BaseModel):
    """List of automation actions."""

    actions: List[AutomationActionResponse] = Field(default_factory=list)
    count: int = 0


class AutomationActionExecuteResponse(BaseModel):
    """Response after requesting action execution."""

    id: str
    status: str
    result: Optional[Dict[str, Any]] = None
    executed_at: Optional[str] = None
