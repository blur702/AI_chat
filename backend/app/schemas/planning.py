"""Pydantic schemas for the planning system API."""

from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


# -------------------------------------------------------------------------
# Request Schemas
# -------------------------------------------------------------------------


class PlanningSessionCreateRequest(BaseModel):
    """Request body for creating a new planning session."""

    project_id: str
    chat_id: Optional[str] = None
    title: str = Field(..., min_length=1, max_length=500)
    description: Optional[str] = None
    target_type: str = Field(default="sandbox", pattern="^(sandbox|ui_builder|both)$")
    success_criteria: List[str] = Field(default_factory=list)


class PlanningSessionUpdateRequest(BaseModel):
    """Request body for updating a planning session."""

    title: Optional[str] = Field(default=None, max_length=500)
    description: Optional[str] = None
    target_type: Optional[str] = Field(default=None, pattern="^(sandbox|ui_builder|both)$")
    status: Optional[str] = Field(
        default=None, pattern="^(draft|active|in_progress|completed|archived)$"
    )
    success_criteria: Optional[List[str]] = None


class PlanPhaseCreateRequest(BaseModel):
    """Request body for creating a new phase."""

    title: str = Field(..., min_length=1, max_length=500)
    description: str = ""
    inputs: List[str] = Field(default_factory=list)
    outputs: List[str] = Field(default_factory=list)
    implementation_plan: Dict[str, Any] = Field(default_factory=dict)
    verification_checks: List[Dict[str, Any]] = Field(default_factory=list)


class PlanPhaseUpdateRequest(BaseModel):
    """Request body for updating a phase."""

    title: Optional[str] = Field(default=None, max_length=500)
    description: Optional[str] = None
    inputs: Optional[List[str]] = None
    outputs: Optional[List[str]] = None
    implementation_plan: Optional[Dict[str, Any]] = None
    verification_checks: Optional[List[Dict[str, Any]]] = None
    status: Optional[str] = Field(
        default=None,
        pattern="^(pending|in_progress|verifying|completed|failed)$",
    )


class PlanTaskCreateRequest(BaseModel):
    """Request body for creating a new task."""

    title: str = Field(..., min_length=1, max_length=500)
    description: str = ""
    task_type: str = Field(
        ...,
        pattern="^(file_create|file_modify|file_delete|ui_component|ui_layout|ui_style|run_command|install_package|verification)$",
    )
    task_data: Dict[str, Any] = Field(default_factory=dict)
    depends_on: List[str] = Field(default_factory=list)


class PlanTaskUpdateRequest(BaseModel):
    """Request body for updating a task."""

    title: Optional[str] = Field(default=None, max_length=500)
    description: Optional[str] = None
    task_data: Optional[Dict[str, Any]] = None
    depends_on: Optional[List[str]] = None
    status: Optional[str] = Field(
        default=None,
        pattern="^(pending|ready|in_progress|completed|failed)$",
    )


class UIBuilderImportRequest(BaseModel):
    """Request body for importing UI builder state into a plan."""

    ui_tree: List[Dict[str, Any]]


# -------------------------------------------------------------------------
# Response Schemas
# -------------------------------------------------------------------------


class PlanTaskResponse(BaseModel):
    """Response for a single task."""

    id: str
    phase_id: str
    title: str
    description: str
    task_order: int
    task_type: str
    task_data: Optional[Dict[str, Any]] = None
    depends_on: Optional[List[str]] = None
    status: str
    result: Optional[Dict[str, Any]] = None
    automation_action_id: Optional[str] = None
    completed_at: Optional[str] = None
    created_at: str
    updated_at: str


class PlanPhaseResponse(BaseModel):
    """Response for a single phase."""

    id: str
    session_id: str
    title: str
    description: str
    phase_order: int
    inputs: Optional[List[str]] = None
    outputs: Optional[List[str]] = None
    implementation_plan: Optional[Dict[str, Any]] = None
    verification_checks: Optional[List[Dict[str, Any]]] = None
    status: str
    user_approved: bool
    verification_result: Optional[Dict[str, Any]] = None
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    tasks: List[PlanTaskResponse] = Field(default_factory=list)
    created_at: str
    updated_at: str


class PlanningSessionResponse(BaseModel):
    """Response for a planning session (list view)."""

    id: str
    project_id: str
    chat_id: Optional[str] = None
    user_id: str
    title: str
    description: Optional[str] = None
    target_type: str
    status: str
    current_phase_id: Optional[str] = None
    success_criteria: Optional[List[str]] = None
    phase_count: int = 0
    completed_phase_count: int = 0
    created_at: str
    updated_at: str


class PlanningSessionDetailResponse(PlanningSessionResponse):
    """Response for a planning session with full phase/task details."""

    phases: List[PlanPhaseResponse] = Field(default_factory=list)
    ui_builder_state: Optional[Dict[str, Any]] = None


class PlanProgressResponse(BaseModel):
    """Summary of plan execution progress."""

    session_id: str
    status: str
    total_phases: int
    completed_phases: int
    current_phase_title: Optional[str] = None
    total_tasks: int
    completed_tasks: int
    progress_percentage: float
