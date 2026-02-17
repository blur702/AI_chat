"""Planning system API endpoints for Traycer-style spec-driven development."""

import logging
from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth import get_current_user_payload
from app.database import get_db_session as get_session
from app.models.plan_phase import PlanPhase
from app.models.plan_task import PlanTask
from app.models.planning_session import PlanningSession
from app.schemas.planning import (
    PlanningSessionCreateRequest,
    PlanningSessionUpdateRequest,
    PlanningSessionResponse,
    PlanningSessionDetailResponse,
    PlanPhaseCreateRequest,
    PlanPhaseUpdateRequest,
    PlanPhaseResponse,
    PlanTaskCreateRequest,
    PlanTaskUpdateRequest,
    PlanTaskResponse,
    PlanProgressResponse,
    UIBuilderImportRequest,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/planning", tags=["planning"])


# -------------------------------------------------------------------------
# Helpers
# -------------------------------------------------------------------------


def _task_to_response(t: PlanTask) -> PlanTaskResponse:
    return PlanTaskResponse(
        id=str(t.id),
        phase_id=str(t.phase_id),
        title=t.title,
        description=t.description,
        task_order=t.task_order,
        task_type=t.task_type,
        task_data=t.task_data,
        depends_on=t.depends_on,
        status=t.status,
        result=t.result,
        automation_action_id=str(t.automation_action_id) if t.automation_action_id else None,
        completed_at=t.completed_at.isoformat() if t.completed_at else None,
        created_at=t.created_at.isoformat(),
        updated_at=t.updated_at.isoformat(),
    )


def _phase_to_response(p: PlanPhase, include_tasks: bool = True) -> PlanPhaseResponse:
    tasks = []
    if include_tasks and p.tasks:
        tasks = [_task_to_response(t) for t in p.tasks]
    return PlanPhaseResponse(
        id=str(p.id),
        session_id=str(p.session_id),
        title=p.title,
        description=p.description,
        phase_order=p.phase_order,
        inputs=p.inputs,
        outputs=p.outputs,
        implementation_plan=p.implementation_plan,
        verification_checks=p.verification_checks,
        status=p.status,
        user_approved=p.user_approved,
        verification_result=p.verification_result,
        started_at=p.started_at.isoformat() if p.started_at else None,
        completed_at=p.completed_at.isoformat() if p.completed_at else None,
        tasks=tasks,
        created_at=p.created_at.isoformat(),
        updated_at=p.updated_at.isoformat(),
    )


def _session_to_response(s: PlanningSession) -> PlanningSessionResponse:
    phases = s.phases if s.phases else []
    completed = sum(1 for p in phases if p.status == "completed")
    return PlanningSessionResponse(
        id=str(s.id),
        project_id=str(s.project_id),
        chat_id=str(s.chat_id) if s.chat_id else None,
        user_id=str(s.user_id),
        title=s.title,
        description=s.description,
        target_type=s.target_type,
        status=s.status,
        current_phase_id=str(s.current_phase_id) if s.current_phase_id else None,
        success_criteria=s.success_criteria,
        phase_count=len(phases),
        completed_phase_count=completed,
        created_at=s.created_at.isoformat(),
        updated_at=s.updated_at.isoformat(),
    )


def _session_to_detail(s: PlanningSession) -> PlanningSessionDetailResponse:
    phases = s.phases if s.phases else []
    completed = sum(1 for p in phases if p.status == "completed")
    return PlanningSessionDetailResponse(
        id=str(s.id),
        project_id=str(s.project_id),
        chat_id=str(s.chat_id) if s.chat_id else None,
        user_id=str(s.user_id),
        title=s.title,
        description=s.description,
        target_type=s.target_type,
        status=s.status,
        current_phase_id=str(s.current_phase_id) if s.current_phase_id else None,
        success_criteria=s.success_criteria,
        phase_count=len(phases),
        completed_phase_count=completed,
        phases=[_phase_to_response(p) for p in phases],
        ui_builder_state=s.ui_builder_state,
        created_at=s.created_at.isoformat(),
        updated_at=s.updated_at.isoformat(),
    )


async def _invalidate_plan_cache(chat_id: Optional[UUID]) -> None:
    """Clear the active plan cache for a chat so prompt builder picks up changes."""
    if not chat_id:
        return
    try:
        import redis.asyncio as aioredis
        import os
        redis_url = os.getenv("REDIS_URL", "redis://redis:6379/0")
        r = aioredis.from_url(redis_url, decode_responses=True)
        await r.delete(f"context:active_plan:{chat_id}")
        await r.aclose()
    except Exception:
        pass  # Best-effort cache invalidation


def _parse_uuid(value: str, label: str = "ID") -> UUID:
    try:
        return UUID(value)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid {label}")


def _check_ownership(session: PlanningSession, user_id: UUID) -> None:
    """Verify the requesting user owns the planning session."""
    if session.user_id != user_id:
        raise HTTPException(status_code=403, detail="Not authorized to modify this planning session")


async def _reload_session(db: AsyncSession, sid: UUID) -> PlanningSession:
    """Re-query a session with eager-loaded phases and tasks.

    Must be used after db.commit() instead of db.refresh() because
    refresh() doesn't reload relationships in async SQLAlchemy.
    """
    result = await db.execute(
        select(PlanningSession)
        .where(PlanningSession.id == sid)
        .options(
            selectinload(PlanningSession.phases).selectinload(PlanPhase.tasks)
        )
    )
    return result.scalar_one()


async def _reload_phase(db: AsyncSession, pid: UUID) -> PlanPhase:
    """Re-query a phase with eager-loaded tasks after commit."""
    result = await db.execute(
        select(PlanPhase)
        .where(PlanPhase.id == pid)
        .options(selectinload(PlanPhase.tasks))
    )
    return result.scalar_one()


# -------------------------------------------------------------------------
# Planning Sessions
# -------------------------------------------------------------------------


@router.post("/sessions", response_model=PlanningSessionDetailResponse, status_code=status.HTTP_201_CREATED)
async def create_session(
    data: PlanningSessionCreateRequest,
    db: AsyncSession = Depends(get_session),
    payload: dict = Depends(get_current_user_payload),
) -> PlanningSessionDetailResponse:
    """Create a new planning session."""
    user_id = _parse_uuid(payload["user_id"], "user_id")
    project_id = _parse_uuid(data.project_id, "project_id")
    chat_id = _parse_uuid(data.chat_id, "chat_id") if data.chat_id else None

    session = PlanningSession(
        project_id=project_id,
        chat_id=chat_id,
        user_id=user_id,
        title=data.title,
        description=data.description,
        target_type=data.target_type,
        success_criteria=data.success_criteria,
        status="draft",
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)
    session.phases = []
    await _invalidate_plan_cache(chat_id)
    return _session_to_detail(session)


@router.get("/sessions", response_model=list[PlanningSessionResponse])
async def list_sessions(
    project_id: str,
    status_filter: Optional[str] = None,
    db: AsyncSession = Depends(get_session),
    _payload: dict = Depends(get_current_user_payload),
) -> list[PlanningSessionResponse]:
    """List planning sessions for a project."""
    pid = _parse_uuid(project_id, "project_id")
    query = (
        select(PlanningSession)
        .where(PlanningSession.project_id == pid)
        .options(selectinload(PlanningSession.phases))
        .order_by(PlanningSession.updated_at.desc())
    )
    if status_filter:
        query = query.where(PlanningSession.status == status_filter)
    result = await db.execute(query)
    sessions = result.scalars().all()
    return [_session_to_response(s) for s in sessions]


@router.get("/sessions/{session_id}", response_model=PlanningSessionDetailResponse)
async def get_session_detail(
    session_id: str,
    db: AsyncSession = Depends(get_session),
    _payload: dict = Depends(get_current_user_payload),
) -> PlanningSessionDetailResponse:
    """Get a planning session with all phases and tasks."""
    sid = _parse_uuid(session_id, "session_id")
    result = await db.execute(
        select(PlanningSession)
        .where(PlanningSession.id == sid)
        .options(
            selectinload(PlanningSession.phases).selectinload(PlanPhase.tasks)
        )
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Planning session not found")
    return _session_to_detail(session)


@router.put("/sessions/{session_id}", response_model=PlanningSessionDetailResponse)
async def update_session(
    session_id: str,
    data: PlanningSessionUpdateRequest,
    db: AsyncSession = Depends(get_session),
    payload: dict = Depends(get_current_user_payload),
) -> PlanningSessionDetailResponse:
    """Update a planning session."""
    sid = _parse_uuid(session_id, "session_id")
    user_id = _parse_uuid(payload["user_id"], "user_id")
    result = await db.execute(
        select(PlanningSession)
        .where(PlanningSession.id == sid)
        .options(
            selectinload(PlanningSession.phases).selectinload(PlanPhase.tasks)
        )
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Planning session not found")
    _check_ownership(session, user_id)

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(session, key, value)

    await db.commit()
    session = await _reload_session(db, sid)
    await _invalidate_plan_cache(session.chat_id)
    return _session_to_detail(session)


@router.delete("/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
async def archive_session(
    session_id: str,
    db: AsyncSession = Depends(get_session),
    payload: dict = Depends(get_current_user_payload),
) -> None:
    """Archive (soft-delete) a planning session."""
    sid = _parse_uuid(session_id, "session_id")
    user_id = _parse_uuid(payload["user_id"], "user_id")
    result = await db.execute(
        select(PlanningSession).where(PlanningSession.id == sid)
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Planning session not found")
    _check_ownership(session, user_id)
    session.status = "archived"
    await db.commit()
    await _invalidate_plan_cache(session.chat_id)


# -------------------------------------------------------------------------
# Workflow Operations
# -------------------------------------------------------------------------


@router.post("/sessions/{session_id}/start", response_model=PlanningSessionDetailResponse)
async def start_session(
    session_id: str,
    db: AsyncSession = Depends(get_session),
    payload: dict = Depends(get_current_user_payload),
) -> PlanningSessionDetailResponse:
    """Start executing a planning session. Sets the first phase as current."""
    sid = _parse_uuid(session_id, "session_id")
    user_id = _parse_uuid(payload["user_id"], "user_id")
    result = await db.execute(
        select(PlanningSession)
        .where(PlanningSession.id == sid)
        .options(
            selectinload(PlanningSession.phases).selectinload(PlanPhase.tasks)
        )
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Planning session not found")
    _check_ownership(session, user_id)
    if session.status not in ("draft", "active"):
        raise HTTPException(status_code=400, detail=f"Cannot start session in '{session.status}' status")
    if not session.phases:
        raise HTTPException(status_code=400, detail="Session has no phases")

    session.status = "in_progress"
    sorted_phases = sorted(session.phases, key=lambda p: p.phase_order)
    first_phase = sorted_phases[0]
    session.current_phase_id = first_phase.id
    first_phase.status = "in_progress"
    first_phase.started_at = datetime.now(timezone.utc)

    await db.commit()
    session = await _reload_session(db, sid)
    await _invalidate_plan_cache(session.chat_id)
    return _session_to_detail(session)


@router.post("/sessions/{session_id}/next-phase", response_model=PlanningSessionDetailResponse)
async def advance_to_next_phase(
    session_id: str,
    db: AsyncSession = Depends(get_session),
    payload: dict = Depends(get_current_user_payload),
) -> PlanningSessionDetailResponse:
    """Mark current phase as completed and advance to the next one."""
    sid = _parse_uuid(session_id, "session_id")
    user_id = _parse_uuid(payload["user_id"], "user_id")
    result = await db.execute(
        select(PlanningSession)
        .where(PlanningSession.id == sid)
        .options(
            selectinload(PlanningSession.phases).selectinload(PlanPhase.tasks)
        )
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Planning session not found")
    _check_ownership(session, user_id)
    if session.status != "in_progress":
        raise HTTPException(status_code=400, detail="Session is not in progress")

    # Find current phase and complete it
    current = None
    next_phase = None
    sorted_phases = sorted(session.phases, key=lambda p: p.phase_order)
    for i, phase in enumerate(sorted_phases):
        if phase.id == session.current_phase_id:
            current = phase
            if i + 1 < len(sorted_phases):
                next_phase = sorted_phases[i + 1]
            break

    if current:
        current.status = "completed"
        current.completed_at = datetime.now(timezone.utc)

    if next_phase:
        session.current_phase_id = next_phase.id
        next_phase.status = "in_progress"
        next_phase.started_at = datetime.now(timezone.utc)
    else:
        # All phases done
        session.status = "completed"
        session.current_phase_id = None

    await db.commit()
    session = await _reload_session(db, sid)
    await _invalidate_plan_cache(session.chat_id)
    return _session_to_detail(session)


@router.get("/sessions/{session_id}/progress", response_model=PlanProgressResponse)
async def get_progress(
    session_id: str,
    db: AsyncSession = Depends(get_session),
    _payload: dict = Depends(get_current_user_payload),
) -> PlanProgressResponse:
    """Get progress summary for a planning session."""
    sid = _parse_uuid(session_id, "session_id")
    result = await db.execute(
        select(PlanningSession)
        .where(PlanningSession.id == sid)
        .options(
            selectinload(PlanningSession.phases).selectinload(PlanPhase.tasks)
        )
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Planning session not found")

    phases = session.phases or []
    all_tasks = [t for p in phases for t in (p.tasks or [])]
    completed_phases = sum(1 for p in phases if p.status == "completed")
    completed_tasks = sum(1 for t in all_tasks if t.status == "completed")
    total_tasks = len(all_tasks)
    total_phases = len(phases)

    current_title = None
    if session.current_phase_id:
        for p in phases:
            if p.id == session.current_phase_id:
                current_title = p.title
                break

    progress = 0.0
    if total_phases > 0:
        progress = round((completed_phases / total_phases) * 100, 1)

    return PlanProgressResponse(
        session_id=str(session.id),
        status=session.status,
        total_phases=total_phases,
        completed_phases=completed_phases,
        current_phase_title=current_title,
        total_tasks=total_tasks,
        completed_tasks=completed_tasks,
        progress_percentage=progress,
    )


# -------------------------------------------------------------------------
# Phases
# -------------------------------------------------------------------------


@router.post("/sessions/{session_id}/phases", response_model=PlanPhaseResponse, status_code=status.HTTP_201_CREATED)
async def create_phase(
    session_id: str,
    data: PlanPhaseCreateRequest,
    db: AsyncSession = Depends(get_session),
    _payload: dict = Depends(get_current_user_payload),
) -> PlanPhaseResponse:
    """Add a phase to a planning session."""
    sid = _parse_uuid(session_id, "session_id")
    result = await db.execute(
        select(PlanningSession)
        .where(PlanningSession.id == sid)
        .options(selectinload(PlanningSession.phases))
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Planning session not found")

    next_order = len(session.phases) if session.phases else 0

    phase = PlanPhase(
        session_id=sid,
        title=data.title,
        description=data.description,
        phase_order=next_order,
        inputs=data.inputs,
        outputs=data.outputs,
        implementation_plan=data.implementation_plan,
        verification_checks=data.verification_checks,
    )
    db.add(phase)
    await db.commit()
    await db.refresh(phase)
    phase.tasks = []
    return _phase_to_response(phase)


@router.put("/phases/{phase_id}", response_model=PlanPhaseResponse)
async def update_phase(
    phase_id: str,
    data: PlanPhaseUpdateRequest,
    db: AsyncSession = Depends(get_session),
    _payload: dict = Depends(get_current_user_payload),
) -> PlanPhaseResponse:
    """Update a phase."""
    pid = _parse_uuid(phase_id, "phase_id")
    result = await db.execute(
        select(PlanPhase)
        .where(PlanPhase.id == pid)
        .options(selectinload(PlanPhase.tasks))
    )
    phase = result.scalar_one_or_none()
    if not phase:
        raise HTTPException(status_code=404, detail="Phase not found")

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(phase, key, value)

    await db.commit()
    phase = await _reload_phase(db, pid)
    return _phase_to_response(phase)


@router.post("/phases/{phase_id}/approve", response_model=PlanPhaseResponse)
async def approve_phase(
    phase_id: str,
    db: AsyncSession = Depends(get_session),
    _payload: dict = Depends(get_current_user_payload),
) -> PlanPhaseResponse:
    """Approve a phase for execution."""
    pid = _parse_uuid(phase_id, "phase_id")
    result = await db.execute(
        select(PlanPhase)
        .where(PlanPhase.id == pid)
        .options(selectinload(PlanPhase.tasks))
    )
    phase = result.scalar_one_or_none()
    if not phase:
        raise HTTPException(status_code=404, detail="Phase not found")

    phase.user_approved = True
    # Mark all pending tasks as ready
    for task in (phase.tasks or []):
        if task.status == "pending":
            task.status = "ready"

    await db.commit()
    phase = await _reload_phase(db, pid)
    return _phase_to_response(phase)


@router.post("/phases/{phase_id}/verify", response_model=PlanPhaseResponse)
async def verify_phase(
    phase_id: str,
    db: AsyncSession = Depends(get_session),
    _payload: dict = Depends(get_current_user_payload),
) -> PlanPhaseResponse:
    """Trigger verification checks for a phase (enqueues ARQ task)."""
    pid = _parse_uuid(phase_id, "phase_id")
    result = await db.execute(
        select(PlanPhase)
        .where(PlanPhase.id == pid)
        .options(selectinload(PlanPhase.tasks))
    )
    phase = result.scalar_one_or_none()
    if not phase:
        raise HTTPException(status_code=404, detail="Phase not found")

    phase.status = "verifying"
    await db.commit()

    # Enqueue verification task via ARQ
    redis = None
    try:
        from arq import create_pool
        from app.worker import get_redis_settings
        redis = await create_pool(get_redis_settings())
        await redis.enqueue_job("verify_plan_phase_task", str(phase.id))
        logger.info("Enqueued verification for phase %s", phase.id)
    except Exception as e:
        logger.warning("Could not enqueue verification task: %s", e)
    finally:
        if redis:
            try:
                await redis.aclose()
            except Exception:
                pass

    phase = await _reload_phase(db, pid)
    return _phase_to_response(phase)


@router.delete("/phases/{phase_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_phase(
    phase_id: str,
    db: AsyncSession = Depends(get_session),
    _payload: dict = Depends(get_current_user_payload),
) -> None:
    """Delete a phase and its tasks."""
    pid = _parse_uuid(phase_id, "phase_id")
    result = await db.execute(select(PlanPhase).where(PlanPhase.id == pid))
    phase = result.scalar_one_or_none()
    if not phase:
        raise HTTPException(status_code=404, detail="Phase not found")
    await db.delete(phase)
    await db.commit()


# -------------------------------------------------------------------------
# Tasks
# -------------------------------------------------------------------------


@router.post("/phases/{phase_id}/tasks", response_model=PlanTaskResponse, status_code=status.HTTP_201_CREATED)
async def create_task(
    phase_id: str,
    data: PlanTaskCreateRequest,
    db: AsyncSession = Depends(get_session),
    _payload: dict = Depends(get_current_user_payload),
) -> PlanTaskResponse:
    """Add a task to a phase."""
    pid = _parse_uuid(phase_id, "phase_id")
    result = await db.execute(
        select(PlanPhase)
        .where(PlanPhase.id == pid)
        .options(selectinload(PlanPhase.tasks))
    )
    phase = result.scalar_one_or_none()
    if not phase:
        raise HTTPException(status_code=404, detail="Phase not found")

    next_order = len(phase.tasks) if phase.tasks else 0

    task = PlanTask(
        phase_id=pid,
        title=data.title,
        description=data.description,
        task_order=next_order,
        task_type=data.task_type,
        task_data=data.task_data,
        depends_on=data.depends_on,
        status="ready" if phase.user_approved else "pending",
    )
    db.add(task)
    await db.commit()
    await db.refresh(task)
    return _task_to_response(task)


@router.put("/tasks/{task_id}", response_model=PlanTaskResponse)
async def update_task(
    task_id: str,
    data: PlanTaskUpdateRequest,
    db: AsyncSession = Depends(get_session),
    _payload: dict = Depends(get_current_user_payload),
) -> PlanTaskResponse:
    """Update a task."""
    tid = _parse_uuid(task_id, "task_id")
    result = await db.execute(select(PlanTask).where(PlanTask.id == tid))
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(task, key, value)

    await db.commit()
    await db.refresh(task)
    return _task_to_response(task)


@router.post("/tasks/{task_id}/execute", response_model=PlanTaskResponse)
async def execute_task(
    task_id: str,
    db: AsyncSession = Depends(get_session),
    payload: dict = Depends(get_current_user_payload),
) -> PlanTaskResponse:
    """Execute a task by creating a corresponding automation action."""
    tid = _parse_uuid(task_id, "task_id")
    result = await db.execute(
        select(PlanTask)
        .where(PlanTask.id == tid)
        .options(selectinload(PlanTask.phase))
    )
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if task.status not in ("ready", "pending"):
        raise HTTPException(status_code=400, detail=f"Task is '{task.status}', not ready for execution")

    # Get project_id from the phase's session
    phase_result = await db.execute(
        select(PlanPhase)
        .where(PlanPhase.id == task.phase_id)
        .options(selectinload(PlanPhase.session))
    )
    phase = phase_result.scalar_one_or_none()

    # Map plan task types to automation action types
    action_type_map = {
        "file_create": "file_create",
        "file_modify": "file_modify",
        "file_delete": "file_delete",
        "run_command": "run_command",
        "install_package": "install_package",
    }

    action_type = action_type_map.get(task.task_type)
    if action_type and phase and phase.session:
        from app.models.automation_action import AutomationAction

        action = AutomationAction(
            project_id=phase.session.project_id,
            action_type=action_type,
            action_data=task.task_data,
        )
        db.add(action)
        await db.flush()
        task.automation_action_id = action.id

    task.status = "in_progress"
    await db.commit()
    await db.refresh(task)
    return _task_to_response(task)


@router.delete("/tasks/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_task(
    task_id: str,
    db: AsyncSession = Depends(get_session),
    _payload: dict = Depends(get_current_user_payload),
) -> None:
    """Delete a task."""
    tid = _parse_uuid(task_id, "task_id")
    result = await db.execute(select(PlanTask).where(PlanTask.id == tid))
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    await db.delete(task)
    await db.commit()


# -------------------------------------------------------------------------
# UI Builder Integration
# -------------------------------------------------------------------------


@router.post("/sessions/{session_id}/export-to-ui-builder")
async def export_to_ui_builder(
    session_id: str,
    db: AsyncSession = Depends(get_session),
    _payload: dict = Depends(get_current_user_payload),
) -> dict:
    """Convert plan UI component tasks into a UI builder tree structure."""
    sid = _parse_uuid(session_id, "session_id")
    result = await db.execute(
        select(PlanningSession)
        .where(PlanningSession.id == sid)
        .options(
            selectinload(PlanningSession.phases).selectinload(PlanPhase.tasks)
        )
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Planning session not found")

    import uuid as uuid_mod

    ui_tree = []
    for phase in (session.phases or []):
        for task in (phase.tasks or []):
            if task.task_type in ("ui_component", "ui_layout", "ui_style"):
                data = task.task_data or {}
                node = {
                    "id": str(uuid_mod.uuid4()),
                    "componentId": data.get("component_id", ""),
                    "componentName": data.get("name", task.title),
                    "props": data.get("props", {}),
                    "children": data.get("children", []),
                }
                ui_tree.append(node)

    session.ui_builder_state = {"tree": ui_tree}
    await db.commit()

    return {
        "session_id": str(session.id),
        "ui_tree": ui_tree,
        "component_count": len(ui_tree),
    }


@router.post("/sessions/{session_id}/import-from-ui-builder")
async def import_from_ui_builder(
    session_id: str,
    data: UIBuilderImportRequest,
    db: AsyncSession = Depends(get_session),
    _payload: dict = Depends(get_current_user_payload),
) -> dict:
    """Save current UI builder tree state into a planning session."""
    sid = _parse_uuid(session_id, "session_id")
    result = await db.execute(
        select(PlanningSession).where(PlanningSession.id == sid)
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Planning session not found")

    session.ui_builder_state = {"tree": data.ui_tree}
    await db.commit()

    return {
        "session_id": str(session.id),
        "imported_components": len(data.ui_tree),
    }
